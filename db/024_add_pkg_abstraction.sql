-- Migration 024: Add PKG (Project Knowledge Graph) Abstraction Layer
-- This creates a unified graph overlay over all project entities (issues, action_items, risks, decisions, meetings)

-- Enable UUID extension for PKG node IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- PKG Nodes Table
-- ========================================
-- Represents all project entities in a unified graph structure

CREATE TABLE IF NOT EXISTS pkg_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Entity type (AIPM ontology)
  type VARCHAR(50) NOT NULL,
  -- Examples: Task, Risk, Decision, Meeting, Milestone, Workload, MigrationWave, CutoverEvent, Control

  -- Source mapping (polymorphic link to underlying tables)
  source_table VARCHAR(50), -- 'issues' | 'action_items' | 'risks' | 'decisions' | 'meetings' | NULL
  source_id INTEGER, -- ID in source table, NULL for synthetic/derived nodes

  -- Attributes (JSONB for flexibility)
  attrs JSONB NOT NULL DEFAULT '{}',
  -- Examples: {title, status, priority, assignee, due_date, impact_level, etc.}

  -- AI provenance
  created_by_ai BOOLEAN DEFAULT FALSE,
  ai_confidence VARCHAR(20), -- low, medium, high
  ai_analysis_id UUID, -- Links to analysis session

  -- Versioning (for decision supersession, milestone updates)
  version INTEGER DEFAULT 1,
  superseded_by UUID REFERENCES pkg_nodes(id), -- For nodes that get replaced

  -- Audit
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_source CHECK (
    (source_table IS NULL AND source_id IS NULL) OR
    (source_table IS NOT NULL AND source_id IS NOT NULL)
  ),
  CONSTRAINT valid_confidence CHECK (ai_confidence IN ('low', 'medium', 'high', NULL))
);

-- Indexes for pkg_nodes
CREATE INDEX idx_pkg_nodes_project_type ON pkg_nodes(project_id, type);
CREATE INDEX idx_pkg_nodes_source ON pkg_nodes(source_table, source_id);
CREATE INDEX idx_pkg_nodes_ai ON pkg_nodes(created_by_ai, ai_confidence);
CREATE INDEX idx_pkg_nodes_superseded ON pkg_nodes(superseded_by);
CREATE INDEX idx_pkg_nodes_created ON pkg_nodes(created_at DESC);

-- GIN index for JSONB attrs queries
CREATE INDEX idx_pkg_nodes_attrs ON pkg_nodes USING GIN(attrs);

-- UNIQUE constraint to ensure one-to-one mapping between source entities and PKG nodes (idempotent upserts)
ALTER TABLE pkg_nodes ADD CONSTRAINT uq_pkg_nodes_source UNIQUE (source_table, source_id);

-- Comments
COMMENT ON TABLE pkg_nodes IS 'Unified Project Knowledge Graph nodes representing all entities';
COMMENT ON COLUMN pkg_nodes.type IS 'Entity type from AIPM ontology (Task, Risk, Decision, Meeting, etc.)';
COMMENT ON COLUMN pkg_nodes.source_table IS 'Underlying table name (issues, action_items, risks, decisions, meetings)';
COMMENT ON COLUMN pkg_nodes.source_id IS 'ID in the source table (polymorphic foreign key)';
COMMENT ON COLUMN pkg_nodes.attrs IS 'JSONB attributes extracted from source table for fast querying';
COMMENT ON COLUMN pkg_nodes.superseded_by IS 'References newer node that replaces this one (for decisions, milestones)';

-- ========================================
-- PKG Edges Table
-- ========================================
-- Represents relationships between PKG nodes

CREATE TABLE IF NOT EXISTS pkg_edges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Relationship type
  type VARCHAR(50) NOT NULL,
  -- Examples: depends_on, blocks, owned_by, evidence_of, cutover_for, scheduled_in, mitigates

  -- From/To nodes
  from_node_id UUID NOT NULL REFERENCES pkg_nodes(id) ON DELETE CASCADE,
  to_node_id UUID NOT NULL REFERENCES pkg_nodes(id) ON DELETE CASCADE,

  -- Edge attributes (optional metadata)
  attrs JSONB DEFAULT '{}',
  -- Examples: {lag_days: 3, dependency_type: 'finish-to-start'}

  -- Evidence for AI-detected relationships
  confidence DECIMAL(3,2), -- 0.00 to 1.00
  evidence_quote TEXT, -- Supporting quote from transcript/document
  created_by_ai BOOLEAN DEFAULT FALSE,

  -- Audit
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT no_self_loops CHECK (from_node_id != to_node_id),
  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

-- Indexes for pkg_edges
CREATE INDEX idx_pkg_edges_from ON pkg_edges(from_node_id, type);
CREATE INDEX idx_pkg_edges_to ON pkg_edges(to_node_id, type);
CREATE INDEX idx_pkg_edges_project ON pkg_edges(project_id);
CREATE INDEX idx_pkg_edges_type ON pkg_edges(type);
CREATE INDEX idx_pkg_edges_confidence ON pkg_edges(confidence DESC);

-- GIN index for JSONB attrs
CREATE INDEX idx_pkg_edges_attrs ON pkg_edges USING GIN(attrs);

-- UNIQUE constraint to prevent duplicate relationships (idempotent upserts)
ALTER TABLE pkg_edges ADD CONSTRAINT uq_pkg_edges_relationship UNIQUE (project_id, type, from_node_id, to_node_id);

-- Comments
COMMENT ON TABLE pkg_edges IS 'Relationships between PKG nodes (dependencies, evidence links, ownership, etc.)';
COMMENT ON COLUMN pkg_edges.type IS 'Relationship type (depends_on, blocks, evidence_of, owned_by, etc.)';
COMMENT ON COLUMN pkg_edges.confidence IS 'Confidence score for AI-detected relationships (0.00-1.00)';
COMMENT ON COLUMN pkg_edges.evidence_quote IS 'Quote from source that supports this relationship';

-- ========================================
-- Link Source Tables to PKG
-- ========================================
-- Add foreign key constraints to existing source tables

-- Link decisions to PKG nodes
ALTER TABLE decisions ADD CONSTRAINT fk_decisions_pkg
  FOREIGN KEY (pkg_node_id) REFERENCES pkg_nodes(id) ON DELETE SET NULL;

-- Link meetings to PKG nodes
ALTER TABLE meetings ADD CONSTRAINT fk_meetings_pkg
  FOREIGN KEY (pkg_node_id) REFERENCES pkg_nodes(id) ON DELETE SET NULL;

-- Link evidence to PKG edges
ALTER TABLE evidence ADD CONSTRAINT fk_evidence_pkg
  FOREIGN KEY (pkg_edge_id) REFERENCES pkg_edges(id) ON DELETE SET NULL;

-- Note: issues, action_items, risks don't have pkg_node_id column yet
-- They will be linked via source_table + source_id polymorphic pattern
-- Auto-sync triggers can be added later if needed
