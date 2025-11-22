/**
 * Real-Time Transcription Service
 * Integrates with Deepgram (Zoom) and Azure Speech (Teams) for live meeting transcription
 * Handles WebSocket connections, audio processing, and transcript storage
 */

const { pool } = require('../db');
const WebSocket = require('ws');
const { createClient } = require('@deepgram/sdk');

// Configuration
const CONFIG = {
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  DEEPGRAM_MODEL: process.env.DEEPGRAM_MODEL || 'nova-2',
  AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY,
  AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || 'eastus',
  ENTITY_DETECTION_INTERVAL: 30000, // 30 seconds
  MAX_RECONNECT_ATTEMPTS: 3,
  TRANSCRIPT_BUFFER_SIZE: 5000 // chars
};

class TranscriptionService {
  constructor() {
    // Active WebSocket connections by meeting ID
    this.activeConnections = new Map();
    
    // Deepgram client instance
    this.deepgramClient = CONFIG.DEEPGRAM_API_KEY ? createClient(CONFIG.DEEPGRAM_API_KEY) : null;
    
    // Azure Speech recognizers by meeting ID
    this.azureRecognizers = new Map();
    
    // Track last entity detection time per meeting
    this.lastDetectionTime = new Map();
    
    // Track reconnection attempts
    this.reconnectAttempts = new Map();
    
    // Meeting session metadata
    this.meetingSessions = new Map();
  }

