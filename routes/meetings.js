const express = require('express');
const router = express.Router();
const { Pool } = require('@neondatabase/serverless');
const joi = require('joi');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Validation schemas
const meetingSchema = joi.object({
  title: joi.string().required(),
  meetingDate: joi.date().iso().required(),
  durationMinutes: joi.number().integer().min(0).allow(null),
  participants: joi.array().items(joi.string()).allow(null),
  transcriptText: joi.string().allow('', null),
  transcriptFiles: joi.array().items(joi.object()).allow(null),
  summary: joi.string().allow('', null),
  visibility: joi.string().valid('public', 'private', 'team').default('public')
});

const updateMeetingSchema = joi.object({
  title: joi.string(),
  summary: joi.string().allow('', null),
  keyDecisions: joi.array().items(joi.number().integer()).allow(null),
  actionItemsCreated: joi.array().items(joi.number().integer()).allow(null),
  risksIdentified: joi.array().items(joi.number().integer()).allow(null),
  issuesCreated: joi.array().items(joi.number().integer()).allow(null)
}).min(1);

// POST /api/projects/:projectId/meetings - Create a meeting
router.post('/projects/:projectId/meetings', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    // Validate request body
    const { error, value } = meetingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Verify project exists
    const projectCheck = await pool.query(
      'SELECT id FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Generate meeting_id
    const meetingIdResult = await pool.query(
      'SELECT generate_meeting_id($1) as meeting_id',
      [projectId]
    );
    const meetingId = meetingIdResult.rows[0].meeting_id;

    // Insert meeting
    const result = await pool.query(
      `INSERT INTO meetings (
        meeting_id, project_id, title, meeting_date, duration_minutes,
        participants, transcript_text, transcript_files, summary, visibility, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        meetingId, projectId, value.title, value.meetingDate, value.durationMinutes,
        JSON.stringify(value.participants), value.transcriptText,
        JSON.stringify(value.transcriptFiles), value.summary, value.visibility, userId
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating meeting:', err);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

// GET /api/projects/:projectId/meetings - List meetings for a project
router.get('/projects/:projectId/meetings', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { startDate, endDate, visibility } = req.query;

    let query = `
      SELECT m.*, u.username as created_by_name
      FROM meetings m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.project_id = $1
    `;
    const params = [projectId];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND m.meeting_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND m.meeting_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (visibility) {
      query += ` AND m.visibility = $${paramIndex}`;
      params.push(visibility);
      paramIndex++;
    }

    query += ' ORDER BY m.meeting_date DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching meetings:', err);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// GET /api/meetings/:id - Get a specific meeting
router.get('/meetings/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT m.*, u.username as created_by_name
       FROM meetings m
       LEFT JOIN users u ON m.created_by = u.id
       WHERE m.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching meeting:', err);
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

// PATCH /api/meetings/:id - Update a meeting
router.patch('/meetings/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = updateMeetingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    Object.keys(value).forEach(key => {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      const dbValue = Array.isArray(value[key]) ? JSON.stringify(value[key]) : value[key];
      updates.push(`${dbKey} = $${paramIndex}`);
      params.push(dbValue);
      paramIndex++;
    });

    params.push(id);

    const query = `
      UPDATE meetings
      SET ${updates.join(', ')}, updated_date = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating meeting:', err);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

module.exports = router;
