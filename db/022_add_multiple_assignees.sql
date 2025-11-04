-- Migration: Add multiple assignees with effort percentage allocation
-- Date: 2025-11-04
-- Description: Creates issue_assignees and action_item_assignees tables for managing multiple assignees per task with percentage-based effort distribution

-- Create issue_assignees table
CREATE TABLE IF NOT EXISTS issue_assignees (
  id SERIAL PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  effort_percentage INTEGER DEFAULT 100 CHECK (effort_percentage >= 0 AND effort_percentage <= 100),
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by INTEGER REFERENCES users(id),
  UNIQUE(issue_id, user_id)
);

-- Create action_item_assignees table
CREATE TABLE IF NOT EXISTS action_item_assignees (
  id SERIAL PRIMARY KEY,
  action_item_id INTEGER NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  effort_percentage INTEGER DEFAULT 100 CHECK (effort_percentage >= 0 AND effort_percentage <= 100),
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by INTEGER REFERENCES users(id),
  UNIQUE(action_item_id, user_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_issue_assignees_issue_id ON issue_assignees(issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_assignees_user_id ON issue_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_issue_assignees_primary ON issue_assignees(issue_id, is_primary) WHERE is_primary = TRUE;

CREATE INDEX IF NOT EXISTS idx_action_item_assignees_action_item_id ON action_item_assignees(action_item_id);
CREATE INDEX IF NOT EXISTS idx_action_item_assignees_user_id ON action_item_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_action_item_assignees_primary ON action_item_assignees(action_item_id, is_primary) WHERE is_primary = TRUE;

-- Migrate existing single assignees to new tables as primary assignees
-- For issues: Convert existing assignee to primary assignee with 100% effort
INSERT INTO issue_assignees (issue_id, user_id, is_primary, effort_percentage, assigned_at, assigned_by)
SELECT 
  i.id,
  u.id,
  TRUE,
  100,
  i.created_at,
  NULL
FROM issues i
JOIN users u ON i.assignee = u.username
WHERE i.assignee IS NOT NULL
  AND i.assignee != ''
  AND NOT EXISTS (
    SELECT 1 FROM issue_assignees ia WHERE ia.issue_id = i.id AND ia.user_id = u.id
  );

-- For action items: Convert existing assignee to primary assignee with 100% effort
INSERT INTO action_item_assignees (action_item_id, user_id, is_primary, effort_percentage, assigned_at, assigned_by)
SELECT 
  a.id,
  u.id,
  TRUE,
  100,
  a.created_at,
  NULL
FROM action_items a
JOIN users u ON a.assignee = u.username
WHERE a.assignee IS NOT NULL
  AND a.assignee != ''
  AND NOT EXISTS (
    SELECT 1 FROM action_item_assignees aia WHERE aia.action_item_id = a.id AND aia.user_id = u.id
  );

-- Add comment explaining the migration
COMMENT ON TABLE issue_assignees IS 'Stores multiple assignees for issues with effort percentage allocation. Replaces single assignee field.';
COMMENT ON TABLE action_item_assignees IS 'Stores multiple assignees for action items with effort percentage allocation. Replaces single assignee field.';

-- Note: We keep the existing assignee columns for backward compatibility during transition
-- They can be removed in a future migration after full UI migration is complete
