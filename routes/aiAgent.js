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

    // 4. Complete session with citations
    const completedSession = await aiAgentService.completeSession({
      sessionId: session.session_id,
      response: llmResult.response,
      confidenceScore: 0.85, // TODO: Calculate from LLM response
      pkgNodesUsed: context.pkgNodes.map(n => n.id),
      ragDocsUsed: context.ragDocuments.map(d => d.id),
      tokensUsed: llmResult.tokensUsed,
      latency: llmResult.latency,
      citations: llmResult.citations || []
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
 * GET /api/aipm/sessions/:sessionId/citations
 * Get citations for an AI session (ENHANCED with URL generation)
 */
router.get('/sessions/:sessionId/citations', async (req, res) => {
  const { sessionId } = req.params;
  const { pool } = require('../db');

  try {
    // FIXED: Get the integer ID from the UUID session_id, then fetch citations
    const sessionResult = await pool.query(`
      SELECT id FROM ai_agent_sessions WHERE session_id = $1
    `, [sessionId]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionIntId = sessionResult.rows[0].id;

    // FIXED: Query only PKG node citations (RAG not supported in evidence table due to UUID vs integer)
    const result = await pool.query(`
      SELECT
        'pkg_node' as citation_type,
        e.quote_text as source_ref,
        e.source_type,
        e.source_id,
        p.type as node_type,
        p.attrs
      FROM evidence e
      LEFT JOIN pkg_nodes p ON e.source_type = p.source_table 
        AND e.source_id = p.source_id
      WHERE e.entity_type = 'ai_session'
        AND e.entity_id = $1
    `, [sessionIntId]);

    // FIXED: URL generation with proper encoding and validation
    const citations = result.rows.map(row => {
      const baseInfo = {
        type: row.citation_type,
        sourceRef: row.source_ref
      };

      if (row.citation_type === 'pkg_node') {
        // SECURITY: Allowlist of valid node types and their URLs
        const urlMap = {
          'Decision': '/decisions.html',
          'Meeting': '/meetings.html',
          'Risk': '/risks.html',
          'Task': '/issues.html'
        };
        
        // SECURITY: Validate and encode source ID
        const safeSourceId = String(row.source_id || '').replace(/[^\w-]/g, '');
        const basePath = urlMap[row.node_type];
        
        if (!basePath) {
          console.warn(`Unknown PKG node type: ${row.node_type}`);
          return {
            ...baseInfo,
            nodeType: row.node_type,
            url: '#',
            tooltip: 'Unknown entity type'
          };
        }

        return {
          ...baseInfo,
          nodeType: row.node_type,
          sourceTable: row.source_type,
          sourceId: safeSourceId,
          title: row.attrs?.title || row.source_ref,
          url: `${basePath}?id=${encodeURIComponent(safeSourceId)}`,
          tooltip: `View ${row.node_type?.toLowerCase() || 'entity'}: ${(row.attrs?.title || row.source_ref || '').substring(0, 100)}`
        };
      } else {
        // SECURITY: Validate and encode RAG document ID
        const safeDocId = String(row.attrs?.id || '').replace(/[^\w-]/g, '');
        
        return {
          ...baseInfo,
          docId: safeDocId,
          sourceType: row.attrs?.source_type,
          title: row.attrs?.title || row.source_ref,
          url: `/documents.html?id=${encodeURIComponent(safeDocId)}`,
          tooltip: `View document: ${(row.attrs?.title || row.source_ref || '').substring(0, 100)}`
        };
      }
    });

    res.json({ citations });

  } catch (error) {
    console.error('Error fetching citations:', error);
    res.status(500).json({ error: 'Failed to fetch citations' });
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

/**
 * POST /api/aipm/agent/feedback
 * Submit user feedback on an AI agent response
 */
router.post('/agent/feedback', async (req, res) => {
  try {
    const { sessionId, feedbackType, projectId, feedbackText, feedbackTags } = req.body;
    const userId = req.user.id;

    if (!sessionId || !feedbackType) {
      return res.status(400).json({ error: 'Session ID and feedback type are required' });
    }

    if (!['positive', 'negative'].includes(feedbackType)) {
      return res.status(400).json({ error: 'Feedback type must be "positive" or "negative"' });
    }

    const feedback = await aiAgentService.submitFeedback({
      sessionId,
      projectId: parseInt(projectId),
      userId,
      feedbackType,
      feedbackText,
      feedbackTags
    });

    res.json({ success: true, feedback });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback', details: error.message });
  }
});

module.exports = router;
