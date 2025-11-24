const { createClient } = require('@deepgram/sdk');
const hallwayMeetingService = require('./hallwayMeetingService');

const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
let deepgramClient = null;

if (deepgramApiKey) {
  deepgramClient = createClient(deepgramApiKey);
  console.log('[HallwayTranscription] Deepgram client initialized');
} else {
  console.warn('[HallwayTranscription] DEEPGRAM_API_KEY not found - transcription unavailable');
}

const activeConnections = new Map();
const transcriptBuffers = new Map();

const DEEPGRAM_CONFIG = {
  model: 'nova-2',
  language: 'en-US',
  punctuate: true,
  diarize: true,
  interim_results: true,
  utterance_end_ms: 1000,
  smart_format: true
};

const BUFFER_DURATION_SECONDS = 30;
const ENTITY_DETECTION_INTERVAL_MS = 30000;

async function startTranscription(meetingId, options = {}) {
  if (!deepgramClient) {
    throw new Error('Deepgram client not initialized - DEEPGRAM_API_KEY required');
  }

  if (!meetingId) {
    throw new Error('meetingId is required');
  }

  const config = {
    ...DEEPGRAM_CONFIG,
    ...options
  };

  try {
    console.log(`[HallwayTranscription] Starting transcription for meeting ${meetingId}`);

    const connection = deepgramClient.listen.live(config);

    const connectionId = `meeting_${meetingId}_${Date.now()}`;
    
    const connectionData = {
      id: connectionId,
      meetingId,
      connection,
      startedAt: new Date(),
      config,
      retryCount: 0,
      maxRetries: 3,
      isActive: true
    };

    activeConnections.set(connectionId, connectionData);

    transcriptBuffers.set(meetingId, {
      chunks: [],
      lastAnalysisTime: Date.now()
    });

    setupEventHandlers(connectionId, connectionData);

    const detectionInterval = setInterval(() => {
      if (connectionData.isActive) {
        processRealtimeEntityDetection(meetingId).catch(err => {
          console.error(`[HallwayTranscription] Real-time entity detection failed for ${meetingId}:`, err);
        });
      } else {
        clearInterval(detectionInterval);
      }
    }, ENTITY_DETECTION_INTERVAL_MS);

    connectionData.detectionInterval = detectionInterval;

    console.log(`[HallwayTranscription] Transcription started for meeting ${meetingId}, connection: ${connectionId}`);

    return {
      connectionId,
      meetingId,
      config,
      sendAudio: (audioData) => {
        if (connection.getReadyState() === 1) {
          connection.send(audioData);
        } else {
          console.warn(`[HallwayTranscription] Connection ${connectionId} not ready, state: ${connection.getReadyState()}`);
        }
      },
      getStatus: () => ({
        connectionId,
        meetingId,
        isActive: connectionData.isActive,
        readyState: connection.getReadyState(),
        retryCount: connectionData.retryCount
      })
    };
  } catch (error) {
    console.error('[HallwayTranscription] Error starting transcription:', error);
    throw error;
  }
}

function setupEventHandlers(connectionId, connectionData) {
  const { connection, meetingId } = connectionData;

  connection.on('open', () => {
    console.log(`[HallwayTranscription] WebSocket opened for meeting ${meetingId}`);
  });

  connection.on('Results', async (data) => {
    try {
      await processTranscriptChunk(meetingId, data, connectionId);
    } catch (error) {
      console.error(`[HallwayTranscription] Error processing chunk for meeting ${meetingId}:`, error);
    }
  });

  connection.on('error', (error) => {
    console.error(`[HallwayTranscription] WebSocket error for meeting ${meetingId}:`, error);
    handleConnectionError(connectionId, error);
  });

  connection.on('close', () => {
    console.log(`[HallwayTranscription] WebSocket closed for meeting ${meetingId}`);
    cleanupConnection(connectionId);
  });

  connection.on('Metadata', (metadata) => {
    console.log(`[HallwayTranscription] Metadata for meeting ${meetingId}:`, metadata);
  });
}

