-- Migration: Checklist Item Dependencies - Functions and Triggers
-- Phase 3b Feature 5: Circular dependency prevention and dependency status view

-- 1. Create function to check for circular dependencies
CREATE OR REPLACE FUNCTION check_circular_dependency(
  new_item_id INTEGER,
  new_depends_on_id INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  visited INTEGER[];
  current_id INTEGER;
  dependency_id INTEGER;
BEGIN
  -- Start from the item we want to depend on
  current_id := new_depends_on_id;
  visited := ARRAY[new_item_id];
  
  -- Follow the dependency chain
  LOOP
    -- Check if current item depends on anything
    SELECT depends_on_item_id INTO dependency_id
    FROM checklist_item_dependencies
    WHERE item_id = current_id
    LIMIT 1;
    
    -- If no dependency, we're at the end of the chain - no circular dependency
    IF dependency_id IS NULL THEN
      RETURN TRUE;
    END IF;
    
    -- Check if we've seen this item before (circular dependency detected)
    IF dependency_id = ANY(visited) THEN
      RETURN FALSE;
    END IF;
    
    -- Add to visited and continue
    visited := array_append(visited, dependency_id);
    current_id := dependency_id;
    
    -- Safety limit to prevent infinite loops
    IF array_length(visited, 1) > 100 THEN
      RETURN FALSE;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 2. Create trigger function to prevent circular dependencies and self-dependencies
CREATE OR REPLACE FUNCTION prevent_circular_dependency()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent self-dependency
  IF NEW.item_id = NEW.depends_on_item_id THEN
    RAISE EXCEPTION 'Self-dependency not allowed: An item cannot depend on itself';
  END IF;
  
  -- Prevent circular dependencies
  IF NOT check_circular_dependency(NEW.item_id, NEW.depends_on_item_id) THEN
    RAISE EXCEPTION 'Circular dependency detected: Adding this dependency would create a cycle';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Drop existing trigger if it exists and create new one
DROP TRIGGER IF EXISTS trigger_prevent_circular_dependency 
  ON checklist_item_dependencies;

CREATE TRIGGER trigger_prevent_circular_dependency
  BEFORE INSERT ON checklist_item_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION prevent_circular_dependency();

-- 4. Create view for item dependency status
CREATE OR REPLACE VIEW checklist_item_dependency_status AS
SELECT 
  cr.id AS item_id,
  cr.checklist_id,
  cr.template_item_id,
  cr.is_completed,
  
  -- Count total dependencies
  COUNT(cid.depends_on_item_id) AS total_dependencies,
  
  -- Count completed dependencies
  COUNT(cid.depends_on_item_id) FILTER (
    WHERE dep.is_completed = TRUE
  ) AS completed_dependencies,
  
  -- Count pending dependencies
  COUNT(cid.depends_on_item_id) FILTER (
    WHERE dep.is_completed = FALSE OR dep.is_completed IS NULL
  ) AS pending_dependencies,
  
  -- Is blocked? (has dependencies that aren't complete)
  CASE 
    WHEN COUNT(cid.depends_on_item_id) = 0 THEN FALSE
    WHEN COUNT(cid.depends_on_item_id) FILTER (WHERE COALESCE(dep.is_completed, FALSE) = FALSE) > 0 THEN TRUE
    ELSE FALSE
  END AS is_blocked
  
FROM checklist_responses cr
LEFT JOIN checklist_item_dependencies cid ON cr.id = cid.item_id
LEFT JOIN checklist_responses dep ON cid.depends_on_item_id = dep.id
GROUP BY cr.id, cr.checklist_id, cr.template_item_id, cr.is_completed;

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_dependencies_item 
  ON checklist_item_dependencies(item_id);

CREATE INDEX IF NOT EXISTS idx_dependencies_depends_on 
  ON checklist_item_dependencies(depends_on_item_id);

-- 6. Add unique constraint to prevent duplicate dependencies
CREATE UNIQUE INDEX IF NOT EXISTS idx_dependencies_unique_pair
  ON checklist_item_dependencies(item_id, depends_on_item_id);

-- Migration complete
COMMENT ON TABLE checklist_item_dependencies IS 
  'Defines dependencies between checklist items - an item cannot be completed until its dependencies are met';

COMMENT ON COLUMN checklist_item_dependencies.item_id IS 
  'The checklist item that has the dependency';

COMMENT ON COLUMN checklist_item_dependencies.depends_on_item_id IS 
  'The checklist item that must be completed first';

COMMENT ON FUNCTION check_circular_dependency(INTEGER, INTEGER) IS 
  'Checks if adding a dependency would create a circular dependency chain';

COMMENT ON FUNCTION prevent_circular_dependency() IS 
  'Trigger function that prevents self-dependencies and circular dependencies';

COMMENT ON VIEW checklist_item_dependency_status IS 
  'Provides status information about each checklist item''s dependencies and whether it is blocked';
