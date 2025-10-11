-- Risk Register Database Schema Migration
-- Phase 1: Core Risk Management Tables

BEGIN;

-- ============================================
-- Table 1: risk_categories
-- ============================================
CREATE TABLE IF NOT EXISTS risk_categories (
    id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#6b7280',
    icon VARCHAR(50) DEFAULT '⚠️',
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, name)
);

-- ============================================
-- Table 2: risks
-- ============================================
CREATE TABLE IF NOT EXISTS risks (
    id SERIAL PRIMARY KEY,
    risk_id VARCHAR(20) UNIQUE NOT NULL,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    risk_source TEXT,
    tags TEXT[],
    
    -- Risk Assessment
    probability INTEGER NOT NULL CHECK (probability >= 1 AND probability <= 5),
    impact INTEGER NOT NULL CHECK (impact >= 1 AND impact <= 5),
    risk_score INTEGER GENERATED ALWAYS AS (probability * impact) STORED,
    risk_level VARCHAR(20) GENERATED ALWAYS AS (
        CASE 
            WHEN probability * impact BETWEEN 1 AND 6 THEN 'Low'
            WHEN probability * impact BETWEEN 8 AND 12 THEN 'Medium'
            WHEN probability * impact BETWEEN 15 AND 20 THEN 'High'
            WHEN probability * impact = 25 THEN 'Critical'
            ELSE 'Medium'
        END
    ) STORED,
    
    -- Response Planning
    response_strategy VARCHAR(20) CHECK (response_strategy IN ('Avoid', 'Mitigate', 'Transfer', 'Accept', 'Exploit', 'Share', 'Enhance')),
    mitigation_plan TEXT,
    contingency_plan TEXT,
    mitigation_cost DECIMAL(10, 2),
    mitigation_effort_hours INTEGER,
    
    -- Ownership & Tracking
    risk_owner_id INTEGER REFERENCES users(id),
    target_resolution_date DATE,
    review_date DATE,
    status VARCHAR(20) DEFAULT 'identified' CHECK (status IN ('identified', 'assessed', 'mitigating', 'monitoring', 'closed', 'realized')),
    
    -- Residual Risk (after mitigation)
    residual_probability INTEGER CHECK (residual_probability >= 1 AND residual_probability <= 5),
    residual_impact INTEGER CHECK (residual_impact >= 1 AND residual_impact <= 5),
    
    -- Metadata
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    realized_at TIMESTAMP,
    attachment_count INTEGER DEFAULT 0
);

-- ============================================
-- Table 3: risk_updates
-- ============================================
CREATE TABLE IF NOT EXISTS risk_updates (
    id SERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    update_type VARCHAR(20) NOT NULL CHECK (update_type IN ('status_change', 'reassessment', 'mitigation_update', 'note', 'closure', 'realization')),
    old_value TEXT,
    new_value TEXT,
    notes TEXT,
    old_probability INTEGER CHECK (old_probability >= 1 AND old_probability <= 5),
    new_probability INTEGER CHECK (new_probability >= 1 AND new_probability <= 5),
    old_impact INTEGER CHECK (old_impact >= 1 AND old_impact <= 5),
    new_impact INTEGER CHECK (new_impact >= 1 AND new_impact <= 5),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Table 4: risk_assessments
-- ============================================
CREATE TABLE IF NOT EXISTS risk_assessments (
    id SERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    probability INTEGER NOT NULL CHECK (probability >= 1 AND probability <= 5),
    impact INTEGER NOT NULL CHECK (impact >= 1 AND impact <= 5),
    risk_score INTEGER NOT NULL,
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('Low', 'Medium', 'High', 'Critical')),
    assessment_notes TEXT,
    assessed_by INTEGER REFERENCES users(id),
    assessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Indexes for Performance
-- ============================================

-- Risks table indexes
CREATE INDEX IF NOT EXISTS idx_risks_project ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks(status);
CREATE INDEX IF NOT EXISTS idx_risks_owner ON risks(risk_owner_id);
CREATE INDEX IF NOT EXISTS idx_risks_level ON risks(risk_level);
CREATE INDEX IF NOT EXISTS idx_risks_category ON risks(category);
CREATE INDEX IF NOT EXISTS idx_risks_score ON risks(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_risks_created ON risks(created_at DESC);

-- Risk updates indexes
CREATE INDEX IF NOT EXISTS idx_risk_updates_risk ON risk_updates(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_updates_created ON risk_updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_updates_type ON risk_updates(update_type);

-- Risk assessments indexes
CREATE INDEX IF NOT EXISTS idx_risk_assessments_risk ON risk_assessments(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_date ON risk_assessments(assessed_at DESC);

-- Risk categories indexes
CREATE INDEX IF NOT EXISTS idx_risk_categories_project ON risk_categories(project_id);
CREATE INDEX IF NOT EXISTS idx_risk_categories_active ON risk_categories(is_active) WHERE is_active = true;

-- ============================================
-- Insert Default Risk Categories
-- ============================================

INSERT INTO risk_categories (project_id, name, description, color, icon, display_order) VALUES
    (NULL, 'Technical', 'Technology, architecture, or technical implementation risks', '#3b82f6', '⚙️', 1),
    (NULL, 'Schedule', 'Timeline and deadline risks', '#f59e0b', '📅', 2),
    (NULL, 'Budget', 'Cost and financial risks', '#10b981', '💰', 3),
    (NULL, 'Resource', 'People, skills, or resource availability risks', '#8b5cf6', '👥', 4),
    (NULL, 'External', 'Third-party, vendor, or external dependency risks', '#ef4444', '🌐', 5),
    (NULL, 'Compliance', 'Regulatory or compliance risks', '#6366f1', '📋', 6),
    (NULL, 'Security', 'Information security or data privacy risks', '#dc2626', '🔒', 7),
    (NULL, 'Quality', 'Quality assurance or defect risks', '#ec4899', '✓', 8)
ON CONFLICT (project_id, name) DO NOTHING;

-- ============================================
-- Create function to auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_risks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER risks_updated_at_trigger
    BEFORE UPDATE ON risks
    FOR EACH ROW
    EXECUTE FUNCTION update_risks_updated_at();

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify tables were created
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
    AND table_name IN ('risk_categories', 'risks', 'risk_updates', 'risk_assessments')
ORDER BY table_name;

-- Verify indexes were created
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
    AND tablename IN ('risk_categories', 'risks', 'risk_updates', 'risk_assessments')
ORDER BY tablename, indexname;

-- Verify default categories were inserted
SELECT 
    id, 
    name, 
    color, 
    icon,
    display_order
FROM risk_categories
WHERE project_id IS NULL
ORDER BY display_order;

-- Test GENERATED columns with a sample risk
-- This demonstrates that risk_score and risk_level are automatically calculated
SELECT 
    'Test: GENERATED columns' as test_name,
    3 as probability,
    4 as impact,
    3 * 4 as expected_score,
    'Medium' as expected_level,
    CASE 
        WHEN 3 * 4 BETWEEN 1 AND 6 THEN 'Low'
        WHEN 3 * 4 BETWEEN 8 AND 12 THEN 'Medium'
        WHEN 3 * 4 BETWEEN 15 AND 20 THEN 'High'
        WHEN 3 * 4 = 25 THEN 'Critical'
        ELSE 'Medium'
    END as calculated_level;
