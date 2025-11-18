-- Migration 028: Auto-Index Existing Data to RAG Documents
-- This backfills existing meetings, decisions, and risks + creates auto-sync triggers

-- ============================================
-- PART 1: Backfill Existing Data
-- ============================================

-- 1.1 Migrate existing meetings → rag_documents
INSERT INTO rag_documents (project_id, source_type, source_id, title, content, meta, created_at)
SELECT
  m.project_id,
  'meeting_transcript' as source_type,
  m.id as source_id,
  m.title,
  m.transcript_text as content,
  jsonb_build_object(
    'meeting_id', m.meeting_id,
    'meeting_date', m.meeting_date,
    'participants', m.participants,
    'duration_minutes', m.duration_minutes,
    'visibility', m.visibility
  ) as meta,
  m.created_date as created_at
FROM meetings m
WHERE m.transcript_text IS NOT NULL AND m.transcript_text != ''
ON CONFLICT DO NOTHING;

-- 1.2 Index decision rationales as RAG documents
INSERT INTO rag_documents (project_id, source_type, source_id, title, content, meta, created_at)
SELECT
  d.project_id,
  'decision_rationale' as source_type,
  d.id as source_id,
  'Decision: ' || d.title as title,
  coalesce(d.description, '') || E'\n\nRationale:\n' || coalesce(d.rationale, '') || E'\n\nConsequences:\n' || coalesce(d.consequences, '') as content,
  jsonb_build_object(
    'decision_id', d.decision_id,
    'decision_type', d.decision_type,
    'impact_level', d.impact_level,
    'status', d.status,
    'decided_date', d.decided_date
  ) as meta,
  d.created_date as created_at
FROM decisions d
WHERE (d.description IS NOT NULL OR d.rationale IS NOT NULL OR d.consequences IS NOT NULL)
ON CONFLICT DO NOTHING;

-- 1.3 Index risk descriptions as RAG documents
INSERT INTO rag_documents (project_id, source_type, source_id, title, content, meta, created_at)
SELECT
  r.project_id,
  'risk_description' as source_type,
  r.id as source_id,
  'Risk: ' || r.title as title,
  coalesce(r.description, '') || E'\n\nMitigation Plan:\n' || coalesce(r.mitigation_plan, '') as content,
  jsonb_build_object(
    'risk_id', r.risk_id,
    'category', r.category,
    'probability', r.probability,
    'impact', r.impact,
    'status', r.status
  ) as meta,
  r.created_at as created_at
FROM risks r
WHERE r.description IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================
-- PART 2: Auto-Indexing Triggers
-- ============================================

-- 2.1 Trigger: Auto-create rag_document when meeting with transcript is created/updated
CREATE OR REPLACE FUNCTION auto_index_meeting_to_rag()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.transcript_text IS NOT NULL AND NEW.transcript_text != '' THEN
    -- Check if RAG document already exists
    IF NOT EXISTS (
      SELECT 1 FROM rag_documents
      WHERE source_type = 'meeting_transcript' AND source_id = NEW.id
    ) THEN
      -- Insert new RAG document
      INSERT INTO rag_documents (project_id, source_type, source_id, title, content, meta)
      VALUES (
        NEW.project_id,
        'meeting_transcript',
        NEW.id,
        NEW.title,
        NEW.transcript_text,
        jsonb_build_object(
          'meeting_id', NEW.meeting_id,
          'meeting_date', NEW.meeting_date,
          'participants', NEW.participants,
          'duration_minutes', NEW.duration_minutes
        )
      );
    ELSE
      -- Update existing RAG document
      UPDATE rag_documents
      SET
        title = NEW.title,
        content = NEW.transcript_text,
        meta = jsonb_build_object(
          'meeting_id', NEW.meeting_id,
          'meeting_date', NEW.meeting_date,
          'participants', NEW.participants,
          'duration_minutes', NEW.duration_minutes
        ),
        updated_at = NOW()
      WHERE source_type = 'meeting_transcript' AND source_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_index_meeting_to_rag
AFTER INSERT OR UPDATE OF transcript_text ON meetings
FOR EACH ROW EXECUTE FUNCTION auto_index_meeting_to_rag();

