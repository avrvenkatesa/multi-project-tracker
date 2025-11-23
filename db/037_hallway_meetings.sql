-- Migration 037: Hallway Meetings System
-- Unscheduled meeting capture with voice activation, transcription, and AI entity detection
-- Created: 2025-11-23

-- ============================================================================
-- TABLE: hallway_meetings
-- Core table for unscheduled meeting captures
-- ============================================================================
CREATE TABLE IF NOT EXISTS hallway_meetings (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Meeting metadata
  meeting_title VARCHAR(255),
  location_description TEXT,
  meeting_type VARCHAR(50) DEFAULT 'hallway' CHECK (
    meeting_type IN ('hallway', 'one_on_one', 'impromptu', 'walking', 'coffee_chat')
  ),
  
  -- Timing
  started_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  
  -- Activation
  activation_mode VARCHAR(50) DEFAULT 'manual' CHECK (
    activation_mode IN ('manual', 'wake_word', 'always_listening', 'scheduled')
  ),
  wake_word_detected VARCHAR(100),
  wake_word_confidence DECIMAL(5,4) CHECK (wake_word_confidence >= 0 AND wake_word_confidence <= 1),
  
  -- Transcription
  transcription_provider VARCHAR(50),
  full_transcript TEXT,
  transcript_url TEXT,
  
  -- Audio
  audio_url TEXT,
  audio_storage_provider VARCHAR(50),
  audio_file_size_bytes BIGINT,
  audio_duration_seconds INTEGER,
  audio_format VARCHAR(20),
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'recording' CHECK (
    status IN ('recording', 'processing', 'completed', 'failed', 'cancelled')
  ),
  transcription_status VARCHAR(50) DEFAULT 'pending' CHECK (
    transcription_status IN ('pending', 'in_progress', 'completed', 'failed')
  ),
  analysis_status VARCHAR(50) DEFAULT 'pending' CHECK (
    analysis_status IN ('pending', 'in_progress', 'completed', 'failed')
  ),
  
  -- AI analysis results
  summary_text TEXT,
  key_topics TEXT[],
  sentiment_score DECIMAL(5,4) CHECK (sentiment_score >= -1 AND sentiment_score <= 1),
  
  -- Entity counts
  participants_count INTEGER DEFAULT 0,
  decisions_detected INTEGER DEFAULT 0,
  risks_detected INTEGER DEFAULT 0,
  action_items_detected INTEGER DEFAULT 0,
  
  -- Additional data
  device_info JSONB,
  metadata JSONB,
  auto_stopped_reason VARCHAR(255),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE hallway_meetings IS 'Unscheduled meeting captures with voice activation and AI analysis';
COMMENT ON COLUMN hallway_meetings.activation_mode IS 'How the meeting recording was triggered';
COMMENT ON COLUMN hallway_meetings.wake_word_confidence IS 'Confidence score for wake word detection (0-1)';
COMMENT ON COLUMN hallway_meetings.sentiment_score IS 'Overall meeting sentiment (-1 to 1)';

-- ============================================================================
-- TABLE: hallway_participants
-- Tracks participants in hallway meetings
-- ============================================================================
CREATE TABLE IF NOT EXISTS hallway_participants (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES hallway_meetings(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  -- Participant info
  participant_name VARCHAR(255),
  participant_email VARCHAR(255),
  participant_role VARCHAR(100),
  speaker_label VARCHAR(50),
  
  -- Participation tracking
  is_organizer BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  speaking_time_seconds INTEGER DEFAULT 0,
  utterance_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE hallway_participants IS 'Meeting participants with speaking time and utterance tracking';
COMMENT ON COLUMN hallway_participants.speaker_label IS 'Maps to speaker diarization labels (e.g., Speaker_0, Speaker_1)';

-- ============================================================================
-- TABLE: hallway_transcript_chunks
-- Real-time transcript segments with speaker diarization
-- ============================================================================
CREATE TABLE IF NOT EXISTS hallway_transcript_chunks (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES hallway_meetings(id) ON DELETE CASCADE,
  participant_id INTEGER REFERENCES hallway_participants(id) ON DELETE SET NULL,
  
  -- Transcript content
  content TEXT NOT NULL,
  speaker_label VARCHAR(50),
  
  -- Timing
  start_time_seconds DECIMAL(10,3),
  end_time_seconds DECIMAL(10,3),
  chunk_sequence INTEGER NOT NULL,
  
  -- Quality metrics
  confidence DECIMAL(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  is_final BOOLEAN DEFAULT FALSE,
  
  -- Additional data
  metadata JSONB,
  
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE hallway_transcript_chunks IS 'Real-time transcript segments with speaker labels and timing';
COMMENT ON COLUMN hallway_transcript_chunks.is_final IS 'Whether this is final transcript or interim result';

-- ============================================================================
-- TABLE: hallway_entity_detections
-- AI-detected entities from meeting transcripts
-- ============================================================================
CREATE TABLE IF NOT EXISTS hallway_entity_detections (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES hallway_meetings(id) ON DELETE CASCADE,
  chunk_id INTEGER REFERENCES hallway_transcript_chunks(id) ON DELETE SET NULL,
  
  -- Entity classification
  entity_type VARCHAR(50) NOT NULL CHECK (
    entity_type IN ('decision', 'risk', 'action_item', 'task', 'blocker', 'note')
  ),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  
  -- AI confidence and impact
  confidence DECIMAL(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  impact_level VARCHAR(20) CHECK (impact_level IN ('low', 'medium', 'high', 'critical')),
  priority VARCHAR(20) CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Detection context
  detection_mode VARCHAR(50) DEFAULT 'post_meeting' CHECK (
    detection_mode IN ('real_time', 'post_meeting')
  ),
  
  -- Entity creation tracking
  was_auto_created BOOLEAN DEFAULT FALSE,
  created_entity_id UUID,
  
  -- Dismissal tracking
  dismissed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMP,
  dismissal_reason TEXT,
  
  -- Context
  quote_text TEXT,
  timestamp_seconds DECIMAL(10,3),
  mentioned_users INTEGER[],
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  -- Additional data
  metadata JSONB,
  
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE hallway_entity_detections IS 'AI-detected entities from meeting transcripts with auto-creation tracking';
COMMENT ON COLUMN hallway_entity_detections.detection_mode IS 'Whether entity was detected in real-time or post-meeting analysis';
COMMENT ON COLUMN hallway_entity_detections.created_entity_id IS 'UUID of auto-created entity in respective table';

-- ============================================================================
-- TABLE: hallway_speaker_mappings
-- Maps speaker labels to participants
-- ============================================================================
CREATE TABLE IF NOT EXISTS hallway_speaker_mappings (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES hallway_meetings(id) ON DELETE CASCADE,
  speaker_label VARCHAR(50) NOT NULL,
  participant_id INTEGER REFERENCES hallway_participants(id) ON DELETE CASCADE,
  
  -- Mapping quality
  confidence DECIMAL(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  mapping_method VARCHAR(50) DEFAULT 'manual' CHECK (
    mapping_method IN ('manual', 'voice_profile', 'ai_inference', 'auto')
  ),
  
  -- Tracking
  mapped_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  mapped_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(meeting_id, speaker_label)
);

COMMENT ON TABLE hallway_speaker_mappings IS 'Maps speaker diarization labels to identified participants';
COMMENT ON COLUMN hallway_speaker_mappings.mapping_method IS 'How the speaker was identified';

-- ============================================================================
-- TABLE: user_wake_word_settings
-- User activation preferences for hallway meetings
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_wake_word_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Activation settings
  activation_mode VARCHAR(50) DEFAULT 'manual' CHECK (
    activation_mode IN ('manual', 'wake_word', 'always_listening', 'scheduled', 'disabled')
  ),
  wake_word_enabled BOOLEAN DEFAULT FALSE,
  custom_wake_words TEXT[],
  wake_word_sensitivity DECIMAL(5,4) DEFAULT 0.8 CHECK (
    wake_word_sensitivity >= 0 AND wake_word_sensitivity <= 1
  ),
  
  -- Advanced activation
  always_listening_enabled BOOLEAN DEFAULT FALSE,
  silence_detection_seconds INTEGER DEFAULT 300,
  scheduled_enabled BOOLEAN DEFAULT FALSE,
  scheduled_config JSONB,
  
  -- Privacy settings
  privacy_mode BOOLEAN DEFAULT TRUE,
  show_recording_indicator BOOLEAN DEFAULT TRUE,
  require_confirmation BOOLEAN DEFAULT TRUE,
  
  -- Limits
  max_auto_recording_minutes INTEGER DEFAULT 60,
  battery_threshold INTEGER DEFAULT 20 CHECK (battery_threshold >= 0 AND battery_threshold <= 100),
  wifi_only_mode BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, project_id)
);

COMMENT ON TABLE user_wake_word_settings IS 'User preferences for wake-word activation and recording settings';
COMMENT ON COLUMN user_wake_word_settings.silence_detection_seconds IS 'Seconds of silence before auto-stopping recording';
COMMENT ON COLUMN user_wake_word_settings.scheduled_config IS 'JSONB config for scheduled recording (e.g., daily standup times)';

-- ============================================================================
-- TABLE: wake_word_detections
-- Wake-word detection logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS wake_word_detections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Detection details
  wake_word VARCHAR(100) NOT NULL,
  confidence DECIMAL(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  detection_method VARCHAR(50) DEFAULT 'local' CHECK (
    detection_method IN ('local', 'cloud')
  ),
  
  -- Validation
  was_false_positive BOOLEAN DEFAULT FALSE,
  user_dismissed BOOLEAN DEFAULT FALSE,
  dismissal_reason TEXT,
  
  -- Meeting association
  meeting_id INTEGER REFERENCES hallway_meetings(id) ON DELETE SET NULL,
  
  -- Additional data
  metadata JSONB,
  
  detected_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE wake_word_detections IS 'Logs all wake-word detections for accuracy tracking and false positive analysis';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Foreign key indexes
CREATE INDEX idx_hallway_meetings_project_id ON hallway_meetings(project_id);
CREATE INDEX idx_hallway_meetings_started_by ON hallway_meetings(started_by);
CREATE INDEX idx_hallway_participants_meeting_id ON hallway_participants(meeting_id);
CREATE INDEX idx_hallway_participants_user_id ON hallway_participants(user_id);
CREATE INDEX idx_hallway_transcript_chunks_meeting_id ON hallway_transcript_chunks(meeting_id);
CREATE INDEX idx_hallway_transcript_chunks_participant_id ON hallway_transcript_chunks(participant_id);
CREATE INDEX idx_hallway_entity_detections_meeting_id ON hallway_entity_detections(meeting_id);
CREATE INDEX idx_hallway_entity_detections_chunk_id ON hallway_entity_detections(chunk_id);
CREATE INDEX idx_hallway_entity_detections_assigned_to ON hallway_entity_detections(assigned_to);
CREATE INDEX idx_hallway_speaker_mappings_meeting_id ON hallway_speaker_mappings(meeting_id);
CREATE INDEX idx_hallway_speaker_mappings_participant_id ON hallway_speaker_mappings(participant_id);
CREATE INDEX idx_user_wake_word_settings_user_id ON user_wake_word_settings(user_id);
CREATE INDEX idx_user_wake_word_settings_project_id ON user_wake_word_settings(project_id);
CREATE INDEX idx_wake_word_detections_user_id ON wake_word_detections(user_id);
CREATE INDEX idx_wake_word_detections_meeting_id ON wake_word_detections(meeting_id);

-- Composite indexes for common queries
CREATE INDEX idx_hallway_meetings_project_status ON hallway_meetings(project_id, status);
CREATE INDEX idx_hallway_meetings_started_at ON hallway_meetings(started_at DESC);
CREATE INDEX idx_hallway_transcript_chunks_meeting_sequence ON hallway_transcript_chunks(meeting_id, chunk_sequence);
CREATE INDEX idx_hallway_entity_detections_meeting_type ON hallway_entity_detections(meeting_id, entity_type);
CREATE INDEX idx_hallway_entity_detections_auto_created ON hallway_entity_detections(was_auto_created) WHERE was_auto_created = TRUE;

-- Full-text search indexes
CREATE INDEX idx_hallway_meetings_transcript_fts ON hallway_meetings USING gin(to_tsvector('english', COALESCE(full_transcript, '')));
CREATE INDEX idx_hallway_meetings_summary_fts ON hallway_meetings USING gin(to_tsvector('english', COALESCE(summary_text, '')));
CREATE INDEX idx_hallway_transcript_chunks_content_fts ON hallway_transcript_chunks USING gin(to_tsvector('english', content));
CREATE INDEX idx_hallway_entity_detections_title_fts ON hallway_entity_detections USING gin(to_tsvector('english', title));

-- JSONB indexes
CREATE INDEX idx_hallway_meetings_metadata ON hallway_meetings USING gin(metadata);
CREATE INDEX idx_hallway_meetings_device_info ON hallway_meetings USING gin(device_info);
CREATE INDEX idx_hallway_transcript_chunks_metadata ON hallway_transcript_chunks USING gin(metadata);
CREATE INDEX idx_hallway_entity_detections_metadata ON hallway_entity_detections USING gin(metadata);
CREATE INDEX idx_user_wake_word_settings_scheduled_config ON user_wake_word_settings USING gin(scheduled_config);
CREATE INDEX idx_wake_word_detections_metadata ON wake_word_detections USING gin(metadata);

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: Active hallway meetings with live duration
CREATE OR REPLACE VIEW active_hallway_meetings AS
SELECT 
  hm.id,
  hm.project_id,
  hm.meeting_title,
  hm.location_description,
  hm.meeting_type,
  hm.started_by,
  hm.started_at,
  hm.status,
  hm.participants_count,
  EXTRACT(EPOCH FROM (NOW() - hm.started_at))::INTEGER AS current_duration_seconds,
  u.username AS started_by_username,
  p.name AS project_name
FROM hallway_meetings hm
LEFT JOIN users u ON hm.started_by = u.id
LEFT JOIN projects p ON hm.project_id = p.id
WHERE hm.status = 'recording'
ORDER BY hm.started_at DESC;

COMMENT ON VIEW active_hallway_meetings IS 'Currently recording meetings with live duration calculation';

-- View: Hallway meeting summary with entity counts
CREATE OR REPLACE VIEW hallway_meeting_summary AS
SELECT 
  hm.id,
  hm.project_id,
  hm.meeting_title,
  hm.meeting_type,
  hm.started_at,
  hm.ended_at,
  hm.duration_seconds,
  hm.status,
  hm.participants_count,
  hm.decisions_detected,
  hm.risks_detected,
  hm.action_items_detected,
  hm.sentiment_score,
  COUNT(DISTINCT htc.id) AS transcript_chunks_count,
  COUNT(DISTINCT hed.id) AS total_entity_detections,
  COUNT(DISTINCT CASE WHEN hed.was_auto_created THEN hed.id END) AS auto_created_entities,
  COUNT(DISTINCT CASE WHEN hed.dismissed_at IS NOT NULL THEN hed.id END) AS dismissed_entities,
  u.username AS started_by_username,
  p.name AS project_name
FROM hallway_meetings hm
LEFT JOIN hallway_transcript_chunks htc ON hm.id = htc.meeting_id
LEFT JOIN hallway_entity_detections hed ON hm.id = hed.meeting_id
LEFT JOIN users u ON hm.started_by = u.id
LEFT JOIN projects p ON hm.project_id = p.id
GROUP BY hm.id, u.username, p.name
ORDER BY hm.started_at DESC;

COMMENT ON VIEW hallway_meeting_summary IS 'Comprehensive meeting summary with entity and transcript statistics';

-- View: Hallway speaker summary with participation metrics
CREATE OR REPLACE VIEW hallway_speaker_summary AS
SELECT 
  hp.meeting_id,
  hp.id AS participant_id,
  hp.user_id,
  hp.participant_name,
  hp.speaker_label,
  hp.is_organizer,
  hp.speaking_time_seconds,
  hp.utterance_count,
  CASE 
    WHEN hm.duration_seconds > 0 
    THEN ROUND((hp.speaking_time_seconds::DECIMAL / hm.duration_seconds * 100), 2)
    ELSE 0
  END AS speaking_percentage,
  COUNT(DISTINCT htc.id) AS transcript_chunks,
  u.username,
  u.email
FROM hallway_participants hp
LEFT JOIN hallway_meetings hm ON hp.meeting_id = hm.id
LEFT JOIN hallway_transcript_chunks htc ON hp.id = htc.participant_id
LEFT JOIN users u ON hp.user_id = u.id
GROUP BY hp.id, hm.duration_seconds, u.username, u.email
ORDER BY hp.speaking_time_seconds DESC;

COMMENT ON VIEW hallway_speaker_summary IS 'Participant speaking metrics and engagement analysis';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Auto-update duration_seconds when ended_at is set
CREATE OR REPLACE FUNCTION update_hallway_meeting_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_hallway_meeting_duration
  BEFORE UPDATE ON hallway_meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_hallway_meeting_duration();

COMMENT ON FUNCTION update_hallway_meeting_duration() IS 'Automatically calculates duration when meeting ends';

-- Trigger: Auto-update participants_count when participants added/removed
CREATE OR REPLACE FUNCTION update_hallway_participants_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE hallway_meetings 
    SET participants_count = participants_count + 1,
        updated_at = NOW()
    WHERE id = NEW.meeting_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE hallway_meetings 
    SET participants_count = GREATEST(0, participants_count - 1),
        updated_at = NOW()
    WHERE id = OLD.meeting_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_hallway_participants_insert
  AFTER INSERT ON hallway_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_hallway_participants_count();

CREATE TRIGGER trigger_hallway_participants_delete
  AFTER DELETE ON hallway_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_hallway_participants_count();

COMMENT ON FUNCTION update_hallway_participants_count() IS 'Maintains accurate participant count in hallway_meetings';

-- Trigger: Auto-update entity counts when detections added/removed
CREATE OR REPLACE FUNCTION update_hallway_entity_counts()
RETURNS TRIGGER AS $$
DECLARE
  delta INTEGER;
BEGIN
  delta := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE -1 END;
  
  IF TG_OP = 'INSERT' THEN
    CASE NEW.entity_type
      WHEN 'decision' THEN
        UPDATE hallway_meetings 
        SET decisions_detected = decisions_detected + delta,
            updated_at = NOW()
        WHERE id = NEW.meeting_id;
      WHEN 'risk' THEN
        UPDATE hallway_meetings 
        SET risks_detected = risks_detected + delta,
            updated_at = NOW()
        WHERE id = NEW.meeting_id;
      WHEN 'action_item', 'task' THEN
        UPDATE hallway_meetings 
        SET action_items_detected = action_items_detected + delta,
            updated_at = NOW()
        WHERE id = NEW.meeting_id;
    END CASE;
  ELSIF TG_OP = 'DELETE' THEN
    CASE OLD.entity_type
      WHEN 'decision' THEN
        UPDATE hallway_meetings 
        SET decisions_detected = GREATEST(0, decisions_detected + delta),
            updated_at = NOW()
        WHERE id = OLD.meeting_id;
      WHEN 'risk' THEN
        UPDATE hallway_meetings 
        SET risks_detected = GREATEST(0, risks_detected + delta),
            updated_at = NOW()
        WHERE id = OLD.meeting_id;
      WHEN 'action_item', 'task' THEN
        UPDATE hallway_meetings 
        SET action_items_detected = GREATEST(0, action_items_detected + delta),
            updated_at = NOW()
        WHERE id = OLD.meeting_id;
    END CASE;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_hallway_entity_insert
  AFTER INSERT ON hallway_entity_detections
  FOR EACH ROW
  EXECUTE FUNCTION update_hallway_entity_counts();

CREATE TRIGGER trigger_hallway_entity_delete
  AFTER DELETE ON hallway_entity_detections
  FOR EACH ROW
  EXECUTE FUNCTION update_hallway_entity_counts();

COMMENT ON FUNCTION update_hallway_entity_counts() IS 'Maintains accurate entity counts (decisions, risks, action items) in hallway_meetings';

-- Trigger: Auto-update speaking_time_seconds from transcript chunks
CREATE OR REPLACE FUNCTION update_participant_speaking_time()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.participant_id IS NOT NULL AND NEW.is_final = TRUE THEN
    UPDATE hallway_participants
    SET 
      speaking_time_seconds = speaking_time_seconds + 
        GREATEST(0, COALESCE(NEW.end_time_seconds - NEW.start_time_seconds, 0))::INTEGER,
      utterance_count = utterance_count + 1
    WHERE id = NEW.participant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_participant_speaking_time
  AFTER INSERT ON hallway_transcript_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_participant_speaking_time();

COMMENT ON FUNCTION update_participant_speaking_time() IS 'Automatically updates participant speaking time from finalized transcript chunks';

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================

/*
-- To rollback this migration, run the following commands:

DROP TRIGGER IF EXISTS trigger_update_participant_speaking_time ON hallway_transcript_chunks;
DROP TRIGGER IF EXISTS trigger_hallway_entity_delete ON hallway_entity_detections;
DROP TRIGGER IF EXISTS trigger_hallway_entity_insert ON hallway_entity_detections;
DROP TRIGGER IF EXISTS trigger_hallway_participants_delete ON hallway_participants;
DROP TRIGGER IF EXISTS trigger_hallway_participants_insert ON hallway_participants;
DROP TRIGGER IF EXISTS trigger_update_hallway_meeting_duration ON hallway_meetings;

DROP FUNCTION IF EXISTS update_participant_speaking_time();
DROP FUNCTION IF EXISTS update_hallway_entity_counts();
DROP FUNCTION IF EXISTS update_hallway_participants_count();
DROP FUNCTION IF EXISTS update_hallway_meeting_duration();

DROP VIEW IF EXISTS hallway_speaker_summary;
DROP VIEW IF EXISTS hallway_meeting_summary;
DROP VIEW IF EXISTS active_hallway_meetings;

DROP INDEX IF EXISTS idx_wake_word_detections_metadata;
DROP INDEX IF EXISTS idx_user_wake_word_settings_scheduled_config;
DROP INDEX IF EXISTS idx_hallway_entity_detections_metadata;
DROP INDEX IF EXISTS idx_hallway_transcript_chunks_metadata;
DROP INDEX IF EXISTS idx_hallway_meetings_device_info;
DROP INDEX IF EXISTS idx_hallway_meetings_metadata;
DROP INDEX IF EXISTS idx_hallway_entity_detections_title_fts;
DROP INDEX IF EXISTS idx_hallway_transcript_chunks_content_fts;
DROP INDEX IF EXISTS idx_hallway_meetings_summary_fts;
DROP INDEX IF EXISTS idx_hallway_meetings_transcript_fts;
DROP INDEX IF EXISTS idx_hallway_entity_detections_auto_created;
DROP INDEX IF EXISTS idx_hallway_entity_detections_meeting_type;
DROP INDEX IF EXISTS idx_hallway_transcript_chunks_meeting_sequence;
DROP INDEX IF EXISTS idx_hallway_meetings_started_at;
DROP INDEX IF EXISTS idx_hallway_meetings_project_status;
DROP INDEX IF EXISTS idx_wake_word_detections_meeting_id;
DROP INDEX IF EXISTS idx_wake_word_detections_user_id;
DROP INDEX IF EXISTS idx_user_wake_word_settings_project_id;
DROP INDEX IF EXISTS idx_user_wake_word_settings_user_id;
DROP INDEX IF EXISTS idx_hallway_speaker_mappings_participant_id;
DROP INDEX IF EXISTS idx_hallway_speaker_mappings_meeting_id;
DROP INDEX IF EXISTS idx_hallway_entity_detections_assigned_to;
DROP INDEX IF EXISTS idx_hallway_entity_detections_chunk_id;
DROP INDEX IF EXISTS idx_hallway_entity_detections_meeting_id;
DROP INDEX IF EXISTS idx_hallway_transcript_chunks_participant_id;
DROP INDEX IF EXISTS idx_hallway_transcript_chunks_meeting_id;
DROP INDEX IF EXISTS idx_hallway_participants_user_id;
DROP INDEX IF EXISTS idx_hallway_participants_meeting_id;
DROP INDEX IF EXISTS idx_hallway_meetings_started_by;
DROP INDEX IF EXISTS idx_hallway_meetings_project_id;

DROP TABLE IF EXISTS wake_word_detections;
DROP TABLE IF EXISTS user_wake_word_settings;
DROP TABLE IF EXISTS hallway_speaker_mappings;
DROP TABLE IF EXISTS hallway_entity_detections;
DROP TABLE IF EXISTS hallway_transcript_chunks;
DROP TABLE IF EXISTS hallway_participants;
DROP TABLE IF EXISTS hallway_meetings;
*/
