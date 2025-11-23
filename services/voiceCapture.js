/**
 * Voice Capture Service
 * 
 * Handles voice-to-text transcription using Deepgram API
 * Supports:
 * - Real-time transcription from audio streams
 * - File-based transcription from uploaded recordings
 * - Confidence scoring
 * - Multiple audio formats (webm, mp3, wav, ogg)
 */

const { createClient } = require('@deepgram/sdk');
const { pool } = require('../db');
const fs = require('fs').promises;
const path = require('path');

// Initialize Deepgram client
const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
let deepgramClient = null;

if (deepgramApiKey) {
  deepgramClient = createClient(deepgramApiKey);
  console.log('✅ Deepgram voice capture service initialized');
} else {
  console.warn('⚠️  DEEPGRAM_API_KEY not set. Voice transcription will use fallback mode.');
}

/**
 * Transcribe audio file to text
 * 
 * @param {string} audioFilePath - Path to audio file
 * @param {object} options - Transcription options
 * @returns {Promise<object>} - Transcription result with text, confidence, metadata
 */
async function transcribeAudioFile(audioFilePath, options = {}) {
  if (!deepgramClient) {
    throw new Error('Deepgram client not initialized. Check DEEPGRAM_API_KEY.');
  }

  try {
    // Read audio file
    const audioBuffer = await fs.readFile(audioFilePath);

    // Prepare transcription options
    const transcriptionOptions = {
      model: options.model || 'nova-2',
      language: options.language || 'en',
      punctuate: true,
      diarize: false,
      smart_format: true,
      utterances: false,
      ...options
    };

    // Call Deepgram API
    const { result, error } = await deepgramClient.listen.prerecorded.transcribeFile(
      audioBuffer,
      transcriptionOptions
    );

    if (error) {
      throw new Error(`Deepgram transcription error: ${error.message}`);
    }

    // Extract transcription results
    const channel = result.results.channels[0];
    const alternative = channel.alternatives[0];

    const transcriptionResult = {
      text: alternative.transcript,
      confidence: alternative.confidence,
      words: alternative.words || [],
      duration: result.metadata.duration,
      provider: 'deepgram',
      model: transcriptionOptions.model,
      metadata: {
        model_info: result.metadata.model_info,
        channels: result.metadata.channels,
        created: result.metadata.created
      }
    };

    return transcriptionResult;
  } catch (error) {
    console.error('Voice transcription error:', error);
    throw error;
  }
}

/**
 * Transcribe audio from URL
 * 
 * @param {string} audioUrl - URL to audio file
 * @param {object} options - Transcription options
 * @returns {Promise<object>} - Transcription result
 */
async function transcribeAudioUrl(audioUrl, options = {}) {
  if (!deepgramClient) {
    throw new Error('Deepgram client not initialized. Check DEEPGRAM_API_KEY.');
  }

  try {
    const transcriptionOptions = {
      model: options.model || 'nova-2',
      language: options.language || 'en',
      punctuate: true,
      smart_format: true,
      ...options
    };

    const { result, error } = await deepgramClient.listen.prerecorded.transcribeUrl(
      { url: audioUrl },
      transcriptionOptions
    );

    if (error) {
      throw new Error(`Deepgram transcription error: ${error.message}`);
    }

    const channel = result.results.channels[0];
    const alternative = channel.alternatives[0];

    return {
      text: alternative.transcript,
      confidence: alternative.confidence,
      words: alternative.words || [],
      duration: result.metadata.duration,
      provider: 'deepgram',
      model: transcriptionOptions.model
    };
  } catch (error) {
    console.error('URL transcription error:', error);
    throw error;
  }
}

/**
 * Store voice recording in database
 * 
 * @param {number} thoughtCaptureId - ID of the thought capture
 * @param {object} recordingData - Voice recording metadata
 * @returns {Promise<object>} - Created voice recording record
 */
