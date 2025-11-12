-- Migration 020: Add Issue Hierarchy Support
-- Adds parent-child relationships, epic tracking, and hierarchical rollup calculations

BEGIN;

-- =====================================================
-- 1. ADD COLUMNS TO ISSUES TABLE
-- =====================================================

-- Add hierarchical structure columns
ALTER TABLE issues 
  ADD COLUMN IF NOT EXISTS parent_issue_id INTEGER 
    REFERENCES issues(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER DEFAULT 0 
    CHECK (hierarchy_level >= 0 AND hierarchy_level <= 10),
  ADD COLUMN IF NOT EXISTS is_epic BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Add comments for new columns
COMMENT ON COLUMN issues.parent_issue_id IS 'Parent issue ID for hierarchical relationships (NULL for top-level items)';
COMMENT ON COLUMN issues.hierarchy_level IS 'Depth in the hierarchy tree (0=top level, max 10 levels)';
COMMENT ON COLUMN issues.is_epic IS 'Auto-set to TRUE when issue has children; marks parent/container issues';
COMMENT ON COLUMN issues.sort_order IS 'Manual ordering within siblings for display purposes';

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for finding children by parent
CREATE INDEX IF NOT EXISTS idx_issues_parent_id 
  ON issues(parent_issue_id) 
  WHERE parent_issue_id IS NOT NULL;

-- Index for querying by hierarchy level
CREATE INDEX IF NOT EXISTS idx_issues_hierarchy_level 
  ON issues(hierarchy_level);

-- Composite index for parent + project queries
CREATE INDEX IF NOT EXISTS idx_issues_parent_project 
  ON issues(parent_issue_id, project_id) 
  WHERE parent_issue_id IS NOT NULL;

-- Index for epic queries
CREATE INDEX IF NOT EXISTS idx_issues_is_epic 
  ON issues(is_epic) 
  WHERE is_epic = TRUE;

-- Index for sort order within parent
CREATE INDEX IF NOT EXISTS idx_issues_parent_sort 
  ON issues(parent_issue_id, sort_order);

-- =====================================================
-- 3. CREATE RECURSIVE HIERARCHY VIEW
-- =====================================================

-- Drop existing view if it exists
DROP VIEW IF EXISTS issue_hierarchy CASCADE;

-- Create comprehensive recursive view
CREATE OR REPLACE VIEW issue_hierarchy AS
WITH RECURSIVE hierarchy_tree AS (
  -- Base case: Root issues (no parent)
  SELECT 
    i.*,
    1 AS depth,
    i.id::TEXT AS path,
    i.title AS full_path,
    ARRAY[]::INTEGER[] AS ancestor_ids
  FROM issues i
  WHERE i.parent_issue_id IS NULL
  
  UNION ALL
  
  -- Recursive case: Child issues
  SELECT 
    child.*,
    parent.depth + 1 AS depth,
    parent.path || '.' || child.id::TEXT AS path,
    parent.full_path || ' → ' || child.title AS full_path,
    parent.ancestor_ids || parent.id AS ancestor_ids
  FROM issues child
  INNER JOIN hierarchy_tree parent ON child.parent_issue_id = parent.id
  WHERE parent.depth < 10  -- Prevent infinite recursion
)
SELECT 
  *,
  CASE 
    WHEN depth = 1 THEN 'Root'
    WHEN depth = 2 THEN 'Epic/Parent'
    WHEN depth = 3 THEN 'Task'
    ELSE 'Subtask (Level ' || depth || ')'
  END AS level_description
FROM hierarchy_tree
ORDER BY path;

COMMENT ON VIEW issue_hierarchy IS 'Recursive view showing complete issue hierarchy with depth, path, and ancestor information';

-- =====================================================
-- 4. FUNCTION: GET ISSUE CHILDREN
-- =====================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_issue_children(INTEGER);

-- Create function to get all descendants with depth and effort
CREATE OR REPLACE FUNCTION get_issue_children(issue_id_param INTEGER)
RETURNS TABLE (
  id INTEGER,
  title TEXT,
  parent_issue_id INTEGER,
  depth INTEGER,
  estimated_effort_hours NUMERIC,
  actual_effort_hours NUMERIC,
  status TEXT,
  assignee TEXT,
  path TEXT,
  is_leaf BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE children AS (
    -- Direct children
    SELECT 
      i.id,
      i.title,
      i.parent_issue_id,
      1 AS depth,
      i.estimated_effort_hours,
      i.actual_effort_hours,
      i.status,
      i.assignee,
      i.id::TEXT AS path,
      NOT EXISTS (SELECT 1 FROM issues WHERE parent_issue_id = i.id) AS is_leaf
    FROM issues i
    WHERE i.parent_issue_id = issue_id_param
    
    UNION ALL
    
    -- Recursive descendants
    SELECT 
      i.id,
      i.title,
      i.parent_issue_id,
      c.depth + 1,
      i.estimated_effort_hours,
      i.actual_effort_hours,
      i.status,
      i.assignee,
      c.path || '.' || i.id::TEXT,
      NOT EXISTS (SELECT 1 FROM issues WHERE parent_issue_id = i.id) AS is_leaf
    FROM issues i
    INNER JOIN children c ON i.parent_issue_id = c.id
    WHERE c.depth < 10
  )
  SELECT * FROM children
  ORDER BY path;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_issue_children(INTEGER) IS 'Returns all descendant issues with their depth, effort hours, and tree path';

-- =====================================================
-- 5. FUNCTION: CALCULATE ROLLUP EFFORT
-- =====================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS calculate_issue_rollup_effort(INTEGER);

-- Create function to calculate effort rollup
CREATE OR REPLACE FUNCTION calculate_issue_rollup_effort(issue_id_param INTEGER)
RETURNS TABLE (
  total_estimated_hours NUMERIC,
  total_actual_hours NUMERIC,
  child_count INTEGER,
  is_leaf_issue BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH children_effort AS (
    SELECT 
      COALESCE(SUM(c.estimated_effort_hours), 0) AS child_estimated,
      COALESCE(SUM(c.actual_effort_hours), 0) AS child_actual,
      COUNT(c.id) AS child_cnt
    FROM get_issue_children(issue_id_param) c
  ),
  issue_effort AS (
    SELECT 
      COALESCE(i.estimated_effort_hours, 0) AS own_estimated,
      COALESCE(i.actual_effort_hours, 0) AS own_actual
    FROM issues i
    WHERE i.id = issue_id_param
  )
  SELECT 
    CASE 
      WHEN ce.child_cnt > 0 THEN ce.child_estimated 
      ELSE ie.own_estimated 
    END AS total_estimated_hours,
    CASE 
      WHEN ce.child_cnt > 0 THEN ce.child_actual 
      ELSE ie.own_actual 
    END AS total_actual_hours,
    ce.child_cnt::INTEGER,
    (ce.child_cnt = 0) AS is_leaf_issue
  FROM children_effort ce, issue_effort ie;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_issue_rollup_effort(INTEGER) IS 'Calculates total effort by summing descendants (if any) or using own effort (if leaf)';

-- =====================================================
-- 6. TRIGGER: PREVENT CIRCULAR HIERARCHIES
-- =====================================================

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS trg_prevent_circular_issue_hierarchy ON issues;
DROP FUNCTION IF EXISTS prevent_circular_issue_hierarchy();

-- Create trigger function
CREATE OR REPLACE FUNCTION prevent_circular_issue_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
  ancestor_id INTEGER;
  check_count INTEGER;
BEGIN
  -- Prevent self-reference
  IF NEW.parent_issue_id = NEW.id THEN
    RAISE EXCEPTION 'Issue cannot be its own parent (circular reference detected)';
  END IF;
  
  -- Skip check if no parent
  IF NEW.parent_issue_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Check if parent exists
  SELECT COUNT(*) INTO check_count
  FROM issues
  WHERE id = NEW.parent_issue_id;
  
  IF check_count = 0 THEN
    RAISE EXCEPTION 'Parent issue with ID % does not exist', NEW.parent_issue_id;
  END IF;
  
  -- Check for circular reference by walking up the ancestor chain
  ancestor_id := NEW.parent_issue_id;
  FOR i IN 1..10 LOOP  -- Max 10 levels to prevent infinite loops
    -- If we find ourselves in the ancestor chain, it's circular
    IF ancestor_id = NEW.id THEN
      RAISE EXCEPTION 'Circular hierarchy detected: Issue % would become its own ancestor', NEW.id;
    END IF;
    
    -- Get next parent
    SELECT parent_issue_id INTO ancestor_id
    FROM issues
    WHERE id = ancestor_id;
    
    -- If no more parents, we're done
    EXIT WHEN ancestor_id IS NULL;
  END LOOP;
  
  -- Update hierarchy level based on parent
  SELECT COALESCE(hierarchy_level, 0) + 1 INTO NEW.hierarchy_level
  FROM issues
  WHERE id = NEW.parent_issue_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trg_prevent_circular_issue_hierarchy
  BEFORE INSERT OR UPDATE OF parent_issue_id
  ON issues
  FOR EACH ROW
  EXECUTE FUNCTION prevent_circular_issue_hierarchy();

COMMENT ON FUNCTION prevent_circular_issue_hierarchy() IS 'Prevents self-reference and circular dependencies in issue hierarchy';

-- =====================================================
-- 7. TRIGGER: AUTO-UPDATE IS_EPIC FLAG
-- =====================================================

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS trg_update_is_epic_flag ON issues;
DROP FUNCTION IF EXISTS update_is_epic_flag();

-- Create trigger function to auto-set is_epic
CREATE OR REPLACE FUNCTION update_is_epic_flag()
RETURNS TRIGGER AS $$
BEGIN
  -- When a child is added, mark parent as epic
  IF NEW.parent_issue_id IS NOT NULL THEN
    UPDATE issues
    SET is_epic = TRUE
    WHERE id = NEW.parent_issue_id AND is_epic = FALSE;
  END IF;
  
  -- When last child is removed, unmark epic
  IF TG_OP = 'UPDATE' AND OLD.parent_issue_id IS NOT NULL AND NEW.parent_issue_id IS NULL THEN
    -- Check if old parent still has other children
    IF NOT EXISTS (SELECT 1 FROM issues WHERE parent_issue_id = OLD.parent_issue_id AND id != NEW.id) THEN
      UPDATE issues
      SET is_epic = FALSE
      WHERE id = OLD.parent_issue_id;
    END IF;
  END IF;
  
  -- When child is deleted
  IF TG_OP = 'DELETE' AND OLD.parent_issue_id IS NOT NULL THEN
    -- Check if parent still has other children
    IF NOT EXISTS (SELECT 1 FROM issues WHERE parent_issue_id = OLD.parent_issue_id AND id != OLD.id) THEN
      UPDATE issues
      SET is_epic = FALSE
      WHERE id = OLD.parent_issue_id;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT/UPDATE
CREATE TRIGGER trg_update_is_epic_flag
  AFTER INSERT OR UPDATE OF parent_issue_id OR DELETE
  ON issues
  FOR EACH ROW
  EXECUTE FUNCTION update_is_epic_flag();

COMMENT ON FUNCTION update_is_epic_flag() IS 'Automatically sets/unsets is_epic flag when children are added/removed';

COMMIT;

-- =====================================================
-- 8. TESTING COMMANDS (COMMENTED OUT)
-- =====================================================

/*
-- TEST 1: Create an epic with child tasks
BEGIN;

-- Create epic
INSERT INTO issues (title, project_id, description, status, is_epic)
VALUES ('Cloud Migration Epic', 1, 'Migrate entire system to cloud infrastructure', 'In Progress', TRUE)
RETURNING id;  -- Let's say this returns ID 100

-- Create child tasks
INSERT INTO issues (title, project_id, parent_issue_id, status, estimated_effort_hours)
VALUES 
  ('Setup AWS Infrastructure', 1, 100, 'In Progress', 40),
  ('Migrate Database', 1, 100, 'To Do', 80),
  ('Deploy Application', 1, 100, 'To Do', 60);

-- Create subtasks under a task
INSERT INTO issues (title, project_id, parent_issue_id, status, estimated_effort_hours)
VALUES 
  ('Configure VPC', 1, 101, 'In Progress', 15),
  ('Setup RDS Instance', 1, 101, 'To Do', 25);

COMMIT;

-- TEST 2: Query the hierarchy view
SELECT 
  id,
  title,
  depth,
  path,
  full_path,
  level_description,
  estimated_effort_hours
FROM issue_hierarchy
WHERE path LIKE '100%'
ORDER BY path;

-- TEST 3: Get all children of epic
SELECT * FROM get_issue_children(100);

-- TEST 4: Calculate rollup effort for epic
SELECT * FROM calculate_issue_rollup_effort(100);

-- Expected: Should sum all child efforts (40 + 80 + 60 + 15 + 25 = 220 hours)

-- TEST 5: Test circular dependency prevention (should fail)
BEGIN;
  UPDATE issues SET parent_issue_id = 105 WHERE id = 100;
  -- This should FAIL with "Circular hierarchy detected"
ROLLBACK;

-- TEST 6: Test self-reference prevention (should fail)
BEGIN;
  UPDATE issues SET parent_issue_id = 100 WHERE id = 100;
  -- This should FAIL with "Issue cannot be its own parent"
ROLLBACK;

-- TEST 7: Verify is_epic flag auto-update
SELECT id, title, is_epic FROM issues WHERE id = 100;
-- Should show is_epic = TRUE

-- Remove all children
DELETE FROM issues WHERE parent_issue_id = 100;

-- Check epic flag again
SELECT id, title, is_epic FROM issues WHERE id = 100;
-- Should show is_epic = FALSE (auto-updated)

-- TEST 8: Test hierarchy levels
SELECT 
  id,
  title,
  hierarchy_level,
  parent_issue_id
FROM issues
WHERE id IN (100, 101, 102, 103, 104, 105)
ORDER BY path;
-- Should show: Epic=0, Tasks=1, Subtasks=2

-- TEST 9: Performance test with indexes
EXPLAIN ANALYZE
SELECT * FROM issues
WHERE parent_issue_id = 100
ORDER BY sort_order;
-- Should use idx_issues_parent_sort index

-- TEST 10: Full hierarchy with rollup calculations
WITH epic_summary AS (
  SELECT 
    i.id,
    i.title,
    i.is_epic,
    r.total_estimated_hours,
    r.total_actual_hours,
    r.child_count
  FROM issues i
  CROSS JOIN LATERAL calculate_issue_rollup_effort(i.id) r
  WHERE i.is_epic = TRUE
)
SELECT * FROM epic_summary
ORDER BY id;

*/
