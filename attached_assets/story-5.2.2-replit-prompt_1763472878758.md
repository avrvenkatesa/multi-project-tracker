# Story 5.2.2: Autonomous Decision Making - Replit Implementation Guide

## 🎯 Objective
Build the AI agent's ability to autonomously propose decisions, analyze impacts, and implement Human-in-the-Loop (HITL) approval workflows.

---

## 📋 Prerequisites

Before starting, verify Story 5.2.1 is complete:
- ✅ `ai_agent_sessions` table exists
- ✅ `ai_agent_proposals` table exists
- ✅ AI agent service (`services/aiAgent.js`) working
- ✅ Basic chat endpoint functional

---

## 🏗️ Implementation Tasks

### **Task 1: Extend AI Agent Service with Decision Making**

**File: `services/aiDecisionMaker.js`**

```javascript
const { pool } = require('../db');
const aiAgentService = require('./aiAgent');

/**
 * AI Decision Maker Service
 * Autonomous decision proposal and impact analysis
 */

class AIDecisionMaker {
  /**
   * Analyze a proposed decision using PKG and RAG
   */
  async analyzeDecision({ projectId, decisionTitle, decisionDescription, sessionId }) {
    const startTime = Date.now();

    // 1. Search for related decisions in RAG
    const relatedDecisions = await pool.query(`
      SELECT
        r.id,
        r.source_type,
        r.source_id,
        r.content_text,
        r.metadata,
        ts_rank(r.content_vector, to_tsquery('english', $1)) as relevance
      FROM rag_documents r
      WHERE r.project_id = $2
        AND r.source_type = 'decision'
        AND r.content_vector @@ to_tsquery('english', $1)
      ORDER BY relevance DESC
      LIMIT 5
    `, [this.prepareSearchQuery(decisionTitle), projectId]);

    // 2. Find impacted PKG nodes via graph traversal
    const impactedNodes = await pool.query(`
      SELECT DISTINCT
        n.id,
        n.type,
        n.attrs,
        n.source_table,
        n.source_id
      FROM pkg_nodes n
      WHERE n.project_id = $1
        AND (
          n.attrs->>'status' = 'In Progress'
          OR n.attrs->>'status' = 'To Do'
          OR n.type IN ('Risk', 'Task')
        )
      LIMIT 20
    `, [projectId]);

    // 3. Identify risks related to this decision area
    const relatedRisks = await pool.query(`
      SELECT
        r.id,
        r.title,
        r.category,
        r.probability,
        r.impact,
        r.status
      FROM risks r
      WHERE r.project_id = $1
        AND (
          r.description ILIKE $2
          OR r.title ILIKE $2
        )
        AND r.status != 'Closed'
      ORDER BY (r.probability * r.impact) DESC
      LIMIT 5
    `, [projectId, `%${decisionTitle}%`]);

    // 4. Check for conflicting decisions
    const potentialConflicts = await pool.query(`
      SELECT
        d.id,
        d.decision_id,
        d.title,
        d.status,
        d.impact_level
      FROM decisions d
      WHERE d.project_id = $1
        AND d.status IN ('approved', 'implemented')
        AND (
          d.title ILIKE $2
          OR d.description ILIKE $2
        )
      ORDER BY d.decided_date DESC
      LIMIT 3
    `, [projectId, `%${decisionTitle}%`]);

    const executionTime = Date.now() - startTime;

    // Log analysis action
    if (sessionId) {
      await aiAgentService.logAction({
        sessionId,
        actionType: 'decision_analysis',
        actionDescription: 'Analyzed decision impact',
        inputData: { decisionTitle },
        outputData: {
          relatedDecisionsCount: relatedDecisions.rows.length,
          impactedNodesCount: impactedNodes.rows.length,
          relatedRisksCount: relatedRisks.rows.length,
          potentialConflictsCount: potentialConflicts.rows.length
        },
        executionTimeMs: executionTime
      });
    }

    return {
      relatedDecisions: relatedDecisions.rows,
      impactedNodes: impactedNodes.rows,
      relatedRisks: relatedRisks.rows,
      potentialConflicts: potentialConflicts.rows,
      analysisMetadata: {
        executionTimeMs: executionTime,
        totalEntitiesAnalyzed:
          relatedDecisions.rows.length +
          impactedNodes.rows.length +
          relatedRisks.rows.length +
          potentialConflicts.rows.length
      }
    };
  }

  /**
   * Generate decision alternatives using LLM
   */
  async generateAlternatives({ projectId, decisionTitle, decisionDescription, analysisContext, sessionId }) {
    // Build prompt for LLM
    const systemPrompt = `You are an expert architectural decision analyst.
