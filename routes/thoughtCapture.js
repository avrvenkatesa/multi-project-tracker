const express = require('express');
const router = express.Router();
const thoughtCaptureService = require('../services/thoughtCapture');
const { authenticateToken, checkProjectAccess } = require('../middleware/auth');

router.post('/projects/:projectId', authenticateToken, checkProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      contentType,
      textContent,
      audioUrl,
      fileUrl,
      transcript,
      thoughtType,
      tags,
      captureSource,
      deviceInfo
    } = req.body;

    const thought = await thoughtCaptureService.createThought({
      projectId: parseInt(projectId),
      userId: req.user.userId,
      contentType,
      textContent,
      audioUrl,
      fileUrl,
      transcript,
      thoughtType,
      tags,
      captureSource,
      deviceInfo
    });

    res.status(201).json({ thought });
  } catch (error) {
    console.error('Error creating thought:', error);
    res.status(400).json({ error: error.message });
  }
});

router.get('/projects/:projectId', authenticateToken, checkProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userId, thoughtType, analyzed, limit } = req.query;

    const filters = {};
    if (userId) filters.userId = parseInt(userId);
    if (thoughtType) filters.thoughtType = thoughtType;
    if (analyzed !== undefined) filters.analyzed = analyzed === 'true';
    if (limit) filters.limit = parseInt(limit);

    const thoughts = await thoughtCaptureService.getThoughtsByProject(parseInt(projectId), filters);
    res.json({ thoughts });
  } catch (error) {
    console.error('Error fetching thoughts:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:thoughtId', authenticateToken, async (req, res) => {
  try {
    const { thoughtId } = req.params;
    const thought = await thoughtCaptureService.getThoughtById(parseInt(thoughtId));
    res.json({ thought });
  } catch (error) {
    console.error('Error fetching thought:', error);
    res.status(404).json({ error: error.message });
  }
});

router.post('/:thoughtId/analyze', authenticateToken, async (req, res) => {
  try {
    const { thoughtId } = req.params;
    const result = await thoughtCaptureService.analyzeThought(parseInt(thoughtId), req.user.userId);
    res.json(result);
  } catch (error) {
    console.error('Error analyzing thought:', error);
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:thoughtId', authenticateToken, async (req, res) => {
  try {
    const { thoughtId } = req.params;
    await thoughtCaptureService.deleteThought(parseInt(thoughtId), req.user.userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting thought:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
