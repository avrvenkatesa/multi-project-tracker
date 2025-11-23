/**
 * Quick Capture Routes
 * 
 * Mobile-optimized API endpoints for thought capture
 * Ultra-fast endpoints with minimal latency
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const quickCapture = require('../services/quickCapture');
const voiceCapture = require('../services/voiceCapture');
const { authenticateToken } = require('../middleware/auth');

// Configure multer for audio file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/voice');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `voice-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedFormats = ['.webm', '.mp3', '.wav', '.ogg', '.opus', '.m4a'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedFormats.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid audio format. Allowed: ${allowedFormats.join(', ')}`));
    }
  }
});

// ============================================
// Quick Text Capture
// ============================================

/**
 * POST /api/quick-capture/text
 * Ultra-fast text thought capture
 */
router.post('/text', authenticateToken, async (req, res) => {
  try {
    const {
      content,
      projectId,
      deviceInfo,
      locationContext
    } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const thoughtCapture = await quickCapture.createThoughtCapture({
      userId: req.user.id,
      projectId,
      content: content.trim(),
      captureMethod: 'text',
      deviceInfo,
      locationContext
    });

    // Return immediately for fast response
    res.status(201).json({
      id: thoughtCapture.id,
      content: thoughtCapture.content,
      status: thoughtCapture.status,
      createdAt: thoughtCapture.created_at,
      message: 'Thought captured successfully. AI analysis in progress.'
    });
  } catch (error) {
    console.error('Text capture error:', error);
    res.status(500).json({ error: 'Failed to capture thought' });
  }
});

// ============================================
// Voice Capture
// ============================================

/**
 * POST /api/quick-capture/voice
 * Upload and transcribe voice recording
 */
router.post('/voice', authenticateToken, upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    const {
      projectId,
      deviceInfo
    } = req.body;

    const audioFilePath = req.file.path;

    // Process voice capture (transcribe + create thought)
    const result = await voiceCapture.processVoiceCapture(
      audioFilePath,
      req.user.id,
      projectId ? parseInt(projectId) : null,
      {
        deviceInfo: deviceInfo ? JSON.parse(deviceInfo) : null
      }
    );

    res.status(201).json({
      id: result.thoughtCapture.id,
      content: result.transcription.text,
      confidence: result.transcription.confidence,
      duration: result.transcription.duration,
      status: result.thoughtCapture.status,
      createdAt: result.thoughtCapture.created_at,
      voiceRecordingId: result.voiceRecording.id,
      message: 'Voice captured and transcribed. AI analysis in progress.'
    });
  } catch (error) {
    console.error('Voice capture error:', error);
    res.status(500).json({ 
      error: 'Failed to process voice capture',
      details: error.message 
    });
  }
});

// ============================================
// Get Thought Captures
// ============================================

/**
 * GET /api/quick-capture
 * Get thought captures for current user
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      projectId,
      status,
      limit = 50,
      offset = 0
    } = req.query;

    const thoughts = await quickCapture.getThoughtCaptures(req.user.id, {
      projectId: projectId ? parseInt(projectId) : null,
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      thoughts,
      count: thoughts.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching thoughts:', error);
    res.status(500).json({ error: 'Failed to fetch thought captures' });
  }
});

/**
 * GET /api/quick-capture/:id
 * Get a single thought capture
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const thoughtId = parseInt(req.params.id);
    const thought = await quickCapture.getThoughtCaptureById(thoughtId, req.user.id);

    if (!thought) {
      return res.status(404).json({ error: 'Thought capture not found' });
    }

    res.json(thought);
  } catch (error) {
    console.error('Error fetching thought:', error);
    res.status(500).json({ error: 'Failed to fetch thought capture' });
  }
});

// ============================================
// Update/Delete Thought Captures
// ============================================

/**
 * PATCH /api/quick-capture/:id
 * Update a thought capture
 */
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const thoughtId = parseInt(req.params.id);
    const updates = req.body;

    const updated = await quickCapture.updateThoughtCapture(
      thoughtId,
      req.user.id,
      updates
    );

    if (!updated) {
      return res.status(404).json({ error: 'Thought capture not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating thought:', error);
    res.status(500).json({ error: 'Failed to update thought capture' });
  }
});

/**
 * DELETE /api/quick-capture/:id
 * Delete a thought capture
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const thoughtId = parseInt(req.params.id);
    const deleted = await quickCapture.deleteThoughtCapture(thoughtId, req.user.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Thought capture not found' });
    }

    res.json({ message: 'Thought capture deleted successfully' });
  } catch (error) {
    console.error('Error deleting thought:', error);
    res.status(500).json({ error: 'Failed to delete thought capture' });
  }
});

// ============================================
// Templates
// ============================================

/**
 * POST /api/quick-capture/templates
 * Create a quick capture template
 */
router.post('/templates', authenticateToken, async (req, res) => {
  try {
    const templateData = {
      userId: req.user.id,
      ...req.body
    };

    const template = await quickCapture.createTemplate(templateData);
    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * GET /api/quick-capture/templates
 * Get templates for current user
 */
router.get('/templates/list', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.query;
    const templates = await quickCapture.getTemplates(
      req.user.id,
      projectId ? parseInt(projectId) : null
    );

    res.json({ templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ============================================
// Statistics
// ============================================

/**
 * GET /api/quick-capture/stats
 * Get thought capture statistics
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.query;
    const stats = await quickCapture.getThoughtCaptureStats(
      req.user.id,
      projectId ? parseInt(projectId) : null
    );

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
