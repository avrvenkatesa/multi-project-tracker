/**
 * Meeting Manager Service
 * Handles meeting lifecycle management, participant tracking, and intelligent activation modes
 * Supports Auto/Manual/Smart activation for Zoom and Microsoft Teams meetings
 */

const { pool } = require('../db');
const transcriptionService = require('./transcriptionService');

class MeetingManager {
  constructor() {
    this.activationModes = ['auto', 'manual', 'smart'];
    
    // Keywords for smart activation
    this.transcriptionKeywords = [
      'standup', 'stand-up', 'stand up',
      'sprint', 'scrum',
      'planning', 'plan',
      'review', 'retro', 'retrospective',
      'kickoff', 'kick-off',
      'all-hands', 'all hands',
      'decision', 'architecture',
      'design review', 'sync',
      'daily', 'weekly',
      'meeting', 'discussion'
    ];
  }

  /**
   * Check if a meeting should be auto-transcribed based on activation mode
   * @param {Object} params - Meeting metadata
   * @returns {Promise<boolean>} Whether to auto-start transcription
   */
  async shouldStartTranscription({ meetingId, platform, title, participantCount, organizerId, projectId }) {
    try {
      // Get project activation mode
      const mode = await this.getProjectActivationMode(projectId);

      console.log(`[Meeting Manager] Checking activation for meeting "${title}" (mode: ${mode}, participants: ${participantCount})`);

      switch (mode) {
        case 'auto':
          console.log('[Meeting Manager] Auto mode: Starting transcription');
          return true;

        case 'manual':
          console.log('[Meeting Manager] Manual mode: Skipping auto-start');
          return false;

        case 'smart':
          // Smart rules
          const rules = {
            participantCount: participantCount > 3,
            titleKeywords: this.containsTranscriptionKeywords(title),
            userPreference: await this.hasUserAutoTranscribePref(organizerId)
          };

          const shouldStart = rules.participantCount || rules.titleKeywords || rules.userPreference;

          console.log(`[Meeting Manager] Smart mode: ${shouldStart ? 'Starting' : 'Skipping'} - Rules:`, rules);
          return shouldStart;

        default:
          console.warn('[Meeting Manager] Unknown mode, defaulting to manual');
          return false;
      }
    } catch (error) {
      console.error('[Meeting Manager] Error checking activation:', error);
      return false; // Fail safe to manual
    }
  }

  /**
   * Check if meeting title contains transcription keywords
   */
  containsTranscriptionKeywords(title) {
    if (!title) return false;

    const lowerTitle = title.toLowerCase();
    return this.transcriptionKeywords.some(keyword => lowerTitle.includes(keyword));
  }

  /**
   * Check if user has auto-transcribe preference enabled
   */
  async hasUserAutoTranscribePref(userId) {
    if (!userId) return false;

    try {
      const result = await pool.query(
        `SELECT preferences->>'auto_transcribe_meetings' as auto_transcribe
         FROM users
         WHERE id = $1`,
        [userId]
      );

      return result.rows[0]?.auto_transcribe === 'true';
    } catch (error) {
      console.error('[Meeting Manager] Error checking user preference:', error);
      return false;
    }
  }

  /**
   * Start meeting transcription
   * @param {Object} params - { meetingId, platform, title, projectId, userId, activationMode }
   * @returns {Promise<Object>} Meeting session info
   */
  async startMeeting({ meetingId, platform, title, projectId, userId, activationMode = 'manual' }) {
    try {
      console.log(`[Meeting Manager] Starting meeting: ${meetingId} (${platform})`);

      // Validate meeting doesn't already exist with active status
      const existing = await pool.query(
        `SELECT id, status FROM meeting_transcriptions 
         WHERE platform = $1 AND meeting_id = $2`,
        [platform, meetingId]
      );

      if (existing.rows.length > 0 && existing.rows[0].status === 'active') {
        throw new Error(`Meeting ${meetingId} is already being transcribed`);
      }

      // Start transcription service
      const transcriptionResult = await transcriptionService.startTranscription({
        meetingId,
        platform,
        projectId,
        userId,
        meetingTitle: title,
        activationMode
      });

      // Add organizer as participant
      if (userId) {
        const user = await pool.query(
          'SELECT username, email FROM users WHERE id = $1',
          [userId]
        );

        if (user.rows.length > 0) {
          await this.addParticipant({
            meetingId,
            userId,
            name: user.rows[0].username,
            email: user.rows[0].email,
            externalId: `user_${userId}`,
            isOrganizer: true
          });
        }
      }

      console.log(`[Meeting Manager] Successfully started meeting: ${meetingId}`);

      return {
        success: true,
        meeting: transcriptionResult,
        activationMode
      };

    } catch (error) {
      console.error('[Meeting Manager] Error starting meeting:', error);
      throw error;
    }
  }

