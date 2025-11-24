const { pool } = require('../db');

// ============================================================================
// MEETING LIFECYCLE
// ============================================================================

async function startMeeting(userId, projectId, options = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  const {
    meetingTitle = null,
    locationDescription = null,
    meetingType = 'hallway',
    activationMode = 'manual',
    wakeWordDetected = null,
    wakeWordConfidence = null,
    deviceInfo = null,
    metadata = null
  } = options;

  const validMeetingTypes = ['hallway', 'one_on_one', 'impromptu', 'walking', 'coffee_chat'];
  if (!validMeetingTypes.includes(meetingType)) {
    throw new Error(`Invalid meeting_type. Must be one of: ${validMeetingTypes.join(', ')}`);
  }

  const validActivationModes = ['manual', 'wake_word', 'always_listening', 'scheduled'];
  if (!validActivationModes.includes(activationMode)) {
    throw new Error(`Invalid activation_mode. Must be one of: ${validActivationModes.join(', ')}`);
  }

  if (projectId) {
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );
    if (projectCheck.rows.length === 0) {
      throw new Error(`Project ${projectId} not found`);
    }
  }

  try {
    const result = await pool.query(`
      INSERT INTO hallway_meetings (
        project_id,
        meeting_title,
        location_description,
        meeting_type,
        started_by,
        activation_mode,
        wake_word_detected,
        wake_word_confidence,
        status,
        device_info,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      projectId,
      meetingTitle,
      locationDescription,
      meetingType,
      userId,
      activationMode,
      wakeWordDetected,
      wakeWordConfidence,
      'recording',
      deviceInfo ? JSON.stringify(deviceInfo) : null,
      metadata ? JSON.stringify(metadata) : null
    ]);

    const meeting = result.rows[0];

    await addParticipant(meeting.id, {
      userId,
      isOrganizer: true
    });

    console.log(`[HallwayMeeting] Started meeting ${meeting.id} for user ${userId} via ${activationMode}`);

    return formatMeeting(meeting);
  } catch (error) {
    console.error('Error starting meeting:', error);
    throw error;
  }
}

async function endMeeting(meetingId, userId) {
  if (!meetingId || !userId) {
    throw new Error('meetingId and userId are required');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const meetingResult = await client.query(
      'SELECT * FROM hallway_meetings WHERE id = $1',
      [meetingId]
    );

    if (meetingResult.rows.length === 0) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    const meeting = meetingResult.rows[0];

    if (meeting.started_by !== userId) {
      throw new Error('Only the meeting organizer can end the meeting');
    }

    if (meeting.status !== 'recording') {
      throw new Error(`Cannot end meeting with status: ${meeting.status}`);
    }

    const updateResult = await client.query(`
      UPDATE hallway_meetings
      SET 
        ended_at = NOW(),
        status = 'processing',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [meetingId]);

    const updatedMeeting = updateResult.rows[0];

    const participantsResult = await client.query(`
      UPDATE hallway_participants
      SET left_at = NOW()
      WHERE meeting_id = $1 AND left_at IS NULL
      RETURNING *
    `, [meetingId]);

    await client.query('COMMIT');

    console.log(`[HallwayMeeting] Ended meeting ${meetingId}, duration: ${updatedMeeting.duration_seconds}s`);

    setImmediate(() => {
      triggerPostMeetingAnalysis(meetingId).catch(err => {
        console.error(`Post-meeting analysis failed for ${meetingId}:`, err);
      });
    });

    return {
      ...formatMeeting(updatedMeeting),
      participantsEnded: participantsResult.rows.length
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error ending meeting:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function cancelMeeting(meetingId, userId, reason = null) {
  if (!meetingId || !userId) {
    throw new Error('meetingId and userId are required');
  }

  try {
    const meetingResult = await pool.query(
      'SELECT * FROM hallway_meetings WHERE id = $1',
      [meetingId]
    );

    if (meetingResult.rows.length === 0) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    const meeting = meetingResult.rows[0];

    if (meeting.started_by !== userId) {
      throw new Error('Only the meeting organizer can cancel the meeting');
    }

    const result = await pool.query(`
      UPDATE hallway_meetings
      SET 
        status = 'cancelled',
        auto_stopped_reason = $1,
        ended_at = NOW(),
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [reason, meetingId]);

    console.log(`[HallwayMeeting] Cancelled meeting ${meetingId}: ${reason || 'No reason provided'}`);

    return formatMeeting(result.rows[0]);
  } catch (error) {
    console.error('Error cancelling meeting:', error);
    throw error;
  }
}

async function pauseMeeting(meetingId, userId) {
  if (!meetingId || !userId) {
    throw new Error('meetingId and userId are required');
  }

  try {
    const meetingResult = await pool.query(
      'SELECT * FROM hallway_meetings WHERE id = $1',
      [meetingId]
    );

    if (meetingResult.rows.length === 0) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    const meeting = meetingResult.rows[0];

    if (meeting.started_by !== userId) {
      throw new Error('Only the meeting organizer can pause the meeting');
    }

    if (meeting.status !== 'recording') {
      throw new Error(`Cannot pause meeting with status: ${meeting.status}`);
    }

    const metadata = meeting.metadata || {};
    metadata.pausedAt = new Date().toISOString();
    metadata.pausedBy = userId;

    const result = await pool.query(`
      UPDATE hallway_meetings
      SET 
        metadata = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(metadata), meetingId]);

    console.log(`[HallwayMeeting] Paused meeting ${meetingId}`);

    return formatMeeting(result.rows[0]);
  } catch (error) {
    console.error('Error pausing meeting:', error);
    throw error;
  }
}

async function resumeMeeting(meetingId, userId) {
  if (!meetingId || !userId) {
    throw new Error('meetingId and userId are required');
  }

  try {
    const meetingResult = await pool.query(
      'SELECT * FROM hallway_meetings WHERE id = $1',
      [meetingId]
    );

    if (meetingResult.rows.length === 0) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    const meeting = meetingResult.rows[0];

    if (meeting.started_by !== userId) {
      throw new Error('Only the meeting organizer can resume the meeting');
    }

    const metadata = meeting.metadata || {};
    metadata.resumedAt = new Date().toISOString();
    metadata.resumedBy = userId;
    delete metadata.pausedAt;
    delete metadata.pausedBy;

    const result = await pool.query(`
      UPDATE hallway_meetings
      SET 
        metadata = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [JSON.stringify(metadata), meetingId]);

    console.log(`[HallwayMeeting] Resumed meeting ${meetingId}`);

    return formatMeeting(result.rows[0]);
  } catch (error) {
    console.error('Error resuming meeting:', error);
    throw error;
  }
}

// ============================================================================
// PARTICIPANT MANAGEMENT
// ============================================================================

async function addParticipant(meetingId, participantData) {
  if (!meetingId) {
    throw new Error('meetingId is required');
  }

  const {
    userId = null,
    participantName = null,
    participantEmail = null,
    participantRole = null,
    speakerLabel = null,
    isOrganizer = false
  } = participantData;

  if (!userId && !participantName) {
    throw new Error('Either userId or participantName is required');
  }

  try {
    const result = await pool.query(`
      INSERT INTO hallway_participants (
        meeting_id,
        user_id,
        participant_name,
        participant_email,
        participant_role,
        speaker_label,
        is_organizer
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [
      meetingId,
      userId,
      participantName,
      participantEmail,
      participantRole,
      speakerLabel,
      isOrganizer
    ]);

    const participant = result.rows[0];

    console.log(`[HallwayMeeting] Added participant to meeting ${meetingId}`);

    return formatParticipant(participant);
  } catch (error) {
    console.error('Error adding participant:', error);
    throw error;
  }
}

async function removeParticipant(meetingId, participantId) {
  if (!meetingId || !participantId) {
    throw new Error('meetingId and participantId are required');
  }

  try {
    const result = await pool.query(`
      UPDATE hallway_participants
      SET left_at = NOW()
      WHERE id = $1 AND meeting_id = $2
      RETURNING *
    `, [participantId, meetingId]);

    if (result.rows.length === 0) {
      throw new Error(`Participant ${participantId} not found in meeting ${meetingId}`);
    }

    console.log(`[HallwayMeeting] Removed participant ${participantId} from meeting ${meetingId}`);

    return formatParticipant(result.rows[0]);
  } catch (error) {
    console.error('Error removing participant:', error);
    throw error;
  }
}

async function mapSpeakerToParticipant(meetingId, speakerLabel, participantId, mappingMethod = 'manual', mappedBy = null) {
  if (!meetingId || !speakerLabel || !participantId) {
    throw new Error('meetingId, speakerLabel, and participantId are required');
  }

  const validMethods = ['manual', 'voice_profile', 'ai_inference', 'auto'];
  if (!validMethods.includes(mappingMethod)) {
    throw new Error(`Invalid mapping_method. Must be one of: ${validMethods.join(', ')}`);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const mappingResult = await client.query(`
      INSERT INTO hallway_speaker_mappings (
        meeting_id,
        speaker_label,
        participant_id,
        mapping_method,
        mapped_by,
        confidence
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (meeting_id, speaker_label)
      DO UPDATE SET
        participant_id = EXCLUDED.participant_id,
        mapping_method = EXCLUDED.mapping_method,
        mapped_by = EXCLUDED.mapped_by,
        mapped_at = NOW()
      RETURNING *
    `, [meetingId, speakerLabel, participantId, mappingMethod, mappedBy, 0.95]);

    await client.query(`
      UPDATE hallway_transcript_chunks
      SET participant_id = $1
      WHERE meeting_id = $2 AND speaker_label = $3
    `, [participantId, meetingId, speakerLabel]);

    await client.query(`
      UPDATE hallway_participants
      SET speaker_label = $1
      WHERE id = $2 AND meeting_id = $3
    `, [speakerLabel, participantId, meetingId]);

    await client.query('COMMIT');

    console.log(`[HallwayMeeting] Mapped speaker "${speakerLabel}" to participant ${participantId}`);

    return {
      id: mappingResult.rows[0].id,
      meetingId,
      speakerLabel,
      participantId,
      mappingMethod,
      mappedAt: mappingResult.rows[0].mapped_at
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error mapping speaker to participant:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function getParticipants(meetingId) {
  if (!meetingId) {
    throw new Error('meetingId is required');
  }

  try {
    const result = await pool.query(`
      SELECT 
        hp.*,
        u.username,
        u.email AS user_email
      FROM hallway_participants hp
      LEFT JOIN users u ON hp.user_id = u.id
      WHERE hp.meeting_id = $1
      ORDER BY hp.is_organizer DESC, hp.joined_at ASC
    `, [meetingId]);

    return result.rows.map(formatParticipant);
  } catch (error) {
    console.error('Error getting participants:', error);
    throw error;
  }
}

// ============================================================================
// TRANSCRIPT MANAGEMENT
// ============================================================================

async function addTranscriptChunk(meetingId, chunkData) {
  if (!meetingId) {
    throw new Error('meetingId is required');
  }

  const {
    content,
    speakerLabel = null,
    participantId = null,
    startTimeSeconds = null,
    endTimeSeconds = null,
    confidence = null,
    isFinal = false,
    metadata = null
  } = chunkData;

  if (!content) {
    throw new Error('content is required');
  }

  try {
    const sequenceResult = await pool.query(
      'SELECT COALESCE(MAX(chunk_sequence), 0) + 1 AS next_sequence FROM hallway_transcript_chunks WHERE meeting_id = $1',
      [meetingId]
    );
    const chunkSequence = sequenceResult.rows[0].next_sequence;

    const result = await pool.query(`
      INSERT INTO hallway_transcript_chunks (
        meeting_id,
        participant_id,
        content,
        speaker_label,
        start_time_seconds,
        end_time_seconds,
        chunk_sequence,
        confidence,
        is_final,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      meetingId,
      participantId,
      content,
      speakerLabel,
      startTimeSeconds,
      endTimeSeconds,
      chunkSequence,
      confidence,
      isFinal,
      metadata ? JSON.stringify(metadata) : null
    ]);

    return formatTranscriptChunk(result.rows[0]);
  } catch (error) {
    console.error('Error adding transcript chunk:', error);
    throw error;
  }
}

async function getFullTranscript(meetingId) {
  if (!meetingId) {
    throw new Error('meetingId is required');
  }

  try {
    const result = await pool.query(`
      SELECT 
        htc.*,
        hp.participant_name,
        hp.speaker_label AS participant_speaker_label,
        u.username
      FROM hallway_transcript_chunks htc
      LEFT JOIN hallway_participants hp ON htc.participant_id = hp.id
      LEFT JOIN users u ON hp.user_id = u.id
      WHERE htc.meeting_id = $1 AND htc.is_final = true
      ORDER BY htc.chunk_sequence ASC
    `, [meetingId]);

    const chunks = result.rows.map(formatTranscriptChunk);
    const fullText = chunks.map(chunk => chunk.content).join(' ');

    return {
      meetingId,
      chunks,
      fullText,
      totalChunks: chunks.length
    };
  } catch (error) {
    console.error('Error getting full transcript:', error);
    throw error;
  }
}

async function updateChunkSpeaker(chunkId, participantId) {
  if (!chunkId || !participantId) {
    throw new Error('chunkId and participantId are required');
  }

  try {
    const result = await pool.query(`
      UPDATE hallway_transcript_chunks
      SET participant_id = $1
      WHERE id = $2
      RETURNING *
    `, [participantId, chunkId]);

    if (result.rows.length === 0) {
      throw new Error(`Transcript chunk ${chunkId} not found`);
    }

    return formatTranscriptChunk(result.rows[0]);
  } catch (error) {
    console.error('Error updating chunk speaker:', error);
    throw error;
  }
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

async function getMeetingById(meetingId, userId = null) {
  if (!meetingId) {
    throw new Error('meetingId is required');
  }

  try {
    const result = await pool.query(`
      SELECT 
        hm.*,
        u.username AS started_by_username,
        p.name AS project_name
      FROM hallway_meetings hm
      LEFT JOIN users u ON hm.started_by = u.id
      LEFT JOIN projects p ON hm.project_id = p.id
      WHERE hm.id = $1
    `, [meetingId]);

    if (result.rows.length === 0) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    const meeting = result.rows[0];

    if (userId && meeting.started_by !== userId && meeting.project_id) {
      const accessCheck = await pool.query(
        'SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2',
        [meeting.project_id, userId]
      );
      if (accessCheck.rows.length === 0) {
        throw new Error('Access denied to this meeting');
      }
    }

    return formatMeeting(meeting);
  } catch (error) {
    console.error('Error getting meeting by ID:', error);
    throw error;
  }
}

async function getActiveMeetings(projectId = null) {
  try {
    let query = `
      SELECT 
        hm.*,
        u.username AS started_by_username,
        p.name AS project_name
      FROM hallway_meetings hm
      LEFT JOIN users u ON hm.started_by = u.id
      LEFT JOIN projects p ON hm.project_id = p.id
      WHERE hm.status = 'recording'
    `;
    const params = [];

    if (projectId) {
      query += ' AND hm.project_id = $1';
      params.push(projectId);
    }

    query += ' ORDER BY hm.started_at DESC';

    const result = await pool.query(query, params);
    return result.rows.map(formatMeeting);
  } catch (error) {
    console.error('Error getting active meetings:', error);
    throw error;
  }
}

async function getUserMeetings(userId, filters = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const { status, projectId, limit = 50, offset = 0 } = filters;
    
    let query = `
      SELECT 
        hm.*,
        u.username AS started_by_username,
        p.name AS project_name
      FROM hallway_meetings hm
      LEFT JOIN users u ON hm.started_by = u.id
      LEFT JOIN projects p ON hm.project_id = p.id
      WHERE hm.started_by = $1
    `;
    const params = [userId];
    let paramIndex = 2;

    if (status) {
      query += ` AND hm.status = $${paramIndex++}`;
      params.push(status);
    }

    if (projectId) {
      query += ` AND hm.project_id = $${paramIndex++}`;
      params.push(projectId);
    }

    query += ` ORDER BY hm.started_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows.map(formatMeeting);
  } catch (error) {
    console.error('Error getting user meetings:', error);
    throw error;
  }
}

async function getProjectMeetings(projectId, filters = {}) {
  if (!projectId) {
    throw new Error('projectId is required');
  }

  try {
    const { status, userId, limit = 50, offset = 0 } = filters;
    
    let query = `
      SELECT 
        hm.*,
        u.username AS started_by_username,
        p.name AS project_name
      FROM hallway_meetings hm
      LEFT JOIN users u ON hm.started_by = u.id
      LEFT JOIN projects p ON hm.project_id = p.id
      WHERE hm.project_id = $1
    `;
    const params = [projectId];
    let paramIndex = 2;

    if (status) {
      query += ` AND hm.status = $${paramIndex++}`;
      params.push(status);
    }

    if (userId) {
      query += ` AND hm.started_by = $${paramIndex++}`;
      params.push(userId);
    }

    query += ` ORDER BY hm.started_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows.map(formatMeeting);
  } catch (error) {
    console.error('Error getting project meetings:', error);
    throw error;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function triggerPostMeetingAnalysis(meetingId) {
  console.log(`[HallwayMeeting] Starting post-meeting analysis for ${meetingId}`);
  
  try {
    const transcript = await getFullTranscript(meetingId);
    
    const summary = `Meeting completed with ${transcript.totalChunks} transcript chunks.`;
    
    await pool.query(`
      UPDATE hallway_meetings
      SET 
        full_transcript = $1,
        summary_text = $2,
        transcription_status = 'completed',
        analysis_status = 'completed',
        status = 'completed',
        updated_at = NOW()
      WHERE id = $3
    `, [transcript.fullText, summary, meetingId]);

    console.log(`[HallwayMeeting] Completed analysis for meeting ${meetingId}`);
  } catch (error) {
    console.error(`[HallwayMeeting] Analysis failed for meeting ${meetingId}:`, error);
    
    await pool.query(`
      UPDATE hallway_meetings
      SET 
        analysis_status = 'failed',
        status = 'failed',
        updated_at = NOW()
      WHERE id = $1
    `, [meetingId]);
  }
}

function formatMeeting(meeting) {
  return {
    id: meeting.id,
    projectId: meeting.project_id,
    projectName: meeting.project_name,
    meetingTitle: meeting.meeting_title,
    locationDescription: meeting.location_description,
    meetingType: meeting.meeting_type,
    startedBy: meeting.started_by,
    startedByUsername: meeting.started_by_username,
    startedAt: meeting.started_at,
    endedAt: meeting.ended_at,
    durationSeconds: meeting.duration_seconds,
    activationMode: meeting.activation_mode,
    wakeWordDetected: meeting.wake_word_detected,
    wakeWordConfidence: meeting.wake_word_confidence ? parseFloat(meeting.wake_word_confidence) : null,
    status: meeting.status,
    transcriptionStatus: meeting.transcription_status,
    analysisStatus: meeting.analysis_status,
    participantsCount: meeting.participants_count,
    decisionsDetected: meeting.decisions_detected,
    risksDetected: meeting.risks_detected,
    actionItemsDetected: meeting.action_items_detected,
    summaryText: meeting.summary_text,
    keyTopics: meeting.key_topics,
    sentimentScore: meeting.sentiment_score ? parseFloat(meeting.sentiment_score) : null,
    deviceInfo: meeting.device_info,
    metadata: meeting.metadata,
    autoStoppedReason: meeting.auto_stopped_reason,
    createdAt: meeting.created_at,
    updatedAt: meeting.updated_at
  };
}

function formatParticipant(participant) {
  return {
    id: participant.id,
    meetingId: participant.meeting_id,
    userId: participant.user_id,
    username: participant.username,
    participantName: participant.participant_name,
    participantEmail: participant.participant_email || participant.user_email,
    participantRole: participant.participant_role,
    speakerLabel: participant.speaker_label,
    isOrganizer: participant.is_organizer,
    joinedAt: participant.joined_at,
    leftAt: participant.left_at,
    speakingTimeSeconds: participant.speaking_time_seconds,
    utteranceCount: participant.utterance_count,
    createdAt: participant.created_at
  };
}

function formatTranscriptChunk(chunk) {
  return {
    id: chunk.id,
    meetingId: chunk.meeting_id,
    participantId: chunk.participant_id,
    participantName: chunk.participant_name,
    username: chunk.username,
    content: chunk.content,
    speakerLabel: chunk.speaker_label,
    startTimeSeconds: chunk.start_time_seconds ? parseFloat(chunk.start_time_seconds) : null,
    endTimeSeconds: chunk.end_time_seconds ? parseFloat(chunk.end_time_seconds) : null,
    chunkSequence: chunk.chunk_sequence,
    confidence: chunk.confidence ? parseFloat(chunk.confidence) : null,
    isFinal: chunk.is_final,
    metadata: chunk.metadata,
    createdAt: chunk.created_at
  };
}

module.exports = {
  // Meeting Lifecycle
  startMeeting,
  endMeeting,
  cancelMeeting,
  pauseMeeting,
  resumeMeeting,
  
  // Participant Management
  addParticipant,
  removeParticipant,
  mapSpeakerToParticipant,
  getParticipants,
  
  // Transcript Management
  addTranscriptChunk,
  getFullTranscript,
  updateChunkSpeaker,
  
  // Query Functions
  getMeetingById,
  getActiveMeetings,
  getUserMeetings,
  getProjectMeetings
};
