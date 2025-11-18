-- Migration 025: Seed PKG from Existing Data
-- Backfills pkg_nodes and pkg_edges from existing entities

-- ========================================
-- Seed Task Nodes from Issues
-- ========================================
INSERT INTO pkg_nodes (project_id, type, source_table, source_id, attrs, created_by_ai, ai_confidence, ai_analysis_id, created_by, created_at)
SELECT
  i.project_id,
  'Task' as type,
  'issues' as source_table,
  i.id as source_id,
  jsonb_build_object(
    'title', i.title,
    'description', i.description,
    'status', i.status,
    'priority', i.priority,
    'assignee', i.assignee,
    'due_date', i.due_date,
    'completion_percentage', i.completion_percentage,
    'hierarchy_level', i.hierarchy_level,
    'is_epic', i.is_epic,
    'parent_issue_id', i.parent_issue_id
  ) as attrs,
  COALESCE(i.created_by_ai, FALSE),
  i.ai_confidence,
  i.ai_analysis_id,
  i.created_by,
  i.created_date
FROM issues i
ON CONFLICT DO NOTHING;

-- ========================================
-- Seed Task Nodes from Action Items
-- ========================================
INSERT INTO pkg_nodes (project_id, type, source_table, source_id, attrs, created_by_ai, ai_confidence, ai_analysis_id, created_by, created_at)
SELECT
  a.project_id,
  'Task' as type,
  'action_items' as source_table,
  a.id as source_id,
  jsonb_build_object(
    'title', a.title,
    'description', a.description,
    'status', a.status,
    'priority', a.priority,
    'assignee', a.assignee,
    'due_date', a.due_date,
    'completion_percentage', a.completion_percentage,
    'source_meeting_id', a.source_meeting_id,
    'source_decision_id', a.source_decision_id
  ) as attrs,
  COALESCE(a.created_by_ai, FALSE),
  a.ai_confidence,
  a.ai_analysis_id,
  a.created_by,
  a.created_date
FROM action_items a
ON CONFLICT DO NOTHING;

-- ========================================
-- Seed Risk Nodes
-- ========================================
INSERT INTO pkg_nodes (project_id, type, source_table, source_id, attrs, created_by_ai, created_by, created_at)
SELECT
  r.project_id,
  'Risk' as type,
  'risks' as source_table,
  r.id as source_id,
  jsonb_build_object(
    'risk_id', r.risk_id,
    'title', r.title,
    'description', r.description,
    'probability', r.probability,
    'impact', r.impact,
    'status', r.status,
    'category', r.category,
    'mitigation_plan', r.mitigation_plan,
    'risk_owner_id', r.risk_owner_id,
    'source_meeting_id', r.source_meeting_id
  ) as attrs,
  (r.risk_source = 'document_analysis') as created_by_ai,
  r.created_by,
  r.created_date
FROM risks r
ON CONFLICT DO NOTHING;

-- ========================================
-- Seed Decision Nodes
-- ========================================
INSERT INTO pkg_nodes (project_id, type, source_table, source_id, attrs, created_by_ai, ai_confidence, ai_analysis_id, created_by, created_at)
SELECT
  d.project_id,
  'Decision' as type,
  'decisions' as source_table,
  d.id as source_id,
  jsonb_build_object(
    'decision_id', d.decision_id,
    'title', d.title,
    'description', d.description,
    'decision_type', d.decision_type,
    'impact_level', d.impact_level,
    'status', d.status,
    'rationale', d.rationale,
    'decided_by', d.decided_by,
    'decided_date', d.decided_date,
    'superseded_by', d.superseded_by
  ) as attrs,
  COALESCE(d.created_by_ai, FALSE),
  d.ai_confidence,
  d.ai_analysis_id,
  d.created_by,
  d.created_date
FROM decisions d
ON CONFLICT DO NOTHING;

-- ========================================
-- Seed Meeting Nodes
-- ========================================
INSERT INTO pkg_nodes (project_id, type, source_table, source_id, attrs, created_by, created_at)
SELECT
  m.project_id,
  'Meeting' as type,
  'meetings' as source_table,
  m.id as source_id,
  jsonb_build_object(
    'meeting_id', m.meeting_id,
    'title', m.title,
    'meeting_date', m.meeting_date,
    'participants', m.participants,
    'summary', m.summary,
    'duration_minutes', m.duration_minutes
  ) as attrs,
  m.created_by,
  m.created_date
FROM meetings m
ON CONFLICT DO NOTHING;

-- ========================================
-- Backfill pkg_node_id in Source Tables
-- ========================================

-- Update decisions.pkg_node_id
UPDATE decisions d
SET pkg_node_id = p.id
FROM pkg_nodes p
WHERE p.source_table = 'decisions' AND p.source_id = d.id
  AND d.pkg_node_id IS NULL;

-- Update meetings.pkg_node_id
UPDATE meetings m
SET pkg_node_id = p.id
FROM pkg_nodes p
WHERE p.source_table = 'meetings' AND p.source_id = m.id
  AND m.pkg_node_id IS NULL;

-- ========================================
-- Seed parent_of Edges from Issue Hierarchy
-- ========================================
INSERT INTO pkg_edges (project_id, type, from_node_id, to_node_id, created_at)
SELECT DISTINCT
  i1.project_id,
  'parent_of' as type,
  p1.id as from_node_id, -- Parent node
  p2.id as to_node_id,   -- Child node
  NOW()
