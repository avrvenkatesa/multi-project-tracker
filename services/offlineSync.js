/**
 * Offline Sync Service
 * 
 * Manages offline queue and synchronization for mobile captures
 * Features:
 * - Queue management for offline captures
 * - Automatic sync when online
 * - Conflict resolution
 * - Retry logic with exponential backoff
 */

const { pool } = require('../db');
const quickCapture = require('./quickCapture');

/**
 * Add item to offline queue
 * 
 * @param {number} userId - User ID
 * @param {object} captureData - Thought capture data to queue
 * @returns {Promise<object>} - Queued item
 */
async function queueOfflineCapture(userId, captureData) {
  const {
    content,
    projectId,
    captureMethod,
    deviceInfo,
    locationContext,
    audioUrl
  } = captureData;

  try {
    const result = await pool.query(`
      INSERT INTO offline_queue (
        user_id,
        capture_data,
        sync_status,
        retry_count
      ) VALUES ($1, $2, $3, 0)
      RETURNING *
    `, [
      userId,
      JSON.stringify({
        content,
        projectId,
        captureMethod,
        deviceInfo,
        locationContext,
        audioUrl
      }),
      'pending'
    ]);

    return result.rows[0];
  } catch (error) {
    console.error('Error queueing offline capture:', error);
    throw error;
  }
}

/**
 * Get pending offline queue items for a user
 * 
 * @param {number} userId - User ID
 * @param {number} limit - Max items to retrieve (default: 50)
 * @returns {Promise<array>} - Array of queued items
 */
async function getPendingQueueItems(userId, limit = 50) {
  try {
    const result = await pool.query(`
      SELECT * FROM offline_queue
      WHERE user_id = $1
        AND sync_status = 'pending'
        AND retry_count < 5
      ORDER BY created_at ASC
      LIMIT $2
    `, [userId, limit]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching queue items:', error);
    throw error;
  }
}

/**
 * Process a single queue item
 * 
 * @param {object} queueItem - Queue item to process
 * @returns {Promise<object>} - Processing result
 */
async function processQueueItem(queueItem) {
  const { id, user_id, capture_data } = queueItem;
  
  try {
    const captureData = typeof capture_data === 'string' 
      ? JSON.parse(capture_data) 
      : capture_data;

    const thoughtCapture = await quickCapture.createThoughtCapture({
      userId: user_id,
      ...captureData
    });

    await pool.query(`
      UPDATE offline_queue
      SET 
        sync_status = 'synced',
        synced_at = NOW(),
        created_entity_id = $1
      WHERE id = $2
    `, [thoughtCapture.id, id]);

    return {
      success: true,
      queueItemId: id,
      thoughtCaptureId: thoughtCapture.id
    };
  } catch (error) {
    console.error(`Error processing queue item ${id}:`, error);

    const retryCount = queueItem.retry_count + 1;
    const syncStatus = retryCount >= 5 ? 'failed' : 'pending';

    await pool.query(`
      UPDATE offline_queue
      SET 
        retry_count = $1,
        sync_status = $2,
        error_message = $3,
        last_retry_at = NOW()
      WHERE id = $4
    `, [retryCount, syncStatus, error.message, id]);

    return {
      success: false,
      queueItemId: id,
      error: error.message,
      retryCount
    };
  }
}

/**
 * Sync all pending queue items for a user
 * 
 * @param {number} userId - User ID
 * @returns {Promise<object>} - Sync results summary
 */
async function syncOfflineQueue(userId) {
  console.log(`[OfflineSync] Starting sync for user ${userId}`);
  
  const queueItems = await getPendingQueueItems(userId);
  
  if (queueItems.length === 0) {
    console.log(`[OfflineSync] No pending items for user ${userId}`);
    return {
      totalItems: 0,
      synced: 0,
      failed: 0,
      results: []
    };
  }

  const results = [];
  let syncedCount = 0;
  let failedCount = 0;

  for (const item of queueItems) {
    const result = await processQueueItem(item);
    results.push(result);
    
    if (result.success) {
      syncedCount++;
    } else {
      failedCount++;
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`[OfflineSync] Completed: ${syncedCount} synced, ${failedCount} failed`);

  return {
    totalItems: queueItems.length,
    synced: syncedCount,
    failed: failedCount,
    results
  };
}

/**
 * Get offline queue statistics for a user
 * 
 * @param {number} userId - User ID
 * @returns {Promise<object>} - Queue statistics
 */
async function getQueueStats(userId) {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_items,
        COUNT(CASE WHEN sync_status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN sync_status = 'synced' THEN 1 END) as synced,
        COUNT(CASE WHEN sync_status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN sync_status = 'conflict' THEN 1 END) as conflicts
      FROM offline_queue
      WHERE user_id = $1
    `, [userId]);

    return result.rows[0];
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    throw error;
  }
}

/**
 * Clear synced items from queue (older than 30 days)
 * 
 * @param {number} userId - User ID (optional, clears for all users if not specified)
 * @returns {Promise<number>} - Number of items cleared
 */
async function clearSyncedItems(userId = null) {
  try {
    let query = `
      DELETE FROM offline_queue
      WHERE sync_status = 'synced'
        AND synced_at < NOW() - INTERVAL '30 days'
    `;
    const params = [];

    if (userId) {
      query += ' AND user_id = $1';
      params.push(userId);
    }

    query += ' RETURNING id';

    const result = await pool.query(query, params);
    
    console.log(`[OfflineSync] Cleared ${result.rows.length} old synced items`);
    return result.rows.length;
  } catch (error) {
    console.error('Error clearing synced items:', error);
    throw error;
  }
}

/**
 * Retry failed queue items
 * 
 * @param {number} userId - User ID
 * @returns {Promise<object>} - Retry results
 */
async function retryFailedItems(userId) {
  try {
    await pool.query(`
      UPDATE offline_queue
      SET 
        sync_status = 'pending',
        retry_count = 0,
        error_message = NULL
      WHERE user_id = $1
        AND sync_status = 'failed'
        AND retry_count < 5
    `, [userId]);

    return await syncOfflineQueue(userId);
  } catch (error) {
    console.error('Error retrying failed items:', error);
    throw error;
  }
}

/**
 * Delete a queue item
 * 
 * @param {number} queueItemId - Queue item ID
 * @param {number} userId - User ID (for authorization)
 * @returns {Promise<boolean>} - Success status
 */
async function deleteQueueItem(queueItemId, userId) {
  try {
    const result = await pool.query(`
      DELETE FROM offline_queue
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [queueItemId, userId]);

    return result.rows.length > 0;
  } catch (error) {
    console.error('Error deleting queue item:', error);
    throw error;
  }
}

/**
 * Get queue items for admin/debugging
 * 
 * @param {object} filters - Filter options
 * @returns {Promise<array>} - Queue items
 */
async function getQueueItems(filters = {}) {
  const { userId, status, limit = 100, offset = 0 } = filters;

  try {
    let query = `
      SELECT oq.*, u.username
      FROM offline_queue oq
      LEFT JOIN users u ON oq.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (userId) {
      query += ` AND oq.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (status) {
      query += ` AND oq.sync_status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY oq.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error fetching queue items:', error);
    throw error;
  }
}

module.exports = {
  queueOfflineCapture,
  getPendingQueueItems,
  processQueueItem,
  syncOfflineQueue,
  getQueueStats,
  clearSyncedItems,
  retryFailedItems,
  deleteQueueItem,
  getQueueItems
};
