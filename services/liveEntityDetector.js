/**
 * Live Entity Detector
 * Analyzes meeting transcripts in real-time to detect Decisions, Risks, Action Items, and Tasks
 * Integrates with AI Analysis Engine (Story 5.4.2) and provides in-meeting notifications
 */

const { pool } = require('../db');
const sidecarBot = require('./sidecarBot');
const workflowEngine = require('./workflowEngine');

class LiveEntityDetector {
  constructor() {
    // Track detection buffer per meeting to prevent duplicate processing
    this.detectionBuffer = new Map();
    
    // Minimum confidence threshold for storing detections
    this.MIN_CONFIDENCE = 0.5;
    
    // High confidence threshold for auto-promotion
    this.HIGH_CONFIDENCE = 0.8;
  }

  /**
   * Main method: Detect entities from transcript buffer
   * @param {Object} params - { meetingId, transcript, chunks }
   * @returns {Promise<Object>} Detected entities and AI metadata
   */
  async detectFromTranscript({ meetingId, transcript, chunks }) {
    try {
      console.log(`[Live Entity Detector] Analyzing transcript for meeting ${meetingId} (${transcript.length} chars)`);

      // Get meeting record
      const meetingResult = await pool.query(
        `SELECT mt.id as db_id, mt.project_id, mt.started_by, mt.meeting_title, mt.meeting_platform
         FROM meeting_transcriptions mt
         WHERE mt.meeting_id = $1 AND mt.status = 'active'`,
        [meetingId]
      );

      if (meetingResult.rows.length === 0) {
        console.log(`[Live Entity Detector] Meeting not found or not active: ${meetingId}`);
        return { success: false, entities: [], message: 'Meeting not found or not active' };
      }

      const meeting = meetingResult.rows[0];

      // Call AI engine from Story 5.4.2
      const aiResult = await sidecarBot.analyzeContent({
        projectId: meeting.project_id,
        content: transcript,
        source: {
          type: 'meeting',
          platform: meeting.meeting_platform,
          meetingId: meetingId,
          meetingTitle: meeting.meeting_title
        },
        userId: meeting.started_by
      });

      // Filter entities with confidence >= 0.5
      const validEntities = (aiResult.entities || []).filter(e =>
        e.confidence >= this.MIN_CONFIDENCE && e.entity_type !== 'None'
      );

      console.log(`[Live Entity Detector] AI detected ${validEntities.length} valid entities (${aiResult.entities?.length || 0} total)`);

      // Store in live_entity_detections
      const detections = [];
      for (const entity of validEntities) {
        const detection = await this.storeLiveDetection({
          dbMeetingId: meeting.db_id,
          entity,
          chunks
        });
        
        if (detection) {
          detections.push(detection);
        }
      }

      // Emit real-time notifications
      if (detections.length > 0) {
        await this.emitDetectionNotifications(meetingId, detections);
      }

      return {
        success: true,
        entities: detections,
        ai_provider: aiResult.llm?.provider,
        ai_cost: aiResult.llm?.cost,
        context_quality: aiResult.context?.qualityScore
      };

    } catch (error) {
      console.error(`[Live Entity Detector] Error analyzing transcript:`, error);
      return { 
        success: false, 
        error: error.message, 
        entities: [] 
      };
    }
  }

  /**
   * Store live detection in database
   * @param {Object} params - { dbMeetingId, entity, chunks }
   * @returns {Promise<Object>} Stored detection record
   */
  async storeLiveDetection({ dbMeetingId, entity, chunks }) {
    try {
      // Find the chunk this entity was detected from
      const chunkId = chunks && chunks.length > 0 ? chunks[0].id : null;

      // Check if similar detection already exists (prevent duplicates)
      const existing = await pool.query(`
        SELECT id FROM live_entity_detections
        WHERE meeting_id = $1
          AND entity_type = $2
          AND title = $3
          AND dismissed_at IS NULL
      `, [dbMeetingId, entity.entity_type, entity.title]);

      if (existing.rows.length > 0) {
        console.log(`[Live Entity Detector] Duplicate detection skipped: ${entity.title}`);
        return null;
      }

      // Determine impact level
      const impactLevel = entity.impact_level || entity.priority || 
        (entity.confidence >= 0.9 ? 'high' : 
         entity.confidence >= 0.7 ? 'medium' : 'low');

      // Insert new detection
      const result = await pool.query(`
        INSERT INTO live_entity_detections (
          meeting_id, chunk_id, entity_type, title, description,
          confidence, impact_level, detected_at, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
        RETURNING *
      `, [
        dbMeetingId,
        chunkId,
        entity.entity_type,
        entity.title,
        entity.description || '',
        entity.confidence,
        impactLevel,
        JSON.stringify({
          ai_analysis: entity.ai_analysis,
          source_chunks: chunks?.map(c => c.id) || [],
          tags: entity.tags || [],
          mentioned_users: entity.mentioned_users || [],
          related_systems: entity.related_systems || []
        })
      ]);

      console.log(`[Live Entity Detector] Stored ${entity.entity_type}: "${entity.title}" (confidence: ${entity.confidence})`);

      return result.rows[0];

    } catch (error) {
      console.error(`[Live Entity Detector] Error storing detection:`, error);
      return null;
    }
  }

