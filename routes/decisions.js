const express = require('express');
const router = express.Router();
const { Pool } = require('@neondatabase/serverless');
const joi = require('joi');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Import authentication middleware (will be provided by server.js)
// These will be attached when router is mounted

// Validation schemas
const decisionSchema = joi.object({
  title: joi.string().required(),
  description: joi.string().allow('', null),
  decisionType: joi.string().valid('architectural', 'business', 'technical', 'operational').allow(null),
  impactLevel: joi.string().valid('low', 'medium', 'high', 'critical').allow(null),
  status: joi.string().valid('proposed', 'approved', 'rejected', 'superseded', 'implemented').default('proposed'),
  rationale: joi.string().allow('', null),
  consequences: joi.string().allow('', null),
  alternativesConsidered: joi.array().items(joi.object()).allow(null),
  decidedBy: joi.number().integer().allow(null),
  decidedDate: joi.date().iso().allow(null),
  reviewDate: joi.date().iso().allow(null)
});

const updateDecisionSchema = joi.object({
  title: joi.string(),
  description: joi.string().allow('', null),
  status: joi.string().valid('proposed', 'approved', 'rejected', 'superseded', 'implemented'),
  rationale: joi.string().allow('', null),
  consequences: joi.string().allow('', null),
  decidedDate: joi.date().iso().allow(null),
  reviewDate: joi.date().iso().allow(null),
  decidedBy: joi.number().integer().allow(null)
}).min(1);

// POST /api/projects/:projectId/decisions - Create a decision
router.post('/projects/:projectId/decisions', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    // Validate request body
    const { error, value } = decisionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Verify project exists and user has access
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate decision_id using PostgreSQL function
    const decisionIdResult = await pool.query(
      'SELECT generate_decision_id($1) as decision_id',
      [projectId]
    );
    const decisionId = decisionIdResult.rows[0].decision_id;

    // Insert decision
    const result = await pool.query(
      `INSERT INTO decisions (
        decision_id, project_id, title, description, decision_type, impact_level, 
        status, rationale, consequences, alternatives_considered, decided_by, 
        decided_date, review_date, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        decisionId, projectId, value.title, value.description, value.decisionType,
        value.impactLevel, value.status, value.rationale, value.consequences,
        JSON.stringify(value.alternativesConsidered), value.decidedBy,
        value.decidedDate, value.reviewDate, userId
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating decision:', err);
    res.status(500).json({ error: 'Failed to create decision' });
  }
});

// GET /api/projects/:projectId/decisions - List decisions for a project
router.get('/projects/:projectId/decisions', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, impactLevel, decisionType } = req.query;

    let query = `
      SELECT d.*, u.username as created_by_name
      FROM decisions d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.project_id = $1
    `;
    const params = [projectId];
    let paramIndex = 2;

    if (status) {
      query += ` AND d.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (impactLevel) {
      query += ` AND d.impact_level = $${paramIndex}`;
      params.push(impactLevel);
      paramIndex++;
    }

    if (decisionType) {
      query += ` AND d.decision_type = $${paramIndex}`;
      params.push(decisionType);
      paramIndex++;
    }

    query += ' ORDER BY d.created_date DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching decisions:', err);
    res.status(500).json({ error: 'Failed to fetch decisions' });
  }
});

// GET /api/decisions/:id - Get a specific decision
router.get('/decisions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT d.*, 
        u1.username as created_by_name,
        u2.username as decided_by_name
       FROM decisions d
       LEFT JOIN users u1 ON d.created_by = u1.id
       LEFT JOIN users u2 ON d.decided_by = u2.id
       WHERE d.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Decision not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching decision:', err);
    res.status(500).json({ error: 'Failed to fetch decision' });
  }
});

// PATCH /api/decisions/:id - Update a decision
router.patch('/decisions/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = updateDecisionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    Object.keys(value).forEach(key => {
      updates.push(`${key.replace(/([A-Z])/g, '_$1').toLowerCase()} = $${paramIndex}`);
      params.push(value[key]);
      paramIndex++;
    });

    params.push(id);

    const query = `
      UPDATE decisions
      SET ${updates.join(', ')}, updated_date = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Decision not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating decision:', err);
    res.status(500).json({ error: 'Failed to update decision' });
  }
});

// POST /api/decisions/:id/supersede - Supersede a decision with a new one
router.post('/decisions/:id/supersede', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Validate new decision data
    const { error, value } = decisionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Get the old decision
    const oldDecisionResult = await pool.query(
      'SELECT * FROM decisions WHERE id = $1',
      [id]
    );

    if (oldDecisionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Original decision not found' });
    }

    const oldDecision = oldDecisionResult.rows[0];

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Generate new decision_id
      const decisionIdResult = await client.query(
        'SELECT generate_decision_id($1) as decision_id',
        [oldDecision.project_id]
      );
      const newDecisionId = decisionIdResult.rows[0].decision_id;

      // Create new decision
      const newDecisionResult = await client.query(
        `INSERT INTO decisions (
          decision_id, project_id, title, description, decision_type, impact_level,
          status, rationale, consequences, alternatives_considered, decided_by,
          decided_date, review_date, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          newDecisionId, oldDecision.project_id, value.title, value.description,
          value.decisionType, value.impactLevel, value.status, value.rationale,
          value.consequences, JSON.stringify(value.alternativesConsidered),
          value.decidedBy, value.decidedDate, value.reviewDate, userId
        ]
      );

      const newDecision = newDecisionResult.rows[0];

      // Update old decision to mark it as superseded
      await client.query(
        'UPDATE decisions SET status = $1, superseded_by = $2, updated_date = NOW() WHERE id = $3',
        ['superseded', newDecision.id, id]
      );

      await client.query('COMMIT');

      res.status(201).json({
        oldDecision: { id, status: 'superseded', superseded_by: newDecision.id },
        newDecision
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error superseding decision:', err);
    res.status(500).json({ error: 'Failed to supersede decision' });
  }
});

module.exports = router;
