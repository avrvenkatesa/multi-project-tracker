const { Pool } = require('@neondatabase/serverless');
const aiMeetingAnalysis = require('./aiMeetingAnalysis');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Meeting Transcription Service
 * Handles meeting transcriptions from various platforms (Teams, Zoom, Google Meet)
 */
class MeetingTranscriptionService {
  /**
   * Create a new meeting transcription record
   */
  async createMeeting({ 
    projectId, 
    meetingId, 
    platform, 
    meetingTitle,
    meetingUrl,
    startedAt,
    participants = [],
    organizerId,
    activationMode = 'manual',
    initiatedBy,
    consentGiven = false
  }) {
    const result = await pool.query(`
      INSERT INTO meeting_transcriptions (
        project_id, meeting_id, platform, meeting_title, meeting_url,
        started_at, participants, organizer_id, activation_mode,
        initiated_by, consent_given, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
      RETURNING *
    `, [
      projectId, meetingId, platform, meetingTitle, meetingUrl,
      startedAt, JSON.stringify(participants), organizerId, activationMode,
      initiatedBy, consentGiven
    ]);

    return result.rows[0];
  }

  /**
   * Update meeting transcription status
   */
  async updateMeetingStatus(id, status, updates = {}) {
    const setClauses = ['status = $2', 'updated_at = NOW()'];
    const values = [id, status];
    let paramCount = 3;

    if (updates.endedAt !== undefined) {
      setClauses.push(`ended_at = $${paramCount++}`);
      values.push(updates.endedAt);
    }

    if (updates.durationSeconds !== undefined) {
      setClauses.push(`duration_seconds = $${paramCount++}`);
      values.push(updates.durationSeconds);
    }

    if (updates.transcriptFull !== undefined) {
      setClauses.push(`transcript_full = $${paramCount++}`);
      values.push(updates.transcriptFull);
    }

    if (updates.transcriptUrl !== undefined) {
      setClauses.push(`transcript_url = $${paramCount++}`);
      values.push(updates.transcriptUrl);
    }

    if (updates.audioUrl !== undefined) {
      setClauses.push(`audio_url = $${paramCount++}`);
      values.push(updates.audioUrl);
    }

    const result = await pool.query(`
      UPDATE meeting_transcriptions
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `, values);

    return result.rows[0];
  }