async function processTranscriptChunk(meetingId, deepgramData, connectionId) {
  if (!deepgramData || !deepgramData.channel) {
    return;
  }

  const { alternatives, duration } = deepgramData.channel;
  if (!alternatives || alternatives.length === 0) {
    return;
  }

  const primary = alternatives[0];
  const transcript = primary.transcript;

  if (!transcript || transcript.trim().length === 0) {
    return;
  }

  const isFinal = deepgramData.is_final || false;
  const speakerLabel = deepgramData.channel.alternatives?.[0]?.words?.[0]?.speaker !== undefined
    ? `Speaker_${deepgramData.channel.alternatives[0].words[0].speaker}`
    : null;

  const startTime = deepgramData.start || 0;
  const words = primary.words || [];
  const endTime = words.length > 0 
    ? words[words.length - 1].end 
    : startTime + (duration || 0);

  const confidence = primary.confidence || 0;

  try {
    const chunk = await hallwayMeetingService.addTranscriptChunk(meetingId, {
      content: transcript,
      speakerLabel,
      startTimeSeconds: startTime,
      endTimeSeconds: endTime,
      confidence,
      isFinal,
      metadata: {
        connectionId,
        words: words.map(w => ({
          word: w.word,
          start: w.start,
          end: w.end,
          confidence: w.confidence,
          speaker: w.speaker
        }))
      }
    });

    if (isFinal) {
      addToTranscriptBuffer(meetingId, {
        content: transcript,
        speakerLabel,
        timestamp: Date.now(),
        startTimeSeconds: startTime,
        endTimeSeconds: endTime
      });

      console.log(`[HallwayTranscription] Saved final chunk for meeting ${meetingId}: "${transcript.substring(0, 50)}..."`);
    }

    return chunk;
  } catch (error) {
    console.error(`[HallwayTranscription] Error saving transcript chunk:`, error);
    throw error;
  }
}

function addToTranscriptBuffer(meetingId, chunk) {
  const buffer = transcriptBuffers.get(meetingId);
  if (!buffer) return;

  buffer.chunks.push(chunk);

  const cutoffTime = Date.now() - (BUFFER_DURATION_SECONDS * 1000);
  buffer.chunks = buffer.chunks.filter(c => c.timestamp > cutoffTime);
}

async function processRealtimeEntityDetection(meetingId) {
  const buffer = transcriptBuffers.get(meetingId);
  if (!buffer || buffer.chunks.length === 0) {
    return;
  }

  const recentTranscript = buffer.chunks
    .map(c => `[${c.speakerLabel || 'Unknown'}]: ${c.content}`)
    .join('\n');

  console.log(`[HallwayTranscription] Running real-time entity detection for meeting ${meetingId} (${buffer.chunks.length} chunks)`);

  try {
    const sidecarBot = require('./sidecarBot');
    
    const analysisResult = await sidecarBot.analyzeContent(
      recentTranscript,
      null,
      meetingId,
      {
        detectionMode: 'real_time',
        meetingId,
        source: 'hallway_meeting'
      }
    );

    if (analysisResult && analysisResult.entities) {
      console.log(`[HallwayTranscription] Detected ${analysisResult.entities.length} entities in real-time for meeting ${meetingId}`);
    }

    buffer.lastAnalysisTime = Date.now();
  } catch (error) {
    if (error.message && error.message.includes('Sidecar Bot')) {
      console.log(`[HallwayTranscription] Sidecar Bot not available, skipping entity detection`);
    } else {
      console.error(`[HallwayTranscription] Real-time entity detection error:`, error);
    }
  }
}