  /**
   * Get live detections for a meeting
   * @param {string} meetingId - External meeting ID
   * @param {string} entityType - Optional filter by entity type
   * @returns {Promise<Array>} Array of detection records
   */
  async getLiveDetections(meetingId, entityType = null) {
    try {
      let query = `
        SELECT
          led.*,
          tc.content as chunk_content,
          tc.speaker_name,
          tc.start_time_seconds
        FROM live_entity_detections led
        JOIN meeting_transcriptions mt ON led.meeting_id = mt.id
        LEFT JOIN transcript_chunks tc ON led.chunk_id = tc.id
        WHERE mt.meeting_id = $1
          AND led.dismissed_at IS NULL
      `;

      const params = [meetingId];

      if (entityType) {
        query += ` AND led.entity_type = $2`;
        params.push(entityType);
      }

      query += ` ORDER BY led.confidence DESC, led.detected_at DESC`;

      const result = await pool.query(query, params);

      return result.rows;

    } catch (error) {
      console.error(`[Live Entity Detector] Error getting detections:`, error);
      throw error;
    }
  }

  /**
   * Get detection statistics for a meeting
   * @param {string} meetingId - External meeting ID
   * @returns {Promise<Object>} Statistics object
   */
  async getDetectionStats(meetingId) {
    try {
      const result = await pool.query(`
        SELECT
          led.entity_type,
          COUNT(*) as count,
          AVG(led.confidence) as avg_confidence,
          SUM(CASE WHEN led.was_auto_created THEN 1 ELSE 0 END) as auto_created_count,
          SUM(CASE WHEN led.dismissed_at IS NOT NULL THEN 1 ELSE 0 END) as dismissed_count
        FROM live_entity_detections led
        JOIN meeting_transcriptions mt ON led.meeting_id = mt.id
        WHERE mt.meeting_id = $1
        GROUP BY led.entity_type
        ORDER BY count DESC
      `, [meetingId]);

      const stats = {
        total: 0,
        by_type: {},
        auto_created: 0,
        dismissed: 0,
        pending: 0
      };

      result.rows.forEach(row => {
        stats.total += parseInt(row.count);
        stats.auto_created += parseInt(row.auto_created_count);
        stats.dismissed += parseInt(row.dismissed_count);
        stats.by_type[row.entity_type] = {
          count: parseInt(row.count),
          avg_confidence: parseFloat(row.avg_confidence),
          auto_created: parseInt(row.auto_created_count),
          dismissed: parseInt(row.dismissed_count)
        };
      });

      stats.pending = stats.total - stats.auto_created - stats.dismissed;

      return stats;

    } catch (error) {
      console.error(`[Live Entity Detector] Error getting stats:`, error);
      throw error;
    }
  }

