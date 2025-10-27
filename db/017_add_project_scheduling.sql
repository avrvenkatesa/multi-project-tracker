-- Migration 017: Add Project Scheduling System
-- Phase 1: Core scheduling tables with versioning support

-- Main schedule table with versioning
CREATE TABLE IF NOT EXISTS project_schedules (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  parent_version_id INTEGER REFERENCES project_schedules(id) ON DELETE SET NULL,
  
  -- Schedule configuration
  start_date DATE NOT NULL,
  end_date DATE,
  hours_per_day DECIMAL(4,2) NOT NULL DEFAULT 8.00,
  include_weekends BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Metadata (calculated)
  total_tasks INTEGER NOT NULL DEFAULT 0,
  total_hours DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  critical_path_tasks INTEGER NOT NULL DEFAULT 0,
  critical_path_hours DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  risks_count INTEGER NOT NULL DEFAULT 0,
  
  -- Version management
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  
  UNIQUE(project_id, name, version)
);

-- Items included in each schedule
CREATE TABLE IF NOT EXISTS schedule_items (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES project_schedules(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('issue', 'action-item')),
  item_id INTEGER NOT NULL,
  included BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Calculated schedule for each task
CREATE TABLE IF NOT EXISTS task_schedules (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES project_schedules(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('issue', 'action-item')),
  item_id INTEGER NOT NULL,
  
  -- Planning data
  assignee VARCHAR(200),
  estimated_hours DECIMAL(6,2),
  estimate_source VARCHAR(50),  -- 'manual', 'ai', 'hybrid_selection'
  
  -- Calculated schedule
  scheduled_start DATE NOT NULL,
  scheduled_end DATE NOT NULL,
  duration_days INTEGER NOT NULL,
  due_date DATE,
  
  -- Analysis flags
  is_critical_path BOOLEAN NOT NULL DEFAULT FALSE,
  has_risk BOOLEAN NOT NULL DEFAULT FALSE,
  risk_reason TEXT,
  days_late INTEGER,
  
  -- Dependencies (denormalized for version stability)
  dependencies JSONB,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Track changes between versions
CREATE TABLE IF NOT EXISTS schedule_changes (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES project_schedules(id) ON DELETE CASCADE,
  from_version INTEGER,
  to_version INTEGER NOT NULL,
  change_type VARCHAR(50) NOT NULL,  -- 'task_added', 'task_removed', 'date_changed', 'estimate_changed'
  item_type VARCHAR(20) CHECK (item_type IN ('issue', 'action-item')),
  item_id INTEGER,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_schedules_project ON project_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_project_schedules_active ON project_schedules(project_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_project_schedules_published ON project_schedules(project_id, is_published) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule ON schedule_items(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_items_item ON schedule_items(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_task_schedules_schedule ON task_schedules(schedule_id);
CREATE INDEX IF NOT EXISTS idx_task_schedules_item ON task_schedules(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_task_schedules_critical ON task_schedules(schedule_id, is_critical_path) WHERE is_critical_path = TRUE;
CREATE INDEX IF NOT EXISTS idx_schedule_changes_schedule ON schedule_changes(schedule_id);

-- Comments for documentation
COMMENT ON TABLE project_schedules IS 'Stores project schedules with versioning support';
COMMENT ON TABLE schedule_items IS 'Tracks which issues/action items are included in each schedule';
COMMENT ON TABLE task_schedules IS 'Contains calculated schedule dates and analysis for each task';
COMMENT ON TABLE schedule_changes IS 'Tracks changes between schedule versions for comparison';

COMMENT ON COLUMN project_schedules.parent_version_id IS 'References the previous version of this schedule';
COMMENT ON COLUMN project_schedules.is_active IS 'Marks the current working version';
COMMENT ON COLUMN project_schedules.is_published IS 'Marks finalized/approved versions';
COMMENT ON COLUMN task_schedules.dependencies IS 'Denormalized dependency data for version stability';