  /**
   * End meeting transcription
   * @param {string} meetingId - External meeting ID
   * @returns {Promise<Object>} Final meeting stats
   */
  async endMeeting(meetingId) {
    try {
      console.log(`[Meeting Manager] Ending meeting: ${meetingId}`);

      // Get meeting details
      const meetingResult = await pool.query(
        'SELECT id FROM meeting_transcriptions WHERE meeting_id = $1',
        [meetingId]
      );

      if (meetingResult.rows.length === 0) {
        throw new Error(`Meeting not found: ${meetingId}`);
      }

      const dbMeetingId = meetingResult.rows[0].id;

      // Mark all active participants as left
      await pool.query(
        `UPDATE meeting_participants 
         SET left_at = NOW() 
         WHERE meeting_id = $1 AND left_at IS NULL`,
        [dbMeetingId]
      );

      // Stop transcription service
      await transcriptionService.stopTranscription(meetingId);

      // Get final stats
      const stats = await pool.query(`
        SELECT 
          mt.duration_seconds,
          COUNT(DISTINCT mp.id) as total_participants,
          COUNT(DISTINCT tc.id) as total_chunks,
          COALESCE(SUM(mp.speaking_time_seconds), 0) as total_speaking_time
        FROM meeting_transcriptions mt
        LEFT JOIN meeting_participants mp ON mt.id = mp.meeting_id
        LEFT JOIN transcript_chunks tc ON mt.id = tc.meeting_id
        WHERE mt.id = $1
        GROUP BY mt.id, mt.duration_seconds
      `, [dbMeetingId]);

      console.log(`[Meeting Manager] Meeting ended: ${meetingId}`, stats.rows[0]);

      return {
        success: true,
        meetingId,
        stats: stats.rows[0] || {}
      };

    } catch (error) {
      console.error('[Meeting Manager] Error ending meeting:', error);
      throw error;
    }
  }

  /**
   * Add participant to meeting
   * @param {Object} params - { meetingId, userId, name, email, externalId, isOrganizer }
   * @returns {Promise<Object>} Participant record
   */
  async addParticipant({ meetingId, userId = null, name, email = null, externalId = null, isOrganizer = false }) {
    try {
      // Get database meeting ID
      const meetingResult = await pool.query(
        'SELECT id FROM meeting_transcriptions WHERE meeting_id = $1',
        [meetingId]
      );

      if (meetingResult.rows.length === 0) {
        throw new Error(`Meeting not found: ${meetingId}`);
      }

      const dbMeetingId = meetingResult.rows[0].id;

      // Check if participant already exists and is still in the meeting
      const existing = await pool.query(
        `SELECT id FROM meeting_participants
         WHERE meeting_id = $1 
         AND (user_id = $2 OR external_participant_id = $3)
         AND left_at IS NULL`,
        [dbMeetingId, userId, externalId]
      );

      if (existing.rows.length > 0) {
        console.log(`[Meeting Manager] Participant already in meeting: ${name}`);
        return existing.rows[0];
      }

      // Insert new participant
      const result = await pool.query(`
        INSERT INTO meeting_participants (
          meeting_id, user_id, participant_name, participant_email,
          external_participant_id, is_organizer, joined_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *
      `, [dbMeetingId, userId, name, email, externalId, isOrganizer]);

      console.log(`[Meeting Manager] Added participant: ${name} (organizer: ${isOrganizer})`);

      return result.rows[0];

    } catch (error) {
      console.error('[Meeting Manager] Error adding participant:', error);
      throw error;
    }
  }

