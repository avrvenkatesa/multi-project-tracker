const express = require('express');
const router = express.Router();
const { Pool } = require('@neondatabase/serverless');
const { authenticateToken } = require('../middleware/auth');
const thoughtCaptureService = require('../services/thoughtCaptureService');
const multer = require('multer');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

router.post('/thoughts', authenticateToken, upload.single('audioFile'), async (req, res) => {
  try {
    const {
      projectId,
      contentType,
      textContent,
      thoughtType,
      tags
    } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const projectAccess = await pool.query(`
      SELECT * FROM project_members 
      WHERE user_id = $1 AND project_id = $2 AND status = 'active'
    `, [req.user.id, projectId]);

    if (projectAccess.rows.length === 0 && req.user.role !== 'System Administrator') {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    if (!contentType || !['text', 'voice'].includes(contentType)) {
      return res.status(400).json({ error: 'Content type must be "text" or "voice"' });
    }

    if (contentType === 'text' && !textContent) {
      return res.status(400).json({ error: 'Text content is required for text captures' });
    }

    if (contentType === 'voice' && !req.file) {
      return res.status(400).json({ error: 'Audio file is required for voice captures' });
    }

    const result = await thoughtCaptureService.processThought({
      projectId: parseInt(projectId),
      userId: req.user.id,
      contentType,
      textContent,
      audioFile: req.file,
      thoughtType: thoughtType || 'auto',
      tags: tags ? JSON.parse(tags) : []
    });

    res.json(result);
  } catch (error) {
    console.error('Thought capture error:', error);
    res.status(500).json({
      error: 'Failed to process thought',
      details: error.message
    });
  }
});

router.get('/thoughts', authenticateToken, async (req, res) => {
  try {
    const { projectId, limit } = req.query;

    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const projectAccess = await pool.query(`
      SELECT * FROM project_members 
      WHERE user_id = $1 AND project_id = $2 AND status = 'active'
    `, [req.user.id, projectId]);

    if (projectAccess.rows.length === 0 && req.user.role !== 'System Administrator') {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const result = await pool.query(`
      SELECT * FROM thought_captures
      WHERE project_id = $1 AND created_by = $2
      ORDER BY created_at DESC
      LIMIT $3
    `, [projectId, req.user.id, limit ? parseInt(limit) : 20]);

    res.json({
      success: true,
      thoughts: result.rows
    });
  } catch (error) {
    console.error('Get thought history error:', error);
    res.status(500).json({
      error: 'Failed to fetch thought history',
      details: error.message
    });
  }
});

router.get('/thoughts/:captureId', authenticateToken, async (req, res) => {
  try {
    const { captureId } = req.params;

    const result = await pool.query(
      'SELECT * FROM thought_captures WHERE id = $1',
      [captureId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Thought capture not found' });
    }

    const projectId = result.rows[0].project_id;
    const projectAccess = await pool.query(`
      SELECT * FROM project_members 
      WHERE user_id = $1 AND project_id = $2 AND status = 'active'
    `, [req.user.id, projectId]);

    if (projectAccess.rows.length === 0 && req.user.role !== 'System Administrator') {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    res.json({
      success: true,
      thought: result.rows[0]
    });
  } catch (error) {
    console.error('Get thought details error:', error);
    res.status(500).json({
      error: 'Failed to fetch thought details',
      details: error.message
    });
  }
});

module.exports = router;
