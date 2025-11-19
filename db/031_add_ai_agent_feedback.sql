-- Migration 031: AI Agent Session Feedback
-- Stores user feedback (thumbs up/down) on AI Agent responses

CREATE TABLE IF NOT EXISTS ai_agent_session_feedback (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES ai_agent_sessions(session_id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Feedback type
  feedback_type VARCHAR(20) NOT NULL,
  -- Types: 'positive', 'negative'
  
  -- Optional feedback details
  feedback_text TEXT,
  feedback_tags VARCHAR(50)[],
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_feedback_type CHECK (feedback_type IN ('positive', 'negative')),
  CONSTRAINT unique_feedback_per_session UNIQUE (session_id, user_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_feedback_session ON ai_agent_session_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_feedback_project ON ai_agent_session_feedback(project_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON ai_agent_session_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON ai_agent_session_feedback(created_at DESC);

-- Comment
COMMENT ON TABLE ai_agent_session_feedback IS 'Stores user feedback on AI Agent responses for quality improvement';