  /**
   * Start transcription for a meeting
   * @param {Object} params - { meetingId, platform, projectId, userId, meetingTitle, activationMode }
   * @returns {Promise<Object>} Session info with connection details
   */
  async startTranscription({ meetingId, platform, projectId, userId, meetingTitle, activationMode = 'manual' }) {
    try {
      console.log(`[Transcription] Starting transcription for ${platform} meeting: ${meetingId}`);

      // Validate platform
      if (!['zoom', 'teams'].includes(platform)) {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      // Check if already transcribing
      if (this.activeConnections.has(meetingId)) {
        throw new Error(`Meeting ${meetingId} is already being transcribed`);
      }

      // Create meeting transcription record
      const result = await pool.query(`
        INSERT INTO meeting_transcriptions (
          project_id, meeting_platform, meeting_id, meeting_title,
          started_by, activation_mode, transcription_provider, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (meeting_platform, meeting_id) 
        DO UPDATE SET 
          status = 'active',
          started_at = NOW(),
          ended_at = NULL,
          error_message = NULL
        RETURNING id, started_at
      `, [
        projectId,
        platform,
        meetingId,
        meetingTitle,
        userId,
        activationMode,
        platform === 'zoom' ? 'deepgram' : 'azure_speech',
        'active'
      ]);

      const dbMeetingId = result.rows[0].id;
      const startedAt = result.rows[0].started_at;

      // Store session metadata
      this.meetingSessions.set(meetingId, {
        dbMeetingId,
        platform,
        projectId,
        startedAt,
        userId
      });

      // Initialize reconnection tracking
      this.reconnectAttempts.set(meetingId, 0);

      // Establish connection based on platform
      let connectionInfo;
      if (platform === 'zoom') {
        connectionInfo = await this.establishDeepgramConnection(meetingId, dbMeetingId);
      } else {
        connectionInfo = await this.establishAzureConnection(meetingId, dbMeetingId);
      }

      console.log(`[Transcription] Successfully started transcription for meeting ${meetingId}`);

      return {
        success: true,
        meetingId,
        dbMeetingId,
        platform,
        provider: platform === 'zoom' ? 'deepgram' : 'azure_speech',
        startedAt,
        connectionInfo
      };

    } catch (error) {
      console.error('[Transcription] Error starting transcription:', error);
      throw error;
    }
  }

  /**
   * Establish Deepgram WebSocket connection (for Zoom)
   */
  async establishDeepgramConnection(meetingId, dbMeetingId) {
    if (!this.deepgramClient) {
      throw new Error('Deepgram client not initialized. Missing DEEPGRAM_API_KEY');
    }

    try {
      // Create live transcription connection
      const connection = this.deepgramClient.listen.live({
        model: CONFIG.DEEPGRAM_MODEL,
        punctuate: true,
        diarize: true,
        smart_format: true,
        interim_results: true,
        utterance_end_ms: 1000,
        vad_events: true,
        language: 'en-US'
      });

      // Handle transcript results
      connection.on('Results', (data) => {
        this.handleDeepgramResults(meetingId, dbMeetingId, data);
      });

      // Handle metadata
      connection.on('Metadata', (data) => {
        console.log(`[Deepgram] Metadata for ${meetingId}:`, data);
      });

      // Handle errors
      connection.on('error', (error) => {
        this.handleWebSocketError(meetingId, error);
      });

      // Handle close
      connection.on('close', () => {
        console.log(`[Deepgram] Connection closed for ${meetingId}`);
        this.activeConnections.delete(meetingId);
      });

      // Store connection
      this.activeConnections.set(meetingId, {
        type: 'deepgram',
        connection,
        dbMeetingId
      });

      return {
        type: 'deepgram',
        status: 'connected',
        model: CONFIG.DEEPGRAM_MODEL
      };

    } catch (error) {
      console.error('[Deepgram] Connection error:', error);
      throw error;
    }
  }

  /**
   * Establish Azure Speech connection (for Teams)
   */
  async establishAzureConnection(meetingId, dbMeetingId) {
    if (!CONFIG.AZURE_SPEECH_KEY) {
      throw new Error('Azure Speech not configured. Missing AZURE_SPEECH_KEY');
    }

    try {
      // Note: Azure Speech SDK requires different setup for Teams
      // This is a simplified version - actual Teams integration uses Graph API
      const sdk = require('microsoft-cognitiveservices-speech-sdk');
      
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        CONFIG.AZURE_SPEECH_KEY,
        CONFIG.AZURE_SPEECH_REGION
      );

      speechConfig.speechRecognitionLanguage = 'en-US';
      speechConfig.enableDictation();
      speechConfig.requestWordLevelTimestamps();

      // Create audio config (for Teams, audio comes from Graph API stream)
      const audioConfig = sdk.AudioConfig.fromDefaultMicrophoneInput();
      
      // Create recognizer
      const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

      // Handle recognized speech
      recognizer.recognized = (s, e) => {
        if (e.result.reason === sdk.ResultReason.RecognizedSpeech) {
          this.handleAzureSpeechResult(meetingId, dbMeetingId, e.result);
        }
      };

      // Handle errors
      recognizer.canceled = (s, e) => {
        console.error(`[Azure Speech] Canceled: ${e.errorDetails}`);
        this.handleWebSocketError(meetingId, new Error(e.errorDetails));
      };

      // Start continuous recognition
      recognizer.startContinuousRecognitionAsync(
        () => {
          console.log(`[Azure Speech] Recognition started for ${meetingId}`);
        },
        (error) => {
          console.error('[Azure Speech] Start error:', error);
          this.handleWebSocketError(meetingId, error);
        }
      );

      // Store recognizer
      this.azureRecognizers.set(meetingId, recognizer);
      this.activeConnections.set(meetingId, {
        type: 'azure',
        recognizer,
        dbMeetingId
      });

      return {
        type: 'azure_speech',
        status: 'connected',
        region: CONFIG.AZURE_SPEECH_REGION
      };

    } catch (error) {
      console.error('[Azure Speech] Connection error:', error);
      throw error;
    }
  }

  /**
   * Handle Deepgram transcript results
   */
  async handleDeepgramResults(meetingId, dbMeetingId, data) {
    try {
      const { channel, type } = data;

      if (type === 'Results') {
        const alternative = channel?.alternatives?.[0];
        if (!alternative) return;

        const transcript = alternative.transcript;
        if (!transcript || transcript.trim().length === 0) return;

        const confidence = alternative.confidence || 0;
        const isFinal = data.is_final || false;
        const speaker = data.channel?.alternatives?.[0]?.words?.[0]?.speaker || 0;
        const start = data.start || 0;
        const duration = data.duration || 0;

        // Store transcript chunk
        await this.storeTranscriptChunk({
          dbMeetingId,
          meetingId,
          speaker: `Speaker ${speaker}`,
          speakerId: `speaker_${speaker}`,
          content: transcript,
          confidence,
          isFinal,
          startTime: start,
          duration
        });
      }
    } catch (error) {
      console.error('[Deepgram] Error handling results:', error);
    }
  }