Given a proposed decision and project context, generate 3 alternative approaches.

For each alternative, provide:
1. Clear description
2. Pros (3-5 points)
3. Cons (3-5 points)
4. Estimated complexity (Low/Medium/High)
5. Risk level (Low/Medium/High)

Format as JSON array.`;

    const contextText = this.buildAnalysisContextText(analysisContext);

    const userPrompt = `Decision: ${decisionTitle}

Description: ${decisionDescription}

${contextText}

Generate 3 alternative approaches to this decision.`;

    // Call LLM
    const llmResult = await aiAgentService.callLLM({
      sessionId,
      context: {
        ragDocuments: analysisContext.relatedDecisions,
        pkgNodes: analysisContext.impactedNodes,
        pkgEdges: []
      },
      userPrompt,
      agentType: 'decision_assistant'
    });

    // Parse LLM response (expect JSON)
    let alternatives = [];
    try {
      alternatives = JSON.parse(llmResult.response);
    } catch (error) {
      console.error('Failed to parse alternatives JSON:', error);
      // Fallback: extract from text
      alternatives = this.extractAlternativesFromText(llmResult.response);
    }

    return alternatives;
  }

  /**
   * Create a decision proposal (HITL workflow)
   */
  async createProposal({ sessionId, projectId, userId, decisionData, analysisResults, confidence }) {
    const proposalId = await this.generateProposalId();

    // Prepare proposed data
    const proposedData = {
      title: decisionData.title,
      description: decisionData.description,
      decision_type: decisionData.decision_type || 'technical',
      impact_level: decisionData.impact_level || 'medium',
      status: 'proposed',
      rationale: decisionData.rationale,
      alternatives_considered: decisionData.alternatives || [],
      impacted_entities: analysisResults.impactedNodes.map(n => ({
        type: n.type,
        id: n.source_id,
        table: n.source_table
      })),
      related_risks: analysisResults.relatedRisks.map(r => r.id),
      ai_analysis: {
        related_decisions: analysisResults.relatedDecisions.length,
        potential_conflicts: analysisResults.potentialConflicts.length,
        execution_time_ms: analysisResults.analysisMetadata.executionTimeMs
      }
    };

    const result = await pool.query(`
      INSERT INTO ai_agent_proposals (
        proposal_id,
        session_id,
        project_id,
        proposal_type,
        title,
        description,
        rationale,
        confidence_score,
        proposed_data,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      proposalId,
      sessionId,
      projectId,
      'decision',
      decisionData.title,
      decisionData.description,
      decisionData.rationale,
      confidence,
      JSON.stringify(proposedData),
      'pending_review'
    ]);

    // Log proposal creation
    await aiAgentService.logAction({
      sessionId,
      actionType: 'proposal_created',
      actionDescription: `Created decision proposal ${proposalId}`,
      inputData: { title: decisionData.title },
      outputData: { proposalId, confidence },
      executionTimeMs: 0
    });

    return result.rows[0];
  }

  /**
   * Approve a proposal and create the actual entity
   */
  async approveProposal({ proposalId, userId, reviewNotes, modifications }) {
    const proposal = await this.getProposal(proposalId);

    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    if (proposal.status !== 'pending_review') {
      throw new Error(`Proposal ${proposalId} is not pending review (status: ${proposal.status})`);
    }

    // Merge modifications with proposed data
    const finalData = modifications
      ? { ...proposal.proposed_data, ...modifications }
      : proposal.proposed_data;

    let createdEntityId;
    let createdEntityType = proposal.proposal_type;

    // Create the actual entity based on proposal type
    if (proposal.proposal_type === 'decision') {
      const decision = await pool.query(`
        INSERT INTO decisions (
          project_id,
          title,
          description,
          decision_type,
          impact_level,
          status,
          rationale,
          alternatives_considered,
          created_by,
          created_by_ai,
          ai_confidence
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)
        RETURNING id
      `, [
        proposal.project_id,
        finalData.title,
        finalData.description,
        finalData.decision_type,
        finalData.impact_level,
        'approved',
        finalData.rationale,
        JSON.stringify(finalData.alternatives_considered || []),
        userId,
        proposal.confidence_score
      ]);

      createdEntityId = decision.rows[0].id;
    } else if (proposal.proposal_type === 'risk') {
      const risk = await pool.query(`
        INSERT INTO risks (
          project_id,
          title,
          description,
          category,
          probability,
          impact,
          status,
          created_by,
          ai_detected,
          ai_confidence
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
        RETURNING id
      `, [
        proposal.project_id,
        finalData.title,
        finalData.description,
        finalData.category || 'technical',
        finalData.probability || 3,
        finalData.impact || 3,
        'Open',
        userId,
        proposal.confidence_score
      ]);

      createdEntityId = risk.rows[0].id;
    } else if (proposal.proposal_type === 'action_item') {
      const action = await pool.query(`
        INSERT INTO action_items (
          project_id,
          title,
          description,
          priority,
          status,
          assigned_to,
          created_by,
          ai_generated,
          ai_confidence
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
        RETURNING id
      `, [
        proposal.project_id,
        finalData.title,
        finalData.description,
        finalData.priority || 'Medium',
        'To Do',
        finalData.assigned_to || null,
        userId,
        proposal.confidence_score
      ]);

      createdEntityId = action.rows[0].id;
    }

    // Update proposal status
    const updatedProposal = await pool.query(`
      UPDATE ai_agent_proposals
      SET
        status = $1,
        reviewed_by = $2,
        review_notes = $3,
        reviewed_at = NOW(),
        modifications = $4,
        created_entity_type = $5,
        created_entity_id = $6,
        updated_at = NOW()
      WHERE proposal_id = $7
      RETURNING *
    `, [
      modifications ? 'modified' : 'approved',
      userId,
      reviewNotes,
      modifications ? JSON.stringify(modifications) : null,
      createdEntityType,
      createdEntityId,
      proposalId
    ]);

    return {
      proposal: updatedProposal.rows[0],
      createdEntity: {
        type: createdEntityType,
        id: createdEntityId
      }
    };
  }

  /**
   * Reject a proposal
   */
  async rejectProposal({ proposalId, userId, reviewNotes }) {
    const result = await pool.query(`
      UPDATE ai_agent_proposals
      SET
        status = 'rejected',
        reviewed_by = $1,
        review_notes = $2,
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE proposal_id = $3
      RETURNING *
    `, [userId, reviewNotes, proposalId]);

    if (result.rows.length === 0) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    return result.rows[0];
  }

  /**
   * Get proposal by ID
   */
  async getProposal(proposalId) {
    const result = await pool.query(
      'SELECT * FROM ai_agent_proposals WHERE proposal_id = $1',
      [proposalId]
    );
    return result.rows[0];
  }

  /**
   * Get pending proposals for project
   */
  async getPendingProposals(projectId) {
    const result = await pool.query(`
      SELECT
        p.*,
        u.username as proposed_by_user,
        s.agent_type,
        s.user_prompt
      FROM ai_agent_proposals p
      LEFT JOIN ai_agent_sessions s ON p.session_id = s.session_id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE p.project_id = $1
        AND p.status = 'pending_review'
      ORDER BY p.confidence_score DESC, p.created_at DESC
    `, [projectId]);

    return result.rows;
  }

  /**
   * Get all proposals for project (with filters)
   */
  async getProposals({ projectId, status, proposalType, limit = 50 }) {
    let query = `
      SELECT
        p.*,
        u.username as proposed_by_user,
        r.username as reviewed_by_user,
        s.agent_type
      FROM ai_agent_proposals p
      LEFT JOIN ai_agent_sessions s ON p.session_id = s.session_id
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN users r ON p.reviewed_by = r.id
      WHERE p.project_id = $1
    `;

    const params = [projectId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND p.status = $${paramCount}`;
      params.push(status);
    }

    if (proposalType) {
      paramCount++;
      query += ` AND p.proposal_type = $${paramCount}`;
      params.push(proposalType);
    }

    paramCount++;
    query += ` ORDER BY p.created_at DESC LIMIT $${paramCount}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Auto-approve proposals with high confidence
   */
  async autoApproveHighConfidence({ projectId, confidenceThreshold = 0.95 }) {
    const proposals = await pool.query(`
      SELECT * FROM ai_agent_proposals
      WHERE project_id = $1
        AND status = 'pending_review'
        AND confidence_score >= $2
    `, [projectId, confidenceThreshold]);

    const approved = [];

    for (const proposal of proposals.rows) {
      try {
        const result = await this.approveProposal({
          proposalId: proposal.proposal_id,
          userId: 1, // System user
          reviewNotes: `Auto-approved (confidence: ${proposal.confidence_score})`,
          modifications: null
        });

        // Update status to auto_approved
        await pool.query(`
          UPDATE ai_agent_proposals
          SET status = 'auto_approved'
          WHERE proposal_id = $1
        `, [proposal.proposal_id]);

        approved.push(result);
      } catch (error) {
        console.error(`Failed to auto-approve ${proposal.proposal_id}:`, error);
      }
    }

    return approved;
  }

  // Helper methods
  prepareSearchQuery(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .join(' | ');
  }

  buildAnalysisContextText(analysisContext) {
    let text = '## Analysis Context\n\n';

    if (analysisContext.relatedDecisions.length > 0) {
      text += '### Related Decisions:\n';
      analysisContext.relatedDecisions.forEach(d => {
        text += `- ${d.metadata.title}\n`;
      });
      text += '\n';
    }

    if (analysisContext.relatedRisks.length > 0) {
      text += '### Related Risks:\n';
      analysisContext.relatedRisks.forEach(r => {
        text += `- ${r.title} (Severity: ${r.probability * r.impact})\n`;
      });
      text += '\n';
    }

    if (analysisContext.potentialConflicts.length > 0) {
      text += '### Potential Conflicts:\n';
      analysisContext.potentialConflicts.forEach(c => {
        text += `- ${c.title} (${c.status})\n`;
      });
      text += '\n';
    }

    return text;
  }

  extractAlternativesFromText(text) {
    // Fallback parser for non-JSON LLM responses
    return [
      {
        description: 'Alternative 1: ' + text.substring(0, 200),
        pros: ['Extracted from LLM response'],
        cons: ['Manual parsing required'],
        complexity: 'Medium',
        riskLevel: 'Medium'
      }
    ];
  }

  async generateProposalId() {
    const result = await pool.query(`SELECT generate_proposal_id()`);
    return result.rows[0].generate_proposal_id;
  }
}

module.exports = new AIDecisionMaker();
```

---

### **Task 2: Create Decision Making API Routes**

**File: `routes/aiDecisionMaker.js`**

```javascript
const express = require('express');
const router = express.Router();
const aiDecisionMaker = require('../services/aiDecisionMaker');
const aiAgentService = require('../services/aiAgent');
const { authenticateToken } = require('../middleware/auth');

/**
 * POST /api/aipm/projects/:projectId/agent/propose-decision
 * AI proposes a decision with impact analysis
 */
router.post('/projects/:projectId/agent/propose-decision', authenticateToken, async (req, res) => {
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
router.get('/projects/:projectId/agent/proposals', authenticateToken, async (req, res) => {
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
router.get('/agent/proposals/:proposalId', authenticateToken, async (req, res) => {
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
router.post('/agent/proposals/:proposalId/approve', authenticateToken, async (req, res) => {
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
router.post('/agent/proposals/:proposalId/reject', authenticateToken, async (req, res) => {
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
router.get('/projects/:projectId/agent/pending-reviews', authenticateToken, async (req, res) => {
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
```

---

### **Task 3: Register Routes in Server**

**File: `server.js`**

```javascript
const aiDecisionMakerRoutes = require('./routes/aiDecisionMaker');

// ... existing routes ...

app.use('/api/aipm', aiDecisionMakerRoutes);
```

---

### **Task 4: Create Proposal Review UI Component (Optional)**

**File: `public/js/components/ProposalReviewPanel.js`**

```javascript
class ProposalReviewPanel {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentProjectId = null;
  }

  async loadPendingProposals(projectId) {
    this.currentProjectId = projectId;

    const response = await fetch(`/api/aipm/projects/${projectId}/agent/pending-reviews`);
    const data = await response.json();

    this.render(data.proposals);
  }

  render(proposals) {
    if (proposals.length === 0) {
      this.container.innerHTML = '<p>No pending proposals</p>';
      return;
    }

    const html = proposals.map(proposal => `
      <div class="proposal-card" data-proposal-id="${proposal.proposal_id}">
        <div class="proposal-header">
          <h3>${proposal.title}</h3>
          <span class="confidence-badge">${(proposal.confidence_score * 100).toFixed(0)}% confidence</span>
        </div>
        <p>${proposal.description}</p>
        <div class="proposal-meta">
          <span>Type: ${proposal.proposal_type}</span>
          <span>Proposed by: ${proposal.proposed_by_user}</span>
          <span>Date: ${new Date(proposal.created_at).toLocaleDateString()}</span>
        </div>
        <div class="proposal-actions">
          <button onclick="proposalPanel.approve('${proposal.proposal_id}')">✓ Approve</button>
          <button onclick="proposalPanel.reject('${proposal.proposal_id}')">✗ Reject</button>
          <button onclick="proposalPanel.viewDetails('${proposal.proposal_id}')">View Details</button>
        </div>
      </div>
    `).join('');

    this.container.innerHTML = html;
  }

  async approve(proposalId) {
    const reviewNotes = prompt('Review notes (optional):');

    const response = await fetch(`/api/aipm/agent/proposals/${proposalId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewNotes })
    });

    if (response.ok) {
      alert('Proposal approved!');
      this.loadPendingProposals(this.currentProjectId);
    } else {
      alert('Failed to approve proposal');
    }
  }

  async reject(proposalId) {
    const reviewNotes = prompt('Reason for rejection:');
    if (!reviewNotes) return;

    const response = await fetch(`/api/aipm/agent/proposals/${proposalId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewNotes })
    });

    if (response.ok) {
      alert('Proposal rejected');
      this.loadPendingProposals(this.currentProjectId);
    } else {
      alert('Failed to reject proposal');
    }
  }

  async viewDetails(proposalId) {
    const response = await fetch(`/api/aipm/agent/proposals/${proposalId}`);
    const data = await response.json();

    // Show modal with full details
    console.log('Proposal details:', data.proposal);
    // TODO: Render modal
  }
}

// Global instance
const proposalPanel = new ProposalReviewPanel('proposal-review-container');
```

---

## ✅ Acceptance Criteria

**API Endpoints:**
- [ ] `POST /api/aipm/projects/:id/agent/propose-decision` - AI proposes decision
- [ ] `GET /api/aipm/projects/:id/agent/proposals` - Get proposals
- [ ] `GET /api/aipm/agent/proposals/:id` - Get proposal details
- [ ] `POST /api/aipm/agent/proposals/:id/approve` - Approve proposal
- [ ] `POST /api/aipm/agent/proposals/:id/reject` - Reject proposal
- [ ] `GET /api/aipm/projects/:id/agent/pending-reviews` - Get pending reviews

**Functionality:**
- [ ] AI analyzes decision impact using PKG + RAG
- [ ] AI generates alternative approaches
- [ ] Proposals created with confidence scores
- [ ] HITL approval workflow functional
- [ ] Approved proposals create actual entities
- [ ] Rejected proposals tracked
- [ ] Modified proposals supported
- [ ] Auto-approval for high confidence (>0.95)

**Data Integrity:**
- [ ] Proposals link to sessions
- [ ] Created entities track AI provenance
- [ ] Audit log captures all actions
- [ ] Proposal status transitions valid

---

## 🧪 Testing

```bash
# 1. Propose a decision
curl -X POST http://localhost:3000/api/aipm/projects/1/agent/propose-decision \
  -H "Cookie: token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Migrate to microservices architecture",
    "description": "Proposal to break monolith into microservices",
    "decision_type": "architectural",
    "impact_level": "high",
    "rationale": "Improve scalability and maintainability"
  }'

# 2. Get pending proposals
curl http://localhost:3000/api/aipm/projects/1/agent/pending-reviews \
  -H "Cookie: token=$TOKEN"

# 3. Approve a proposal
curl -X POST http://localhost:3000/api/aipm/agent/proposals/PROP-00001/approve \
  -H "Cookie: token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reviewNotes": "Looks good, approved"}'
```

---

## 🚀 Next Steps

After Story 5.2.2 is complete, proceed to **Story 5.2.3**: Proactive Risk Detection

---

**Questions?** Start implementing the decision maker service and API routes!
