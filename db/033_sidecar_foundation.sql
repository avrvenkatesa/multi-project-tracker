-- ============================================
-- Migration 033: Sidecar Foundation
-- Story 5.4.1: Role System & Platform Integration
-- ============================================

-- ============================================
-- PART 1: CUSTOM ROLE SYSTEM (Tier 1)
-- ============================================

-- Custom roles (industry-agnostic)
CREATE TABLE IF NOT EXISTS custom_roles (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER,
  project_id INTEGER REFERENCES projects(id),

  -- Role definition
  role_name VARCHAR(100) NOT NULL,
  role_code VARCHAR(50) NOT NULL,
  role_description TEXT,
  role_category VARCHAR(50) CHECK (role_category IN ('leadership', 'contributor', 'specialist', 'viewer')),

  -- Visual customization
  icon VARCHAR(50) DEFAULT 'user',
  color VARCHAR(20) DEFAULT '#6B7280',

  -- Hierarchy
  reports_to_role_id INTEGER REFERENCES custom_roles(id) ON DELETE SET NULL,
  authority_level INTEGER DEFAULT 1 CHECK (authority_level BETWEEN 1 AND 5),

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_system_role BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  UNIQUE(project_id, role_code),
  CHECK (customer_id IS NOT NULL OR project_id IS NOT NULL)
);

-- Role permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER REFERENCES custom_roles(id) ON DELETE CASCADE,

  -- Entity type (decision, risk, task, etc.)
  entity_type VARCHAR(50) NOT NULL,

  -- CRUD permissions
  can_create BOOLEAN DEFAULT false,
  can_read BOOLEAN DEFAULT true,
  can_update BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,

  -- Auto-creation rules
  auto_create_enabled BOOLEAN DEFAULT false,
  auto_create_threshold DECIMAL DEFAULT 0.9 CHECK (auto_create_threshold BETWEEN 0 AND 1),

  -- Approval workflow
  requires_approval BOOLEAN DEFAULT false,
  approval_from_role_id INTEGER REFERENCES custom_roles(id),

  -- Notification rules
  notify_on_create BOOLEAN DEFAULT false,
  notify_role_ids INTEGER[],

  -- Capture permissions
  can_capture_thoughts BOOLEAN DEFAULT true,
  can_record_meetings BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  UNIQUE(role_id, entity_type)
);

-- User role assignments
CREATE TABLE IF NOT EXISTS user_role_assignments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES custom_roles(id) ON DELETE CASCADE,

  -- Assignment metadata
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by INTEGER REFERENCES users(id),
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_to DATE,

  -- Primary role flag
  is_primary BOOLEAN DEFAULT true,

  -- Constraints
  UNIQUE(user_id, project_id, role_id, valid_from)
);

-- Custom entity types (for industry-specific entities)
CREATE TABLE IF NOT EXISTS custom_entity_types (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER,
  project_id INTEGER REFERENCES projects(id),

  -- Entity definition
  entity_type_code VARCHAR(50) NOT NULL,
  entity_type_name VARCHAR(100) NOT NULL,
  entity_type_description TEXT,

  -- Visual
  icon VARCHAR(50) DEFAULT 'file',
  color VARCHAR(20) DEFAULT '#6B7280',

  -- Schema (custom fields)
  custom_fields JSONB DEFAULT '[]'::jsonb,

  -- Workflow
  approval_workflow JSONB,
  notification_rules JSONB,

  -- Mapping to core entities
  maps_to_core_entity VARCHAR(50),

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  UNIQUE(project_id, entity_type_code),
  CHECK (customer_id IS NOT NULL OR project_id IS NOT NULL)
);

-- ============================================
-- PART 2: SIDECAR CONFIGURATION
-- ============================================