async function stopTranscription(connectionId) {
  if (!connectionId) {
    throw new Error('connectionId is required');
  }

  const connectionData = activeConnections.get(connectionId);
  if (!connectionData) {
    console.warn(`[HallwayTranscription] Connection ${connectionId} not found`);
    return { success: false, message: 'Connection not found' };
  }

  const { connection, meetingId, detectionInterval } = connectionData;

  try {
    console.log(`[HallwayTranscription] Stopping transcription for meeting ${meetingId}`);

    connectionData.isActive = false;

    if (detectionInterval) {
      clearInterval(detectionInterval);
    }

    if (connection.getReadyState() === 1) {
      connection.finish();
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    const pool = require('../db');
    await pool.query(`
      UPDATE hallway_meetings
      SET 
        transcription_status = 'completed',
        updated_at = NOW()
      WHERE id = $1
    `, [meetingId]);

    cleanupConnection(connectionId);

    console.log(`[HallwayTranscription] Transcription stopped for meeting ${meetingId}`);

    return {
      success: true,
      meetingId,
      connectionId
    };
  } catch (error) {
    console.error('[HallwayTranscription] Error stopping transcription:', error);
    throw error;
  }
}

function handleConnectionError(connectionId, error) {
  const connectionData = activeConnections.get(connectionId);
  if (!connectionData) return;

  const { meetingId, retryCount, maxRetries } = connectionData;

  console.error(`[HallwayTranscription] Connection error for meeting ${meetingId}, retry ${retryCount}/${maxRetries}`);

  if (retryCount < maxRetries) {
    connectionData.retryCount += 1;
    
    setTimeout(() => {
      console.log(`[HallwayTranscription] Attempting to reconnect meeting ${meetingId}...`);
      startTranscription(meetingId, connectionData.config)
        .then(() => {
          console.log(`[HallwayTranscription] Reconnected meeting ${meetingId}`);
          activeConnections.delete(connectionId);
        })
        .catch(err => {
          console.error(`[HallwayTranscription] Reconnection failed for meeting ${meetingId}:`, err);
        });
    }, 2000 * (retryCount + 1));
  } else {
    console.error(`[HallwayTranscription] Max retries reached for meeting ${meetingId}, giving up`);
    connectionData.isActive = false;
    
    const pool = require('../db');
    pool.query(`
      UPDATE hallway_meetings
      SET 
        transcription_status = 'failed',
        updated_at = NOW()
      WHERE id = $1
    `, [meetingId]).catch(err => {
      console.error(`[HallwayTranscription] Error updating meeting status:`, err);
    });
  }
}

function cleanupConnection(connectionId) {
  const connectionData = activeConnections.get(connectionId);
  if (connectionData) {
    connectionData.isActive = false;
    
    if (connectionData.detectionInterval) {
      clearInterval(connectionData.detectionInterval);
    }
    
    activeConnections.delete(connectionId);
    
    if (transcriptBuffers.has(connectionData.meetingId)) {
      transcriptBuffers.delete(connectionData.meetingId);
    }
    
    console.log(`[HallwayTranscription] Cleaned up connection ${connectionId}`);
  }
}

async function getTranscriptionStatus(meetingId) {
  if (!meetingId) {
    throw new Error('meetingId is required');
  }

  const activeConnection = Array.from(activeConnections.values())
    .find(conn => conn.meetingId === meetingId);

  const buffer = transcriptBuffers.get(meetingId);

  return {
    meetingId,
    isActive: activeConnection ? activeConnection.isActive : false,
    connectionId: activeConnection ? activeConnection.id : null,
    retryCount: activeConnection ? activeConnection.retryCount : 0,
    bufferSize: buffer ? buffer.chunks.length : 0,
    lastAnalysisTime: buffer ? buffer.lastAnalysisTime : null
  };
}

async function stopAllTranscriptions() {
  console.log(`[HallwayTranscription] Stopping all active transcriptions (${activeConnections.size})`);
  
  const promises = Array.from(activeConnections.keys()).map(connectionId => 
    stopTranscription(connectionId).catch(err => {
      console.error(`Error stopping connection ${connectionId}:`, err);
    })
  );

  await Promise.all(promises);
  
  console.log('[HallwayTranscription] All transcriptions stopped');
}

function createSpeakerMapping(meetingId, speakerLabel) {
  const pool = require('../db');
  
  return pool.query(`
    INSERT INTO hallway_speaker_mappings (
      meeting_id,
      speaker_label,
      mapping_method,
      confidence
    ) VALUES ($1, $2, $3, $4)
    ON CONFLICT (meeting_id, speaker_label) DO NOTHING
    RETURNING *
  `, [meetingId, speakerLabel, 'auto', 0.5]);
}

module.exports = {
  startTranscription,
  processTranscriptChunk,
  stopTranscription,
  getTranscriptionStatus,
  stopAllTranscriptions,
  createSpeakerMapping,
  isDeepgramAvailable: () => !!deepgramClient,
  DEEPGRAM_CONFIG
};
