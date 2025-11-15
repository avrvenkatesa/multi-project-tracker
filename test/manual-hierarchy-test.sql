-- ============================================================
-- Manual Hierarchy Testing Script
-- ============================================================
-- This script demonstrates and tests the hierarchical issue 
-- management features added in Story 4.2
--
-- Run with: psql $DATABASE_URL -f test/manual-hierarchy-test.sql
-- Or: Copy/paste individual sections into psql prompt
-- ============================================================

-- Clean up any previous test data
DELETE FROM issues WHERE title LIKE 'TEST:%';

-- ============================================================
-- SECTION 1: Create Test Epic and Child Tasks
-- ============================================================
-- This creates a realistic hierarchical structure:
-- - 1 Epic (parent)
-- - 3 Child Tasks with different effort hours
-- ============================================================

\echo ''
\echo '=========================================='
\echo 'SECTION 1: Creating Test Hierarchy'
\echo '=========================================='
\echo ''

-- Step 1.1: Create the Epic (parent issue) and store its ID
-- Expected: Returns the epic's ID
WITH new_epic AS (
  INSERT INTO issues 
    (project_id, title, description, status, priority, 
     parent_issue_id, hierarchy_level, is_epic, created_at, updated_at)
  VALUES 
    (1, 'TEST: Cloud Migration Epic', 
     'Migrate all infrastructure to cloud', 
     'In Progress', 'high', 
     NULL, 0, TRUE, NOW(), NOW())
  RETURNING id, title, is_epic, hierarchy_level
)
SELECT id, title, is_epic, hierarchy_level FROM new_epic
\gset epic_

\echo ''
\echo 'Epic created with ID: ' :epic_id
\echo ''

-- Step 1.2: Create child task 1
-- Expected: Returns task ID with parent_issue_id set
INSERT INTO issues 
  (project_id, title, description, status, priority, 
   parent_issue_id, hierarchy_level, is_epic, estimated_effort_hours, created_at, updated_at)
SELECT 
  1, 'TEST: Setup Cloud Infrastructure', 
  'Configure VPC, networking, and security groups', 
  'In Progress', 'high', 
  :'epic_id'::INTEGER, 1, FALSE, 24, NOW(), NOW()
RETURNING id, title, parent_issue_id, estimated_effort_hours;

-- Step 1.3: Create child task 2
INSERT INTO issues 
  (project_id, title, description, status, priority, 
   parent_issue_id, hierarchy_level, is_epic, estimated_effort_hours, created_at, updated_at)
SELECT 
  1, 'TEST: Database Migration', 
  'Migrate PostgreSQL database to managed service', 
  'To Do', 'high', 
  :'epic_id'::INTEGER, 1, FALSE, 16, NOW(), NOW()
RETURNING id, title, parent_issue_id, estimated_effort_hours;

-- Step 1.4: Create child task 3
INSERT INTO issues 
  (project_id, title, description, status, priority, 
   parent_issue_id, hierarchy_level, is_epic, estimated_effort_hours, created_at, updated_at)
SELECT 
  1, 'TEST: Application Deployment', 
  'Deploy applications to cloud platform', 
  'To Do', 'medium', 
  :'epic_id'::INTEGER, 1, FALSE, 12, NOW(), NOW()
RETURNING id, title, parent_issue_id, estimated_effort_hours;

\echo ''
\echo '✓ Created 1 epic + 3 child tasks'
\echo '  Total effort: 24 + 16 + 12 = 52 hours'
\echo ''

-- ============================================================
-- SECTION 2: Query the issue_hierarchy View
-- ============================================================
-- This demonstrates the recursive view that shows full hierarchy
-- Expected output: 4 rows (1 epic + 3 tasks) with depth and path info
-- ============================================================

\echo ''
\echo '=========================================='
\echo 'SECTION 2: Query issue_hierarchy View'
\echo '=========================================='
\echo ''

SELECT 
  id,
  title,
  depth,
  hierarchy_level,
  path,
  full_path,
  level_description,
  estimated_effort_hours,
  is_epic
FROM issue_hierarchy
WHERE title LIKE 'TEST:%'
ORDER BY path;

\echo ''
\echo 'Expected: 4 rows showing hierarchical structure'
\echo '  - Epic: depth=1, hierarchy_level=0, path=<epic_id>'
\echo '  - Tasks: depth=2, hierarchy_level=1, path=<epic_id>.<task_id>'
\echo ''

