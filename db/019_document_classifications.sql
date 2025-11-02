-- Story 3: AI Document Classification
-- Store classification results for uploaded documents

CREATE TABLE IF NOT EXISTS document_classifications (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  confidence DECIMAL(3,2) NOT NULL,
  reasoning TEXT,
  is_custom_category BOOLEAN DEFAULT FALSE,
  text_length INTEGER,
  classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

-- Indexes for efficient querying
CREATE INDEX idx_doc_class_project ON document_classifications(project_id);
CREATE INDEX idx_doc_class_category ON document_classifications(category);
CREATE INDEX idx_doc_class_custom ON document_classifications(is_custom_category);

-- Comments
COMMENT ON TABLE document_classifications IS 'AI-generated document classifications for routing to specialized processors';
COMMENT ON COLUMN document_classifications.is_custom_category IS 'TRUE if AI created a new category, FALSE if using base categories';