async function storeVoiceRecording(thoughtCaptureId, recordingData) {
  const {
    audioUrl,
    storageProvider = 'local',
    durationSeconds,
    fileSizeBytes,
    format,
    transcriptionProvider,
    transcriptionText,
    transcriptionConfidence,
    transcriptionMetadata
  } = recordingData;

  try {
    const result = await pool.query(`
      INSERT INTO voice_recordings (
        thought_capture_id,
        audio_url,
        storage_provider,
        duration_seconds,
        file_size_bytes,
        format,
        transcription_provider,
        transcription_text,
        transcription_confidence,
        transcription_metadata,
        is_processed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      RETURNING *
    `, [
      thoughtCaptureId,
      audioUrl,
      storageProvider,
      durationSeconds,
      fileSizeBytes,
      format,
      transcriptionProvider,
      transcriptionText,
      transcriptionConfidence,
      transcriptionMetadata ? JSON.stringify(transcriptionMetadata) : null
    ]);

    return result.rows[0];
  } catch (error) {
    console.error('Error storing voice recording:', error);
    throw error;
  }
}

/**
 * Get voice recording by ID
 * 
 * @param {number} recordingId - Voice recording ID
 * @returns {Promise<object>} - Voice recording record
 */
async function getVoiceRecording(recordingId) {
  try {
    const result = await pool.query(`
      SELECT * FROM voice_recordings WHERE id = $1
    `, [recordingId]);

    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching voice recording:', error);
    throw error;
  }
}

/**
 * Get voice recordings for a thought capture
 * 
 * @param {number} thoughtCaptureId - Thought capture ID
 * @returns {Promise<array>} - Array of voice recordings
 */
async function getVoiceRecordingsByThought(thoughtCaptureId) {
  try {
    const result = await pool.query(`
      SELECT * FROM voice_recordings
      WHERE thought_capture_id = $1
      ORDER BY created_at DESC
    `, [thoughtCaptureId]);

    return result.rows;
  } catch (error) {
    console.error('Error fetching voice recordings:', error);
    throw error;
  }
}

/**
 * Process voice capture: transcribe and store
 * 
 * @param {string} audioFilePath - Path to audio file
 * @param {number} userId - User ID
 * @param {number} projectId - Project ID (optional)
 * @param {object} options - Processing options
 * @returns {Promise<object>} - Processing result with thought capture and voice recording
 */
async function processVoiceCapture(audioFilePath, userId, projectId, options = {}) {
  try {
    // Get file stats
    const stats = await fs.stat(audioFilePath);
    const fileSizeBytes = stats.size;
    const format = path.extname(audioFilePath).substring(1); // Remove leading dot

    // Transcribe audio
    const transcription = await transcribeAudioFile(audioFilePath, options);

    // Create thought capture record
    const thoughtResult = await pool.query(`
      INSERT INTO thought_captures (
        user_id,
        project_id,
        content,
        original_audio_url,
        transcription,
        transcription_confidence,
        capture_method,
        device_info,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      userId,
      projectId || null,
      transcription.text,
      audioFilePath,
      transcription.text,
      transcription.confidence,
      'voice',
      options.deviceInfo ? JSON.stringify(options.deviceInfo) : null,
      'pending' // Will be processed by AI later
    ]);

    const thoughtCapture = thoughtResult.rows[0];

    // Store voice recording metadata
    const voiceRecording = await storeVoiceRecording(thoughtCapture.id, {
      audioUrl: audioFilePath,
      storageProvider: 'local',
      durationSeconds: transcription.duration,
      fileSizeBytes,
      format,
      transcriptionProvider: 'deepgram',
      transcriptionText: transcription.text,
      transcriptionConfidence: transcription.confidence,
      transcriptionMetadata: {
        words: transcription.words,
        model: transcription.model,
        metadata: transcription.metadata
      }
    });

    return {
      thoughtCapture,
      voiceRecording,
      transcription
    };
  } catch (error) {
    console.error('Error processing voice capture:', error);
    throw error;
  }
}

/**
 * Fallback transcription for testing (when Deepgram is unavailable)
 * Returns mock transcription for development
 */
function getFallbackTranscription(audioFilePath) {
  return {
    text: '[Fallback transcription - Deepgram API key not configured]',
    confidence: 0.0,
    words: [],
    duration: 0,
    provider: 'fallback',
    model: 'mock'
  };
}

module.exports = {
  transcribeAudioFile,
  transcribeAudioUrl,
  storeVoiceRecording,
  getVoiceRecording,
  getVoiceRecordingsByThought,
  processVoiceCapture,
  getFallbackTranscription
};
