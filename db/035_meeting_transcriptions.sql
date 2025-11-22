-- Migration 035: Meeting Transcriptions System
-- Supports real-time transcription from Zoom and Microsoft Teams
-- Includes meeting lifecycle management, participant tracking, and live entity detection
-- Dependencies: Requires migrations 001-034 to be applied first

-- ==========================================
-- 1. Meeting Transcriptions Table
-- ==========================================
CREATE TABLE IF NOT EXISTS meeting_transcriptions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  meeting_platform VARCHAR(50) NOT NULL CHECK (meeting_platform IN ('zoom', 'teams')),
  meeting_id VARCHAR(255) NOT NULL,
  meeting_title VARCHAR(500),
  started_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  activation_mode VARCHAR(50) DEFAULT 'manual' CHECK (activation_mode IN ('auto', 'manual', 'smart')),
  transcription_provider VARCHAR(50) CHECK (transcription_provider IN ('deepgram', 'azure_speech')),
  full_transcript TEXT,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'ended', 'paused', 'error')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(meeting_platform, meeting_id)
);

CREATE INDEX idx_meeting_transcriptions_project ON meeting_transcriptions(project_id);
CREATE INDEX idx_meeting_transcriptions_status ON meeting_transcriptions(status);
CREATE INDEX idx_meeting_transcriptions_started_at ON meeting_transcriptions(started_at);
CREATE INDEX idx_meeting_transcriptions_platform ON meeting_transcriptions(meeting_platform);

COMMENT ON TABLE meeting_transcriptions IS 'Stores meeting metadata and transcription lifecycle';
COMMENT ON COLUMN meeting_transcriptions.activation_mode IS 'How transcription was activated: auto, manual, or smart';
COMMENT ON COLUMN meeting_transcriptions.status IS 'Current state: active, ended, paused, error';

-- ==========================================
-- 2. Meeting Participants Table
-- ==========================================
CREATE TABLE IF NOT EXISTS meeting_participants (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meeting_transcriptions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  participant_name VARCHAR(255) NOT NULL,
  participant_email VARCHAR(255),
  external_participant_id VARCHAR(255),
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  is_organizer BOOLEAN DEFAULT false,
  speaking_time_seconds INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (speaking_time_seconds >= 0)
);

CREATE INDEX idx_meeting_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX idx_meeting_participants_user ON meeting_participants(user_id);
CREATE INDEX idx_meeting_participants_email ON meeting_participants(participant_email);
CREATE INDEX idx_meeting_participants_external_id ON meeting_participants(external_participant_id);

COMMENT ON TABLE meeting_participants IS 'Tracks who participated in each meeting';
COMMENT ON COLUMN meeting_participants.user_id IS 'Linked user if internal, NULL for external participants';
COMMENT ON COLUMN meeting_participants.speaking_time_seconds IS 'Total time this participant spoke';

-- ==========================================
-- 3. Transcript Chunks Table
-- ==========================================
CREATE TABLE IF NOT EXISTS transcript_chunks (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meeting_transcriptions(id) ON DELETE CASCADE,
  speaker_name VARCHAR(255),
  speaker_id VARCHAR(255),
  content TEXT NOT NULL,
  start_time_seconds DECIMAL(10,2),
  end_time_seconds DECIMAL(10,2),
  confidence DECIMAL(3,2) CHECK (confidence >= 0.00 AND confidence <= 1.00),
  is_final BOOLEAN DEFAULT false,
  chunk_sequence INTEGER,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (start_time_seconds >= 0),
  CHECK (end_time_seconds >= start_time_seconds)
);

CREATE INDEX idx_transcript_chunks_meeting ON transcript_chunks(meeting_id);
CREATE INDEX idx_transcript_chunks_sequence ON transcript_chunks(meeting_id, chunk_sequence);
CREATE INDEX idx_transcript_chunks_speaker ON transcript_chunks(speaker_id);
CREATE INDEX idx_transcript_chunks_time ON transcript_chunks(meeting_id, start_time_seconds);
CREATE INDEX idx_transcript_chunks_final ON transcript_chunks(meeting_id, is_final);

COMMENT ON TABLE transcript_chunks IS 'Stores individual transcript segments with timing';
COMMENT ON COLUMN transcript_chunks.is_final IS 'True for final transcript, false for interim results';
COMMENT ON COLUMN transcript_chunks.confidence IS 'Transcription confidence score (0.00-1.00)';
COMMENT ON COLUMN transcript_chunks.metadata IS 'Word-level timestamps, alternatives, speaker diarization data';

