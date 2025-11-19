-- Migration 027: Add RAG Documents Table for Semantic Search
-- This creates a unified evidence store for retrieval-augmented generation

-- Ensure uuid extension is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create rag_documents table
CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Source tracking
  source_type VARCHAR(50) NOT NULL,
  -- Examples: meeting_transcript, uploaded_doc, email, note, issue_comment, slack_message
  source_id INTEGER, -- meeting.id, document.id, etc. (nullable for ad-hoc notes)

  -- Content
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- Full document/transcript text
  meta JSONB DEFAULT '{}',
  -- Examples: {filename, mime_type, created_by, participants, meeting_date, url}

  -- Full-text search (MVP: tsvector)
  content_tsv TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) STORED,

  -- Future: Vector embeddings (Phase 2 - pgvector)
  -- embedding VECTOR(1536), -- For OpenAI ada-002 or Anthropic embeddings

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_source_type CHECK (source_type IN (
    'meeting_transcript', 'uploaded_doc', 'email', 'note',
    'issue_comment', 'slack_message', 'risk_description', 'decision_rationale'
  ))
);

-- Full-text search index (GIN)
CREATE INDEX idx_rag_docs_fts ON rag_documents USING GIN(content_tsv);

-- Source lookup
CREATE INDEX idx_rag_docs_project ON rag_documents(project_id);
CREATE INDEX idx_rag_docs_source ON rag_documents(source_type, source_id);
CREATE INDEX idx_rag_docs_created ON rag_documents(created_at DESC);

-- JSONB meta index
CREATE INDEX idx_rag_docs_meta ON rag_documents USING GIN(meta);

-- Future: Vector similarity index (Phase 2)
-- CREATE INDEX idx_rag_docs_vector ON rag_documents
-- USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);

-- Add table and column comments
COMMENT ON TABLE rag_documents IS 'Unified evidence store for RAG retrieval across meetings, docs, emails, and notes';
COMMENT ON COLUMN rag_documents.source_type IS 'Type of source document (meeting_transcript, uploaded_doc, etc.)';
COMMENT ON COLUMN rag_documents.source_id IS 'ID in the source table (nullable for ad-hoc content)';
COMMENT ON COLUMN rag_documents.content_tsv IS 'Full-text search vector (auto-generated from title + content)';
COMMENT ON COLUMN rag_documents.meta IS 'JSONB metadata (filename, participants, date, etc.)';

-- Auto-update trigger for updated_at
CREATE TRIGGER update_rag_documents_modified
BEFORE UPDATE ON rag_documents
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Summary report
DO $$
BEGIN
  RAISE NOTICE '=== RAG Documents Table Created ===';
  RAISE NOTICE 'Table: rag_documents with full-text search support';
  RAISE NOTICE 'Indexes: 5 indexes created (1 GIN FTS, 1 GIN JSONB, 3 B-tree)';
  RAISE NOTICE 'Ready for: meetings, documents, decisions, risks, notes';
END $$;
