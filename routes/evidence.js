const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const joi = require('joi');

// Validation schema
const evidenceSchema = joi.object({
  entityType: joi.string().valid('issue', 'action-item', 'risk', 'decision').required(),
  entityId: joi.number().integer().required(),
  evidenceType: joi.string().valid('transcript_quote', 'document_excerpt', 'meeting_note', 'user_statement', 'email_excerpt').allow(null),
  sourceType: joi.string().valid('meeting', 'document', 'manual', 'email').allow(null),
  sourceId: joi.number().integer().allow(null),
  quoteText: joi.string().required(),
  pageNumber: joi.number().integer().allow(null),
  timestampSeconds: joi.number().integer().allow(null),
  context: joi.string().allow('', null),
  confidence: joi.string().valid('low', 'medium', 'high').allow(null),
  extractionMethod: joi.string().valid('manual', 'llm_extraction', 'keyword_match').allow(null)
});

// POST /api/evidence - Create evidence
router.post('/evidence', async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate request body
    const { error, value } = evidenceSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Verify entity exists using parameterized queries (prevent SQL injection)
    const { entityType, entityId } = value;
    let entityCheck;
    
    switch (entityType) {
      case 'issue':
        entityCheck = await pool.query('SELECT id FROM issues WHERE id = $1', [entityId]);
        break;
      case 'action-item':
        entityCheck = await pool.query('SELECT id FROM action_items WHERE id = $1', [entityId]);
        break;
      case 'risk':
        entityCheck = await pool.query('SELECT id FROM risks WHERE id = $1', [entityId]);
        break;
      case 'decision':
        entityCheck = await pool.query('SELECT id FROM decisions WHERE id = $1', [entityId]);
        break;
      default:
        return res.status(400).json({ error: 'Invalid entity type' });
    }

    if (entityCheck.rows.length === 0) {
      return res.status(404).json({ error: `${entityType} not found` });
    }

    // Insert evidence
    const result = await pool.query(
      `INSERT INTO evidence (
        entity_type, entity_id, evidence_type, source_type, source_id,
        quote_text, page_number, timestamp_seconds, context, confidence,
        extraction_method, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        value.entityType, value.entityId, value.evidenceType, value.sourceType,
        value.sourceId, value.quoteText, value.pageNumber, value.timestampSeconds,
        value.context, value.confidence, value.extractionMethod, userId
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating evidence:', err);
    res.status(500).json({ error: 'Failed to create evidence' });
  }
});

// GET /api/evidence - List evidence with filters
router.get('/evidence', async (req, res) => {
  try {
    const { entityType, entityId, sourceType, sourceId } = req.query;

    let query = 'SELECT * FROM evidence WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (entityType) {
      query += ` AND entity_type = $${paramIndex}`;
      params.push(entityType);
      paramIndex++;
    }

    if (entityId) {
      query += ` AND entity_id = $${paramIndex}`;
      params.push(entityId);
      paramIndex++;
    }

    if (sourceType) {
      query += ` AND source_type = $${paramIndex}`;
      params.push(sourceType);
      paramIndex++;
    }

    if (sourceId) {
      query += ` AND source_id = $${paramIndex}`;
      params.push(sourceId);
      paramIndex++;
    }

    query += ' ORDER BY created_date DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching evidence:', err);
    res.status(500).json({ error: 'Failed to fetch evidence' });
  }
});

// GET /api/:entityType/:entityId/evidence - Get all evidence for an entity
router.get('/:entityType/:entityId/evidence', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    // Map URL entity type to database entity type
    const entityTypeMap = {
      'issues': 'issue',
      'action-items': 'action-item',
      'risks': 'risk',
      'decisions': 'decision'
    };

    const dbEntityType = entityTypeMap[entityType];
    if (!dbEntityType) {
      return res.status(400).json({ error: 'Invalid entity type' });
    }

    const result = await pool.query(
      `SELECT e.*, 
        m.title as source_meeting_title,
        m.meeting_date as source_meeting_date,
        u.username as created_by_name
       FROM evidence e
       LEFT JOIN meetings m ON e.source_type = 'meeting' AND e.source_id = m.id
       LEFT JOIN users u ON e.created_by = u.id
       WHERE e.entity_type = $1 AND e.entity_id = $2
       ORDER BY e.created_date DESC`,
      [dbEntityType, entityId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching entity evidence:', err);
    res.status(500).json({ error: 'Failed to fetch evidence' });
  }
});

module.exports = router;
