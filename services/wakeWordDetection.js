const { pool } = require('../db');
const { createClient } = require('@deepgram/sdk');

const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
let deepgramClient = null;

if (deepgramApiKey) {
  deepgramClient = createClient(deepgramApiKey);
  console.log('[WakeWordDetection] Deepgram client initialized for keyword spotting');
} else {
  console.warn('[WakeWordDetection] DEEPGRAM_API_KEY not found - cloud detection unavailable');
}

async function logWakeWordDetection(userId, projectId, wakeWord, confidence, detectionMethod = 'local', metadata = {}) {
  if (!userId || !wakeWord) {
    throw new Error('userId and wakeWord are required');
  }

  try {
    const result = await pool.query(`
      INSERT INTO wake_word_detections (
        user_id,
        project_id,
        wake_word,
        confidence,
        detection_method,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      userId,
      projectId || null,
      wakeWord,
      confidence,
      detectionMethod,
      metadata ? JSON.stringify(metadata) : null
    ]);

    const detection = result.rows[0];
    
    console.log(`[WakeWordDetection] Logged detection for user ${userId}: "${wakeWord}" (${confidence}) via ${detectionMethod}`);

    return {
      id: detection.id,
      userId: detection.user_id,
      projectId: detection.project_id,
      wakeWord: detection.wake_word,
      confidence: parseFloat(detection.confidence),
      detectionMethod: detection.detection_method,
      wasFalsePositive: detection.was_false_positive,
      userDismissed: detection.user_dismissed,
      meetingId: detection.meeting_id,
      metadata: detection.metadata,
      detectedAt: detection.detected_at
    };
  } catch (error) {
    console.error('Error logging wake word detection:', error);
    throw error;
  }
}

async function validateWakeWord(userId, projectId, wakeWord, audioContext = null) {
  if (!userId || !wakeWord) {
    throw new Error('userId and wakeWord are required');
  }

  try {
    const settingsResult = await pool.query(`
      SELECT 
        wake_word_enabled,
        custom_wake_words,
        wake_word_sensitivity,
        activation_mode
      FROM user_wake_word_settings
      WHERE user_id = $1 AND (project_id = $2 OR (project_id IS NULL AND $2 IS NULL))
    `, [userId, projectId]);

    if (settingsResult.rows.length === 0) {
      console.log(`[WakeWordDetection] No settings found for user ${userId}, defaulting to disabled`);
      return {
        isValid: false,
        confidence: 0,
        reason: 'Wake-word not configured for this user'
      };
    }

    const settings = settingsResult.rows[0];

    if (!settings.wake_word_enabled) {
      return {
        isValid: false,
        confidence: 0,
        reason: 'Wake-word detection is disabled'
      };
    }

    if (!settings.custom_wake_words || settings.custom_wake_words.length === 0) {
      return {
        isValid: false,
        confidence: 0,
        reason: 'No wake-words configured'
      };
    }

    const normalizedWakeWord = wakeWord.toLowerCase().trim();
    const configuredWords = settings.custom_wake_words.map(w => w.toLowerCase().trim());

    const isConfigured = configuredWords.some(configured => {
      return normalizedWakeWord.includes(configured) || configured.includes(normalizedWakeWord);
    });

    if (!isConfigured) {
      return {
        isValid: false,
        confidence: 0,
        reason: 'Wake-word does not match any configured phrases'
      };
    }

    const minSensitivity = parseFloat(settings.wake_word_sensitivity) || 0.70;
    
    let finalConfidence = 0.85;
    if (audioContext && audioContext.confidence) {
      finalConfidence = parseFloat(audioContext.confidence);
    }

    const isValid = finalConfidence >= minSensitivity;

    return {
      isValid,
      confidence: finalConfidence,
      reason: isValid 
        ? `Wake-word validated (${(finalConfidence * 100).toFixed(1)}% confidence)` 
        : `Confidence ${(finalConfidence * 100).toFixed(1)}% below threshold ${(minSensitivity * 100).toFixed(1)}%`,
      matchedWord: isConfigured ? configuredWords.find(w => 
        normalizedWakeWord.includes(w) || w.includes(normalizedWakeWord)
      ) : null
    };
  } catch (error) {
    console.error('Error validating wake word:', error);
    throw error;
  }
}

async function handleFalsePositive(detectionId, dismissalReason = null) {
  if (!detectionId) {
    throw new Error('detectionId is required');
  }

  try {
    const result = await pool.query(`
      UPDATE wake_word_detections
      SET 
        was_false_positive = true,
        user_dismissed = true,
        dismissal_reason = $1
      WHERE id = $2
      RETURNING *
    `, [dismissalReason, detectionId]);

    if (result.rows.length === 0) {
      throw new Error(`Detection ${detectionId} not found`);
    }

    const detection = result.rows[0];
    
    console.log(`[WakeWordDetection] Marked detection ${detectionId} as false positive`);

    return {
      id: detection.id,
      userId: detection.user_id,
      wakeWord: detection.wake_word,
      wasFalsePositive: detection.was_false_positive,
      dismissalReason: detection.dismissal_reason
    };
  } catch (error) {
    console.error('Error handling false positive:', error);
    throw error;
  }
}

async function getWakeWordStats(userId, projectId = null, dateRange = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const { startDate, endDate } = dateRange;
    
    let dateCondition = '';
    const params = [userId, projectId];
    
    if (startDate && endDate) {
      dateCondition = ' AND detected_at BETWEEN $3 AND $4';
      params.push(startDate, endDate);
    } else if (startDate) {
      dateCondition = ' AND detected_at >= $3';
      params.push(startDate);
    } else if (endDate) {
      dateCondition = ' AND detected_at <= $3';
      params.push(endDate);
    }

    const statsQuery = `
      SELECT 
        COUNT(*) AS total_detections,
        COUNT(CASE WHEN was_false_positive = true THEN 1 END) AS false_positives,
        COUNT(CASE WHEN was_false_positive = false THEN 1 END) AS valid_detections,
        COUNT(CASE WHEN meeting_id IS NOT NULL THEN 1 END) AS meetings_started,
        AVG(confidence) AS avg_confidence,
        MIN(confidence) AS min_confidence,
        MAX(confidence) AS max_confidence,
        COUNT(CASE WHEN detection_method = 'local' THEN 1 END) AS local_detections,
        COUNT(CASE WHEN detection_method = 'cloud' THEN 1 END) AS cloud_detections
      FROM wake_word_detections
      WHERE user_id = $1 AND (project_id = $2 OR (project_id IS NULL AND $2 IS NULL))
      ${dateCondition}
    `;

    const statsResult = await pool.query(statsQuery, params);
    const stats = statsResult.rows[0];

    const topWordsQuery = `
      SELECT 
        wake_word,
        COUNT(*) AS detection_count,
        COUNT(CASE WHEN was_false_positive = true THEN 1 END) AS false_positive_count,
        AVG(confidence) AS avg_confidence
      FROM wake_word_detections
      WHERE user_id = $1 AND (project_id = $2 OR (project_id IS NULL AND $2 IS NULL))
      ${dateCondition}
      GROUP BY wake_word
      ORDER BY detection_count DESC
      LIMIT 10
    `;

    const topWordsResult = await pool.query(topWordsQuery, params);

    const totalDetections = parseInt(stats.total_detections, 10);
    const falsePositives = parseInt(stats.false_positives, 10);
    const validDetections = parseInt(stats.valid_detections, 10);
    
    const accuracy = totalDetections > 0 
      ? ((validDetections / totalDetections) * 100).toFixed(2)
      : 100;

    return {
      totalDetections,
      falsePositives,
      validDetections,
      meetingsStarted: parseInt(stats.meetings_started, 10),
      accuracy: parseFloat(accuracy),
      avgConfidence: stats.avg_confidence ? parseFloat(stats.avg_confidence) : 0,
      minConfidence: stats.min_confidence ? parseFloat(stats.min_confidence) : 0,
      maxConfidence: stats.max_confidence ? parseFloat(stats.max_confidence) : 0,
      localDetections: parseInt(stats.local_detections, 10),
      cloudDetections: parseInt(stats.cloud_detections, 10),
      topWakeWords: topWordsResult.rows.map(row => ({
        wakeWord: row.wake_word,
        detectionCount: parseInt(row.detection_count, 10),
        falsePositiveCount: parseInt(row.false_positive_count, 10),
        avgConfidence: parseFloat(row.avg_confidence),
        accuracy: row.detection_count > 0
          ? (((row.detection_count - row.false_positive_count) / row.detection_count) * 100).toFixed(2)
          : 100
      }))
    };
  } catch (error) {
    console.error('Error getting wake word stats:', error);
    throw error;
  }
}

function createDeepgramKeywordSpotter(keywords, options = {}) {
  if (!deepgramClient) {
    throw new Error('Deepgram client not initialized - DEEPGRAM_API_KEY required');
  }

  if (!keywords || keywords.length === 0) {
    throw new Error('At least one keyword is required');
  }

  const {
    sensitivity = 0.7,
    language = 'en-US',
    model = 'nova-2'
  } = options;

  console.log(`[WakeWordDetection] Creating Deepgram keyword spotter for: ${keywords.join(', ')}`);

  const connection = deepgramClient.listen.live({
    model,
    language,
    smart_format: false,
    interim_results: true,
    keywords: keywords.map(kw => `${kw}:${sensitivity}`)
  });

  const detectedKeywords = [];

  connection.on('open', () => {
    console.log('[WakeWordDetection] Deepgram WebSocket connection opened');
  });

  connection.on('Results', (data) => {
    if (!data || !data.channel) return;

    const { alternatives } = data.channel;
    if (!alternatives || alternatives.length === 0) return;

    const transcript = alternatives[0].transcript;
    if (!transcript) return;

    const normalizedTranscript = transcript.toLowerCase().trim();
    
    keywords.forEach(keyword => {
      const normalizedKeyword = keyword.toLowerCase().trim();
      if (normalizedTranscript.includes(normalizedKeyword)) {
        const detection = {
          keyword,
          confidence: alternatives[0].confidence || sensitivity,
          timestamp: Date.now(),
          transcript: transcript,
          isFinal: data.is_final || false
        };
        
        detectedKeywords.push(detection);
        
        console.log(`[WakeWordDetection] Keyword detected: "${keyword}" (confidence: ${detection.confidence})`);
        
        connection.emit('keyword_detected', detection);
      }
    });
  });

  connection.on('error', (error) => {
    console.error('[WakeWordDetection] Deepgram error:', error);
  });

  connection.on('close', () => {
    console.log('[WakeWordDetection] Deepgram WebSocket connection closed');
  });

  return {
    connection,
    sendAudio: (audioData) => {
      if (connection.getReadyState() === 1) {
        connection.send(audioData);
      }
    },
    close: () => {
      connection.finish();
    },
    getDetections: () => detectedKeywords,
    onKeywordDetected: (callback) => {
      connection.on('keyword_detected', callback);
    }
  };
}

async function getDetections(userId, projectId = null, options = {}) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const { limit = 50, offset = 0, startDate, endDate } = options;
    
    let dateCondition = '';
    const params = [userId, projectId];
    let paramIndex = 3;
    
    if (startDate && endDate) {
      dateCondition = ` AND detected_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(startDate, endDate);
      paramIndex += 2;
    } else if (startDate) {
      dateCondition = ` AND detected_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    } else if (endDate) {
      dateCondition = ` AND detected_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(`
      SELECT * FROM wake_word_detections
      WHERE user_id = $1 AND (project_id = $2 OR (project_id IS NULL AND $2 IS NULL))
      ${dateCondition}
      ORDER BY detected_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, params);

    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      wakeWord: row.wake_word,
      confidence: parseFloat(row.confidence),
      detectionMethod: row.detection_method,
      wasFalsePositive: row.was_false_positive,
      userDismissed: row.user_dismissed,
      meetingId: row.meeting_id,
      metadata: row.metadata,
      detectedAt: row.detected_at
    }));
  } catch (error) {
    console.error('Error getting detections:', error);
    throw error;
  }
}

async function cleanupOldDetections(daysToKeep = 90) {
  try {
    const result = await pool.query(`
      DELETE FROM wake_word_detections
      WHERE detected_at < NOW() - INTERVAL '${daysToKeep} days'
      AND meeting_id IS NULL
    `);

    console.log(`[WakeWordDetection] Cleaned up ${result.rowCount} old detections (>${daysToKeep} days)`);
    
    return {
      deletedCount: result.rowCount
    };
  } catch (error) {
    console.error('Error cleaning up old detections:', error);
    throw error;
  }
}

module.exports = {
  logWakeWordDetection,
  getDetections,
  validateWakeWord,
  handleFalsePositive,
  getWakeWordStats,
  createDeepgramKeywordSpotter,
  cleanupOldDetections,
  isDeepgramAvailable: () => !!deepgramClient
};
