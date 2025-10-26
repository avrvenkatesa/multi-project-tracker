-- Migration: Add Completion Tracking & Quick Time Logging
-- Description: Adds completion percentage and time tracking without status changes
-- Required for accurate project schedule generation

-- ============================================
-- 1. Add completion tracking to issues
-- ============================================
ALTER TABLE issues 
ADD COLUMN IF NOT EXISTS completion_percentage INTEGER DEFAULT 0 
  CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
ADD COLUMN IF NOT EXISTS last_time_logged_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS time_log_count INTEGER DEFAULT 0;

-- ============================================
-- 2. Add completion tracking to action_items
-- ============================================
ALTER TABLE action_items 
ADD COLUMN IF NOT EXISTS completion_percentage INTEGER DEFAULT 0 
  CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
ADD COLUMN IF NOT EXISTS last_time_logged_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS time_log_count INTEGER DEFAULT 0;

-- ============================================
-- 3. Create time tracking history table
-- ============================================
CREATE TABLE IF NOT EXISTS time_tracking_history (
  id SERIAL PRIMARY KEY,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('issue', 'action-item')),
  item_id INTEGER NOT NULL,
  hours_added DECIMAL(6,2) NOT NULL,
  total_hours_after DECIMAL(6,2) NOT NULL,
  completion_percentage_after INTEGER,
  status_from VARCHAR(50),
  status_to VARCHAR(50),
  is_quick_log BOOLEAN DEFAULT FALSE,
  notes TEXT,
  logged_by INTEGER REFERENCES users(id),
  logged_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_time_tracking_item ON time_tracking_history(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_time_tracking_date ON time_tracking_history(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_tracking_user ON time_tracking_history(logged_by, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_tracking_quick_log ON time_tracking_history(is_quick_log, logged_at DESC);

-- ============================================
-- 4. Add comments for documentation
-- ============================================
COMMENT ON COLUMN issues.completion_percentage IS 'Completion percentage (0-100), calculated from actual hours / planning estimate or set manually';
COMMENT ON COLUMN issues.last_time_logged_at IS 'Last time actual hours were logged (via quick log or status change)';
COMMENT ON COLUMN issues.time_log_count IS 'Number of times time has been logged for this item';

COMMENT ON COLUMN action_items.completion_percentage IS 'Completion percentage (0-100), calculated from actual hours / planning estimate or set manually';
COMMENT ON COLUMN action_items.last_time_logged_at IS 'Last time actual hours were logged (via quick log or status change)';
COMMENT ON COLUMN action_items.time_log_count IS 'Number of times time has been logged for this item';

COMMENT ON TABLE time_tracking_history IS 'Complete audit trail for all time tracking entries (quick logs and status changes)';
COMMENT ON COLUMN time_tracking_history.is_quick_log IS 'TRUE if logged via quick log (no status change), FALSE if logged during status transition';
