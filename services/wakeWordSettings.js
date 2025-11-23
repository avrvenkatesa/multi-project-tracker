const pool = require('../db');

const DEFAULT_SETTINGS = {
  activation_mode: 'manual',
  wake_word_enabled: false,
  custom_wake_words: [],
  wake_word_sensitivity: 0.70,
  always_listening_enabled: false,
  silence_detection_seconds: 180,
  scheduled_enabled: false,
  scheduled_config: null,
  privacy_mode: true,
  show_recording_indicator: true,
  require_confirmation: true,
  max_auto_recording_minutes: 30,
  battery_threshold: 20,
  wifi_only_mode: false
};

const VALID_ACTIVATION_MODES = ['manual', 'wake_word', 'always_listening', 'scheduled', 'disabled'];

function validateSettings(settings) {
  const errors = [];

  if (settings.activation_mode !== undefined) {
    if (!VALID_ACTIVATION_MODES.includes(settings.activation_mode)) {
      errors.push(`Invalid activation_mode. Must be one of: ${VALID_ACTIVATION_MODES.join(', ')}`);
    }
  }

  if (settings.wake_word_sensitivity !== undefined) {
    const sensitivity = parseFloat(settings.wake_word_sensitivity);
    if (isNaN(sensitivity) || sensitivity < 0.0 || sensitivity > 1.0) {
      errors.push('wake_word_sensitivity must be between 0.0 and 1.0');
    }
  }

  if (settings.custom_wake_words !== undefined) {
    if (!Array.isArray(settings.custom_wake_words)) {
      errors.push('custom_wake_words must be an array');
    } else {
      if (settings.custom_wake_words.length > 10) {
        errors.push('custom_wake_words cannot exceed 10 phrases');
      }
      settings.custom_wake_words.forEach((phrase, index) => {
        if (typeof phrase !== 'string') {
          errors.push(`custom_wake_words[${index}] must be a string`);
        } else if (phrase.length < 2 || phrase.length > 50) {
          errors.push(`custom_wake_words[${index}] must be between 2 and 50 characters`);
        }
      });
    }
  }

  if (settings.battery_threshold !== undefined) {
    const threshold = parseInt(settings.battery_threshold, 10);
    if (isNaN(threshold) || threshold < 10 || threshold > 100) {
      errors.push('battery_threshold must be between 10 and 100');
    }
  }

  if (settings.max_auto_recording_minutes !== undefined) {
    const minutes = parseInt(settings.max_auto_recording_minutes, 10);
    if (isNaN(minutes) || minutes < 5 || minutes > 120) {
      errors.push('max_auto_recording_minutes must be between 5 and 120');
    }
  }

  if (settings.scheduled_config !== undefined && settings.scheduled_config !== null) {
    if (typeof settings.scheduled_config !== 'object') {
      errors.push('scheduled_config must be an object or null');
    }
  }

  if (settings.silence_detection_seconds !== undefined) {
    const seconds = parseInt(settings.silence_detection_seconds, 10);
    if (isNaN(seconds) || seconds < 0) {
      errors.push('silence_detection_seconds must be a positive number');
    }
  }

  return errors;
}

