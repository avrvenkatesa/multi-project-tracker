const express = require('express');
const router = express.Router();
const aiAgentStreaming = require('../services/aiAgentStreaming');

/**
 * GET /api/aipm/projects/:projectId/agent/chat/stream
 * Stream AI agent response in real-time (Server-Sent Events)
 */
router.get('/projects/:projectId/agent/chat/stream', async (req, res) => {
  const { projectId } = req.params;
  const { prompt, agentType = 'knowledge_explorer' } = req.query;
  const userId = req.user.id;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Stream response
  await aiAgentStreaming.streamChatResponse({
    projectId: parseInt(projectId),
    userId,
    prompt,
    agentType,
    responseStream: res
  });
});

module.exports = router;
