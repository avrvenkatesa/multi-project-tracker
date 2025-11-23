-- Migration 036: Thought Capture & Mobile Support
-- Story 5.4.4: Voice capture, quick thoughts, offline queue, AI analysis
-- Dependencies: Requires migrations 001-035

BEGIN;

-- ============================================
-- Table 1: thought_captures
-- Core table for capturing thoughts via voice or text
-- ============================================
CREATE TABLE IF NOT EXISTS thought_captures (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,

  -- Capture content
  content TEXT NOT NULL,
  original_audio_url TEXT,
  transcription TEXT,
  transcription_confidence DECIMAL(3,2), -- 0.00-1.00

  -- Capture metadata
  capture_method VARCHAR(50) NOT NULL, -- 'voice', 'text', 'email', 'sms', 'mobile_app'
  device_info JSONB, -- { "type": "mobile", "os": "iOS 15", "browser": "Safari" }
  location_context JSONB, -- Optional geolocation if permitted

  -- AI Analysis
  detected_entity_type VARCHAR(50), -- 'decision', 'risk', 'action_item', 'task', 'note'
  ai_analysis JSONB, -- Full AI response with entities, confidence, suggestions
  ai_confidence DECIMAL(3,2),

  -- Workflow
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'processed', 'failed', 'cancelled'
  created_entity_id UUID, -- Link to pkg_nodes if auto-created
  requires_review BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,

  -- Constraints
  CONSTRAINT thought_captures_capture_method_check
    CHECK (capture_method IN ('voice', 'text', 'email', 'sms', 'mobile_app')),
  CONSTRAINT thought_captures_status_check
    CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'cancelled'))
);

-- Indexes for thought_captures
CREATE INDEX idx_thought_captures_user ON thought_captures(user_id);
CREATE INDEX idx_thought_captures_project ON thought_captures(project_id);
CREATE INDEX idx_thought_captures_status ON thought_captures(status);
CREATE INDEX idx_thought_captures_created ON thought_captures(created_at DESC);
CREATE INDEX idx_thought_captures_entity_type ON thought_captures(detected_entity_type);

-- Full-text search on content
CREATE INDEX idx_thought_captures_content_search ON thought_captures
  USING gin(to_tsvector('english', content));

COMMENT ON TABLE thought_captures IS 'Captures thoughts via voice or text with AI analysis';
COMMENT ON COLUMN thought_captures.content IS 'Text content or transcription of the thought';
COMMENT ON COLUMN thought_captures.capture_method IS 'How the thought was captured';
COMMENT ON COLUMN thought_captures.ai_analysis IS 'Full AI analysis result with detected entities';

-- ============================================
-- Table 2: voice_recordings
-- Stores audio recordings and transcription metadata
-- ============================================
CREATE TABLE IF NOT EXISTS voice_recordings (
  id SERIAL PRIMARY KEY,
  thought_capture_id INTEGER REFERENCES thought_captures(id) ON DELETE CASCADE,

  -- Audio file metadata
  audio_url TEXT NOT NULL,
  storage_provider VARCHAR(50) DEFAULT 'local', -- 'local', 's3', 'cloudinary'
  duration_seconds DECIMAL(10,2),
  file_size_bytes BIGINT,
  format VARCHAR(20), -- 'webm', 'mp3', 'wav', 'ogg', 'opus', 'm4a'

  -- Transcription
  transcription_provider VARCHAR(50), -- 'deepgram', 'web_speech', 'azure_speech'
  transcription_text TEXT,
  transcription_confidence DECIMAL(3,2),
  transcription_metadata JSONB, -- Word-level timestamps, alternatives

  -- Processing
  is_processed BOOLEAN DEFAULT false,
  processing_error TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT voice_recordings_format_check
    CHECK (format IN ('webm', 'mp3', 'wav', 'ogg', 'opus', 'm4a'))
);

-- Indexes for voice_recordings
CREATE INDEX idx_voice_recordings_thought ON voice_recordings(thought_capture_id);
CREATE INDEX idx_voice_recordings_processed ON voice_recordings(is_processed);

COMMENT ON TABLE voice_recordings IS 'Audio recordings with transcription metadata';
COMMENT ON COLUMN voice_recordings.transcription_metadata IS 'Word-level timestamps and alternatives from transcription service';

-- ============================================
-- Table 3: offline_queue
-- Queue for offline captures waiting to sync
-- ============================================
CREATE TABLE IF NOT EXISTS offline_queue (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255), -- Unique device identifier

  -- Queue item
  action_type VARCHAR(50) NOT NULL, -- 'thought_capture', 'entity_create', 'entity_update'
  payload JSONB NOT NULL, -- Full request data
  endpoint VARCHAR(255), -- API endpoint to call
  http_method VARCHAR(10) DEFAULT 'POST',

  -- Sync status
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'syncing', 'synced', 'failed', 'expired'
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_error TEXT,

  -- Resolution
  synced_entity_id UUID, -- Reference to created/updated entity
  conflict_resolution VARCHAR(50), -- 'auto_merge', 'user_chose_local', 'user_chose_remote'

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  synced_at TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days'),

  -- Constraints
  CONSTRAINT offline_queue_status_check
    CHECK (status IN ('pending', 'syncing', 'synced', 'failed', 'expired'))
);

