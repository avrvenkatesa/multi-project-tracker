-- Migration 034: Entity Proposals Table
-- Stores AI-extracted entities pending approval

CREATE TABLE IF NOT EXISTS entity_proposals (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  proposed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  proposed_data JSONB NOT NULL,
  ai_analysis JSONB,
  confidence DECIMAL(3, 2),
  source_type VARCHAR(50),
  source_metadata JSONB,
  status VARCHAR(50) DEFAULT 'pending',
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  requires_approval_from INTEGER REFERENCES custom_roles(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_entity_proposals_project ON entity_proposals(project_id);
CREATE INDEX idx_entity_proposals_status ON entity_proposals(status);
CREATE INDEX idx_entity_proposals_proposed_by ON entity_proposals(proposed_by);
CREATE INDEX idx_entity_proposals_requires_approval ON entity_proposals(requires_approval_from);
CREATE INDEX idx_entity_proposals_created_at ON entity_proposals(created_at);

COMMENT ON TABLE entity_proposals IS 'Stores AI-extracted entities pending approval based on workflow engine decisions';
COMMENT ON COLUMN entity_proposals.entity_type IS 'Type of entity: Decision, Risk, Action Item, Task, etc.';
COMMENT ON COLUMN entity_proposals.proposed_data IS 'Full entity data extracted by AI';
COMMENT ON COLUMN entity_proposals.ai_analysis IS 'AI analysis metadata including reasoning and citations';
COMMENT ON COLUMN entity_proposals.confidence IS 'AI confidence score (0.0 - 1.0)';
COMMENT ON COLUMN entity_proposals.status IS 'pending, approved, rejected, auto_created';
COMMENT ON COLUMN entity_proposals.requires_approval_from IS 'Role ID that must approve this proposal';