  /**
   * Process transcript and detect entities using AI
   */
  async processTranscript(id, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const meetingResult = await client.query(`
        SELECT * FROM meeting_transcriptions WHERE id = $1
      `, [id]);

      if (meetingResult.rows.length === 0) {
        throw new Error('Meeting not found');
      }

      const meeting = meetingResult.rows[0];

      if (!meeting.transcript_full) {
        await client.query(`
          UPDATE meeting_transcriptions
          SET status = 'completed', summary = $1, updated_at = NOW()
          WHERE id = $2
        `, ['Waiting for transcript upload', id]);
        await client.query('COMMIT');
        return {
          detectedEntities: [],
          keyPoints: [],
          actionItems: [],
          summary: 'Waiting for transcript upload',
          analysisSkipped: true,
          reason: 'no_transcript'
        };
      }

      await client.query(`
        UPDATE meeting_transcriptions
        SET status = 'transcribing', updated_at = NOW()
        WHERE id = $1
      `, [id]);

      let analysisResult;
      try {
        analysisResult = await aiMeetingAnalysis.analyzeMeetingTranscript(
          meeting.transcript_full,
          meeting.meeting_title || 'Untitled Meeting',
          meeting.project_id
        );
      } catch (analysisError) {
        console.error('[MeetingTranscription] AI analysis failed, using fallback:', analysisError.message);
        analysisResult = {
          detectedEntities: [],
          keyPoints: [],
          actionItems: [],
          summary: 'Meeting transcription completed, AI analysis failed',
          analysisSkipped: true,
          reason: 'analysis_error',
          errorType: 'exception'
        };
      }

      const detectedEntitiesArray = (analysisResult.detectedEntities || []).map(entity => ({
        ...entity,
        _metadata: {
          keyPoints: analysisResult.keyPoints || [],
          actionItems: analysisResult.actionItems || [],
          analysisSkipped: analysisResult.analysisSkipped || false,
          reason: analysisResult.reason || null
        }
      }));

      try {
        await client.query(`
          UPDATE meeting_transcriptions
          SET 
            status = 'completed',
            detected_entities = $1,
            summary = $2,
            updated_at = NOW()
          WHERE id = $3
        `, [
          JSON.stringify(detectedEntitiesArray.length > 0 ? detectedEntitiesArray : (analysisResult.detectedEntities || [])),
          analysisResult.summary || 'Meeting transcription completed',
          id
        ]);

        await client.query('COMMIT');
      } catch (storageError) {
        console.error('[MeetingTranscription] Storage error, retrying with minimal payload:', storageError.message);
        await client.query('ROLLBACK');
        
        try {
          await pool.query(`
            UPDATE meeting_transcriptions
            SET 
              status = 'completed',
              detected_entities = $1,
              summary = $2,
              updated_at = NOW()
            WHERE id = $3
          `, [
            JSON.stringify([]),
            'Meeting transcription completed (storage error during analysis save)',
            id
          ]);
        } catch (retryError) {
          console.error('[MeetingTranscription] Retry also failed, marking as completed with no data:', retryError.message);
          await pool.query(`
            UPDATE meeting_transcriptions
            SET status = 'completed', summary = 'Completed with errors', updated_at = NOW()
            WHERE id = $1
          `, [id]);
        }
      }

      return {
        detectedEntities: analysisResult.detectedEntities || [],
        keyPoints: analysisResult.keyPoints || [],
        actionItems: analysisResult.actionItems || [],
        summary: analysisResult.summary,
        analysisSkipped: analysisResult.analysisSkipped || false,
        reason: analysisResult.reason || null
      };
    } catch (error) {
      await client.query('ROLLBACK');
      
      await pool.query(`
        UPDATE meeting_transcriptions
        SET status = 'failed', updated_at = NOW()
        WHERE id = $1
      `, [id]);

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get meetings for a project
   */
  async getMeetingsByProject(projectId, filters = {}) {
    const conditions = ['project_id = $1'];
    const values = [projectId];
    let paramCount = 2;

    if (filters.platform) {
      conditions.push(`platform = $${paramCount++}`);
      values.push(filters.platform);
    }

    if (filters.status) {
      conditions.push(`status = $${paramCount++}`);
      values.push(filters.status);
    }

    if (filters.startDate) {
      conditions.push(`started_at >= $${paramCount++}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`started_at <= $${paramCount++}`);
      values.push(filters.endDate);
    }

    const result = await pool.query(`
      SELECT 
        mt.*,
        u_org.full_name as organizer_name,
        u_init.full_name as initiated_by_name
      FROM meeting_transcriptions mt
      LEFT JOIN users u_org ON mt.organizer_id = u_org.id
      LEFT JOIN users u_init ON mt.initiated_by = u_init.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY mt.started_at DESC NULLS LAST, mt.created_at DESC
      LIMIT ${filters.limit || 50}
    `, values);

    return result.rows;
  }

  /**
   * Get meeting by ID
   */
  async getMeetingById(id) {
    const result = await pool.query(`
      SELECT 
        mt.*,
        u_org.full_name as organizer_name,
        u_org.email as organizer_email,
        u_init.full_name as initiated_by_name
      FROM meeting_transcriptions mt
      LEFT JOIN users u_org ON mt.organizer_id = u_org.id
      LEFT JOIN users u_init ON mt.initiated_by = u_init.id
      WHERE mt.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      throw new Error('Meeting not found');
    }

    return result.rows[0];
  }

  /**
   * Get meeting by platform meeting ID
   */
  async getMeetingByMeetingId(meetingId) {
    const result = await pool.query(`
      SELECT * FROM meeting_transcriptions
      WHERE meeting_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [meetingId]);

    return result.rows[0] || null;
  }

  /**
   * Delete a meeting transcription
   */
  async deleteMeeting(id) {
    await pool.query(`
      DELETE FROM meeting_transcriptions WHERE id = $1
    `, [id]);

    return { success: true };
  }

  /**
   * Cancel a meeting transcription
   */
  async cancelMeeting(id) {
    const result = await pool.query(`
      UPDATE meeting_transcriptions
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'transcribing')
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      throw new Error('Meeting not found or cannot be cancelled');
    }

    return result.rows[0];
  }

  /**
   * Get meeting statistics for a project
   */
  async getMeetingStats(projectId, dateRange = {}) {
    const conditions = ['project_id = $1'];
    const values = [projectId];
    let paramCount = 2;

    if (dateRange.startDate) {
      conditions.push(`started_at >= $${paramCount++}`);
      values.push(dateRange.startDate);
    }

    if (dateRange.endDate) {
      conditions.push(`started_at <= $${paramCount++}`);
      values.push(dateRange.endDate);
    }

    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_meetings,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_meetings,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_meetings,
        COUNT(*) FILTER (WHERE status = 'transcribing') as transcribing_meetings,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_meetings,
        COALESCE(SUM(duration_seconds), 0) as total_duration_seconds,
        COUNT(DISTINCT platform) as platforms_used,
        jsonb_object_agg(
          platform, 
          COUNT(*) FILTER (WHERE platform IS NOT NULL)
        ) FILTER (WHERE platform IS NOT NULL) as meetings_by_platform
      FROM meeting_transcriptions
      WHERE ${conditions.join(' AND ')}
    `, values);

    return result.rows[0];
  }

  /**
   * Update transcript content (for manual upload or webhook)
   */
  async updateTranscript(id, transcriptFull, audioUrl = null) {
    const result = await pool.query(`
      UPDATE meeting_transcriptions
      SET 
        transcript_full = $1,
        audio_url = COALESCE($2, audio_url),
        status = CASE WHEN status = 'pending' THEN 'transcribing' ELSE status END,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [transcriptFull, audioUrl, id]);

    if (result.rows.length === 0) {
      throw new Error('Meeting not found');
    }

    return result.rows[0];
  }
}

module.exports = new MeetingTranscriptionService();
