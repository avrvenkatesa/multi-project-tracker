-- Add AI detection fields to risks table
-- Story 5.2.3: Proactive Risk Detection

-- Add AI detection columns
ALTER TABLE risks
  ADD COLUMN IF NOT EXISTS ai_detected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS detection_source VARCHAR(50);

-- Add index for querying AI-detected risks
CREATE INDEX IF NOT EXISTS idx_risks_ai_detected ON risks(ai_detected, project_id)
  WHERE ai_detected = TRUE;

-- Add comments
COMMENT ON COLUMN risks.ai_detected IS 'Whether this risk was detected by AI agent';
COMMENT ON COLUMN risks.ai_confidence IS 'AI confidence score (0.00-1.00)';
COMMENT ON COLUMN risks.detection_source IS 'Source type that triggered detection (meeting_mention, dependency_bottleneck, etc.)';