FROM issues i1
JOIN issues i2 ON i2.parent_issue_id = i1.id
JOIN pkg_nodes p1 ON p1.source_table = 'issues' AND p1.source_id = i1.id
JOIN pkg_nodes p2 ON p2.source_table = 'issues' AND p2.source_id = i2.id
WHERE i1.id != i2.id
ON CONFLICT DO NOTHING;

-- ========================================
-- Seed evidence_of Edges from Evidence Table
-- ========================================
-- Links Meeting nodes to entity nodes via evidence

INSERT INTO pkg_edges (project_id, type, from_node_id, to_node_id, evidence_quote, confidence, created_by_ai, created_by, created_at)
SELECT DISTINCT
  CASE e.entity_type
    WHEN 'issue' THEN (SELECT project_id FROM issues WHERE id = e.entity_id LIMIT 1)
    WHEN 'action-item' THEN (SELECT project_id FROM action_items WHERE id = e.entity_id LIMIT 1)
    WHEN 'risk' THEN (SELECT project_id FROM risks WHERE id = e.entity_id LIMIT 1)
    WHEN 'decision' THEN (SELECT project_id FROM decisions WHERE id = e.entity_id LIMIT 1)
  END as project_id,
  'evidence_of' as type,
  m_node.id as from_node_id, -- Meeting node (source)
  entity_node.id as to_node_id, -- Entity node (target)
  e.quote_text,
  CASE e.confidence
    WHEN 'high' THEN 0.90
    WHEN 'medium' THEN 0.70
    WHEN 'low' THEN 0.50
    ELSE NULL
  END as confidence,
  (e.extraction_method = 'llm_extraction') as created_by_ai,
  e.created_by,
  e.created_date
FROM evidence e
-- Join to meeting node
LEFT JOIN pkg_nodes m_node ON e.source_type = 'meeting'
  AND m_node.source_table = 'meetings'
  AND m_node.source_id = e.source_id
-- Join to entity node
LEFT JOIN pkg_nodes entity_node ON (
  (e.entity_type = 'issue' AND entity_node.source_table = 'issues' AND entity_node.source_id = e.entity_id) OR
  (e.entity_type = 'action-item' AND entity_node.source_table = 'action_items' AND entity_node.source_id = e.entity_id) OR
  (e.entity_type = 'risk' AND entity_node.source_table = 'risks' AND entity_node.source_id = e.entity_id) OR
  (e.entity_type = 'decision' AND entity_node.source_table = 'decisions' AND entity_node.source_id = e.entity_id)
)
WHERE m_node.id IS NOT NULL AND entity_node.id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ========================================
-- Seed source_from Edges (Action Items/Risks from Meetings)
-- ========================================

-- Action Items sourced from Meetings
INSERT INTO pkg_edges (project_id, type, from_node_id, to_node_id, created_at)
SELECT DISTINCT
  a.project_id,
  'sourced_from' as type,
  a_node.id as from_node_id, -- Action Item node
  m_node.id as to_node_id,   -- Meeting node
  NOW()
FROM action_items a
JOIN pkg_nodes a_node ON a_node.source_table = 'action_items' AND a_node.source_id = a.id
JOIN pkg_nodes m_node ON m_node.source_table = 'meetings' AND m_node.source_id = a.source_meeting_id
WHERE a.source_meeting_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Action Items sourced from Decisions
INSERT INTO pkg_edges (project_id, type, from_node_id, to_node_id, created_at)
SELECT DISTINCT
  a.project_id,
  'sourced_from' as type,
  a_node.id as from_node_id, -- Action Item node
  d_node.id as to_node_id,   -- Decision node
  NOW()
FROM action_items a
JOIN pkg_nodes a_node ON a_node.source_table = 'action_items' AND a_node.source_id = a.id
JOIN pkg_nodes d_node ON d_node.source_table = 'decisions' AND d_node.source_id = a.source_decision_id
WHERE a.source_decision_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Risks sourced from Meetings
INSERT INTO pkg_edges (project_id, type, from_node_id, to_node_id, created_at)
SELECT DISTINCT
  r.project_id,
  'sourced_from' as type,
  r_node.id as from_node_id, -- Risk node
  m_node.id as to_node_id,   -- Meeting node
  NOW()
FROM risks r
JOIN pkg_nodes r_node ON r_node.source_table = 'risks' AND r_node.source_id = r.id
JOIN pkg_nodes m_node ON m_node.source_table = 'meetings' AND m_node.source_id = r.source_meeting_id
WHERE r.source_meeting_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Issues sourced from Meetings
INSERT INTO pkg_edges (project_id, type, from_node_id, to_node_id, created_at)
SELECT DISTINCT
  i.project_id,
  'sourced_from' as type,
  i_node.id as from_node_id, -- Issue node
  m_node.id as to_node_id,   -- Meeting node
  NOW()
FROM issues i
JOIN pkg_nodes i_node ON i_node.source_table = 'issues' AND i_node.source_id = i.id
JOIN pkg_nodes m_node ON m_node.source_table = 'meetings' AND m_node.source_id = i.source_meeting_id
WHERE i.source_meeting_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ========================================
-- Backfill pkg_edge_id in Evidence Table
-- ========================================
UPDATE evidence e
SET pkg_edge_id = pe.id
FROM pkg_edges pe
WHERE pe.type = 'evidence_of'
  AND pe.evidence_quote = e.quote_text
  AND e.pkg_edge_id IS NULL;
