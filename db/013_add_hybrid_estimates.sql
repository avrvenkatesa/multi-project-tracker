-- Migration: Add Hybrid Estimate Support
-- Description: Adds hybrid estimate data storage and planning estimate source tracking

-- ============================================
-- 1. Add hybrid estimate data to history table
-- ============================================
ALTER TABLE effort_estimate_history 
ADD COLUMN IF NOT EXISTS hybrid_estimate_data JSONB;

COMMENT ON COLUMN effort_estimate_history.hybrid_estimate_data IS 'Stores hybrid estimate: selected tasks, edited hours, and totals';

-- ============================================
-- 2. Add planning estimate source to issues
-- ============================================
ALTER TABLE issues 
ADD COLUMN IF NOT EXISTS planning_estimate_source VARCHAR(20) CHECK (planning_estimate_source IN ('manual', 'ai', 'hybrid'));

COMMENT ON COLUMN issues.planning_estimate_source IS 'Which estimate type user selected for planning: manual, ai, or hybrid';

-- ============================================
-- 3. Add planning estimate source to action_items
-- ============================================
ALTER TABLE action_items 
ADD COLUMN IF NOT EXISTS planning_estimate_source VARCHAR(20) CHECK (planning_estimate_source IN ('manual', 'ai', 'hybrid'));

COMMENT ON COLUMN action_items.planning_estimate_source IS 'Which estimate type user selected for planning: manual, ai, or hybrid';

-- ============================================
-- 4. Add hybrid estimate hours to issues
-- ============================================
ALTER TABLE issues 
ADD COLUMN IF NOT EXISTS hybrid_effort_estimate_hours DECIMAL(6,2);

COMMENT ON COLUMN issues.hybrid_effort_estimate_hours IS 'Hybrid estimate total hours (computed from selected AI tasks)';

-- ============================================
-- 5. Add hybrid estimate hours to action_items
-- ============================================
ALTER TABLE action_items 
ADD COLUMN IF NOT EXISTS hybrid_effort_estimate_hours DECIMAL(6,2);

COMMENT ON COLUMN action_items.hybrid_effort_estimate_hours IS 'Hybrid estimate total hours (computed from selected AI tasks)';

-- ============================================
-- 6. Update source constraint to allow hybrid_selection
-- ============================================
ALTER TABLE effort_estimate_history 
DROP CONSTRAINT IF EXISTS effort_estimate_history_source_check;

ALTER TABLE effort_estimate_history 
ADD CONSTRAINT effort_estimate_history_source_check 
CHECK (source IN ('initial_analysis', 'transcript_update', 'manual_regenerate', 'manual_edit', 'hybrid_selection'));
