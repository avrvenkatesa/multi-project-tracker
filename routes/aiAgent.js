const express = require('express');
const router = express.Router();
const aiAgentService = require('../services/aiAgent');

/**
 * POST /api/aipm/projects/:projectId/agent/chat
 * Send a message to the AI agent
 */
router.post('/projects/:projectId/agent/chat', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { prompt, agentType = 'knowledge_explorer' } = req.body;
    const userId = req.user.id;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // 1. Create session
    const session = await aiAgentService.createSession({
      projectId: parseInt(projectId),
      userId,
      agentType,
      userPrompt: prompt
    });

    // 2. Assemble context
    const context = await aiAgentService.assembleContext({
      projectId: parseInt(projectId),
      userPrompt: prompt,
      agentType
    });

    // Log context assembly
    await aiAgentService.logAction({
      sessionId: session.session_id,
      actionType: 'context_assembly',
      actionDescription: 'Assembled PKG + RAG context',
      inputData: { prompt },
      outputData: context.metadata,
      executionTimeMs: context.metadata.executionTimeMs
    });

    // 3. Call LLM
    const llmResult = await aiAgentService.callLLM({
      sessionId: session.session_id,
      context,
      userPrompt: prompt,
      agentType
    });

    // 4. Complete session
    const completedSession = await aiAgentService.completeSession({
      sessionId: session.session_id,
      response: llmResult.response,
      confidenceScore: 0.85, // TODO: Calculate from LLM response
      pkgNodesUsed: context.pkgNodes.map(n => n.id),
      ragDocsUsed: context.ragDocuments.map(d => d.id),
      tokensUsed: llmResult.tokensUsed,
      latency: llmResult.latency
    });

    res.json({
      sessionId: session.session_id,
      response: llmResult.response,
      confidence: 0.85,
      context: {
        pkgNodesUsed: context.pkgNodes.length,
        ragDocsUsed: context.ragDocuments.length
      },
      metadata: {
        tokensUsed: llmResult.tokensUsed,
        latencyMs: llmResult.latency,
        model: session.model_used
      }
    });
  } catch (error) {
    console.error('AI agent chat error:', error);
    res.status(500).json({ error: 'Failed to process AI agent request', details: error.message });
  }
});

/**
 * GET /api/aipm/projects/:projectId/agent/sessions
 * Get AI agent session history
 */
router.get('/projects/:projectId/agent/sessions', async (req, res) => {
  try {
    const { projectId } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const sessions = await aiAgentService.getSessionHistory(parseInt(projectId), limit);

    res.json({ sessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch session history' });
  }
});

/**
 * GET /api/aipm/agent/sessions/:sessionId
 * Get details of a specific session
 */
router.get('/agent/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await aiAgentService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const auditLog = await aiAgentService.getAuditLog(sessionId);

    res.json({
      session,
      auditLog
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session details' });
  }
});

/**
 * GET /api/aipm/agent/health
 * Health check for AI agent service
 */
router.get('/agent/health', async (req, res) => {
  try {
    const hasApiKey = !!aiAgentService.apiKey;

    res.json({
      status: hasApiKey ? 'operational' : 'no_api_key',
      model: aiAgentService.defaultModel,
      apiKeyConfigured: hasApiKey
    });
  } catch (error) {
    res.status(500).json({ error: 'Health check failed' });
  }
});

module.exports = router;