-- ============================================================
-- SECTION 3: Call get_issue_children() Function
-- ============================================================
-- This function returns all descendants of a given issue
-- Expected output: 3 child tasks with their details
-- ============================================================

\echo ''
\echo '=========================================='
\echo 'SECTION 3: Get Issue Children'
\echo '=========================================='
\echo ''

SELECT 
  id,
  title,
  depth,
  estimated_effort_hours,
  status,
  assignee,
  path,
  is_leaf
FROM get_issue_children(:'epic_id'::INTEGER)
ORDER BY id;

\echo ''
\echo 'Expected: 3 rows (child tasks)'
\echo '  - All have depth=1 (direct children)'
\echo '  - All have is_leaf=true (no grandchildren)'
\echo '  - Paths show hierarchical structure'
\echo ''

-- ============================================================
-- SECTION 4: Test Rollup Calculation
-- ============================================================
-- This demonstrates the effort rollup function
-- Expected: Total of 52 hours (24+16+12)
-- ============================================================

\echo ''
\echo '=========================================='
\echo 'SECTION 4: Calculate Rollup Effort'
\echo '=========================================='
\echo ''

-- Step 4.1: Get rollup calculation WITHOUT updating parent
SELECT 
  total_estimated_hours,
  total_actual_hours,
  child_count,
  is_leaf_issue
FROM calculate_issue_rollup_effort(:'epic_id'::INTEGER);

\echo ''
\echo 'Expected: total_estimated_hours = 52 (24+16+12)'
\echo '          child_count = 3'
\echo '          is_leaf_issue = false'
\echo ''

-- Step 4.2: Update the epic with rolled-up effort
UPDATE issues 
SET effort_hours = (
  SELECT total_estimated_hours 
  FROM calculate_issue_rollup_effort(:'epic_id'::INTEGER)
)
WHERE id = :'epic_id'::INTEGER
RETURNING id, title, effort_hours;

\echo ''
\echo '✓ Epic effort_hours updated with rollup calculation'
\echo ''

-- ============================================================
-- SECTION 5: Verify Parent-Child Relationships
-- ============================================================
-- This verifies the hierarchy was created correctly
-- ============================================================

\echo ''
\echo '=========================================='
\echo 'SECTION 5: Verify Relationships'
\echo '=========================================='
\echo ''

-- Step 5.1: Show parent issue with summary
SELECT 
  i.id as epic_id,
  i.title as epic_title,
  i.is_epic,
  i.hierarchy_level,
  i.effort_hours as rolled_up_effort,
  COUNT(children.id) as child_count
FROM issues i
LEFT JOIN issues children ON children.parent_issue_id = i.id
WHERE i.id = :'epic_id'::INTEGER
GROUP BY i.id, i.title, i.is_epic, i.hierarchy_level, i.effort_hours;

\echo ''
\echo 'Expected: Shows epic with child_count=3 and rolled_up_effort=52'
\echo ''

-- Step 5.2: Show all children with their parent reference
SELECT 
  id,
  title,
  parent_issue_id,
  hierarchy_level,
  estimated_effort_hours,
  status
FROM issues
WHERE parent_issue_id = :'epic_id'::INTEGER
ORDER BY id;

\echo ''
\echo 'Expected: 3 tasks, all with parent_issue_id matching epic'
\echo ''

-- Step 5.3: Verify hierarchy_level auto-calculation
-- The trigger should have set hierarchy_level based on parent
SELECT 
  title,
  hierarchy_level,
  CASE 
    WHEN parent_issue_id IS NULL THEN 'Root (Epic)'
    ELSE 'Child Task'
  END as level_type
FROM issues
WHERE title LIKE 'TEST:%'
ORDER BY hierarchy_level, id;

\echo ''
\echo 'Expected: Epic has hierarchy_level=0, Tasks have hierarchy_level=1'
\echo ''

-- ============================================================
-- SECTION 6: Test Circular Dependency Prevention
-- ============================================================
-- This tests the trigger that prevents circular references
-- ============================================================

\echo ''
\echo '=========================================='
\echo 'SECTION 6: Test Circular Dependency Prevention'
\echo '=========================================='
\echo ''

-- Step 6.1: Try to make epic its own parent (should FAIL)
\echo 'Test 6.1: Attempting self-reference (should fail)...'
DO $$
BEGIN
  UPDATE issues 
  SET parent_issue_id = id 
  WHERE id = :'epic_id'::INTEGER;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '  ✓ Correctly prevented: %', SQLERRM;
