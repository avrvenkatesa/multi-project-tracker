-- Add archive and update tracking columns to projects table

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS archived_by INTEGER REFERENCES users(id);

-- Add index for faster queries on archived projects
CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(archived);

-- Add updated_by column to track who last edited
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id);

-- Add comments for documentation
COMMENT ON COLUMN projects.archived IS 'Indicates if project is archived (soft delete)';
COMMENT ON COLUMN projects.archived_at IS 'Timestamp when project was archived';
COMMENT ON COLUMN projects.archived_by IS 'User ID who archived the project';
COMMENT ON COLUMN projects.updated_by IS 'User ID who last updated the project';