  /**
   * Promote live detection to real entity
   * @param {Object} params - { detectionId, userId }
   * @returns {Promise<Object>} Created entity result
   */
  async promoteToEntity({ detectionId, userId }) {
    try {
      // Get detection
      const detectionResult = await pool.query(
        'SELECT * FROM live_entity_detections WHERE id = $1',
        [detectionId]
      );

      if (detectionResult.rows.length === 0) {
        throw new Error(`Detection not found: ${detectionId}`);
      }

      const detection = detectionResult.rows[0];

      // Check if already promoted
      if (detection.was_auto_created) {
        console.log(`[Live Entity Detector] Detection ${detectionId} already promoted`);
        return { 
          success: true, 
          already_created: true,
          entity_id: detection.created_entity_id 
        };
      }

      // Get meeting and project info
      const meetingResult = await pool.query(
        'SELECT project_id FROM meeting_transcriptions WHERE id = $1',
        [detection.meeting_id]
      );

      const projectId = meetingResult.rows[0].project_id;

      // Create entity using workflow engine
      const entity = {
        entity_type: detection.entity_type,
        title: detection.title,
        description: detection.description,
        confidence: detection.confidence,
        impact_level: detection.impact_level
      };

      const createResult = await workflowEngine.autoCreateEntity({
        entity,
        userId: userId || null,
        projectId,
        source: {
          type: 'live_meeting_detection',
          detectionId: detection.id,
          meetingId: detection.meeting_id
        }
      });

      // Update detection record
      await pool.query(`
        UPDATE live_entity_detections
        SET was_auto_created = true, created_entity_id = $1
        WHERE id = $2
      `, [createResult.entity_id, detectionId]);

      console.log(`[Live Entity Detector] Promoted detection ${detectionId} to entity ${createResult.entity_id}`);

      return {
        success: true,
        detection_id: detectionId,
        entity_id: createResult.entity_id,
        entity_type: detection.entity_type,
        title: detection.title
      };

    } catch (error) {
      console.error(`[Live Entity Detector] Error promoting detection:`, error);
      throw error;
    }
  }

  /**
   * Dismiss a live detection
   * @param {Object} params - { detectionId, userId, reason }
   * @returns {Promise<Object>} Updated detection record
   */
  async dismissDetection({ detectionId, userId, reason }) {
    try {
      const result = await pool.query(`
        UPDATE live_entity_detections
        SET dismissed_by = $1, dismissed_at = NOW(), dismissal_reason = $2
        WHERE id = $3
        RETURNING *
      `, [userId, reason, detectionId]);

      if (result.rows.length > 0) {
        console.log(`[Live Entity Detector] Dismissed detection ${detectionId}: ${reason}`);
        return result.rows[0];
      }

      return null;

    } catch (error) {
      console.error(`[Live Entity Detector] Error dismissing detection:`, error);
      throw error;
    }
  }

  /**
   * Bulk promote all high-confidence detections for a meeting
   * @param {string} meetingId - External meeting ID
   * @param {number} minConfidence - Minimum confidence threshold
   * @returns {Promise<Object>} Summary of promotions
   */
  async bulkPromoteDetections(meetingId, minConfidence = 0.8) {
    try {
      // Get meeting DB ID
      const meetingResult = await pool.query(
        'SELECT id, project_id FROM meeting_transcriptions WHERE meeting_id = $1',
        [meetingId]
      );

      if (meetingResult.rows.length === 0) {
        throw new Error(`Meeting not found: ${meetingId}`);
      }

      const { id: dbMeetingId } = meetingResult.rows[0];

      // Get high-confidence detections
      const detectionsResult = await pool.query(`
        SELECT * FROM live_entity_detections
        WHERE meeting_id = $1
          AND confidence >= $2
          AND was_auto_created = false
          AND dismissed_at IS NULL
        ORDER BY confidence DESC
      `, [dbMeetingId, minConfidence]);

      console.log(`[Live Entity Detector] Bulk promoting ${detectionsResult.rows.length} detections (min confidence: ${minConfidence})`);

      const promoted = [];
      const failed = [];

      for (const detection of detectionsResult.rows) {
        try {
          const result = await this.promoteToEntity({
            detectionId: detection.id,
            userId: null // System promotion
          });
          promoted.push(result);
        } catch (error) {
          console.error(`[Live Entity Detector] Failed to promote detection ${detection.id}:`, error);
          failed.push({ 
            detection_id: detection.id,
            title: detection.title,
            error: error.message 
          });
        }
      }

      return {
        success: true,
        total: detectionsResult.rows.length,
        promoted: promoted.length,
        failed: failed.length,
        results: { promoted, failed }
      };

    } catch (error) {
      console.error(`[Live Entity Detector] Error bulk promoting:`, error);
      throw error;
    }
  }