  /**
   * Handle Azure Speech results
   */
  async handleAzureSpeechResult(meetingId, dbMeetingId, result) {
    try {
      const transcript = result.text;
      if (!transcript || transcript.trim().length === 0) return;

      const confidence = result.confidence || 0;
      const speaker = result.speakerId || 'Unknown';
      const startTime = result.offset / 10000000; // Convert ticks to seconds
      const duration = result.duration / 10000000;

      // Store transcript chunk
      await this.storeTranscriptChunk({
        dbMeetingId,
        meetingId,
        speaker,
        speakerId: result.speakerId || 'unknown',
        content: transcript,
        confidence,
        isFinal: true,
        startTime,
        duration
      });
    } catch (error) {
      console.error('[Azure Speech] Error handling result:', error);
    }
  }

  /**
   * Process audio chunk (for Zoom/Deepgram)
   */
  async processAudioChunk({ meetingId, audioData, timestamp }) {
    try {
      const connectionInfo = this.activeConnections.get(meetingId);
      
      if (!connectionInfo || connectionInfo.type !== 'deepgram') {
        throw new Error(`No active Deepgram connection for meeting ${meetingId}`);
      }

      // Send audio to Deepgram
      connectionInfo.connection.send(audioData);

    } catch (error) {
      console.error('[Transcription] Error processing audio chunk:', error);
      throw error;
    }
  }

  /**
   * Process Teams transcript event (Teams provides transcripts directly)
   */
  async processTeamsTranscript({ meetingId, transcript, speaker, timestamp, confidence = 0.95 }) {
    try {
      const session = this.meetingSessions.get(meetingId);
      if (!session) {
        throw new Error(`No active session for meeting ${meetingId}`);
      }

      // Calculate time offset from meeting start
      const startTime = (new Date(timestamp) - new Date(session.startedAt)) / 1000;

      // Store transcript chunk
      await this.storeTranscriptChunk({
        dbMeetingId: session.dbMeetingId,
        meetingId,
        speaker: speaker.name || 'Unknown',
        speakerId: speaker.id || 'unknown',
        content: transcript,
        confidence,
        isFinal: true,
        startTime,
        duration: 2.0 // Estimated, Teams doesn't provide exact duration
      });

    } catch (error) {
      console.error('[Teams] Error processing transcript:', error);
      throw error;
    }
  }

  /**
   * Store transcript chunk in database
   */
  async storeTranscriptChunk({ dbMeetingId, meetingId, speaker, speakerId, content, confidence, isFinal, startTime, duration }) {
    try {
      // Get next sequence number
      const { rows: [{ max_seq }] } = await pool.query(
        'SELECT COALESCE(MAX(chunk_sequence), 0) as max_seq FROM transcript_chunks WHERE meeting_id = $1',
        [dbMeetingId]
      );

      // Insert chunk
      await pool.query(`
        INSERT INTO transcript_chunks (
          meeting_id, speaker_name, speaker_id, content, confidence, is_final,
          start_time_seconds, end_time_seconds, chunk_sequence, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING id
      `, [
        dbMeetingId,
        speaker,
        speakerId,
        content,
        confidence,
        isFinal,
        startTime,
        startTime + duration,
        max_seq + 1
      ]);

      // Update full transcript (for final results only)
      if (isFinal) {
        await pool.query(`
          UPDATE meeting_transcriptions 
          SET full_transcript = COALESCE(full_transcript, '') || $1 || E'\n'
          WHERE id = $2
        `, [
          `[${speaker}] ${content}`,
          dbMeetingId
        ]);
      }

      // Check if we should trigger entity detection
      if (isFinal && this.shouldTriggerEntityDetection(meetingId)) {
        await this.triggerLiveEntityDetection(dbMeetingId, meetingId);
      }

    } catch (error) {
      console.error('[Transcription] Error storing chunk:', error);
      throw error;
    }
  }

