-- Migration: Add Effort Estimation Feature (Phase 1)
-- Description: Adds manual & AI effort estimation with versioning, rate limiting, and accuracy tracking

-- ============================================
-- 1. Add effort estimation fields to issues
-- ============================================
ALTER TABLE issues 
ADD COLUMN IF NOT EXISTS estimated_effort_hours DECIMAL(6,2),
ADD COLUMN IF NOT EXISTS actual_effort_hours DECIMAL(6,2),
ADD COLUMN IF NOT EXISTS ai_effort_estimate_hours DECIMAL(6,2),
ADD COLUMN IF NOT EXISTS ai_estimate_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS ai_estimate_confidence VARCHAR(20),
ADD COLUMN IF NOT EXISTS ai_estimate_last_updated TIMESTAMP;

-- ============================================
-- 2. Add effort estimation fields to action_items
-- ============================================
ALTER TABLE action_items 
ADD COLUMN IF NOT EXISTS estimated_effort_hours DECIMAL(6,2),
ADD COLUMN IF NOT EXISTS actual_effort_hours DECIMAL(6,2),
ADD COLUMN IF NOT EXISTS ai_effort_estimate_hours DECIMAL(6,2),
ADD COLUMN IF NOT EXISTS ai_estimate_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS ai_estimate_confidence VARCHAR(20),
ADD COLUMN IF NOT EXISTS ai_estimate_last_updated TIMESTAMP;

-- ============================================
-- 3. Create effort estimate history table
-- ============================================
CREATE TABLE IF NOT EXISTS effort_estimate_history (
  id SERIAL PRIMARY KEY,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('issue', 'action-item')),
  item_id INTEGER NOT NULL,
  estimate_hours DECIMAL(6,2) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  confidence VARCHAR(20) CHECK (confidence IN ('low', 'medium', 'high')),
  breakdown JSONB,
  reasoning TEXT,
  source VARCHAR(50) CHECK (source IN ('initial_analysis', 'transcript_update', 'manual_regenerate', 'manual_edit')),
  created_at TIMESTAMP DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_effort_history_item ON effort_estimate_history(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_effort_history_version ON effort_estimate_history(item_type, item_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_effort_history_created ON effort_estimate_history(created_at DESC);

-- ============================================
-- 4. Create AI usage tracking table
-- ============================================
CREATE TABLE IF NOT EXISTS ai_usage_tracking (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  project_id INTEGER REFERENCES projects(id),
  feature VARCHAR(50) NOT NULL,
  operation_type VARCHAR(50),
  tokens_used INTEGER,
  cost_usd DECIMAL(8,4),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for usage analysis
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_tracking(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_project ON ai_usage_tracking(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage_tracking(feature, created_at DESC);

-- ============================================
-- 5. Create estimate accuracy tracking table
-- ============================================
CREATE TABLE IF NOT EXISTS estimate_accuracy (
  id SERIAL PRIMARY KEY,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('issue', 'action-item')),
  item_id INTEGER NOT NULL,
  estimated_hours DECIMAL(6,2) NOT NULL,
  actual_hours DECIMAL(6,2) NOT NULL,
  variance_hours DECIMAL(6,2) GENERATED ALWAYS AS (actual_hours - estimated_hours) STORED,
  variance_pct DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN estimated_hours > 0 THEN ((actual_hours - estimated_hours) / estimated_hours * 100)
      ELSE NULL 
    END
  ) STORED,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for accuracy analysis
CREATE INDEX IF NOT EXISTS idx_estimate_accuracy_item ON estimate_accuracy(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_estimate_accuracy_variance ON estimate_accuracy(variance_pct);
CREATE INDEX IF NOT EXISTS idx_estimate_accuracy_completed ON estimate_accuracy(completed_at DESC);

-- ============================================
-- 6. Create function to track estimate accuracy on completion
-- ============================================
CREATE OR REPLACE FUNCTION track_estimate_accuracy()
RETURNS TRIGGER AS $$
BEGIN
  -- Only track if item is completed and has both estimated and actual hours
  IF NEW.status = 'Done' AND NEW.actual_effort_hours IS NOT NULL THEN
    -- For issues
    IF TG_TABLE_NAME = 'issues' AND (NEW.estimated_effort_hours IS NOT NULL OR NEW.ai_effort_estimate_hours IS NOT NULL) THEN
      INSERT INTO estimate_accuracy (item_type, item_id, estimated_hours, actual_hours, completed_at)
      VALUES (
        'issue',
        NEW.id,
        COALESCE(NEW.estimated_effort_hours, NEW.ai_effort_estimate_hours),
        NEW.actual_effort_hours,
        NEW.updated_at
      )
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- For action items
    IF TG_TABLE_NAME = 'action_items' AND (NEW.estimated_effort_hours IS NOT NULL OR NEW.ai_effort_estimate_hours IS NOT NULL) THEN
      INSERT INTO estimate_accuracy (item_type, item_id, estimated_hours, actual_hours, completed_at)
      VALUES (
        'action-item',
        NEW.id,
        COALESCE(NEW.estimated_effort_hours, NEW.ai_effort_estimate_hours),
        NEW.actual_effort_hours,
        NEW.updated_at
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. Create triggers for automatic accuracy tracking
-- ============================================
DROP TRIGGER IF EXISTS track_issue_estimate_accuracy ON issues;
CREATE TRIGGER track_issue_estimate_accuracy
  AFTER UPDATE OF status, actual_effort_hours ON issues
  FOR EACH ROW
  EXECUTE FUNCTION track_estimate_accuracy();

DROP TRIGGER IF EXISTS track_action_estimate_accuracy ON action_items;
CREATE TRIGGER track_action_estimate_accuracy
  AFTER UPDATE OF status, actual_effort_hours ON action_items
  FOR EACH ROW
  EXECUTE FUNCTION track_estimate_accuracy();

-- ============================================
-- 8. Add comments for documentation
-- ============================================
COMMENT ON COLUMN issues.estimated_effort_hours IS 'Manual effort estimate provided by user (in hours)';
COMMENT ON COLUMN issues.actual_effort_hours IS 'Actual time spent (tracked for accuracy learning)';
COMMENT ON COLUMN issues.ai_effort_estimate_hours IS 'Current AI-generated effort estimate (in hours)';
COMMENT ON COLUMN issues.ai_estimate_version IS 'Version number for AI estimate (increments on regeneration)';
COMMENT ON COLUMN issues.ai_estimate_confidence IS 'Confidence level: low, medium, high';
COMMENT ON COLUMN issues.ai_estimate_last_updated IS 'When AI estimate was last generated/updated';

COMMENT ON TABLE effort_estimate_history IS 'Version history for all effort estimates';
COMMENT ON TABLE ai_usage_tracking IS 'Tracks AI API usage for cost monitoring and rate limiting';
COMMENT ON TABLE estimate_accuracy IS 'Tracks estimation accuracy to improve future estimates';