  /**
   * Remove participant from meeting
   * @param {Object} params - { meetingId, participantId }
   * @returns {Promise<Object>} Updated participant record
   */
  async removeParticipant({ meetingId, participantId }) {
    try {
      // Get database meeting ID
      const meetingResult = await pool.query(
        'SELECT id FROM meeting_transcriptions WHERE meeting_id = $1',
        [meetingId]
      );

      if (meetingResult.rows.length === 0) {
        throw new Error(`Meeting not found: ${meetingId}`);
      }

      const dbMeetingId = meetingResult.rows[0].id;

      // Update left_at timestamp
      const result = await pool.query(`
        UPDATE meeting_participants
        SET left_at = NOW()
        WHERE meeting_id = $1 AND external_participant_id = $2 AND left_at IS NULL
        RETURNING *, EXTRACT(EPOCH FROM (left_at - joined_at)) as duration_seconds
      `, [dbMeetingId, participantId]);

      if (result.rows.length > 0) {
        const participant = result.rows[0];
        console.log(`[Meeting Manager] Participant left: ${participant.participant_name} (duration: ${Math.round(participant.duration_seconds)}s)`);
        return participant;
      }

      return null;

    } catch (error) {
      console.error('[Meeting Manager] Error removing participant:', error);
      throw error;
    }
  }

  /**
   * Update participant speaking time
   * @param {Object} params - { meetingId, speakerId, additionalSeconds }
   */
  async updateSpeakingTime({ meetingId, speakerId, additionalSeconds }) {
    try {
      const result = await pool.query(`
        UPDATE meeting_participants
        SET speaking_time_seconds = speaking_time_seconds + $1
        WHERE meeting_id = (
          SELECT id FROM meeting_transcriptions WHERE meeting_id = $2
        ) AND external_participant_id = $3
        RETURNING participant_name, speaking_time_seconds
      `, [additionalSeconds, meetingId, speakerId]);

      if (result.rows.length > 0) {
        console.log(`[Meeting Manager] Updated speaking time for ${result.rows[0].participant_name}: ${result.rows[0].speaking_time_seconds}s`);
      }

      return result.rows[0];

    } catch (error) {
      console.error('[Meeting Manager] Error updating speaking time:', error);
      throw error;
    }
  }

  /**
   * Get active meetings for a project
   * @param {number} projectId - Project ID
   * @returns {Promise<Array>} List of active meetings
   */
  async getActiveMeetings(projectId) {
    try {
      const result = await pool.query(`
        SELECT
          mt.*,
          COUNT(DISTINCT mp.id) as participant_count,
          COUNT(DISTINCT CASE WHEN mp.left_at IS NULL THEN mp.id END) as active_participants,
          COUNT(DISTINCT tc.id) as chunk_count,
          EXTRACT(EPOCH FROM (NOW() - mt.started_at))::INTEGER as current_duration_seconds
        FROM meeting_transcriptions mt
        LEFT JOIN meeting_participants mp ON mt.id = mp.meeting_id
        LEFT JOIN transcript_chunks tc ON mt.id = tc.meeting_id
        WHERE mt.project_id = $1 AND mt.status = 'active'
        GROUP BY mt.id
        ORDER BY mt.started_at DESC
      `, [projectId]);

      return result.rows;

    } catch (error) {
      console.error('[Meeting Manager] Error getting active meetings:', error);
      throw error;
    }
  }

