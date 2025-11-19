-- Migration 029: AI Agent Core Engine Tables
-- Story 5.2.1: AI Agent Sessions, Proposals, and Audit Log

-- AI Agent Sessions Table
-- Tracks AI agent invocations and conversations
CREATE TABLE IF NOT EXISTS ai_agent_sessions (
  id SERIAL PRIMARY KEY,
  session_id UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Agent type
  agent_type VARCHAR(50) NOT NULL,
  -- Types: 'decision_assistant', 'risk_detector', 'meeting_analyzer', 'knowledge_explorer'

  -- Context
  user_id INTEGER NOT NULL REFERENCES users(id),
  user_prompt TEXT NOT NULL,

  -- Agent state
  status VARCHAR(20) DEFAULT 'in_progress',
  -- Status: 'in_progress', 'completed', 'failed', 'cancelled'

  -- Results
  agent_response TEXT,
  confidence_score DECIMAL(3,2), -- 0.00 to 1.00

  -- Context used
  pkg_nodes_used INTEGER[], -- Array of PKG node IDs used
  rag_docs_used INTEGER[], -- Array of RAG document IDs used

  -- Metadata
  model_used VARCHAR(50), -- 'claude-3-opus', 'gpt-4', etc.
  tokens_used INTEGER,
  latency_ms INTEGER,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT valid_status CHECK (status IN ('in_progress', 'completed', 'failed', 'cancelled'))
);

-- AI Agent Proposals Table
-- Stores AI-generated proposals awaiting human approval
CREATE TABLE IF NOT EXISTS ai_agent_proposals (
  id SERIAL PRIMARY KEY,
  proposal_id VARCHAR(20) UNIQUE NOT NULL, -- PROP-00001 format
  session_id UUID NOT NULL REFERENCES ai_agent_sessions(session_id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Proposal details
  proposal_type VARCHAR(50) NOT NULL,
  -- Types: 'decision', 'risk', 'action_item', 'meeting_summary', 'pkg_update'

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rationale TEXT,

  -- AI confidence
  confidence_score DECIMAL(3,2) NOT NULL,
  evidence_ids INTEGER[], -- IDs from evidence table

  -- HITL (Human-in-the-loop) workflow
  status VARCHAR(20) DEFAULT 'pending_review',
  -- Status: 'pending_review', 'approved', 'rejected', 'modified', 'auto_approved'

  reviewed_by INTEGER REFERENCES users(id),
  review_notes TEXT,
  reviewed_at TIMESTAMP,

  -- If approved, link to created entity
  created_entity_type VARCHAR(50), -- 'decision', 'risk', etc.
  created_entity_id INTEGER,

  -- Metadata
  proposed_data JSONB, -- Full JSON of proposed entity
  modifications JSONB, -- User modifications if status = 'modified'

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_proposal_status CHECK (
    status IN ('pending_review', 'approved', 'rejected', 'modified', 'auto_approved')
  )
);

-- AI Agent Audit Log
-- Detailed logging of agent actions for transparency
CREATE TABLE IF NOT EXISTS ai_agent_audit_log (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES ai_agent_sessions(session_id) ON DELETE CASCADE,

  -- Action details
  action_type VARCHAR(50) NOT NULL,
  -- Types: 'pkg_query', 'rag_search', 'llm_call', 'proposal_created', 'entity_created'

  action_description TEXT,

  -- Context
  input_data JSONB,
  output_data JSONB,

  -- Performance
  execution_time_ms INTEGER,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_ai_sessions_project ON ai_agent_sessions(project_id);
CREATE INDEX idx_ai_sessions_user ON ai_agent_sessions(user_id);
CREATE INDEX idx_ai_sessions_status ON ai_agent_sessions(status);
CREATE INDEX idx_ai_sessions_created ON ai_agent_sessions(created_at DESC);

CREATE INDEX idx_ai_proposals_session ON ai_agent_proposals(session_id);
CREATE INDEX idx_ai_proposals_project ON ai_agent_proposals(project_id);
CREATE INDEX idx_ai_proposals_status ON ai_agent_proposals(status);
CREATE INDEX idx_ai_proposals_type ON ai_agent_proposals(proposal_type);

CREATE INDEX idx_ai_audit_session ON ai_agent_audit_log(session_id);
CREATE INDEX idx_ai_audit_type ON ai_agent_audit_log(action_type);
CREATE INDEX idx_ai_audit_created ON ai_agent_audit_log(created_at DESC);

-- Helper function for proposal ID generation
CREATE OR REPLACE FUNCTION generate_proposal_id()
RETURNS VARCHAR AS $$
DECLARE
  next_num INTEGER;
  new_id VARCHAR(20);
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(proposal_id FROM 6) AS INTEGER)), 0) + 1
  INTO next_num
  FROM ai_agent_proposals;

  new_id := 'PROP-' || LPAD(next_num::TEXT, 5, '0');
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_ai_proposals_updated_at
  BEFORE UPDATE ON ai_agent_proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

-- Add constraints for data integrity
ALTER TABLE ai_agent_proposals
  ADD CONSTRAINT valid_confidence CHECK (confidence_score BETWEEN 0.00 AND 1.00);

ALTER TABLE ai_agent_sessions
  ADD CONSTRAINT valid_session_confidence CHECK (
    confidence_score IS NULL OR confidence_score BETWEEN 0.00 AND 1.00
  );

COMMENT ON TABLE ai_agent_sessions IS 'Tracks AI agent invocations and conversation sessions';
COMMENT ON TABLE ai_agent_proposals IS 'AI-generated proposals awaiting human approval (HITL)';
COMMENT ON TABLE ai_agent_audit_log IS 'Detailed audit trail of all AI agent actions';