async function getUserWakeWordSettings(userId, projectId = null) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    const result = await pool.query(`
      SELECT * FROM user_wake_word_settings
      WHERE user_id = $1 AND (project_id = $2 OR (project_id IS NULL AND $2 IS NULL))
    `, [userId, projectId]);

    if (result.rows.length > 0) {
      const settings = result.rows[0];
      return {
        id: settings.id,
        userId: settings.user_id,
        projectId: settings.project_id,
        activationMode: settings.activation_mode,
        wakeWordEnabled: settings.wake_word_enabled,
        customWakeWords: settings.custom_wake_words || [],
        wakeWordSensitivity: parseFloat(settings.wake_word_sensitivity),
        alwaysListeningEnabled: settings.always_listening_enabled,
        silenceDetectionSeconds: settings.silence_detection_seconds,
        scheduledEnabled: settings.scheduled_enabled,
        scheduledConfig: settings.scheduled_config,
        privacyMode: settings.privacy_mode,
        showRecordingIndicator: settings.show_recording_indicator,
        requireConfirmation: settings.require_confirmation,
        maxAutoRecordingMinutes: settings.max_auto_recording_minutes,
        batteryThreshold: settings.battery_threshold,
        wifiOnlyMode: settings.wifi_only_mode,
        createdAt: settings.created_at,
        updatedAt: settings.updated_at
      };
    }

    const defaultResult = await pool.query(`
      INSERT INTO user_wake_word_settings (
        user_id,
        project_id,
        activation_mode,
        wake_word_enabled,
        custom_wake_words,
        wake_word_sensitivity,
        always_listening_enabled,
        silence_detection_seconds,
        scheduled_enabled,
        scheduled_config,
        privacy_mode,
        show_recording_indicator,
        require_confirmation,
        max_auto_recording_minutes,
        battery_threshold,
        wifi_only_mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      userId,
      projectId,
      DEFAULT_SETTINGS.activation_mode,
      DEFAULT_SETTINGS.wake_word_enabled,
      DEFAULT_SETTINGS.custom_wake_words,
      DEFAULT_SETTINGS.wake_word_sensitivity,
      DEFAULT_SETTINGS.always_listening_enabled,
      DEFAULT_SETTINGS.silence_detection_seconds,
      DEFAULT_SETTINGS.scheduled_enabled,
      DEFAULT_SETTINGS.scheduled_config,
      DEFAULT_SETTINGS.privacy_mode,
      DEFAULT_SETTINGS.show_recording_indicator,
      DEFAULT_SETTINGS.require_confirmation,
      DEFAULT_SETTINGS.max_auto_recording_minutes,
      DEFAULT_SETTINGS.battery_threshold,
      DEFAULT_SETTINGS.wifi_only_mode
    ]);

    const settings = defaultResult.rows[0];
    return {
      id: settings.id,
      userId: settings.user_id,
      projectId: settings.project_id,
      activationMode: settings.activation_mode,
      wakeWordEnabled: settings.wake_word_enabled,
      customWakeWords: settings.custom_wake_words || [],
      wakeWordSensitivity: parseFloat(settings.wake_word_sensitivity),
      alwaysListeningEnabled: settings.always_listening_enabled,
      silenceDetectionSeconds: settings.silence_detection_seconds,
      scheduledEnabled: settings.scheduled_enabled,
      scheduledConfig: settings.scheduled_config,
      privacyMode: settings.privacy_mode,
      showRecordingIndicator: settings.show_recording_indicator,
      requireConfirmation: settings.require_confirmation,
      maxAutoRecordingMinutes: settings.max_auto_recording_minutes,
      batteryThreshold: settings.battery_threshold,
      wifiOnlyMode: settings.wifi_only_mode,
      createdAt: settings.created_at,
      updatedAt: settings.updated_at
    };
  } catch (error) {
    console.error('Error getting wake word settings:', error);
    throw error;
  }
}

async function updateWakeWordSettings(userId, projectId = null, settings) {
  if (!userId) {
    throw new Error('userId is required');
  }

  if (!settings || typeof settings !== 'object') {
    throw new Error('settings object is required');
  }

  const validationErrors = validateSettings(settings);
  if (validationErrors.length > 0) {
    const error = new Error('Validation failed');
    error.validationErrors = validationErrors;
    throw error;
  }

  try {
    const updateFields = [];
    const values = [userId, projectId];
    let paramIndex = 3;

    if (settings.activationMode !== undefined) {
      updateFields.push(`activation_mode = $${paramIndex++}`);
      values.push(settings.activationMode);
    }
    if (settings.wakeWordEnabled !== undefined) {
      updateFields.push(`wake_word_enabled = $${paramIndex++}`);
      values.push(settings.wakeWordEnabled);
    }
    if (settings.customWakeWords !== undefined) {
      updateFields.push(`custom_wake_words = $${paramIndex++}`);
      values.push(settings.customWakeWords);
    }
    if (settings.wakeWordSensitivity !== undefined) {
      updateFields.push(`wake_word_sensitivity = $${paramIndex++}`);
      values.push(settings.wakeWordSensitivity);
    }
    if (settings.alwaysListeningEnabled !== undefined) {
      updateFields.push(`always_listening_enabled = $${paramIndex++}`);
      values.push(settings.alwaysListeningEnabled);
    }
    if (settings.silenceDetectionSeconds !== undefined) {
      updateFields.push(`silence_detection_seconds = $${paramIndex++}`);
      values.push(settings.silenceDetectionSeconds);
    }
    if (settings.scheduledEnabled !== undefined) {
      updateFields.push(`scheduled_enabled = $${paramIndex++}`);
      values.push(settings.scheduledEnabled);
    }
    if (settings.scheduledConfig !== undefined) {
      updateFields.push(`scheduled_config = $${paramIndex++}`);
      values.push(settings.scheduledConfig);
    }
    if (settings.privacyMode !== undefined) {
      updateFields.push(`privacy_mode = $${paramIndex++}`);
      values.push(settings.privacyMode);
    }
    if (settings.showRecordingIndicator !== undefined) {
      updateFields.push(`show_recording_indicator = $${paramIndex++}`);
      values.push(settings.showRecordingIndicator);
    }
    if (settings.requireConfirmation !== undefined) {
      updateFields.push(`require_confirmation = $${paramIndex++}`);
      values.push(settings.requireConfirmation);
    }
    if (settings.maxAutoRecordingMinutes !== undefined) {
      updateFields.push(`max_auto_recording_minutes = $${paramIndex++}`);
      values.push(settings.maxAutoRecordingMinutes);
    }
    if (settings.batteryThreshold !== undefined) {
      updateFields.push(`battery_threshold = $${paramIndex++}`);
      values.push(settings.batteryThreshold);
    }
    if (settings.wifiOnlyMode !== undefined) {
      updateFields.push(`wifi_only_mode = $${paramIndex++}`);
      values.push(settings.wifiOnlyMode);
    }

    updateFields.push(`updated_at = NOW()`);

    if (updateFields.length === 1) {
      return await getUserWakeWordSettings(userId, projectId);
    }

    const result = await pool.query(`
      UPDATE user_wake_word_settings
      SET ${updateFields.join(', ')}
      WHERE user_id = $1 AND (project_id = $2 OR (project_id IS NULL AND $2 IS NULL))
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      await getUserWakeWordSettings(userId, projectId);
      return await updateWakeWordSettings(userId, projectId, settings);
    }

    const updated = result.rows[0];
    return {
      id: updated.id,
      userId: updated.user_id,
      projectId: updated.project_id,
      activationMode: updated.activation_mode,
      wakeWordEnabled: updated.wake_word_enabled,
      customWakeWords: updated.custom_wake_words || [],
      wakeWordSensitivity: parseFloat(updated.wake_word_sensitivity),
      alwaysListeningEnabled: updated.always_listening_enabled,
      silenceDetectionSeconds: updated.silence_detection_seconds,
      scheduledEnabled: updated.scheduled_enabled,
      scheduledConfig: updated.scheduled_config,
      privacyMode: updated.privacy_mode,
      showRecordingIndicator: updated.show_recording_indicator,
      requireConfirmation: updated.require_confirmation,
      maxAutoRecordingMinutes: updated.max_auto_recording_minutes,
      batteryThreshold: updated.battery_threshold,
      wifiOnlyMode: updated.wifi_only_mode,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at
    };
  } catch (error) {
    console.error('Error updating wake word settings:', error);
    throw error;
  }
}