  /**
   * Clean up old detections after meeting ends
   * @param {string} meetingId - External meeting ID
   * @returns {Promise<Object>} Cleanup summary
   */
  async cleanupDetections(meetingId) {
    try {
      console.log(`[Live Entity Detector] Cleaning up detections for meeting ${meetingId}`);

      // Get meeting DB ID
      const meetingResult = await pool.query(
        'SELECT id FROM meeting_transcriptions WHERE meeting_id = $1',
        [meetingId]
      );

      if (meetingResult.rows.length === 0) {
        throw new Error(`Meeting not found: ${meetingId}`);
      }

      const dbMeetingId = meetingResult.rows[0].id;

      // Delete low-confidence dismissed detections
      const deletedResult = await pool.query(`
        DELETE FROM live_entity_detections
        WHERE meeting_id = $1
          AND confidence < $2
          AND dismissed_at IS NOT NULL
        RETURNING id
      `, [dbMeetingId, this.HIGH_CONFIDENCE]);

      const deletedCount = deletedResult.rows.length;

      // Get summary of remaining detections
      const remainingResult = await pool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN was_auto_created THEN 1 ELSE 0 END) as promoted,
          SUM(CASE WHEN dismissed_at IS NOT NULL THEN 1 ELSE 0 END) as dismissed,
          SUM(CASE WHEN confidence >= $2 THEN 1 ELSE 0 END) as high_confidence
        FROM live_entity_detections
        WHERE meeting_id = $1
      `, [dbMeetingId, this.HIGH_CONFIDENCE]);

      const summary = remainingResult.rows[0];

      console.log(`[Live Entity Detector] Cleanup complete: deleted ${deletedCount} low-confidence detections`);

      return {
        success: true,
        deleted: deletedCount,
        remaining: parseInt(summary.total),
        promoted: parseInt(summary.promoted),
        dismissed: parseInt(summary.dismissed),
        high_confidence: parseInt(summary.high_confidence)
      };

    } catch (error) {
      console.error(`[Live Entity Detector] Error cleaning up:`, error);
      throw error;
    }
  }

  /**
   * Emit real-time notifications (WebSocket/SSE placeholder)
   * @param {string} meetingId - External meeting ID
   * @param {Array} detections - Array of detection records
   */
  async emitDetectionNotifications(meetingId, detections) {
    // Placeholder for WebSocket/SSE notifications
    // In production, this would emit to connected clients via Socket.IO or SSE

    console.log(`[Live Entity Detector] Emitting ${detections.length} detection notifications for meeting ${meetingId}`);

    // Example notification structure for future WebSocket integration:
    const notifications = detections.map(detection => ({
      type: 'live_entity_detected',
      meetingId,
      detection: {
        id: detection.id,
        entity_type: detection.entity_type,
        title: detection.title,
        confidence: detection.confidence,
        impact_level: detection.impact_level,
        detected_at: detection.detected_at
      }
    }));

    // TODO: Integrate with WebSocket service
    // socketService.emit(`meeting:${meetingId}`, notifications);

    return notifications;
  }

  /**
   * Get all detections for a meeting (including dismissed)
   * @param {string} meetingId - External meeting ID
   * @returns {Promise<Array>} All detections
   */
  async getAllDetections(meetingId) {
    try {
      const result = await pool.query(`
        SELECT
          led.*,
          tc.content as chunk_content,
          tc.speaker_name,
          tc.start_time_seconds,
          u.username as dismissed_by_username
        FROM live_entity_detections led
        JOIN meeting_transcriptions mt ON led.meeting_id = mt.id
        LEFT JOIN transcript_chunks tc ON led.chunk_id = tc.id
        LEFT JOIN users u ON led.dismissed_by = u.id
        WHERE mt.meeting_id = $1
        ORDER BY led.detected_at DESC
      `, [meetingId]);

      return result.rows;

    } catch (error) {
      console.error(`[Live Entity Detector] Error getting all detections:`, error);
      throw error;
    }
  }

  /**
   * Get detection by ID
   * @param {number} detectionId - Detection ID
   * @returns {Promise<Object>} Detection record
   */
  async getDetectionById(detectionId) {
    try {
      const result = await pool.query(`
        SELECT
          led.*,
          tc.content as chunk_content,
          tc.speaker_name,
          tc.start_time_seconds,
          mt.meeting_id,
          mt.meeting_title
        FROM live_entity_detections led
        JOIN meeting_transcriptions mt ON led.meeting_id = mt.id
        LEFT JOIN transcript_chunks tc ON led.chunk_id = tc.id
        WHERE led.id = $1
      `, [detectionId]);

      return result.rows[0] || null;

    } catch (error) {
      console.error(`[Live Entity Detector] Error getting detection:`, error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new LiveEntityDetector();
