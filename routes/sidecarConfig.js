const express = require('express');
const router = express.Router();
const sidecarConfigService = require('../services/sidecarConfig');
const { authenticateToken, checkProjectAccess } = require('../middleware/auth');

router.get('/projects/:projectId', authenticateToken, checkProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const config = await sidecarConfigService.getConfig(parseInt(projectId));
    res.json({ config });
  } catch (error) {
    console.error('Error fetching sidecar config:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/projects/:projectId', authenticateToken, checkProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const updates = req.body;

    const validation = sidecarConfigService.validateConfig(updates);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
    }

    const config = await sidecarConfigService.updateConfig(parseInt(projectId), updates);
    res.json({ config });
  } catch (error) {
    console.error('Error updating sidecar config:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/projects/:projectId/test-connection', authenticateToken, checkProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { connectionType } = req.body;

    if (!connectionType) {
      return res.status(400).json({ error: 'connectionType is required' });
    }

    const result = await sidecarConfigService.testConnection(parseInt(projectId), connectionType);
    res.json(result);
  } catch (error) {
    console.error('Error testing connection:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