-- Indexes for offline_queue
CREATE INDEX idx_offline_queue_user ON offline_queue(user_id);
CREATE INDEX idx_offline_queue_status ON offline_queue(status);
CREATE INDEX idx_offline_queue_device ON offline_queue(device_id);
CREATE INDEX idx_offline_queue_expires ON offline_queue(expires_at);

COMMENT ON TABLE offline_queue IS 'Queue for syncing offline captures when connection is restored';
COMMENT ON COLUMN offline_queue.payload IS 'Complete request data to replay when online';
COMMENT ON COLUMN offline_queue.conflict_resolution IS 'How conflicts were resolved during sync';

-- ============================================
-- Table 4: quick_capture_templates
-- User-defined templates for quick thought capture
-- ============================================
CREATE TABLE IF NOT EXISTS quick_capture_templates (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  template_text TEXT, -- "Decided to {{decision}}"
  entity_type VARCHAR(50), -- Pre-set entity type
  tags TEXT[], -- Pre-filled tags

  is_favorite BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for quick_capture_templates
CREATE INDEX idx_quick_templates_user ON quick_capture_templates(user_id);
CREATE INDEX idx_quick_templates_favorites ON quick_capture_templates(user_id, is_favorite);

COMMENT ON TABLE quick_capture_templates IS 'User templates for quick thought capture';
COMMENT ON COLUMN quick_capture_templates.template_text IS 'Template with placeholders like {{decision}}';
COMMENT ON COLUMN quick_capture_templates.use_count IS 'Number of times template has been used';

-- ============================================
-- Views for analytics and reporting
-- ============================================

-- View: Recent thought captures by user
CREATE OR REPLACE VIEW user_thought_captures AS
SELECT
  tc.id,
  tc.user_id,
  u.username,
  tc.project_id,
  p.name as project_name,
  tc.content,
  tc.capture_method,
  tc.detected_entity_type,
  tc.status,
  tc.created_at,
  CASE WHEN tc.created_entity_id IS NOT NULL THEN true ELSE false END as was_created
FROM thought_captures tc
LEFT JOIN users u ON tc.user_id = u.id
LEFT JOIN projects p ON tc.project_id = p.id;

COMMENT ON VIEW user_thought_captures IS 'User-friendly view of thought captures with user and project names';

-- View: Offline queue summary
CREATE OR REPLACE VIEW offline_queue_summary AS
SELECT
  user_id,
  device_id,
  status,
  COUNT(*) as queue_count,
  MIN(created_at) as oldest_item,
  MAX(created_at) as newest_item
FROM offline_queue
WHERE status IN ('pending', 'syncing')
GROUP BY user_id, device_id, status;

COMMENT ON VIEW offline_queue_summary IS 'Summary of pending offline queue items per user/device';

-- ============================================
-- Triggers for automation
-- ============================================

-- Trigger: Auto-update processed_at when status changes to 'processed'
CREATE OR REPLACE FUNCTION update_thought_processed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'processed' AND OLD.status != 'processed' THEN
    NEW.processed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_thought_processed_at
BEFORE UPDATE ON thought_captures
FOR EACH ROW
EXECUTE FUNCTION update_thought_processed_at();

COMMENT ON FUNCTION update_thought_processed_at() IS 'Auto-sets processed_at timestamp when status changes to processed';

-- Trigger: Expire old offline queue items
CREATE OR REPLACE FUNCTION expire_old_queue_items()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE offline_queue
  SET status = 'expired'
  WHERE expires_at < NOW() AND status = 'pending';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_expire_queue_items
AFTER INSERT ON offline_queue
FOR EACH STATEMENT
EXECUTE FUNCTION expire_old_queue_items();

COMMENT ON FUNCTION expire_old_queue_items() IS 'Automatically expires old pending queue items past their expiration date';

COMMIT;

-- ============================================
-- Rollback Script (run manually if needed)
-- ============================================
-- DROP TRIGGER IF EXISTS trigger_expire_queue_items ON offline_queue;
-- DROP TRIGGER IF EXISTS trigger_thought_processed_at ON thought_captures;
-- DROP FUNCTION IF EXISTS expire_old_queue_items();
-- DROP FUNCTION IF EXISTS update_thought_processed_at();
-- DROP VIEW IF EXISTS offline_queue_summary;
-- DROP VIEW IF EXISTS user_thought_captures;
-- DROP TABLE IF EXISTS quick_capture_templates;
-- DROP TABLE IF EXISTS offline_queue;
-- DROP TABLE IF EXISTS voice_recordings;
-- DROP TABLE IF EXISTS thought_captures;
