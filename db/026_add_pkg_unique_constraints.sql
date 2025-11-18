-- Migration 026: Add UNIQUE Constraints to PKG Tables (Idempotent)
-- This migration safely adds constraints to existing PKG installations

-- Add UNIQUE constraint to pkg_nodes if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_pkg_nodes_source' 
    AND conrelid = 'pkg_nodes'::regclass
  ) THEN
    ALTER TABLE pkg_nodes 
      ADD CONSTRAINT uq_pkg_nodes_source UNIQUE (source_table, source_id);
    RAISE NOTICE 'Added UNIQUE constraint uq_pkg_nodes_source to pkg_nodes';
  ELSE
    RAISE NOTICE 'UNIQUE constraint uq_pkg_nodes_source already exists on pkg_nodes';
  END IF;
END $$;

-- Add UNIQUE constraint to pkg_edges if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_pkg_edges_relationship' 
    AND conrelid = 'pkg_edges'::regclass
  ) THEN
    ALTER TABLE pkg_edges 
      ADD CONSTRAINT uq_pkg_edges_relationship UNIQUE (project_id, type, from_node_id, to_node_id);
    RAISE NOTICE 'Added UNIQUE constraint uq_pkg_edges_relationship to pkg_edges';
  ELSE
    RAISE NOTICE 'UNIQUE constraint uq_pkg_edges_relationship already exists on pkg_edges';
  END IF;
END $$;

-- Verify no duplicate nodes exist (safety check before constraint)
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT source_table, source_id, COUNT(*) as count
    FROM pkg_nodes
    WHERE source_table IS NOT NULL
    GROUP BY source_table, source_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    RAISE WARNING 'Found % duplicate pkg_nodes entries - manual cleanup required before constraints can be enforced', duplicate_count;
  ELSE
    RAISE NOTICE 'No duplicate pkg_nodes found - constraints safe to apply';
  END IF;
END $$;

-- Verify no duplicate edges exist (safety check before constraint)
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT project_id, type, from_node_id, to_node_id, COUNT(*) as count
    FROM pkg_edges
    GROUP BY project_id, type, from_node_id, to_node_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    RAISE WARNING 'Found % duplicate pkg_edges entries - manual cleanup required before constraints can be enforced', duplicate_count;
  ELSE
    RAISE NOTICE 'No duplicate pkg_edges found - constraints safe to apply';
  END IF;
END $$;

-- Summary report
DO $$
DECLARE
  nodes_constraint_exists BOOLEAN;
  edges_constraint_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_pkg_nodes_source'
  ) INTO nodes_constraint_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_pkg_edges_relationship'
  ) INTO edges_constraint_exists;
  
  RAISE NOTICE '=== PKG Constraint Status ===';
  RAISE NOTICE 'pkg_nodes UNIQUE constraint: %', 
    CASE WHEN nodes_constraint_exists THEN 'EXISTS ✓' ELSE 'MISSING ✗' END;
  RAISE NOTICE 'pkg_edges UNIQUE constraint: %', 
    CASE WHEN edges_constraint_exists THEN 'EXISTS ✓' ELSE 'MISSING ✗' END;
END $$;