CREATE TABLE IF NOT EXISTS sidecar_config (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) UNIQUE NOT NULL,
  customer_id INTEGER,
  enabled BOOLEAN DEFAULT true,

  -- ============================================
  -- Chat Platform Configuration
  -- ============================================
  active_chat_platform VARCHAR(20) CHECK (active_chat_platform IN ('slack', 'teams', 'both', 'none')) DEFAULT 'none',

  -- Slack configuration
  slack_enabled BOOLEAN DEFAULT false,
  slack_workspace_id VARCHAR(255),
  slack_bot_token TEXT,
  slack_channels TEXT[],
  slack_webhook_url TEXT,
  slack_auto_reply BOOLEAN DEFAULT true,

  -- Teams configuration
  teams_enabled BOOLEAN DEFAULT false,
  teams_tenant_id VARCHAR(255),
  teams_bot_app_id VARCHAR(255),
  teams_bot_secret TEXT,
  teams_team_ids TEXT[],
  teams_channel_ids TEXT[],

  -- ============================================
  -- GitHub Configuration
  -- ============================================
  github_enabled BOOLEAN DEFAULT false,
  github_repos TEXT[],
  github_webhook_secret TEXT,

  -- ============================================
  -- Email Integration Configuration
  -- ============================================
  email_integration_mode VARCHAR(50) CHECK (email_integration_mode IN ('dedicated_address', 'forwarding_rules', 'imap_polling', 'all', 'none')) DEFAULT 'none',
  email_dedicated_address VARCHAR(255),
  email_forwarding_enabled BOOLEAN DEFAULT false,

  -- IMAP configuration
  email_imap_enabled BOOLEAN DEFAULT false,
  email_imap_host VARCHAR(255),
  email_imap_port INTEGER DEFAULT 993,
  email_imap_username VARCHAR(255),
  email_imap_password TEXT,
  email_imap_folder VARCHAR(100) DEFAULT 'INBOX',
  email_imap_use_tls BOOLEAN DEFAULT true,

  -- Email filtering
  email_filter_rules JSONB DEFAULT '{}'::jsonb,
  email_process_internal BOOLEAN DEFAULT true,
  email_process_external BOOLEAN DEFAULT true,
  email_ignore_domains TEXT[],

  -- ============================================
  -- Meeting Transcription Configuration
  -- ============================================
  meeting_activation_mode VARCHAR(50) CHECK (meeting_activation_mode IN ('always_on', 'manual', 'smart')) DEFAULT 'smart',
  meeting_auto_start_teams BOOLEAN DEFAULT false,
  meeting_auto_start_zoom BOOLEAN DEFAULT false,
  meeting_require_confirmation BOOLEAN DEFAULT true,
  meeting_announce_presence BOOLEAN DEFAULT true,
  meeting_smart_filters JSONB DEFAULT '{}'::jsonb,

  -- Transcription provider
  transcription_provider VARCHAR(50) CHECK (transcription_provider IN ('deepgram', 'assemblyai', 'azure_speech', 'aws_transcribe')) DEFAULT 'deepgram',
  transcription_api_key TEXT,

  -- ============================================
  -- Detection Settings
  -- ============================================
  auto_create_threshold DECIMAL DEFAULT 0.9 CHECK (auto_create_threshold BETWEEN 0 AND 1),
  detection_types TEXT[] DEFAULT ARRAY['risk', 'decision', 'action_item'],

  -- ============================================
  -- Notification Preferences
  -- ============================================
  notify_chat_platform BOOLEAN DEFAULT true,
  notify_email BOOLEAN DEFAULT false,
  email_digest_frequency VARCHAR(20) CHECK (email_digest_frequency IN ('realtime', 'daily', 'weekly', 'never')) DEFAULT 'daily',
  notification_channel_id VARCHAR(255),

  -- ============================================
  -- Privacy & Compliance
  -- ============================================
  data_retention_days INTEGER DEFAULT 90,
  auto_redact_pii BOOLEAN DEFAULT true,
  require_meeting_consent BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PART 3: THOUGHT CAPTURE
-- ============================================

