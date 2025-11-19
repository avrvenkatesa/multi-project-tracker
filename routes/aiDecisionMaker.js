const express = require('express');
const router = express.Router();
const aiDecisionMaker = require('../services/aiDecisionMaker');
const aiAgentService = require('../services/aiAgent');

/**
 * POST /api/aipm/projects/:projectId/agent/propose-decision
 * AI proposes a decision with impact analysis
 */
router.post('/projects/:projectId/agent/propose-decision', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { title, description, decision_type, impact_level, rationale } = req.body;
    const userId = req.user.id;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    // 1. Create AI session
    const session = await aiAgentService.createSession({
      projectId: parseInt(projectId),
      userId,
      agentType: 'decision_assistant',
      userPrompt: `Propose decision: ${title}`
    });

    // 2. Analyze decision impact
    const analysisResults = await aiDecisionMaker.analyzeDecision({
      projectId: parseInt(projectId),
      decisionTitle: title,
      decisionDescription: description,
      sessionId: session.session_id
    });

    // 3. Generate alternatives
    const alternatives = await aiDecisionMaker.generateAlternatives({
      projectId: parseInt(projectId),
      decisionTitle: title,
      decisionDescription: description,
      analysisContext: analysisResults,
      sessionId: session.session_id
    });

    // 4. Calculate confidence score
    const confidence = calculateConfidence(analysisResults);

    // 5. Create proposal
    const proposal = await aiDecisionMaker.createProposal({
      sessionId: session.session_id,
      projectId: parseInt(projectId),
      userId,
      decisionData: {
        title,
        description,
        decision_type,
        impact_level,
        rationale,
        alternatives
      },
      analysisResults,
      confidence
    });

    // 6. Complete session
    await aiAgentService.completeSession({
      sessionId: session.session_id,
      response: `Created decision proposal ${proposal.proposal_id}`,
      confidenceScore: confidence,
      pkgNodesUsed: analysisResults.impactedNodes.map(n => n.id),
      ragDocsUsed: analysisResults.relatedDecisions.map(d => d.id),
      tokensUsed: 0,
      latency: analysisResults.analysisMetadata.executionTimeMs
    });

    res.json({
      proposal: {
        proposalId: proposal.proposal_id,
        title: proposal.title,
        status: proposal.status,
        confidence: proposal.confidence_score,
        createdAt: proposal.created_at
      },
      analysis: {
        relatedDecisions: analysisResults.relatedDecisions.length,
        impactedNodes: analysisResults.impactedNodes.length,
        relatedRisks: analysisResults.relatedRisks.length,
        potentialConflicts: analysisResults.potentialConflicts.length
      },
      alternatives: alternatives,
      sessionId: session.session_id
    });
  } catch (error) {
    console.error('Error proposing decision:', error);
    res.status(500).json({ error: 'Failed to propose decision', details: error.message });
  }
});

/**
 * GET /api/aipm/projects/:projectId/agent/proposals
 * Get AI proposals for project
 */
router.get('/projects/:projectId/agent/proposals', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { status, type, limit } = req.query;

    const proposals = await aiDecisionMaker.getProposals({
      projectId: parseInt(projectId),
      status,
      proposalType: type,
      limit: parseInt(limit) || 50
    });

    res.json({ proposals });
  } catch (error) {
    console.error('Error fetching proposals:', error);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

/**
 * GET /api/aipm/agent/proposals/:proposalId
 * Get specific proposal details
 */
router.get('/agent/proposals/:proposalId', async (req, res) => {
  try {
    const { proposalId } = req.params;

    const proposal = await aiDecisionMaker.getProposal(proposalId);

    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    res.json({ proposal });
  } catch (error) {
    console.error('Error fetching proposal:', error);
    res.status(500).json({ error: 'Failed to fetch proposal' });
  }
});

/**
 * POST /api/aipm/agent/proposals/:proposalId/approve
 * Approve a proposal (HITL)
 */
router.post('/agent/proposals/:proposalId/approve', async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { reviewNotes, modifications } = req.body;
    const userId = req.user.id;

    const result = await aiDecisionMaker.approveProposal({
      proposalId,
      userId,
      reviewNotes,
      modifications
    });

    res.json({
      proposal: result.proposal,
      createdEntity: result.createdEntity,
      message: 'Proposal approved and entity created'
    });
  } catch (error) {
    console.error('Error approving proposal:', error);
    res.status(500).json({ error: 'Failed to approve proposal', details: error.message });
  }
});

/**
 * POST /api/aipm/agent/proposals/:proposalId/reject
 * Reject a proposal (HITL)
 */
router.post('/agent/proposals/:proposalId/reject', async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { reviewNotes } = req.body;
    const userId = req.user.id;

    const proposal = await aiDecisionMaker.rejectProposal({
      proposalId,
      userId,
      reviewNotes
    });

    res.json({
      proposal,
      message: 'Proposal rejected'
    });
  } catch (error) {
    console.error('Error rejecting proposal:', error);
    res.status(500).json({ error: 'Failed to reject proposal', details: error.message });
  }
});

/**
 * GET /api/aipm/projects/:projectId/agent/pending-reviews
 * Get proposals awaiting review
 */
router.get('/projects/:projectId/agent/pending-reviews', async (req, res) => {
  try {
    const { projectId } = req.params;

    const proposals = await aiDecisionMaker.getPendingProposals(parseInt(projectId));

    res.json({ proposals, count: proposals.length });
  } catch (error) {
    console.error('Error fetching pending reviews:', error);
    res.status(500).json({ error: 'Failed to fetch pending reviews' });
  }
});

// Helper function
function calculateConfidence(analysisResults) {
  let confidence = 0.7; // Base confidence

  // Increase confidence if we have related context
  if (analysisResults.relatedDecisions.length > 0) confidence += 0.1;
  if (analysisResults.relatedRisks.length === 0) confidence += 0.05; // No risks is good
  if (analysisResults.potentialConflicts.length === 0) confidence += 0.1; // No conflicts is good

  return Math.min(confidence, 0.99); // Cap at 0.99
}

module.exports = router;