  /**
   * Get meeting details with participants and stats
   * @param {string} meetingId - External meeting ID
   * @returns {Promise<Object>} Comprehensive meeting object
   */
  async getMeetingDetails(meetingId) {
    try {
      // Get meeting record
      const meetingResult = await pool.query(`
        SELECT
          mt.*,
          COUNT(DISTINCT mp.id) as participant_count,
          COUNT(DISTINCT tc.id) as chunk_count,
          COALESCE(
            EXTRACT(EPOCH FROM (mt.ended_at - mt.started_at)),
            EXTRACT(EPOCH FROM (NOW() - mt.started_at))
          )::INTEGER as duration_seconds
        FROM meeting_transcriptions mt
        LEFT JOIN meeting_participants mp ON mt.id = mp.meeting_id
        LEFT JOIN transcript_chunks tc ON mt.id = tc.meeting_id
        WHERE mt.meeting_id = $1
        GROUP BY mt.id
      `, [meetingId]);

      if (meetingResult.rows.length === 0) {
        throw new Error(`Meeting not found: ${meetingId}`);
      }

      const meeting = meetingResult.rows[0];

      // Get participants
      const participantsResult = await pool.query(`
        SELECT
          mp.*,
          u.username,
          u.email as user_email,
          COALESCE(
            EXTRACT(EPOCH FROM (mp.left_at - mp.joined_at)),
            EXTRACT(EPOCH FROM (NOW() - mp.joined_at))
          )::INTEGER as duration_seconds
        FROM meeting_participants mp
        LEFT JOIN users u ON mp.user_id = u.id
        WHERE mp.meeting_id = $1
        ORDER BY mp.joined_at ASC
      `, [meeting.id]);

      meeting.participants = participantsResult.rows;

      return meeting;

    } catch (error) {
      console.error('[Meeting Manager] Error getting meeting details:', error);
      throw error;
    }
  }

  /**
   * Get user's meeting history
   * @param {number} userId - User ID
   * @param {number} limit - Number of meetings to return
   * @returns {Promise<Array>} User's meeting history
   */
  async getUserMeetingHistory(userId, limit = 20) {
    try {
      const result = await pool.query(`
        SELECT
          mt.id as db_meeting_id,
          mt.meeting_id,
          mt.platform as meeting_platform,
          mt.meeting_title,
          mt.started_at,
          mt.ended_at,
          mt.duration_seconds,
          mt.status,
          COUNT(DISTINCT mp_all.id) as participant_count,
          mp.is_organizer,
          mp.speaking_time_seconds
        FROM meeting_transcriptions mt
        JOIN meeting_participants mp ON mt.id = mp.meeting_id
        LEFT JOIN meeting_participants mp_all ON mt.id = mp_all.meeting_id
        WHERE mp.user_id = $1
        GROUP BY mt.id, mp.is_organizer, mp.speaking_time_seconds
        ORDER BY mt.started_at DESC
        LIMIT $2
      `, [userId, limit]);

      return result.rows;

    } catch (error) {
      console.error('[Meeting Manager] Error getting user meeting history:', error);
      throw error;
    }
  }

  /**
   * Set project activation mode preference
   * @param {number} projectId - Project ID
   * @param {string} mode - Activation mode ('auto', 'manual', 'smart')
   */
  async setProjectActivationMode(projectId, mode) {
    try {
      // Validate mode
      if (!this.activationModes.includes(mode)) {
        throw new Error(`Invalid activation mode: ${mode}. Must be one of: ${this.activationModes.join(', ')}`);
      }

      // Check if custom_fields table exists, if not use sidecar_config
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'custom_fields'
        ) as table_exists
      `);

      if (tableCheck.rows[0].table_exists) {
        // Use custom_fields table
        await pool.query(`
          INSERT INTO custom_fields (entity_type, entity_id, field_name, field_value)
          VALUES ('project', $1, 'meeting_activation_mode', $2)
          ON CONFLICT (entity_type, entity_id, field_name)
          DO UPDATE SET field_value = $2
        `, [projectId, mode]);
      } else {
        // Use sidecar_config metadata as fallback
        const modeValue = mode; // PostgreSQL needs explicit variable for type resolution
        await pool.query(`
          INSERT INTO sidecar_config (project_id, enabled, metadata)
          VALUES ($1::integer, true, jsonb_build_object('meeting_activation_mode', $2::text))
          ON CONFLICT (project_id)
          DO UPDATE SET metadata = jsonb_set(
            COALESCE(sidecar_config.metadata, '{}'::jsonb),
            '{meeting_activation_mode}',
            to_jsonb($2::text)
          )
        `, [projectId, modeValue]);
      }

      console.log(`[Meeting Manager] Set activation mode for project ${projectId}: ${mode}`);

      return { success: true, mode };

    } catch (error) {
      console.error('[Meeting Manager] Error setting activation mode:', error);
      throw error;
    }
  }

  /**
   * Get project activation mode
   * @param {number} projectId - Project ID
   * @returns {Promise<string>} Activation mode ('auto', 'manual', or 'smart')
   */
  async getProjectActivationMode(projectId) {
    try {
      // Check if custom_fields table exists
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'custom_fields'
        ) as table_exists
      `);