CREATE TABLE IF NOT EXISTS thought_captures (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,

  -- Content
  content_type VARCHAR(50) CHECK (content_type IN ('text', 'voice', 'file')) NOT NULL,
  text_content TEXT,
  audio_url TEXT,
  file_url TEXT,
  transcript TEXT,

  -- Metadata
  thought_type VARCHAR(50) CHECK (thought_type IN ('auto', 'decision', 'risk', 'idea', 'blocker', 'question')) DEFAULT 'auto',
  user_role VARCHAR(50),
  user_authority_level INTEGER,
  tags TEXT[],

  -- Analysis results
  analyzed BOOLEAN DEFAULT false,
  analysis_result JSONB,
  analysis_confidence DECIMAL,

  -- Workflow results
  created_entities JSONB DEFAULT '[]'::jsonb,
  created_proposals JSONB DEFAULT '[]'::jsonb,

  -- Source metadata
  capture_source VARCHAR(50) CHECK (capture_source IN ('mobile', 'desktop', 'web', 'browser_extension', 'api')),
  device_info JSONB,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PART 4: MEETING TRANSCRIPTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS meeting_transcriptions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  meeting_id VARCHAR(255) UNIQUE NOT NULL,

  -- Meeting metadata
  platform VARCHAR(50) CHECK (platform IN ('teams', 'zoom', 'google_meet', 'adhoc')) NOT NULL,
  meeting_title VARCHAR(255),
  meeting_url TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,

  -- Participants
  participants JSONB DEFAULT '[]'::jsonb,
  organizer_id INTEGER REFERENCES users(id),

  -- Transcription
  transcript_full TEXT,
  transcript_url TEXT,
  audio_url TEXT,

  -- Analysis
  detected_entities JSONB DEFAULT '[]'::jsonb,
  summary TEXT,

  -- Configuration
  activation_mode VARCHAR(50),
  initiated_by INTEGER REFERENCES users(id),
  consent_given BOOLEAN DEFAULT false,

  -- Status
  status VARCHAR(50) CHECK (status IN ('pending', 'transcribing', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PART 5: INDEXES FOR PERFORMANCE
-- ============================================

-- Custom roles indexes
CREATE INDEX IF NOT EXISTS idx_custom_roles_project ON custom_roles(project_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_custom_roles_customer ON custom_roles(customer_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_custom_roles_authority ON custom_roles(authority_level);
CREATE INDEX IF NOT EXISTS idx_custom_roles_hierarchy ON custom_roles(reports_to_role_id);

-- Role permissions indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_entity ON role_permissions(entity_type);

-- User role assignments indexes
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user ON user_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_project ON user_role_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_active ON user_role_assignments(valid_from, valid_to) WHERE is_primary = true;

-- Thought captures indexes
CREATE INDEX IF NOT EXISTS idx_thought_captures_project ON thought_captures(project_id);
CREATE INDEX IF NOT EXISTS idx_thought_captures_user ON thought_captures(created_by);
CREATE INDEX IF NOT EXISTS idx_thought_captures_date ON thought_captures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thought_captures_text ON thought_captures USING GIN(to_tsvector('english', text_content)) WHERE text_content IS NOT NULL;

-- Meeting transcriptions indexes
CREATE INDEX IF NOT EXISTS idx_meeting_transcriptions_project ON meeting_transcriptions(project_id);
CREATE INDEX IF NOT EXISTS idx_meeting_transcriptions_platform ON meeting_transcriptions(platform);
CREATE INDEX IF NOT EXISTS idx_meeting_transcriptions_date ON meeting_transcriptions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_transcriptions_status ON meeting_transcriptions(status);

-- Sidecar config index
CREATE INDEX IF NOT EXISTS idx_sidecar_config_project ON sidecar_config(project_id);

-- ============================================
-- PART 6: DEFAULT SOFTWARE PROJECT ROLES
-- ============================================

-- Function to seed default roles for a project
CREATE OR REPLACE FUNCTION seed_default_software_roles(p_project_id INTEGER)
RETURNS void AS $$
DECLARE
  v_admin_role_id INTEGER;
  v_manager_role_id INTEGER;
  v_tech_lead_role_id INTEGER;
  v_developer_role_id INTEGER;
  v_qa_role_id INTEGER;
  v_ba_role_id INTEGER;
  v_devops_role_id INTEGER;
  v_designer_role_id INTEGER;
  v_viewer_role_id INTEGER;
BEGIN
  -- Admin (Level 5)
  INSERT INTO custom_roles (project_id, role_name, role_code, role_category, authority_level, icon, color, is_system_role)
  VALUES (p_project_id, 'Admin', 'admin', 'leadership', 5, 'shield', '#DC2626', true)
  RETURNING id INTO v_admin_role_id;

  -- Project Manager (Level 4)
  INSERT INTO custom_roles (project_id, role_name, role_code, role_category, authority_level, icon, color, is_system_role)
  VALUES (p_project_id, 'Project Manager', 'manager', 'leadership', 4, 'briefcase', '#7C3AED', true)
  RETURNING id INTO v_manager_role_id;

  -- Tech Lead (Level 3, reports to PM)
  INSERT INTO custom_roles (project_id, role_name, role_code, role_category, authority_level, reports_to_role_id, icon, color, is_system_role)
  VALUES (p_project_id, 'Tech Lead', 'tech_lead', 'leadership', 3, v_manager_role_id, 'code', '#2563EB', true)
  RETURNING id INTO v_tech_lead_role_id;

  -- Developer (Level 1, reports to Tech Lead)
  INSERT INTO custom_roles (project_id, role_name, role_code, role_category, authority_level, reports_to_role_id, icon, color, is_system_role)
  VALUES (p_project_id, 'Developer', 'developer', 'contributor', 1, v_tech_lead_role_id, 'terminal', '#10B981', true)
  RETURNING id INTO v_developer_role_id;

  -- QA/Tester (Level 1, reports to Tech Lead)
  INSERT INTO custom_roles (project_id, role_name, role_code, role_category, authority_level, reports_to_role_id, icon, color, is_system_role)
  VALUES (p_project_id, 'QA/Tester', 'qa', 'contributor', 1, v_tech_lead_role_id, 'bug', '#F59E0B', true)
  RETURNING id INTO v_qa_role_id;

  -- Business Analyst (Level 2, reports to PM)
  INSERT INTO custom_roles (project_id, role_name, role_code, role_category, authority_level, reports_to_role_id, icon, color, is_system_role)
  VALUES (p_project_id, 'Business Analyst', 'ba', 'specialist', 2, v_manager_role_id, 'chart', '#8B5CF6', true)
  RETURNING id INTO v_ba_role_id;

  -- DevOps Engineer (Level 2, reports to Tech Lead)
  INSERT INTO custom_roles (project_id, role_name, role_code, role_category, authority_level, reports_to_role_id, icon, color, is_system_role)
  VALUES (p_project_id, 'DevOps Engineer', 'devops', 'specialist', 2, v_tech_lead_role_id, 'server', '#EC4899', true)
  RETURNING id INTO v_devops_role_id;

  -- Designer (Level 2, reports to PM)
  INSERT INTO custom_roles (project_id, role_name, role_code, role_category, authority_level, reports_to_role_id, icon, color, is_system_role)
  VALUES (p_project_id, 'Designer', 'designer', 'specialist', 2, v_manager_role_id, 'palette', '#06B6D4', true)
  RETURNING id INTO v_designer_role_id;

  -- Viewer (Level 0)
  INSERT INTO custom_roles (project_id, role_name, role_code, role_category, authority_level, icon, color, is_system_role)
  VALUES (p_project_id, 'Viewer', 'viewer', 'viewer', 0, 'eye', '#6B7280', true)
  RETURNING id INTO v_viewer_role_id;

  -- Now create default permissions for each role
  -- Admin: Full permissions on all entity types
  INSERT INTO role_permissions (role_id, entity_type, can_create, can_read, can_update, can_delete, auto_create_enabled, can_capture_thoughts, can_record_meetings)
  VALUES
    (v_admin_role_id, 'decision', true, true, true, true, true, true, true),
    (v_admin_role_id, 'risk', true, true, true, true, true, true, true),
    (v_admin_role_id, 'task', true, true, true, true, true, true, true);

  -- Project Manager: Full permissions, auto-create enabled
  INSERT INTO role_permissions (role_id, entity_type, can_create, can_read, can_update, can_delete, auto_create_enabled, can_capture_thoughts, can_record_meetings)
  VALUES
    (v_manager_role_id, 'decision', true, true, true, true, true, true, true),
    (v_manager_role_id, 'risk', true, true, true, true, true, true, true),
    (v_manager_role_id, 'task', true, true, true, true, true, true, true);

  -- Tech Lead: Can auto-create risks and tasks, proposals for decisions
  INSERT INTO role_permissions (role_id, entity_type, can_create, can_read, can_update, can_delete, auto_create_enabled, requires_approval, approval_from_role_id, can_capture_thoughts, can_record_meetings)
  VALUES
    (v_tech_lead_role_id, 'decision', true, true, true, false, false, true, v_manager_role_id, true, true),
    (v_tech_lead_role_id, 'risk', true, true, true, false, true, false, NULL, true, true),
    (v_tech_lead_role_id, 'task', true, true, true, true, true, false, NULL, true, true);

  -- Developer: Proposals only, can capture thoughts
  INSERT INTO role_permissions (role_id, entity_type, can_create, can_read, can_update, can_delete, auto_create_enabled, requires_approval, approval_from_role_id, can_capture_thoughts, can_record_meetings)
  VALUES
    (v_developer_role_id, 'decision', true, true, false, false, false, true, v_tech_lead_role_id, true, false),
    (v_developer_role_id, 'risk', true, true, false, false, false, true, v_tech_lead_role_id, true, false),
    (v_developer_role_id, 'task', true, true, true, false, true, false, NULL, true, false);

  -- QA: Can auto-create bug-related risks
  INSERT INTO role_permissions (role_id, entity_type, can_create, can_read, can_update, can_delete, auto_create_enabled, requires_approval, approval_from_role_id, can_capture_thoughts, can_record_meetings)
  VALUES
    (v_qa_role_id, 'decision', true, true, false, false, false, true, v_tech_lead_role_id, true, false),
    (v_qa_role_id, 'risk', true, true, false, false, true, false, NULL, true, false),
    (v_qa_role_id, 'task', true, true, true, false, true, false, NULL, true, false);

  -- Business Analyst: Can create requirement tasks
  INSERT INTO role_permissions (role_id, entity_type, can_create, can_read, can_update, can_delete, auto_create_enabled, requires_approval, approval_from_role_id, can_capture_thoughts, can_record_meetings)
  VALUES
    (v_ba_role_id, 'decision', true, true, false, false, false, true, v_manager_role_id, true, false),
    (v_ba_role_id, 'risk', true, true, false, false, false, true, v_manager_role_id, true, false),
    (v_ba_role_id, 'task', true, true, true, false, true, false, NULL, true, false);

  -- DevOps: Can auto-create infrastructure-related items
  INSERT INTO role_permissions (role_id, entity_type, can_create, can_read, can_update, can_delete, auto_create_enabled, requires_approval, approval_from_role_id, can_capture_thoughts, can_record_meetings)
  VALUES
    (v_devops_role_id, 'decision', true, true, false, false, false, true, v_tech_lead_role_id, true, false),
    (v_devops_role_id, 'risk', true, true, false, false, true, false, NULL, true, false),
    (v_devops_role_id, 'task', true, true, true, false, true, false, NULL, true, false);

  -- Designer: Can create design tasks
  INSERT INTO role_permissions (role_id, entity_type, can_create, can_read, can_update, can_delete, auto_create_enabled, requires_approval, approval_from_role_id, can_capture_thoughts, can_record_meetings)
  VALUES
    (v_designer_role_id, 'decision', true, true, false, false, false, true, v_manager_role_id, true, false),
    (v_designer_role_id, 'risk', true, true, false, false, false, true, v_manager_role_id, true, false),
    (v_designer_role_id, 'task', true, true, true, false, true, false, NULL, true, false);

  -- Viewer: Read-only
  INSERT INTO role_permissions (role_id, entity_type, can_create, can_read, can_update, can_delete, auto_create_enabled, can_capture_thoughts, can_record_meetings)
  VALUES
    (v_viewer_role_id, 'decision', false, true, false, false, false, true, false),
    (v_viewer_role_id, 'risk', false, true, false, false, false, true, false),
    (v_viewer_role_id, 'task', false, true, false, false, false, true, false);

END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 7: TRIGGER TO AUTO-SEED ROLES
-- ============================================

-- Trigger function to auto-create default roles when project is created
CREATE OR REPLACE FUNCTION auto_seed_project_roles()
RETURNS TRIGGER AS $$
BEGIN
  -- Seed default software development roles
  PERFORM seed_default_software_roles(NEW.id);

  -- Create default Sidecar config
  INSERT INTO sidecar_config (project_id, customer_id, enabled)
  VALUES (NEW.id, NEW.customer_id, false);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on projects table
DROP TRIGGER IF EXISTS trigger_auto_seed_roles ON projects;
CREATE TRIGGER trigger_auto_seed_roles
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_seed_project_roles();

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