  /**
   * Check if entity detection should be triggered
   */
  shouldTriggerEntityDetection(meetingId) {
    const lastDetection = this.lastDetectionTime.get(meetingId) || 0;
    const now = Date.now();

    // Trigger every 30 seconds
    if (now - lastDetection > CONFIG.ENTITY_DETECTION_INTERVAL) {
      this.lastDetectionTime.set(meetingId, now);
      return true;
    }
    return false;
  }

  /**
   * Trigger live entity detection on recent transcript
   */
  async triggerLiveEntityDetection(dbMeetingId, meetingId) {
    try {
      // Get recent chunks (last 30 seconds of final transcript)
      const chunks = await pool.query(`
        SELECT id, content, speaker_name, start_time_seconds
        FROM transcript_chunks
        WHERE meeting_id = $1
          AND is_final = true
          AND start_time_seconds > (
            SELECT EXTRACT(EPOCH FROM (NOW() - started_at)) - 30
            FROM meeting_transcriptions
            WHERE id = $1
          )
        ORDER BY chunk_sequence ASC
      `, [dbMeetingId]);

      if (chunks.rows.length === 0) return;

      // Combine into single text
      const combinedText = chunks.rows
        .map(c => `${c.speaker_name}: ${c.content}`)
        .join('\n');

      console.log(`[Entity Detection] Triggering for meeting ${meetingId} (${chunks.rows.length} chunks)`);

      // Trigger async entity detection (don't wait)
      // This would integrate with your existing AI entity detection service
      process.nextTick(() => {
        this.detectEntitiesFromTranscript({
          dbMeetingId,
          meetingId,
          transcript: combinedText,
          chunks: chunks.rows
        }).catch(err => {
          console.error('[Entity Detection] Error:', err);
        });
      });

    } catch (error) {
      console.error('[Entity Detection] Trigger error:', error);
    }
  }

  /**
   * Detect entities from transcript (placeholder for AI integration)
   */
  async detectEntitiesFromTranscript({ dbMeetingId, meetingId, transcript, chunks }) {
    // TODO: Integrate with your AI entity detection service (sidecarBot.js)
    // This is a placeholder showing the expected integration point
    
    console.log(`[Entity Detection] Analyzing transcript for meeting ${meetingId}`);
    
    // Example: Call your existing AI service
    // const sidecarBot = require('./sidecarBot');
    // const result = await sidecarBot.analyzeContent({
    //   projectId: session.projectId,
    //   content: transcript,
    //   source: { type: 'meeting_transcript', meetingId },
    //   userId: session.userId
    // });
    
    // Store detected entities in live_entity_detections table
    // for (const entity of result.entities) {
    //   await pool.query(`
    //     INSERT INTO live_entity_detections (
    //       meeting_id, chunk_id, entity_type, title, description,
    //       confidence, impact_level, metadata
    //     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    //   `, [...]);
    // }
  }

  /**
   * Stop transcription
   */
  async stopTranscription(meetingId) {
    try {
      console.log(`[Transcription] Stopping transcription for ${meetingId}`);

      const connectionInfo = this.activeConnections.get(meetingId);
      const session = this.meetingSessions.get(meetingId);

      if (!session) {
        throw new Error(`No active session for meeting ${meetingId}`);
      }

      // Close connections
      if (connectionInfo) {
        if (connectionInfo.type === 'deepgram' && connectionInfo.connection) {
          connectionInfo.connection.finish();
        } else if (connectionInfo.type === 'azure' && connectionInfo.recognizer) {
          connectionInfo.recognizer.stopContinuousRecognitionAsync();
          connectionInfo.recognizer.close();
        }
        this.activeConnections.delete(meetingId);
      }

      // Update database
      await pool.query(`
        UPDATE meeting_transcriptions 
        SET status = 'ended', ended_at = NOW()
        WHERE id = $1
      `, [session.dbMeetingId]);

      // Cleanup
      this.meetingSessions.delete(meetingId);
      this.lastDetectionTime.delete(meetingId);
      this.reconnectAttempts.delete(meetingId);
      this.azureRecognizers.delete(meetingId);

      console.log(`[Transcription] Successfully stopped transcription for ${meetingId}`);

      // Trigger post-meeting summary generation (async)
      process.nextTick(() => {
        this.generateMeetingSummary(session.dbMeetingId).catch(err => {
          console.error('[Summary] Generation error:', err);
        });
      });

      return { success: true, meetingId };

    } catch (error) {
      console.error('[Transcription] Error stopping transcription:', error);
      throw error;
    }
  }

