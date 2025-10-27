-- Migration: Add work_date column to time_entries table
-- This enables backdated time entry (logging time for past dates)

-- Add work_date column (when the work was actually done)
ALTER TABLE time_entries 
    ADD COLUMN IF NOT EXISTS work_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Create index for efficient sorting and filtering by work date
CREATE INDEX IF NOT EXISTS idx_time_entries_work_date ON time_entries(work_date DESC);

-- Update existing entries to use logged_at date as work_date (backwards compatibility)
UPDATE time_entries 
SET work_date = DATE(logged_at) 
WHERE work_date = CURRENT_DATE AND logged_at IS NOT NULL;

-- Migration complete
