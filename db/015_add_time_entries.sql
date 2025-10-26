-- Migration: Add time_entries table for incremental time logging
-- This enables users to log time without changing status

-- Create time_entries table
CREATE TABLE IF NOT EXISTS time_entries (
    id SERIAL PRIMARY KEY,
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('issue', 'action-item')),
    item_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    hours_logged DECIMAL(6,2) NOT NULL CHECK (hours_logged > 0),
    logged_by INTEGER NOT NULL REFERENCES users(id),
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_logged_by FOREIGN KEY (logged_by) REFERENCES users(id)
);

-- Add tracking columns to issues
ALTER TABLE issues 
    ADD COLUMN IF NOT EXISTS last_time_logged_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS time_log_count INTEGER DEFAULT 0;

-- Add tracking columns to action_items
ALTER TABLE action_items 
    ADD COLUMN IF NOT EXISTS last_time_logged_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS time_log_count INTEGER DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_time_entries_item ON time_entries(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_logged_by ON time_entries(logged_by);
CREATE INDEX IF NOT EXISTS idx_time_entries_logged_at ON time_entries(logged_at DESC);

-- Migration complete
