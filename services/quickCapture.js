/**
 * Quick Capture Service
 * 
 * Ultra-fast thought capture processing optimized for mobile devices
 * Features:
 * - < 3 second capture time
 * - Background AI analysis
 * - Automatic entity type detection
 * - Project context awareness
 * - Template support
 */

const { pool } = require('../db');
const sidecarBot = require('./sidecarBot');

/**
 * Create a quick thought capture
 * 
 * @param {object} captureData - Thought capture data
 * @returns {Promise<object>} - Created thought capture with ID
 */
async function createThoughtCapture(captureData, options = {}) {
  const {
    userId,
    projectId,
    content,
    captureMethod = 'text',
    deviceInfo,
    locationContext,
    originalAudioUrl,
    transcription,
    transcriptionConfidence
  } = captureData;

  const { skipAI = false } = options;

  if (!userId || !content) {
    throw new Error('userId and content are required');
  }

  try {
    const initialStatus = skipAI ? 'processed' : 'pending';
    
    const result = await pool.query(`
      INSERT INTO thought_captures (
        user_id,
        project_id,
        content,
        capture_method,
        device_info,
        location_context,
        original_audio_url,
        transcription,
        transcription_confidence,
        status,
        processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      userId,
      projectId || null,
      content,
      captureMethod,
      deviceInfo ? JSON.stringify(deviceInfo) : null,
      locationContext ? JSON.stringify(locationContext) : null,
      originalAudioUrl || null,
      transcription || null,
      transcriptionConfidence || null,
      initialStatus,
      skipAI ? new Date() : null
    ]);

    const thoughtCapture = result.rows[0];

    // Trigger background AI analysis only if not skipped (non-blocking)
    if (!skipAI) {
      processThoughtWithAI(thoughtCapture.id, userId, projectId).catch(err => {
        console.error(`Background AI analysis failed for thought ${thoughtCapture.id}:`, err);
      });
    }

    return thoughtCapture;
  } catch (error) {
    console.error('Error creating thought capture:', error);
    throw error;
  }
}

/**
 * Process thought capture with AI analysis
 * Detects entity type and creates entities based on confidence
 * 
 * @param {number} thoughtCaptureId - Thought capture ID
 * @param {number} userId - User ID
 * @param {number} projectId - Project ID (optional)
 * @returns {Promise<object>} - AI analysis result
 */
async function processThoughtWithAI(thoughtCaptureId, userId, projectId) {
  try {
    // Update status to processing
    await pool.query(`
      UPDATE thought_captures
      SET status = 'processing'
      WHERE id = $1
    `, [thoughtCaptureId]);

    // Get thought capture content
    const thoughtResult = await pool.query(`
      SELECT * FROM thought_captures WHERE id = $1
    `, [thoughtCaptureId]);

    const thought = thoughtResult.rows[0];
    if (!thought) {
      throw new Error(`Thought capture ${thoughtCaptureId} not found`);
    }

    // Analyze content with Sidecar Bot AI engine (with graceful fallback)
    let aiResult;
    try {
      aiResult = await sidecarBot.analyzeContent(
        thought.content,
        projectId,
        userId,
        {
          source: 'thought_capture',
          sourceId: thoughtCaptureId,
          captureMethod: thought.capture_method
        }
      );
    } catch (aiError) {
      console.warn(`[QuickCapture] AI analysis unavailable for thought ${thoughtCaptureId}:`, aiError.message);
      // Mark as processed without AI analysis
      await pool.query(`
        UPDATE thought_captures
        SET 
          status = 'processed',
          ai_analysis = $1,
          processed_at = NOW()
        WHERE id = $2
      `, [
        JSON.stringify({ error: 'AI service unavailable', fallback: true }),
        thoughtCaptureId
      ]);

      return {
        thoughtCaptureId,
        detectedEntityType: null,
        aiConfidence: 0,
        createdEntityId: null,
        requiresReview: false,
        entitiesDetected: 0,
        aiAvailable: false,
        message: 'Thought captured without AI analysis'
      };
    }

    // Determine detected entity type and confidence
    const detectedEntities = aiResult.entities || [];
    const primaryEntity = detectedEntities[0] || null;
    
    const detectedEntityType = primaryEntity?.entity_type || null;
    const aiConfidence = primaryEntity?.confidence || 0;

    // Check if entity was auto-created or requires review
    const createdEntityId = aiResult.createdEntities?.[0]?.pkg_node_id || null;
    const requiresReview = aiResult.proposalsCreated > 0 || aiConfidence < 0.7;

    // Update thought capture with AI analysis results
    await pool.query(`
      UPDATE thought_captures
      SET 
        detected_entity_type = $1,
        ai_analysis = $2,
        ai_confidence = $3,
        created_entity_id = $4,
        requires_review = $5,
        status = 'processed',
        processed_at = NOW()
      WHERE id = $6
    `, [
      detectedEntityType,
      JSON.stringify(aiResult),
      aiConfidence,
      createdEntityId,
      requiresReview,
      thoughtCaptureId
    ]);

    return {
      thoughtCaptureId,
      detectedEntityType,
      aiConfidence,
      createdEntityId,
      requiresReview,
      entitiesDetected: detectedEntities.length,
      aiResult
    };
  } catch (error) {
    console.error('AI processing error:', error);
    
    // Mark as failed
    await pool.query(`
      UPDATE thought_captures
      SET status = 'failed'
      WHERE id = $1
    `, [thoughtCaptureId]);

    throw error;
  }
}

/**
 * Get thought captures for a user
 * 
 * @param {number} userId - User ID
 * @param {object} filters - Optional filters (projectId, status, limit)
 * @returns {Promise<array>} - Array of thought captures
 */
async function getThoughtCaptures(userId, filters = {}) {
  const { projectId, status, limit = 50, offset = 0 } = filters;

  try {
    let query = `
      SELECT tc.*,
        p.name as project_name,
        u.username
      FROM thought_captures tc
      LEFT JOIN projects p ON tc.project_id = p.id
      LEFT JOIN users u ON tc.user_id = u.id
      WHERE tc.user_id = $1
    `;

    const params = [userId];
    let paramIndex = 2;

    if (projectId) {
      query += ` AND tc.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    if (status) {
      query += ` AND tc.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY tc.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error fetching thought captures:', error);
    throw error;
  }
}

/**
 * Get a single thought capture by ID
 * 
 * @param {number} thoughtCaptureId - Thought capture ID
 * @param {number} userId - User ID (for authorization)
 * @returns {Promise<object>} - Thought capture with related data
 */
async function getThoughtCaptureById(thoughtCaptureId, userId) {
  try {
    const result = await pool.query(`
      SELECT tc.*,
        p.name as project_name,
        u.username,
        vr.audio_url,
        vr.duration_seconds,
        vr.format as audio_format
      FROM thought_captures tc
      LEFT JOIN projects p ON tc.project_id = p.id
      LEFT JOIN users u ON tc.user_id = u.id
      LEFT JOIN voice_recordings vr ON vr.thought_capture_id = tc.id
      WHERE tc.id = $1 AND tc.user_id = $2
    `, [thoughtCaptureId, userId]);

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching thought capture:', error);
    throw error;
  }
}

/**
 * Update thought capture
 * 
 * @param {number} thoughtCaptureId - Thought capture ID
 * @param {number} userId - User ID (for authorization)
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} - Updated thought capture
 */
async function updateThoughtCapture(thoughtCaptureId, userId, updates) {
  const allowedFields = ['content', 'project_id', 'status', 'detected_entity_type'];
  const fields = Object.keys(updates).filter(key => allowedFields.includes(key));

  if (fields.length === 0) {
    throw new Error('No valid fields to update');
  }

  try {
    const setClause = fields.map((field, idx) => `${field} = $${idx + 3}`).join(', ');
    const values = fields.map(field => updates[field]);

    const result = await pool.query(`
      UPDATE thought_captures
      SET ${setClause}
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [thoughtCaptureId, userId, ...values]);

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error updating thought capture:', error);
    throw error;
  }
}

/**
 * Delete thought capture
 * 
 * @param {number} thoughtCaptureId - Thought capture ID
 * @param {number} userId - User ID (for authorization)
 * @returns {Promise<boolean>} - Success status
 */
async function deleteThoughtCapture(thoughtCaptureId, userId) {
  try {
    const result = await pool.query(`
      DELETE FROM thought_captures
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [thoughtCaptureId, userId]);

    return result.rows.length > 0;
  } catch (error) {
    console.error('Error deleting thought capture:', error);
    throw error;
  }
}

/**
 * Create quick capture template
 * 
 * @param {object} templateData - Template data
 * @returns {Promise<object>} - Created template
 */
async function createTemplate(templateData) {
  const {
    userId,
    projectId,
    name,
    templateText,
    entityType,
    tags = [],
    isFavorite = false
  } = templateData;

  try {
    const result = await pool.query(`
      INSERT INTO quick_capture_templates (
        user_id,
        project_id,
        name,
        template_text,
        entity_type,
        tags,
        is_favorite
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [userId, projectId || null, name, templateText, entityType || null, tags, isFavorite]);

    return result.rows[0];
  } catch (error) {
    console.error('Error creating template:', error);
    throw error;
  }
}

/**
 * Get templates for a user
 * 
 * @param {number} userId - User ID
 * @param {number} projectId - Project ID (optional)
 * @returns {Promise<array>} - Array of templates
 */
async function getTemplates(userId, projectId = null) {
  try {
    const result = await pool.query(`
      SELECT * FROM quick_capture_templates
      WHERE user_id = $1
        AND (project_id = $2 OR project_id IS NULL)
      ORDER BY is_favorite DESC, use_count DESC, name ASC
    `, [userId, projectId]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching templates:', error);
    throw error;
  }
}

/**
 * Increment template use count
 * 
 * @param {number} templateId - Template ID
 * @returns {Promise<void>}
 */
async function incrementTemplateUseCount(templateId) {
  try {
    await pool.query(`
      UPDATE quick_capture_templates
      SET use_count = use_count + 1
      WHERE id = $1
    `, [templateId]);
  } catch (error) {
    console.error('Error incrementing template use count:', error);
  }
}

/**
 * Get thought capture statistics for a user
 * 
 * @param {number} userId - User ID
 * @param {number} projectId - Project ID (optional)
 * @returns {Promise<object>} - Statistics
 */
async function getThoughtCaptureStats(userId, projectId = null) {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_captures,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN created_entity_id IS NOT NULL THEN 1 END) as entities_created,
        COUNT(CASE WHEN requires_review THEN 1 END) as requires_review_count,
        COUNT(CASE WHEN capture_method = 'voice' THEN 1 END) as voice_captures,
        COUNT(CASE WHEN capture_method = 'text' THEN 1 END) as text_captures,
        AVG(ai_confidence) as avg_confidence
      FROM thought_captures
      WHERE user_id = $1
        AND ($2::INTEGER IS NULL OR project_id = $2)
    `, [userId, projectId]);

    return result.rows[0];
  } catch (error) {
    console.error('Error fetching stats:', error);
    throw error;
  }
}

module.exports = {
  createThoughtCapture,
  processThoughtWithAI,
  getThoughtCaptures,
  getThoughtCaptureById,
  updateThoughtCapture,
  deleteThoughtCapture,
  createTemplate,
  getTemplates,
  incrementTemplateUseCount,
  getThoughtCaptureStats
};