      let mode = 'manual'; // Default

      if (tableCheck.rows[0].table_exists) {
        // Try custom_fields first
        const result = await pool.query(`
          SELECT field_value
          FROM custom_fields
          WHERE entity_type = 'project'
            AND entity_id = $1
            AND field_name = 'meeting_activation_mode'
        `, [projectId]);

        if (result.rows.length > 0) {
          mode = result.rows[0].field_value;
        }
      } else {
        // Fallback to sidecar_config
        const result = await pool.query(`
          SELECT metadata->>'meeting_activation_mode' as mode
          FROM sidecar_config
          WHERE project_id = $1
        `, [projectId]);

        if (result.rows.length > 0 && result.rows[0].mode) {
          mode = result.rows[0].mode;
        }
      }

      return mode;

    } catch (error) {
      console.error('[Meeting Manager] Error getting activation mode:', error);
      return 'manual'; // Fail safe to manual
    }
  }

  /**
   * Get meeting statistics for a project
   * @param {number} projectId - Project ID
   * @returns {Promise<Object>} Meeting statistics
   */
  async getProjectMeetingStats(projectId) {
    try {
      const result = await pool.query(`
        SELECT
          COUNT(DISTINCT mt.id) as total_meetings,
          COUNT(DISTINCT CASE WHEN mt.status = 'active' THEN mt.id END) as active_meetings,
          COUNT(DISTINCT CASE WHEN mt.status = 'ended' THEN mt.id END) as completed_meetings,
          COALESCE(SUM(mt.duration_seconds), 0) as total_duration_seconds,
          COALESCE(AVG(mt.duration_seconds), 0)::INTEGER as avg_duration_seconds,
          COUNT(DISTINCT mp.id) as total_participants,
          COUNT(DISTINCT tc.id) as total_transcript_chunks
        FROM meeting_transcriptions mt
        LEFT JOIN meeting_participants mp ON mt.id = mp.meeting_id
        LEFT JOIN transcript_chunks tc ON mt.id = tc.meeting_id
        WHERE mt.project_id = $1
      `, [projectId]);

      return result.rows[0] || {};

    } catch (error) {
      console.error('[Meeting Manager] Error getting project stats:', error);
      throw error;
    }
  }

  /**
   * Search meetings by title or participant
   * @param {number} projectId - Project ID
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @returns {Promise<Array>} Matching meetings
   */
  async searchMeetings(projectId, query, limit = 20) {
    try {
      const result = await pool.query(`
        SELECT DISTINCT
          mt.*,
          COUNT(DISTINCT mp.id) as participant_count,
          COUNT(DISTINCT tc.id) as chunk_count
        FROM meeting_transcriptions mt
        LEFT JOIN meeting_participants mp ON mt.id = mp.meeting_id
        LEFT JOIN transcript_chunks tc ON mt.id = tc.meeting_id
        WHERE mt.project_id = $1
          AND (
            mt.meeting_title ILIKE $2
            OR EXISTS (
              SELECT 1 FROM meeting_participants mp2
              WHERE mp2.meeting_id = mt.id
              AND mp2.participant_name ILIKE $2
            )
          )
        GROUP BY mt.id
        ORDER BY mt.started_at DESC
        LIMIT $3
      `, [projectId, `%${query}%`, limit]);

      return result.rows;

    } catch (error) {
      console.error('[Meeting Manager] Error searching meetings:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new MeetingManager();
