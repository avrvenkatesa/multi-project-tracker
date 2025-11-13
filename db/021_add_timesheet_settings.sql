-- Migration 021: Add Timesheet Entry Settings
-- Adds project-level timesheet requirement toggle, item-level overrides, and audit trail

-- ============================================================================
-- PART 1: Project-Level Timesheet Setting
-- ============================================================================

-- Add timesheet entry requirement toggle to projects
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS timesheet_entry_required BOOLEAN DEFAULT FALSE;

-- Comment for documentation
COMMENT ON COLUMN projects.timesheet_entry_required IS 
  'When enabled, team members must log time when changing status to Done. Can be overridden at item level.';

-- Update existing projects to default (maintains backward compatibility)
UPDATE projects 
SET timesheet_entry_required = FALSE
WHERE timesheet_entry_required IS NULL;

-- ============================================================================
-- PART 2: Item-Level Override Capability
-- ============================================================================

-- Add override field to issues table
ALTER TABLE issues
ADD COLUMN IF NOT EXISTS timesheet_required_override BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN issues.timesheet_required_override IS 
  'Override project timesheet requirement. NULL=inherit from project, TRUE=always require, FALSE=never require';

-- Add override field to action_items table
ALTER TABLE action_items
ADD COLUMN IF NOT EXISTS timesheet_required_override BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN action_items.timesheet_required_override IS 
  'Override project timesheet requirement. NULL=inherit from project, TRUE=always require, FALSE=never require';

-- ============================================================================
-- PART 3: Audit Trail for Project Settings Changes
-- ============================================================================

-- Create project settings audit table
CREATE TABLE IF NOT EXISTS project_settings_audit (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  setting_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  change_reason TEXT
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_project_settings_audit_project_id 
  ON project_settings_audit(project_id);

CREATE INDEX IF NOT EXISTS idx_project_settings_audit_changed_at 
  ON project_settings_audit(changed_at DESC);

-- Comment for documentation
COMMENT ON TABLE project_settings_audit IS 
  'Tracks changes to project settings for compliance and audit purposes';

-- ============================================================================
-- PART 4: Helper Function to Determine Timesheet Requirement
-- ============================================================================

-- Function to determine if timesheet is required for a specific item
-- Considers both project-level setting and item-level override
CREATE OR REPLACE FUNCTION is_timesheet_required(
  p_project_id INTEGER,
  p_item_override BOOLEAN
) RETURNS BOOLEAN AS $$
DECLARE
  v_project_setting BOOLEAN;
BEGIN
  -- Get project-level setting
  SELECT timesheet_entry_required 
  INTO v_project_setting
  FROM projects
  WHERE id = p_project_id;
  
  -- If project not found, default to false
  IF v_project_setting IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- If item has override, use it; otherwise use project setting
  RETURN COALESCE(p_item_override, v_project_setting);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION is_timesheet_required IS 
  'Determines if timesheet entry is required for an item, considering project setting and item override';

-- ============================================================================
-- PART 5: Trigger to Auto-Log Setting Changes
-- ============================================================================

-- Function to log project settings changes
CREATE OR REPLACE FUNCTION log_project_setting_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Log timesheet_entry_required changes
  IF OLD.timesheet_entry_required IS DISTINCT FROM NEW.timesheet_entry_required THEN
    INSERT INTO project_settings_audit (
      project_id,
      setting_name,
      old_value,
      new_value,
      changed_by
    ) VALUES (
      NEW.id,
      'timesheet_entry_required',
      OLD.timesheet_entry_required::TEXT,
      NEW.timesheet_entry_required::TEXT,
      NEW.updated_by
    );
  END IF;
  
  -- Log checklist_completion_enabled changes (existing setting)
  IF OLD.checklist_completion_enabled IS DISTINCT FROM NEW.checklist_completion_enabled THEN
    INSERT INTO project_settings_audit (
      project_id,
      setting_name,
      old_value,
      new_value,
      changed_by
    ) VALUES (
      NEW.id,
      'checklist_completion_enabled',
      OLD.checklist_completion_enabled::TEXT,
      NEW.checklist_completion_enabled::TEXT,
      NEW.updated_by
    );
  END IF;
  
  -- Log complexity_level changes (existing setting)
  IF OLD.complexity_level IS DISTINCT FROM NEW.complexity_level THEN
    INSERT INTO project_settings_audit (
      project_id,
      setting_name,
      old_value,
      new_value,
      changed_by
    ) VALUES (
      NEW.id,
      'complexity_level',
      OLD.complexity_level::TEXT,
      NEW.complexity_level::TEXT,
      NEW.updated_by
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS trigger_log_project_settings ON projects;

CREATE TRIGGER trigger_log_project_settings
  AFTER UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION log_project_setting_change();

COMMENT ON TRIGGER trigger_log_project_settings ON projects IS 
  'Automatically logs project settings changes to audit table';

-- ============================================================================
-- PART 6: Create View for Timesheet Requirement Analysis
-- ============================================================================

-- View to show which items require timesheet entries
CREATE OR REPLACE VIEW v_timesheet_requirements AS
SELECT 
  'issue' as item_type,
  i.id as item_id,
  i.project_id,
  i.title,
  i.status,
  i.assignee,
  p.timesheet_entry_required as project_requires_timesheet,
  i.timesheet_required_override as item_override,
  is_timesheet_required(i.project_id, i.timesheet_required_override) as requires_timesheet,
  i.actual_effort_hours,
  i.time_log_count,
  CASE 
    WHEN i.timesheet_required_override = TRUE THEN 'Always Required (Item Override)'
    WHEN i.timesheet_required_override = FALSE THEN 'Never Required (Item Override)'
    WHEN p.timesheet_entry_required = TRUE THEN 'Required (Project Setting)'
    ELSE 'Optional (Project Setting)'
  END as requirement_source
FROM issues i
JOIN projects p ON i.project_id = p.id

UNION ALL

SELECT 
  'action-item' as item_type,
  a.id as item_id,
  a.project_id,
  a.title,
  a.status,
  a.assignee,
  p.timesheet_entry_required as project_requires_timesheet,
  a.timesheet_required_override as item_override,
  is_timesheet_required(a.project_id, a.timesheet_required_override) as requires_timesheet,
  a.actual_effort_hours,
  a.time_log_count,
  CASE 
    WHEN a.timesheet_required_override = TRUE THEN 'Always Required (Item Override)'
    WHEN a.timesheet_required_override = FALSE THEN 'Never Required (Item Override)'
    WHEN p.timesheet_entry_required = TRUE THEN 'Required (Project Setting)'
    ELSE 'Optional (Project Setting)'
  END as requirement_source
FROM action_items a
JOIN projects p ON a.project_id = p.id;

COMMENT ON VIEW v_timesheet_requirements IS 
  'Shows timesheet requirement status for all items, considering project settings and item overrides';

-- ============================================================================
-- Summary
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 021 completed successfully';
  RAISE NOTICE '   - Added timesheet_entry_required to projects (default: FALSE)';
  RAISE NOTICE '   - Added timesheet_required_override to issues and action_items';
  RAISE NOTICE '   - Created project_settings_audit table';
  RAISE NOTICE '   - Created is_timesheet_required() helper function';
  RAISE NOTICE '   - Created audit logging trigger';
  RAISE NOTICE '   - Created v_timesheet_requirements view';
END $$;
