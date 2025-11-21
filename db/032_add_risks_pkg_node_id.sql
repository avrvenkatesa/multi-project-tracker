-- Migration: Add pkg_node_id column to risks table
-- This enables bi-directional sync between risks and PKG nodes

-- Add pkg_node_id column to risks table
ALTER TABLE risks 
ADD COLUMN IF NOT EXISTS pkg_node_id UUID REFERENCES pkg_nodes(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_risks_pkg_node_id ON risks(pkg_node_id);

-- Add comment for documentation
COMMENT ON COLUMN risks.pkg_node_id IS 'Link to PKG node for bi-directional sync between risks table and Project Knowledge Graph';
