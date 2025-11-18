const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const aiRiskDetector = require('../services/aiRiskDetector');
const aiAgentService = require('../services/aiAgent');

// Authentication middleware is applied in server.js when mounting this router

/**
 * POST /api/aipm/projects/:projectId/agent/scan-risks
 * Scan project for risks
 */
router.post('/projects/:projectId/agent/scan-risks', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { autoCreateHighConfidence = false } = req.body;
    const userId = req.user.id;

    // 1. Create AI session
    const session = await aiAgentService.createSession({
      projectId: parseInt(projectId),
      userId,
      agentType: 'risk_detector',
      userPrompt: 'Scan project for risks'
    });

    // 2. Scan for risks
    const scanResults = await aiRiskDetector.scanForRisks({
      projectId: parseInt(projectId),
      sessionId: session.session_id
    });

    // 3. Auto-create high-confidence risks if requested
    let autoCreated = [];
    if (autoCreateHighConfidence) {
      autoCreated = await aiRiskDetector.autoCreateHighConfidenceRisks({
        projectId: parseInt(projectId),
        detectedRisks: scanResults.risks
      });
    }

    // 4. Create proposals for remaining risks
    const proposals = [];
    for (const risk of scanResults.risks) {
      if (risk.confidence < 0.9) { // Don't propose if auto-created
        const proposal = await aiRiskDetector.proposeRisk({
          projectId: parseInt(projectId),
          userId,
          sessionId: session.session_id,
          detectedRisk: risk
        });
        proposals.push(proposal);
      }
    }

    // 5. Complete session
    await aiAgentService.completeSession({
      sessionId: session.session_id,
      response: `Detected ${scanResults.risks.length} risks, created ${autoCreated.length} automatically, proposed ${proposals.length} for review`,
      confidenceScore: 0.8,
      pkgNodesUsed: [],
      ragDocsUsed: [],
      tokensUsed: 0,
      latency: scanResults.metadata.executionTimeMs
    });

    res.json({
      sessionId: session.session_id,
      detected: scanResults.risks,
      metadata: scanResults.metadata,
      autoCreated: autoCreated.map(r => ({ id: r.id, title: r.title })),
      proposals: proposals.map(p => ({ proposalId: p.proposal_id, title: p.title }))
    });
  } catch (error) {
    console.error('Error scanning for risks:', error);
    res.status(500).json({ error: 'Failed to scan for risks', details: error.message });
  }
});

/**
 * GET /api/aipm/projects/:projectId/risks/ai-detected
 * Get AI-detected risks
 */
router.get('/projects/:projectId/risks/ai-detected', async (req, res) => {
  try {
    const { projectId } = req.params;

    const risks = await pool.query(`
      SELECT
        r.*,
        u.username as created_by_user
      FROM risks r
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.project_id = $1
        AND r.ai_detected = TRUE
      ORDER BY (r.probability * r.impact) DESC, r.created_at DESC
    `, [parseInt(projectId)]);

    res.json({ risks: risks.rows });
  } catch (error) {
    console.error('Error fetching AI-detected risks:', error);
    res.status(500).json({ error: 'Failed to fetch AI-detected risks' });
  }
});

/**
 * GET /api/aipm/projects/:projectId/agent/risk-summary
 * Get risk detection summary
 */
router.get('/projects/:projectId/agent/risk-summary', async (req, res) => {
  try {
    const { projectId } = req.params;

    const summary = await pool.query(`
      SELECT
        COUNT(*) as total_ai_risks,
        COUNT(*) FILTER (WHERE status = 'Open') as open_risks,
        COUNT(*) FILTER (WHERE probability * impact >= 12) as high_severity,
        COUNT(*) FILTER (WHERE probability * impact >= 6 AND probability * impact < 12) as medium_severity,
        COUNT(*) FILTER (WHERE probability * impact < 6) as low_severity,
        json_agg(
          json_build_object(
            'type', detection_source,
            'count', 1
          )
        ) FILTER (WHERE detection_source IS NOT NULL) as detection_breakdown
      FROM risks
      WHERE project_id = $1
        AND ai_detected = TRUE
    `, [parseInt(projectId)]);

    res.json({ summary: summary.rows[0] });
  } catch (error) {
    console.error('Error fetching risk summary:', error);
    res.status(500).json({ error: 'Failed to fetch risk summary' });
  }
});

module.exports = router;