  /**
   * Pause transcription
   */
  async pauseTranscription(meetingId) {
    const session = this.meetingSessions.get(meetingId);
    if (!session) {
      throw new Error(`No active session for meeting ${meetingId}`);
    }

    await pool.query(
      'UPDATE meeting_transcriptions SET status = $1 WHERE id = $2',
      ['paused', session.dbMeetingId]
    );

    return { success: true, status: 'paused' };
  }

  /**
   * Resume transcription
   */
  async resumeTranscription(meetingId) {
    const session = this.meetingSessions.get(meetingId);
    if (!session) {
      throw new Error(`No active session for meeting ${meetingId}`);
    }

    await pool.query(
      'UPDATE meeting_transcriptions SET status = $1 WHERE id = $2',
      ['active', session.dbMeetingId]
    );

    return { success: true, status: 'active' };
  }

  /**
   * Get live transcript for a meeting
   */
  async getLiveTranscript(meetingId, since = null) {
    try {
      const session = this.meetingSessions.get(meetingId);
      if (!session) {
        throw new Error(`No active session for meeting ${meetingId}`);
      }

      let query = `
        SELECT 
          id, speaker_name, speaker_id, content, confidence,
          is_final, start_time_seconds, end_time_seconds, chunk_sequence, created_at
        FROM transcript_chunks
        WHERE meeting_id = $1
      `;
      const params = [session.dbMeetingId];

      if (since) {
        query += ' AND created_at > $2';
        params.push(since);
      }

      query += ' ORDER BY chunk_sequence ASC LIMIT 100';

      const result = await pool.query(query, params);

      return {
        meetingId,
        chunks: result.rows,
        count: result.rows.length
      };

    } catch (error) {
      console.error('[Transcription] Error getting transcript:', error);
      throw error;
    }
  }

  /**
   * Get meeting status
   */
  async getMeetingStatus(meetingId) {
    try {
      const session = this.meetingSessions.get(meetingId);
      if (!session) {
        // Check database
        const result = await pool.query(`
          SELECT 
            mt.id, mt.status, mt.started_at, mt.ended_at, mt.duration_seconds,
            COUNT(DISTINCT mp.id) as participant_count,
            COUNT(DISTINCT tc.id) as chunk_count
          FROM meeting_transcriptions mt
          LEFT JOIN meeting_participants mp ON mt.id = mp.meeting_id
          LEFT JOIN transcript_chunks tc ON mt.id = tc.meeting_id
          WHERE mt.meeting_id = $1
          GROUP BY mt.id
        `, [meetingId]);

        if (result.rows.length === 0) {
          return null;
        }

        return result.rows[0];
      }

      // Get live status
      const result = await pool.query(`
        SELECT 
          mt.id, mt.status, mt.started_at, mt.ended_at, mt.duration_seconds,
          COUNT(DISTINCT mp.id) as participant_count,
          COUNT(DISTINCT tc.id) as chunk_count,
          EXTRACT(EPOCH FROM (NOW() - mt.started_at))::INTEGER as current_duration
        FROM meeting_transcriptions mt
        LEFT JOIN meeting_participants mp ON mt.id = mp.meeting_id
        LEFT JOIN transcript_chunks tc ON mt.id = tc.meeting_id
        WHERE mt.id = $1
        GROUP BY mt.id
      `, [session.dbMeetingId]);

      return result.rows[0] || null;

    } catch (error) {
      console.error('[Transcription] Error getting status:', error);
      throw error;
    }
  }

