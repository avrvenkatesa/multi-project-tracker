const pool = require('../db');

/**
 * Time Entries Service
 * Handles incremental time logging for issues and action items
 * Allows users to log time without changing status
 */

/**
 * Log time for an item (without status change)
 * @param {Object} params - { itemType, itemId, projectId, hoursLogged, loggedBy, notes }
 * @returns {Object} Created time entry with updated totals
 */
async function logTime({ itemType, itemId, projectId, hoursLogged, loggedBy, notes = null }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Validate item type
    if (!['issue', 'action-item'].includes(itemType)) {
      throw new Error('Invalid item type. Must be "issue" or "action-item"');
    }
    
    // Validate hours
    const hours = parseFloat(hoursLogged);
    if (isNaN(hours) || hours <= 0 || hours > 999) {
      throw new Error('Hours must be a positive number between 0 and 999');
    }
    
    // Insert time entry
    const entryResult = await client.query(
      `INSERT INTO time_entries 
       (item_type, item_id, project_id, hours_logged, logged_by, notes, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       RETURNING *`,
      [itemType, itemId, projectId, hours, loggedBy, notes]
    );
    
    const entry = entryResult.rows[0];
    
    // Calculate new total actual hours
    const totalResult = await client.query(
      `SELECT COALESCE(SUM(hours_logged), 0) as total
       FROM time_entries
       WHERE item_type = $1 AND item_id = $2`,
      [itemType, itemId]
    );
    
    const totalHours = parseFloat(totalResult.rows[0].total);
    
    // Update item's actual_effort_hours, last_time_logged_at, and time_log_count
    const tableName = itemType === 'issue' ? 'issues' : 'action_items';
    await client.query(
      `UPDATE ${tableName}
       SET actual_effort_hours = $1,
           last_time_logged_at = CURRENT_TIMESTAMP,
           time_log_count = COALESCE(time_log_count, 0) + 1
       WHERE id = $2`,
      [totalHours, itemId]
    );
    
    // Get updated item to calculate completion percentage
    const itemResult = await client.query(
      `SELECT id, estimated_effort_hours, actual_effort_hours
       FROM ${tableName}
       WHERE id = $1`,
      [itemId]
    );
    
    const item = itemResult.rows[0];
    let completionPercentage = 0;
    
    if (item.estimated_effort_hours && item.estimated_effort_hours > 0) {
      completionPercentage = Math.min(100, Math.round((item.actual_effort_hours / item.estimated_effort_hours) * 100));
      
      // Update completion percentage
      await client.query(
        `UPDATE ${tableName}
         SET completion_percentage = $1
         WHERE id = $2`,
        [completionPercentage, itemId]
      );
    }
    
    await client.query('COMMIT');
    
    return {
      entry,
      totalHours,
      completionPercentage
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all time entries for an item
 * @param {string} itemType - 'issue' or 'action-item'
 * @param {number} itemId - Item ID
 * @returns {Array} Time entries with user information
 */
async function getTimeEntries(itemType, itemId) {
  const result = await pool.query(
    `SELECT 
      te.*,
      u.username as logged_by_username,
      u.full_name as logged_by_name
     FROM time_entries te
     LEFT JOIN users u ON te.logged_by = u.id
     WHERE te.item_type = $1 AND te.item_id = $2
     ORDER BY te.logged_at DESC`,
    [itemType, itemId]
  );
  
  return result.rows;
}

/**
 * Get total hours logged for an item
 * @param {string} itemType - 'issue' or 'action-item'
 * @param {number} itemId - Item ID
 * @returns {number} Total hours
 */
async function getTotalHours(itemType, itemId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(hours_logged), 0) as total
     FROM time_entries
     WHERE item_type = $1 AND item_id = $2`,
    [itemType, itemId]
  );
  
  return parseFloat(result.rows[0].total);
}

/**
 * Delete a time entry (with recalculation)
 * @param {number} entryId - Time entry ID
 * @param {number} userId - User requesting deletion
 * @returns {Object} Updated totals
 */
async function deleteTimeEntry(entryId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get entry details before deletion
    const entryResult = await client.query(
      'SELECT * FROM time_entries WHERE id = $1',
      [entryId]
    );
    
    if (entryResult.rows.length === 0) {
      throw new Error('Time entry not found');
    }
    
    const entry = entryResult.rows[0];
    
    // Delete the entry
    await client.query('DELETE FROM time_entries WHERE id = $1', [entryId]);
    
    // Recalculate total hours
    const totalResult = await client.query(
      `SELECT COALESCE(SUM(hours_logged), 0) as total
       FROM time_entries
       WHERE item_type = $1 AND item_id = $2`,
      [entry.item_type, entry.item_id]
    );
    
    const totalHours = parseFloat(totalResult.rows[0].total);
    
    // Update item
    const tableName = entry.item_type === 'issue' ? 'issues' : 'action_items';
    await client.query(
      `UPDATE ${tableName}
       SET actual_effort_hours = $1,
           time_log_count = GREATEST(0, COALESCE(time_log_count, 0) - 1)
       WHERE id = $2`,
      [totalHours, entry.item_id]
    );
    
    // Recalculate completion percentage
    const itemResult = await client.query(
      `SELECT id, estimated_effort_hours, actual_effort_hours
       FROM ${tableName}
       WHERE id = $1`,
      [entry.item_id]
    );
    
    const item = itemResult.rows[0];
    let completionPercentage = 0;
    
    if (item.estimated_effort_hours && item.estimated_effort_hours > 0) {
      completionPercentage = Math.min(100, Math.round((item.actual_effort_hours / item.estimated_effort_hours) * 100));
      
      await client.query(
        `UPDATE ${tableName}
         SET completion_percentage = $1
         WHERE id = $2`,
        [completionPercentage, entry.item_id]
      );
    }
    
    await client.query('COMMIT');
    
    return {
      deleted: true,
      totalHours,
      completionPercentage
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  logTime,
  getTimeEntries,
  getTotalHours,
  deleteTimeEntry
};
