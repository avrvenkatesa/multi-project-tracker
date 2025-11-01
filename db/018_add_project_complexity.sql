-- Migration 018: Add Project Complexity Configuration
-- Adds complexity level and file upload limits to projects

-- Add complexity level and max file uploads columns
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS complexity_level VARCHAR(20) DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS max_file_uploads INTEGER DEFAULT 5;

-- Add constraint for valid complexity levels
ALTER TABLE projects 
ADD CONSTRAINT IF NOT EXISTS projects_complexity_level_check 
CHECK (complexity_level IN ('standard', 'complex', 'enterprise'));

-- Create function to set max_file_uploads based on complexity_level
CREATE OR REPLACE FUNCTION set_max_files_from_complexity()
RETURNS TRIGGER AS $$
BEGIN
  -- Set max_file_uploads based on complexity_level
  CASE NEW.complexity_level
    WHEN 'standard' THEN
      NEW.max_file_uploads := 5;
    WHEN 'complex' THEN
      NEW.max_file_uploads := 10;
    WHEN 'enterprise' THEN
      NEW.max_file_uploads := 20;
    ELSE
      NEW.max_file_uploads := 5; -- Default to standard
  END CASE;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set max_file_uploads
-- Fires on ANY update to projects table to ensure max_file_uploads is always in sync
DROP TRIGGER IF EXISTS trigger_set_max_files_from_complexity ON projects;

CREATE TRIGGER trigger_set_max_files_from_complexity
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION set_max_files_from_complexity();

-- Update existing projects to have proper max_file_uploads
UPDATE projects 
SET max_file_uploads = CASE complexity_level
  WHEN 'standard' THEN 5
  WHEN 'complex' THEN 10
  WHEN 'enterprise' THEN 20
  ELSE 5
END
WHERE max_file_uploads IS NULL OR complexity_level IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN projects.complexity_level IS 'Project complexity tier: standard (5 files), complex (10 files), enterprise (20 files)';
COMMENT ON COLUMN projects.max_file_uploads IS 'Maximum number of file uploads allowed (set automatically based on complexity_level)';