  /**
   * Generate meeting summary (post-meeting)
   */
  async generateMeetingSummary(dbMeetingId) {
    try {
      console.log(`[Summary] Generating summary for meeting ${dbMeetingId}`);

      // Get full transcript
      const { rows: [meeting] } = await pool.query(
        'SELECT full_transcript, project_id FROM meeting_transcriptions WHERE id = $1',
        [dbMeetingId]
      );

      if (!meeting || !meeting.full_transcript) {
        console.log('[Summary] No transcript available');
        return;
      }

      // TODO: Integrate with AI service for summary generation
      // const summaryText = await generateAISummary(meeting.full_transcript);

      // Get counts
      const { rows: [counts] } = await pool.query(`
        SELECT 
          COUNT(DISTINCT CASE WHEN entity_type = 'decision' THEN id END) as decisions,
          COUNT(DISTINCT CASE WHEN entity_type = 'risk' THEN id END) as risks,
          COUNT(DISTINCT CASE WHEN entity_type = 'action_item' THEN id END) as action_items
        FROM live_entity_detections
        WHERE meeting_id = $1
      `, [dbMeetingId]);

      const { rows: [stats] } = await pool.query(`
        SELECT 
          COUNT(DISTINCT id) as participants,
          COALESCE(SUM(speaking_time_seconds), 0) as total_time
        FROM meeting_participants
        WHERE meeting_id = $1
      `, [dbMeetingId]);

      // Store summary
      await pool.query(`
        INSERT INTO meeting_summaries (
          meeting_id, summary_text, key_decisions, key_risks, action_items,
          participants_count, total_speaking_time, ai_provider
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        dbMeetingId,
        'Summary generation pending', // Placeholder
        counts.decisions || 0,
        counts.risks || 0,
        counts.action_items || 0,
        stats.participants || 0,
        stats.total_time || 0,
        'pending'
      ]);

      console.log(`[Summary] Summary generated for meeting ${dbMeetingId}`);

    } catch (error) {
      console.error('[Summary] Generation error:', error);
    }
  }

  /**
   * Handle WebSocket errors
   */
  handleWebSocketError(meetingId, error) {
    console.error(`[Transcription] WebSocket error for meeting ${meetingId}:`, error);

    const session = this.meetingSessions.get(meetingId);
    if (!session) return;

    // Update meeting status
    pool.query(
      'UPDATE meeting_transcriptions SET status = $1, error_message = $2 WHERE id = $3',
      ['error', error.message, session.dbMeetingId]
    ).catch(err => console.error('[Transcription] Error updating status:', err));

    // Attempt reconnection (max 3 retries)
    const attempts = this.reconnectAttempts.get(meetingId) || 0;
    if (attempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
      console.log(`[Transcription] Scheduling reconnection for ${meetingId} (attempt ${attempts + 1}/${CONFIG.MAX_RECONNECT_ATTEMPTS})`);
      setTimeout(() => this.reconnect(meetingId), 5000);
    } else {
      console.error(`[Transcription] Max reconnection attempts reached for ${meetingId}`);
    }
  }

  /**
   * Reconnect to transcription service
   */
  async reconnect(meetingId) {
    try {
      const session = this.meetingSessions.get(meetingId);
      if (!session) {
        console.log(`[Transcription] Session no longer exists for ${meetingId}`);
        return;
      }

      const attempts = this.reconnectAttempts.get(meetingId) || 0;
      this.reconnectAttempts.set(meetingId, attempts + 1);

      console.log(`[Transcription] Reconnecting ${meetingId} (attempt ${attempts + 1}/${CONFIG.MAX_RECONNECT_ATTEMPTS})`);

      // Close existing connection
      const connectionInfo = this.activeConnections.get(meetingId);
      if (connectionInfo) {
        if (connectionInfo.type === 'deepgram') {
          connectionInfo.connection.finish();
        } else if (connectionInfo.type === 'azure') {
          connectionInfo.recognizer.close();
        }
        this.activeConnections.delete(meetingId);
      }

      // Recreate connection
      if (session.platform === 'zoom') {
        await this.establishDeepgramConnection(meetingId, session.dbMeetingId);
      } else {
        await this.establishAzureConnection(meetingId, session.dbMeetingId);
      }

      // Update status
      await pool.query(
        'UPDATE meeting_transcriptions SET status = $1, error_message = NULL WHERE id = $2',
        ['active', session.dbMeetingId]
      );

      console.log(`[Transcription] Successfully reconnected ${meetingId}`);

    } catch (error) {
      console.error(`[Transcription] Reconnection failed for ${meetingId}:`, error);
    }
  }
}

// Export singleton instance
module.exports = new TranscriptionService();