async function deleteWakeWordSettings(userId, projectId = null) {
  if (!userId) {
    throw new Error('userId is required');
  }

  try {
    await pool.query(`
      DELETE FROM user_wake_word_settings
      WHERE user_id = $1 AND (project_id = $2 OR (project_id IS NULL AND $2 IS NULL))
    `, [userId, projectId]);

    return await getUserWakeWordSettings(userId, projectId);
  } catch (error) {
    console.error('Error deleting wake word settings:', error);
    throw error;
  }
}

async function getProjectWakeWords(projectId) {
  if (!projectId) {
    throw new Error('projectId is required');
  }

  try {
    const result = await pool.query(`
      SELECT 
        uwws.user_id,
        uwws.custom_wake_words,
        uwws.wake_word_enabled,
        uwws.activation_mode,
        u.username,
        u.email
      FROM user_wake_word_settings uwws
      LEFT JOIN users u ON uwws.user_id = u.id
      WHERE uwws.project_id = $1 
        AND uwws.wake_word_enabled = true
        AND uwws.custom_wake_words IS NOT NULL
        AND array_length(uwws.custom_wake_words, 1) > 0
      ORDER BY u.username
    `, [projectId]);

    return result.rows.map(row => ({
      userId: row.user_id,
      username: row.username,
      email: row.email,
      customWakeWords: row.custom_wake_words || [],
      activationMode: row.activation_mode
    }));
  } catch (error) {
    console.error('Error getting project wake words:', error);
    throw error;
  }
}

module.exports = {
  getUserWakeWordSettings,
  updateWakeWordSettings,
  deleteWakeWordSettings,
  getProjectWakeWords,
  DEFAULT_SETTINGS,
  VALID_ACTIVATION_MODES,
  validateSettings
};