-- 2.2 Trigger: Auto-index decisions
CREATE OR REPLACE FUNCTION auto_index_decision_to_rag()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.description IS NOT NULL OR NEW.rationale IS NOT NULL OR NEW.consequences IS NOT NULL) THEN
    IF NOT EXISTS (
      SELECT 1 FROM rag_documents
      WHERE source_type = 'decision_rationale' AND source_id = NEW.id
    ) THEN
      INSERT INTO rag_documents (project_id, source_type, source_id, title, content, meta)
      VALUES (
        NEW.project_id,
        'decision_rationale',
        NEW.id,
        'Decision: ' || NEW.title,
        coalesce(NEW.description, '') || E'\n\nRationale:\n' || coalesce(NEW.rationale, '') || E'\n\nConsequences:\n' || coalesce(NEW.consequences, ''),
        jsonb_build_object(
          'decision_id', NEW.decision_id,
          'decision_type', NEW.decision_type,
          'impact_level', NEW.impact_level,
          'status', NEW.status,
          'decided_date', NEW.decided_date
        )
      );
    ELSE
      UPDATE rag_documents
      SET
        title = 'Decision: ' || NEW.title,
        content = coalesce(NEW.description, '') || E'\n\nRationale:\n' || coalesce(NEW.rationale, '') || E'\n\nConsequences:\n' || coalesce(NEW.consequences, ''),
        meta = jsonb_build_object(
          'decision_id', NEW.decision_id,
          'decision_type', NEW.decision_type,
          'impact_level', NEW.impact_level,
          'status', NEW.status,
          'decided_date', NEW.decided_date
        ),
        updated_at = NOW()
      WHERE source_type = 'decision_rationale' AND source_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_index_decision_to_rag
AFTER INSERT OR UPDATE OF description, rationale, consequences ON decisions
FOR EACH ROW EXECUTE FUNCTION auto_index_decision_to_rag();

-- 2.3 Trigger: Auto-index risks
CREATE OR REPLACE FUNCTION auto_index_risk_to_rag()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.description IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM rag_documents
      WHERE source_type = 'risk_description' AND source_id = NEW.id
    ) THEN
      INSERT INTO rag_documents (project_id, source_type, source_id, title, content, meta)
      VALUES (
        NEW.project_id,
        'risk_description',
        NEW.id,
        'Risk: ' || NEW.title,
        coalesce(NEW.description, '') || E'\n\nMitigation Plan:\n' || coalesce(NEW.mitigation_plan, ''),
        jsonb_build_object(
          'risk_id', NEW.risk_id,
          'category', NEW.category,
          'probability', NEW.probability,
          'impact', NEW.impact,
          'status', NEW.status
        )
      );
    ELSE
      UPDATE rag_documents
      SET
        title = 'Risk: ' || NEW.title,
        content = coalesce(NEW.description, '') || E'\n\nMitigation Plan:\n' || coalesce(NEW.mitigation_plan, ''),
        meta = jsonb_build_object(
          'risk_id', NEW.risk_id,
          'category', NEW.category,
          'probability', NEW.probability,
          'impact', NEW.impact,
          'status', NEW.status
        ),
        updated_at = NOW()
      WHERE source_type = 'risk_description' AND source_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_index_risk_to_rag
AFTER INSERT OR UPDATE OF description, mitigation_plan ON risks
FOR EACH ROW EXECUTE FUNCTION auto_index_risk_to_rag();

-- ============================================
-- Summary Report
-- ============================================

DO $$
DECLARE
  meeting_count INTEGER;
  decision_count INTEGER;
  risk_count INTEGER;
  total_docs INTEGER;
BEGIN
  SELECT COUNT(*) INTO meeting_count FROM rag_documents WHERE source_type = 'meeting_transcript';
  SELECT COUNT(*) INTO decision_count FROM rag_documents WHERE source_type = 'decision_rationale';
  SELECT COUNT(*) INTO risk_count FROM rag_documents WHERE source_type = 'risk_description';
  SELECT COUNT(*) INTO total_docs FROM rag_documents;

  RAISE NOTICE '=== RAG Auto-Indexing Complete ===';
  RAISE NOTICE 'Meeting transcripts indexed: %', meeting_count;
  RAISE NOTICE 'Decision rationales indexed: %', decision_count;
  RAISE NOTICE 'Risk descriptions indexed: %', risk_count;
  RAISE NOTICE 'Total RAG documents: %', total_docs;
  RAISE NOTICE 'Auto-sync triggers: 3 triggers created';
END $$;