-- ==========================================
-- 4. Live Entity Detections Table
-- ==========================================
CREATE TABLE IF NOT EXISTS live_entity_detections (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meeting_transcriptions(id) ON DELETE CASCADE,
  chunk_id INTEGER REFERENCES transcript_chunks(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('decision', 'risk', 'action_item', 'task', 'blocker', 'discussion')),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  confidence DECIMAL(3,2) CHECK (confidence >= 0.00 AND confidence <= 1.00),
  impact_level VARCHAR(50) CHECK (impact_level IN ('low', 'medium', 'high', 'critical')),
  detected_at TIMESTAMP DEFAULT NOW(),
  was_auto_created BOOLEAN DEFAULT false,
  created_entity_id UUID,
  dismissed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  dismissed_at TIMESTAMP,
  dismissal_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_live_detections_meeting ON live_entity_detections(meeting_id);
CREATE INDEX idx_live_detections_chunk ON live_entity_detections(chunk_id);
CREATE INDEX idx_live_detections_entity_type ON live_entity_detections(entity_type);
CREATE INDEX idx_live_detections_created_entity ON live_entity_detections(created_entity_id);
CREATE INDEX idx_live_detections_dismissed ON live_entity_detections(dismissed_by, dismissed_at);
CREATE INDEX idx_live_detections_auto_created ON live_entity_detections(was_auto_created);

COMMENT ON TABLE live_entity_detections IS 'AI-detected entities during live meeting transcription';
COMMENT ON COLUMN live_entity_detections.was_auto_created IS 'Whether this detection became an actual project entity';
COMMENT ON COLUMN live_entity_detections.created_entity_id IS 'Reference to pkg_nodes.id if auto-created';

-- ==========================================
-- 5. Meeting Summaries Table
-- ==========================================
CREATE TABLE IF NOT EXISTS meeting_summaries (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meeting_transcriptions(id) ON DELETE CASCADE,
  generated_at TIMESTAMP DEFAULT NOW(),
  summary_text TEXT NOT NULL,
  key_decisions INTEGER DEFAULT 0 CHECK (key_decisions >= 0),
  key_risks INTEGER DEFAULT 0 CHECK (key_risks >= 0),
  action_items INTEGER DEFAULT 0 CHECK (action_items >= 0),
  participants_count INTEGER DEFAULT 0 CHECK (participants_count >= 0),
  total_speaking_time INTEGER CHECK (total_speaking_time >= 0),
  sentiment_score DECIMAL(3,2) CHECK (sentiment_score >= -1.00 AND sentiment_score <= 1.00),
  ai_provider VARCHAR(50) CHECK (ai_provider IN ('openai', 'claude', 'gemini', 'azure_openai')),
  generation_cost DECIMAL(10,6),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_meeting_summaries_meeting ON meeting_summaries(meeting_id);
CREATE INDEX idx_meeting_summaries_generated ON meeting_summaries(generated_at);
CREATE INDEX idx_meeting_summaries_provider ON meeting_summaries(ai_provider);

COMMENT ON TABLE meeting_summaries IS 'AI-generated summaries of completed meetings';
COMMENT ON COLUMN meeting_summaries.sentiment_score IS 'Overall meeting sentiment (-1.00 to 1.00)';
COMMENT ON COLUMN meeting_summaries.metadata IS 'Topics, keywords, highlights, key quotes';

-- ==========================================
-- 6. Meeting Recordings Table
-- ==========================================
CREATE TABLE IF NOT EXISTS meeting_recordings (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meeting_transcriptions(id) ON DELETE CASCADE,
  storage_provider VARCHAR(50) CHECK (storage_provider IN ('s3', 'azure_blob', 'zoom_cloud', 'teams_cloud', 'replit_storage')),
  storage_url TEXT,
  file_size_bytes BIGINT CHECK (file_size_bytes >= 0),
  duration_seconds INTEGER CHECK (duration_seconds >= 0),
  format VARCHAR(50),
  is_processed BOOLEAN DEFAULT false,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_meeting_recordings_meeting ON meeting_recordings(meeting_id);
CREATE INDEX idx_meeting_recordings_processed ON meeting_recordings(is_processed);
CREATE INDEX idx_meeting_recordings_uploaded ON meeting_recordings(uploaded_at);

COMMENT ON TABLE meeting_recordings IS 'Optional storage for meeting recordings';
COMMENT ON COLUMN meeting_recordings.is_processed IS 'Whether recording has been processed for transcription';

-- ==========================================
-- Additional Performance Indexes
-- ==========================================

-- Composite index for common queries
CREATE INDEX idx_meeting_transcriptions_project_status ON meeting_transcriptions(project_id, status);
CREATE INDEX idx_meeting_transcriptions_project_started ON meeting_transcriptions(project_id, started_at DESC);

-- Full-text search on transcript content
CREATE INDEX idx_transcript_chunks_content_fts ON transcript_chunks USING gin(to_tsvector('english', content));

-- Full-text search on meeting summaries
CREATE INDEX idx_meeting_summaries_text_fts ON meeting_summaries USING gin(to_tsvector('english', summary_text));

-- JSONB indexes for metadata queries
CREATE INDEX idx_meeting_transcriptions_metadata ON meeting_transcriptions USING gin(metadata);
CREATE INDEX idx_live_detections_metadata ON live_entity_detections USING gin(metadata);

-- ==========================================
-- Views for Common Queries
-- ==========================================

-- Active meetings with participant count
CREATE OR REPLACE VIEW active_meetings_with_participants AS
SELECT 
  mt.id,
  mt.project_id,
  mt.meeting_platform,
  mt.meeting_title,
  mt.started_at,
  mt.started_by,
  COUNT(DISTINCT mp.id) as participant_count,
  COUNT(DISTINCT CASE WHEN mp.left_at IS NULL THEN mp.id END) as active_participants
FROM meeting_transcriptions mt
LEFT JOIN meeting_participants mp ON mt.id = mp.meeting_id
WHERE mt.status = 'active'
GROUP BY mt.id;

COMMENT ON VIEW active_meetings_with_participants IS 'Real-time view of active meetings with participant counts';

-- Meeting entity detection summary
CREATE OR REPLACE VIEW meeting_entity_summary AS
SELECT 
  mt.id as meeting_id,
  mt.meeting_title,
  mt.project_id,
  COUNT(DISTINCT CASE WHEN led.entity_type = 'decision' THEN led.id END) as decisions_detected,
  COUNT(DISTINCT CASE WHEN led.entity_type = 'risk' THEN led.id END) as risks_detected,
  COUNT(DISTINCT CASE WHEN led.entity_type = 'action_item' THEN led.id END) as action_items_detected,
  COUNT(DISTINCT CASE WHEN led.was_auto_created = true THEN led.id END) as auto_created_count,
  COUNT(DISTINCT CASE WHEN led.dismissed_by IS NOT NULL THEN led.id END) as dismissed_count
FROM meeting_transcriptions mt
LEFT JOIN live_entity_detections led ON mt.id = led.meeting_id
GROUP BY mt.id, mt.meeting_title, mt.project_id;

COMMENT ON VIEW meeting_entity_summary IS 'Summary of AI-detected entities per meeting';

-- ==========================================
-- Triggers for Automatic Updates
-- ==========================================

-- Update meeting duration when ended
CREATE OR REPLACE FUNCTION update_meeting_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL THEN
    NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_meeting_duration
BEFORE UPDATE ON meeting_transcriptions
FOR EACH ROW
EXECUTE FUNCTION update_meeting_duration();

-- Update speaking time when participant leaves
CREATE OR REPLACE FUNCTION update_speaking_time()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
    -- Calculate speaking time from transcript chunks
    UPDATE meeting_participants
    SET speaking_time_seconds = (
      SELECT COALESCE(SUM(end_time_seconds - start_time_seconds), 0)
      FROM transcript_chunks
      WHERE meeting_id = NEW.meeting_id 
        AND speaker_id = NEW.external_participant_id
        AND is_final = true
    )
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_speaking_time
AFTER UPDATE ON meeting_participants
FOR EACH ROW
EXECUTE FUNCTION update_speaking_time();

-- ==========================================
-- Rollback Script (for migration reversal)
-- ==========================================

-- To rollback this migration, run the following in reverse order:
/*
DROP TRIGGER IF EXISTS trigger_update_speaking_time ON meeting_participants;
DROP TRIGGER IF EXISTS trigger_update_meeting_duration ON meeting_transcriptions;
DROP FUNCTION IF EXISTS update_speaking_time();
DROP FUNCTION IF EXISTS update_meeting_duration();
DROP VIEW IF EXISTS meeting_entity_summary;
DROP VIEW IF EXISTS active_meetings_with_participants;
DROP TABLE IF EXISTS meeting_recordings CASCADE;
DROP TABLE IF EXISTS meeting_summaries CASCADE;
DROP TABLE IF EXISTS live_entity_detections CASCADE;
DROP TABLE IF EXISTS transcript_chunks CASCADE;
DROP TABLE IF EXISTS meeting_participants CASCADE;
DROP TABLE IF EXISTS meeting_transcriptions CASCADE;
*/