END $$;
-- Expected: ERROR: Issue cannot be its own parent

\echo ''

-- Step 6.2: Try to make the parent a child of its own child (should FAIL)
\echo 'Test 6.2: Attempting circular reference (should fail)...'
DO $$
DECLARE
  v_child_id INTEGER;
  v_epic_id INTEGER := :'epic_id'::INTEGER;
BEGIN
  -- Get a child task ID
  SELECT id INTO v_child_id 
  FROM issues 
  WHERE parent_issue_id = v_epic_id 
  LIMIT 1;
  
  IF v_child_id IS NOT NULL THEN
    -- Try to make the parent a child of its own child
    UPDATE issues 
    SET parent_issue_id = v_child_id 
    WHERE id = v_epic_id;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '  ✓ Correctly prevented: %', SQLERRM;
END $$;
-- Expected: ERROR: Circular hierarchy detected

\echo ''
\echo 'If both tests above showed errors, circular dependency prevention is working!'
\echo ''

-- ============================================================
-- SECTION 7: Test Epic Auto-Flagging
-- ============================================================
-- This tests the trigger that auto-sets is_epic when children are added
-- ============================================================

\echo ''
\echo '=========================================='
\echo 'SECTION 7: Test Epic Auto-Flagging'
\echo '=========================================='
\echo ''

-- Step 7.1: Create a regular task (not an epic)
WITH new_standalone AS (
  INSERT INTO issues 
    (project_id, title, description, status, priority, 
     parent_issue_id, hierarchy_level, is_epic, created_at, updated_at)
  VALUES 
    (1, 'TEST: Standalone Task', 
     'This starts as a regular task', 
     'To Do', 'low', 
     NULL, 0, FALSE, NOW(), NOW())
  RETURNING id, title, is_epic
)
SELECT id, title, is_epic FROM new_standalone
\gset standalone_

\echo ''
\echo 'Created standalone task with is_epic=FALSE (ID: ' :standalone_id ')'
\echo ''

-- Step 7.2: Add a child to it (should auto-set is_epic=TRUE)
INSERT INTO issues 
  (project_id, title, description, status, priority, 
   parent_issue_id, hierarchy_level, is_epic, created_at, updated_at)
SELECT 
  1, 'TEST: Child of Standalone', 
  'Adding this child should make parent an epic', 
  'To Do', 'low', 
  :'standalone_id'::INTEGER, 1, FALSE, NOW(), NOW()
RETURNING id, title, parent_issue_id;

\echo ''
\echo 'Added child task...'
\echo ''

-- Step 7.3: Verify the parent is now an epic
SELECT 
  id,
  title,
  is_epic,
  (SELECT COUNT(*) FROM issues WHERE parent_issue_id = :'standalone_id'::INTEGER) as child_count
FROM issues
WHERE id = :'standalone_id'::INTEGER;

\echo ''
\echo 'Expected: is_epic should now be TRUE (auto-updated by trigger)'
\echo ''

-- ============================================================
-- SECTION 8: Query Full Hierarchy Tree
-- ============================================================
-- Final visualization of the complete hierarchy
-- ============================================================

\echo ''
\echo '=========================================='
\echo 'SECTION 8: Complete Hierarchy Visualization'
\echo '=========================================='
\echo ''

SELECT 
  REPEAT('  ', depth - 1) || '├─ ' || title as hierarchy_tree,
  id,
  depth,
  hierarchy_level,
  estimated_effort_hours as effort,
  is_epic,
  CASE 
    WHEN is_epic THEN '📦 Epic'
    ELSE '✓ Task'
  END as type
FROM issue_hierarchy
WHERE title LIKE 'TEST:%'
ORDER BY path;

\echo ''
\echo 'Visual hierarchy showing all test issues with indentation'
\echo ''

-- ============================================================
-- CLEANUP (Optional)
-- ============================================================
-- Uncomment to remove all test data
-- ============================================================

\echo ''
\echo '=========================================='
\echo 'Cleanup'
\echo '=========================================='
\echo ''
\echo 'To remove all test data, run:'
\echo '  DELETE FROM issues WHERE title LIKE ''TEST:%'';'
\echo ''
\echo 'Test complete!'
\echo ''

-- Uncomment the line below to automatically clean up test data:
-- DELETE FROM issues WHERE title LIKE 'TEST:%';
