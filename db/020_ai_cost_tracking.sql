-- Story 4: AI Cost Monitoring Dashboard
-- Enhance existing AI usage tracking with detailed cost monitoring

-- Add missing columns to existing ai_usage_tracking table
ALTER TABLE ai_usage_tracking 
ADD COLUMN IF NOT EXISTS model VARCHAR(50) DEFAULT 'gpt-4o',
ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Update total_tokens for existing rows
UPDATE ai_usage_tracking 
SET total_tokens = COALESCE(tokens_used, 0)
WHERE total_tokens = 0;

-- Create index on created_at if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ai_usage_created') THEN
        CREATE INDEX idx_ai_usage_created ON ai_usage_tracking(created_at);
    END IF;
END
$$;

-- Drop old views if they exist
DROP VIEW IF EXISTS ai_cost_by_project CASCADE;
DROP VIEW IF EXISTS ai_cost_by_user CASCADE;

-- View: Cost breakdown by project and feature
CREATE OR REPLACE VIEW ai_cost_by_project AS
SELECT
  project_id,
  feature,
  model,
  COUNT(*) as operation_count,
  SUM(COALESCE(total_tokens, tokens_used, 0)) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  AVG(cost_usd) as avg_cost_usd,
  MAX(created_at) as last_used
FROM ai_usage_tracking
GROUP BY project_id, feature, model
ORDER BY project_id, total_cost_usd DESC;

-- View: Cost breakdown by user
CREATE OR REPLACE VIEW ai_cost_by_user AS
SELECT
  user_id,
  feature,
  COUNT(*) as operation_count,
  SUM(COALESCE(total_tokens, tokens_used, 0)) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  MAX(created_at) as last_used
FROM ai_usage_tracking
GROUP BY user_id, feature
ORDER BY user_id, total_cost_usd DESC;

-- Update comments
COMMENT ON TABLE ai_usage_tracking IS 'Tracks AI API usage and costs for monitoring and optimization';
COMMENT ON COLUMN ai_usage_tracking.feature IS 'Feature name: classification, checklist, meeting_analysis, timeline, dependencies, etc.';
COMMENT ON COLUMN ai_usage_tracking.model IS 'AI model used: gpt-4o, gpt-3.5-turbo, gpt-4o-mini, etc.';
COMMENT ON COLUMN ai_usage_tracking.metadata IS 'Additional context: filename, operation type, input length, etc.';
