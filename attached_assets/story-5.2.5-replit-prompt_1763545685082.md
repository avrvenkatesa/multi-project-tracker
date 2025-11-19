# Story 5.2.5: AI Agent Integration with PKG/RAG - Complete Implementation Guide

## 🎯 Objective

Enhance existing AI agents (from Story 5.2) to leverage the PKG (Project Knowledge Graph) and RAG (Retrieval-Augmented Generation) infrastructure built in Story 5.1. This integration makes AI agents more intelligent, contextual, and capable of providing grounded responses with citations.

---

## 📋 Prerequisites

Before starting, verify the following are complete:
- ✅ Story 5.1.1-5.1.4: AIPM Foundation (decisions, meetings, evidence, pkg_nodes, pkg_edges, rag_documents)
- ✅ Story 5.2.1-5.2.4: AI Agent Implementation (aiAgent, aiDecisionMaker, aiRiskDetector, streaming)

---

## 🏗️ Implementation Tasks

---

## **Sub-Story 5.2.5.1: Refactor AI Agent Context Assembly to Use PKG** (2-3 hours)

### Current State (Story 5.2.1)

The `aiAgent.js` service currently queries raw tables directly:

```javascript
// OLD: Query raw tables
const tasks = await pool.query('SELECT * FROM issues WHERE project_id = $1', [projectId]);
const risks = await pool.query('SELECT * FROM risks WHERE project_id = $1', [projectId]);
const decisions = await pool.query('SELECT * FROM decisions WHERE project_id = $1', [projectId]);
```

### New State (Story 5.2.5.1)

Query the unified PKG abstraction layer:

```javascript
// NEW: Query PKG unified graph
const pkgNodes = await pool.query(`
  SELECT * FROM pkg_nodes
  WHERE project_id = $1
    AND type IN ('Task', 'Risk', 'Decision', 'Meeting')
  ORDER BY created_at DESC
`, [projectId]);
```

---

### **File: `services/aiAgent.js`**

**Update the `assembleContext` method:**

```javascript
/**
 * Assemble context for AI agent using PKG + RAG
 * ENHANCED: Now queries PKG instead of raw tables
 */
async assembleContext({ projectId, userPrompt, agentType }) {
  const startTime = Date.now();

  try {
    // 1. RAG Search - Find relevant documents (EXISTING - keep as-is)
    const ragResults = await this.performRAGSearch(projectId, userPrompt);

    // 2. PKG Query - Get relevant nodes (NEW - replaces raw table queries)
    const pkgResults = await this.queryPKG(projectId, userPrompt, agentType);

    // 3. PKG Edges - Get relationships between entities (NEW)
    const pkgEdges = await this.queryPKGEdges(projectId, pkgResults.nodeIds);

    // 4. Assemble unified context
    const context = {
      ragDocuments: ragResults.documents,
      pkgNodes: pkgResults.nodes,
      pkgEdges: pkgEdges,
      metadata: {
        ragDocCount: ragResults.documents.length,
        pkgNodeCount: pkgResults.nodes.length,
        pkgEdgeCount: pkgEdges.length,
        assemblyTimeMs: Date.now() - startTime
      }
    };

    return context;

  } catch (error) {
    console.error('Context assembly error:', error);
    throw error;
  }
}

/**
 * Query PKG for relevant nodes based on agent type and user prompt
 */
async queryPKG(projectId, userPrompt, agentType) {
  // Agent-specific PKG queries
  const typeFilters = {
    'knowledge_explorer': ['Task', 'Risk', 'Decision', 'Meeting'],
    'decision_assistant': ['Decision', 'Risk', 'Task'],
    'risk_detector': ['Risk', 'Task', 'Decision'],
    'meeting_analyzer': ['Meeting', 'Decision', 'Task']
  };

  const relevantTypes = typeFilters[agentType] || ['Task', 'Risk', 'Decision'];

  // Query PKG nodes with type filtering
  const result = await pool.query(`
    SELECT
      id,
      type,
      attrs,
      source_table,
      source_id,
      created_by_ai,
      ai_confidence,
      created_at
    FROM pkg_nodes
    WHERE project_id = $1
      AND type = ANY($2)
    ORDER BY
      CASE
        WHEN created_by_ai THEN 1
        ELSE 0
      END DESC,
      created_at DESC
    LIMIT 50
  `, [projectId, relevantTypes]);

  return {
    nodes: result.rows,
    nodeIds: result.rows.map(n => n.id)
  };
}

/**
 * Query PKG edges for relationships between entities
 */
async queryPKGEdges(projectId, nodeIds) {
  if (nodeIds.length === 0) return [];

  const result = await pool.query(`
    SELECT
      id,
      type,
      from_node_id,
      to_node_id,
      attrs,
      confidence,
      evidence_quote
    FROM pkg_edges
    WHERE project_id = $1
      AND (from_node_id = ANY($2) OR to_node_id = ANY($2))
  `, [projectId, nodeIds]);

  return result.rows;
}

/**
 * Build context text for LLM prompt (ENHANCED with PKG structure)
 */
buildContextText(context) {
  let contextText = '# Project Context\n\n';

  // 1. PKG Nodes (grouped by type)
  const nodesByType = {};
  context.pkgNodes.forEach(node => {
    if (!nodesByType[node.type]) {
      nodesByType[node.type] = [];
    }
    nodesByType[node.type].push(node);
  });

  Object.keys(nodesByType).forEach(type => {
    contextText += `## ${type}s\n\n`;
    nodesByType[type].forEach(node => {
      contextText += `- **${node.attrs.title || node.attrs.risk_id || node.attrs.decision_id}**\n`;
      if (node.attrs.description) {
        contextText += `  ${node.attrs.description.substring(0, 200)}...\n`;
      }
      if (node.attrs.status) {
        contextText += `  Status: ${node.attrs.status}\n`;
      }
      if (node.created_by_ai) {
        contextText += `  (AI-detected, confidence: ${node.ai_confidence})\n`;
      }
      contextText += '\n';
    });
  });

  // 2. PKG Relationships
  if (context.pkgEdges && context.pkgEdges.length > 0) {
    contextText += '## Relationships\n\n';
    context.pkgEdges.forEach(edge => {
      contextText += `- ${edge.type}: ${edge.from_node_id} → ${edge.to_node_id}\n`;
      if (edge.evidence_quote) {
        contextText += `  Evidence: "${edge.evidence_quote}"\n`;
      }
    });
    contextText += '\n';
  }

  // 3. RAG Documents (relevant excerpts)
  if (context.ragDocuments && context.ragDocuments.length > 0) {
    contextText += '## Relevant Documents\n\n';
    context.ragDocuments.forEach(doc => {
      contextText += `### ${doc.title}\n`;
      contextText += `Source: ${doc.source_type}\n`;
      contextText += `${doc.snippet || doc.content.substring(0, 300)}...\n\n`;
    });
  }

  return contextText;
}
```

---

### **Update API Route: `routes/aiAgent.js`**

No changes needed - the API remains the same, but now uses PKG internally.

---

### **Testing Changes:**

```bash
# Test context assembly with PKG
curl -X POST http://localhost:3000/api/aipm/projects/1/agent/chat \
  -H "Cookie: token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What are the high-priority tasks?",
    "agentType": "knowledge_explorer"
  }'

# Verify response includes PKG nodes and edges
```

**Expected Response:**
```json
{
  "sessionId": "uuid",
  "response": "Based on the project knowledge graph, here are the high-priority tasks: ...",
  "confidence": 0.85,
  "context": {
    "pkgNodesUsed": 15,
    "ragDocsUsed": 8,
    "pkgEdgesUsed": 6
  }
}
```

---

## **Sub-Story 5.2.5.2: Integrate RAG Search for Grounded Responses** (2-3 hours)

### **File: `services/aiAgent.js`**

**Add enhanced RAG search method:**

```javascript
/**
 * Perform RAG search with full-text search and ranking
 * ENHANCED: Uses rag_documents table from Story 5.1.3
 */
async performRAGSearch(projectId, userPrompt, limit = 10) {
  // Prepare search query (extract keywords)
  const searchQuery = this.prepareSearchQuery(userPrompt);

  const result = await pool.query(`
    SELECT
      id,
      title,
      source_type,
      source_id,
      ts_headline('english', content, plainto_tsquery('english', $1),
        'MaxWords=50, MinWords=25, HighlightAll=false') as snippet,
      ts_rank(content_tsv, plainto_tsquery('english', $1)) as relevance,
      meta,
      created_at
    FROM rag_documents
    WHERE project_id = $2
      AND content_tsv @@ plainto_tsquery('english', $1)
    ORDER BY relevance DESC
    LIMIT $3
  `, [searchQuery, projectId, limit]);

  return {
    documents: result.rows,
    searchQuery: searchQuery,
    resultCount: result.rows.length
  };
}

/**
 * Prepare search query by extracting keywords from user prompt
 */
prepareSearchQuery(userPrompt) {
  // Remove common words, extract key terms
  const stopWords = ['what', 'when', 'where', 'who', 'how', 'is', 'are', 'the', 'a', 'an'];
  const words = userPrompt.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.includes(word));

  // Join with OR for flexible matching
  return words.join(' | ');
}

/**
 * Build LLM prompt with grounded context and citation instructions
 */
async buildGroundedPrompt(userPrompt, context) {
  const systemPrompt = `You are an AI project management assistant with access to the project's knowledge graph and documentation.

IMPORTANT INSTRUCTIONS:
1. Base your responses ONLY on the provided context
2. Cite your sources using [Source: meeting_title] or [Source: decision_id] format
3. If the context doesn't contain relevant information, say "I don't have enough information to answer that"
4. Be specific and reference actual entities from the context

Context:
${this.buildContextText(context)}
`;

  return {
    system: systemPrompt,
    user: userPrompt
  };
}
```

---

### **Update `callLLM` method to use grounded prompts:**

```javascript
/**
 * Call LLM with grounded context
 * ENHANCED: Uses grounded prompt with citation instructions
 */
async callLLM({ sessionId, context, userPrompt, agentType }) {
  const startTime = Date.now();

  // Build grounded prompt
  const { system, user } = await this.buildGroundedPrompt(userPrompt, context);

  try {
    // Call Anthropic Claude
    if (this.defaultModel.startsWith('claude')) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.defaultModel,
          max_tokens: 4096,
          system: system,
          messages: [{ role: 'user', content: user }]
        })
      });

      const data = await response.json();
      const assistantMessage = data.content[0].text;
      const tokensUsed = data.usage.input_tokens + data.usage.output_tokens;

      // Extract citations from response
      const citations = this.extractCitations(assistantMessage, context);

      // Log to audit
      await this.logAction({
        sessionId,
        actionType: 'llm_call_grounded',
        actionDescription: 'Called LLM with PKG/RAG grounding',
        inputData: { userPrompt, contextSize: this.buildContextText(context).length },
        outputData: { responseLength: assistantMessage.length, tokensUsed, citationCount: citations.length },
        executionTimeMs: Date.now() - startTime
      });

      return {
        response: assistantMessage,
        tokensUsed,
        latency: Date.now() - startTime,
        citations
      };
    }

    // Similar for OpenAI GPT (omitted for brevity)

  } catch (error) {
    console.error('LLM call error:', error);
    throw error;
  }
}

/**
 * Extract citations from AI response
 */
extractCitations(response, context) {
  const citations = [];
  const citationRegex = /\[Source:\s*([^\]]+)\]/g;
  let match;

  while ((match = citationRegex.exec(response)) !== null) {
    const sourceRef = match[1].trim();

    // Find matching entity in context
    const pkgNode = context.pkgNodes.find(node =>
      node.attrs.decision_id === sourceRef ||
      node.attrs.meeting_id === sourceRef ||
      node.attrs.risk_id === sourceRef ||
      node.attrs.title === sourceRef
    );

    const ragDoc = context.ragDocuments.find(doc =>
      doc.title === sourceRef ||
      doc.meta.meeting_id === sourceRef
    );

    if (pkgNode) {
      citations.push({
        type: 'pkg_node',
        sourceRef,
        nodeId: pkgNode.id,
        nodeType: pkgNode.type,
        sourceTable: pkgNode.source_table,
        sourceId: pkgNode.source_id
      });
    } else if (ragDoc) {
      citations.push({
        type: 'rag_document',
        sourceRef,
        docId: ragDoc.id,
        sourceType: ragDoc.source_type,
        sourceId: ragDoc.source_id
      });
    }
  }

  return citations;
}
```

---

### **Update Response Format to Include Citations:**

```javascript
/**
 * Complete session with citations
 */
async completeSession({ sessionId, response, confidenceScore, pkgNodesUsed, ragDocsUsed, tokensUsed, latency, citations }) {
  await pool.query(`
    UPDATE ai_agent_sessions
    SET
      status = $1,
      agent_response = $2,
      confidence_score = $3,
      pkg_nodes_used = $4,
      rag_docs_used = $5,
      tokens_used = $6,
      latency_ms = $7,
      completed_at = NOW()
    WHERE session_id = $8
  `, ['completed', response, confidenceScore, pkgNodesUsed, ragDocsUsed, tokensUsed, latency, sessionId]);

  // Store citations as evidence (NEW)
  if (citations && citations.length > 0) {
    await this.storeCitations(sessionId, citations);
  }

  return { sessionId, status: 'completed' };
}

/**
 * Store citations as evidence links
 */
async storeCitations(sessionId, citations) {
  for (const citation of citations) {
    if (citation.type === 'pkg_node') {
      // Create evidence record linking AI response → source entity
      await pool.query(`
        INSERT INTO evidence (
          entity_type, entity_id, evidence_type, source_type, source_id, quote_text, confidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        'ai_session',
        sessionId,
        'citation',
        citation.sourceTable,
        citation.sourceId,
        citation.sourceRef,
        'high'
      ]);
    }
  }
}
```

---

## **Sub-Story 5.2.5.3: Add Citation Support to AI Responses** (2-3 hours)

### **Update Frontend Dashboard to Display Citations**

**File: `public/js/components/AIAgentDashboard.js`**

```javascript
/**
 * Format message with citations (ENHANCED)
 */
formatMessage(content, citations = []) {
  // Basic markdown-like formatting
  let formatted = content
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');

  // Replace citation references with clickable links
  if (citations && citations.length > 0) {
    citations.forEach(citation => {
      const citationText = `[Source: ${citation.sourceRef}]`;
      const citationLink = this.buildCitationLink(citation);
      formatted = formatted.replace(citationText, citationLink);
    });
  }

  return formatted;
}

/**
 * Build clickable citation link
 */
buildCitationLink(citation) {
  let url = '#';
  let tooltip = citation.sourceRef;

  if (citation.type === 'pkg_node') {
    // Link to appropriate page based on node type
    if (citation.nodeType === 'Decision') {
      url = `/decisions.html?id=${citation.sourceId}`;
      tooltip = `View decision: ${citation.sourceRef}`;
    } else if (citation.nodeType === 'Meeting') {
      url = `/meetings.html?id=${citation.sourceId}`;
      tooltip = `View meeting: ${citation.sourceRef}`;
    } else if (citation.nodeType === 'Risk') {
      url = `/risks.html?id=${citation.sourceId}`;
      tooltip = `View risk: ${citation.sourceRef}`;
    } else if (citation.nodeType === 'Task') {
      url = `/issues.html?id=${citation.sourceId}`;
      tooltip = `View task: ${citation.sourceRef}`;
    }
  } else if (citation.type === 'rag_document') {
    url = `/documents.html?id=${citation.docId}`;
    tooltip = `View document: ${citation.sourceRef}`;
  }

  return `<a href="${url}" class="citation-link" title="${tooltip}" target="_blank">[Source: ${citation.sourceRef}]</a>`;
}

/**
 * Update message display to include citations
 */
updateMessage(messageId, content, citations = []) {
  const messageEl = document.getElementById(messageId);
  if (messageEl) {
    const contentEl = messageEl.querySelector('.message-content');
    contentEl.innerHTML = this.formatMessage(content, citations);
    contentEl.classList.remove('loading');

    // Auto-scroll
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
  }
}

/**
 * Handle streaming response with citations (ENHANCED)
 */
async streamResponse(prompt, agentType, loadingMessageId) {
  const url = `/api/aipm/projects/${this.currentProjectId}/agent/chat/stream?prompt=${encodeURIComponent(prompt)}&agentType=${agentType}`;

  this.eventSource = new EventSource(url);
  let fullResponse = '';
  let citations = [];

  this.eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'session') {
      console.log('Session ID:', data.sessionId);
      this.currentSessionId = data.sessionId;
    } else if (data.type === 'chunk') {
      fullResponse += data.text;
      this.updateMessage(loadingMessageId, fullResponse, citations);
    } else if (data.type === 'complete') {
      // Fetch session details to get citations
      this.fetchSessionCitations(data.sessionId).then(sessionCitations => {
        citations = sessionCitations;
        this.updateMessage(loadingMessageId, fullResponse, citations);
      });
      this.eventSource.close();
      this.loadRecentSessions();
    }
  };
}

/**
 * Fetch citations for a session
 */
async fetchSessionCitations(sessionId) {
  try {
    const response = await fetch(`/api/aipm/sessions/${sessionId}/citations`);
    const data = await response.json();
    return data.citations || [];
  } catch (error) {
    console.error('Error fetching citations:', error);
    return [];
  }
}
```

---

### **Add Citation Styles to CSS**

**File: `public/css/ai-agent.css`**

```css
/* Citation links */
.citation-link {
  color: #007bff;
  text-decoration: none;
  font-size: 0.9em;
  font-weight: 500;
  padding: 2px 6px;
  background: #e7f3ff;
  border-radius: 4px;
  margin: 0 2px;
  transition: background 0.2s;
}

.citation-link:hover {
  background: #cce5ff;
  text-decoration: underline;
}

/* Citation tooltip */
.citation-link[title] {
  cursor: help;
}
```

---

### **Add API Endpoint for Citations**

**File: `routes/aiAgent.js`**

```javascript
/**
 * GET /api/aipm/sessions/:sessionId/citations
 * Get citations for an AI session
 */
router.get('/sessions/:sessionId/citations', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Get evidence records for this session
    const result = await pool.query(`
      SELECT
        e.entity_type,
        e.source_type,
        e.source_id,
        e.quote_text as source_ref,
        p.type as node_type,
        p.attrs
      FROM evidence e
      LEFT JOIN pkg_nodes p ON e.source_table = p.source_table AND e.source_id = p.source_id
      WHERE e.entity_type = 'ai_session'
        AND e.entity_id::text = $1
    `, [sessionId]);

    const citations = result.rows.map(row => ({
      type: 'pkg_node',
      sourceRef: row.source_ref,
      nodeType: row.node_type,
      sourceTable: row.source_type,
      sourceId: row.source_id,
      title: row.attrs?.title || row.source_ref
    }));

    res.json({ citations });

  } catch (error) {
    console.error('Error fetching citations:', error);
    res.status(500).json({ error: 'Failed to fetch citations' });
  }
});
```

---

## **Sub-Story 5.2.5.4: Update Decision/Risk Agents to Write PKG Nodes** (2-3 hours)

### **File: `services/aiDecisionMaker.js`**

**Update `proposeDecision` to create PKG node:**

```javascript
/**
 * Propose decision with PKG integration
 * ENHANCED: Creates PKG node for the decision
 */
async proposeDecision({ projectId, decisionTitle, decisionDescription, decisionType, impactLevel, rationale, alternatives, sessionId, userId }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Generate proposal ID
    const proposalIdResult = await client.query('SELECT generate_proposal_id() as proposal_id');
    const proposalId = proposalIdResult.rows[0].proposal_id;

    // 2. Generate decision ID
    const decisionIdResult = await client.query('SELECT generate_decision_id($1) as decision_id', [projectId]);
    const decisionId = decisionIdResult.rows[0].decision_id;

    // 3. Prepare decision data
    const decisionData = {
      decision_id: decisionId,
      title: decisionTitle,
      description: decisionDescription,
      decision_type: decisionType,
      impact_level: impactLevel,
      status: 'proposed',
      rationale: rationale,
      alternatives_considered: alternatives
    };

    // 4. Create PKG node for decision (NEW)
    const pkgNodeResult = await client.query(`
      INSERT INTO pkg_nodes (
        project_id, type, attrs, created_by_ai, ai_confidence, ai_analysis_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      projectId,
      'Decision',
      JSON.stringify(decisionData),
      true,
      'medium',
      sessionId,
      userId
    ]);

    const pkgNodeId = pkgNodeResult.rows[0].id;

    // 5. Create proposal
    const proposal = await client.query(`
      INSERT INTO ai_agent_proposals (
        proposal_id, session_id, project_id, proposal_type,
        proposed_action, proposed_data, rationale, confidence_score,
        status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      proposalId,
      sessionId,
      projectId,
      'decision',
      'create_decision',
      JSON.stringify({ ...decisionData, pkg_node_id: pkgNodeId }),
      rationale,
      0.75,
      'pending_review',
      userId
    ]);

    await client.query('COMMIT');

    return {
      proposal: proposal.rows[0],
      pkgNodeId: pkgNodeId
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error proposing decision:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Approve proposal and create actual decision with PKG linking
 * ENHANCED: Links decision to PKG node
 */
async approveProposal({ proposalId, userId, reviewNotes, modifications }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get proposal
    const proposalResult = await client.query(
      'SELECT * FROM ai_agent_proposals WHERE proposal_id = $1',
      [proposalId]
    );
    const proposal = proposalResult.rows[0];

    if (!proposal) {
      throw new Error('Proposal not found');
    }

    // Merge modifications
    const finalData = modifications
      ? { ...proposal.proposed_data, ...modifications }
      : proposal.proposed_data;

    // Create actual decision in decisions table
    const decision = await client.query(`
      INSERT INTO decisions (
        decision_id, project_id, title, description, decision_type,
        impact_level, status, rationale, alternatives_considered,
        created_by, created_by_ai, ai_confidence, pkg_node_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      finalData.decision_id,
      proposal.project_id,
      finalData.title,
      finalData.description,
      finalData.decision_type,
      finalData.impact_level,
      'approved',
      finalData.rationale,
      finalData.alternatives_considered,
      userId,
      true,
      'high',
      finalData.pkg_node_id // Link to existing PKG node
    ]);

    // Update PKG node to link to decision table (bi-directional sync)
    await client.query(`
      UPDATE pkg_nodes
      SET source_table = $1, source_id = $2, attrs = $3
      WHERE id = $4
    `, ['decisions', decision.rows[0].id, JSON.stringify(finalData), finalData.pkg_node_id]);

    // Update proposal status
    await client.query(`
      UPDATE ai_agent_proposals
      SET status = $1, reviewed_by = $2, review_notes = $3,
          created_entity_type = $4, created_entity_id = $5,
          updated_at = NOW()
      WHERE proposal_id = $6
    `, ['approved', userId, reviewNotes, 'decision', decision.rows[0].id, proposalId]);

    await client.query('COMMIT');

    return {
      decision: decision.rows[0],
      proposal: proposal
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error approving proposal:', error);
    throw error;
  } finally {
    client.release();
  }
}
```

---

### **File: `services/aiRiskDetector.js`**

**Update `autoCreateHighConfidenceRisks` to use PKG:**

```javascript
/**
 * Auto-create high-confidence risks with PKG integration
 * ENHANCED: Creates PKG nodes for risks
 */
async autoCreateHighConfidenceRisks({ projectId, detectedRisks, confidenceThreshold = 0.9 }) {
  const autoCreated = [];

  for (const risk of detectedRisks) {
    if (risk.confidence >= confidenceThreshold) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // 1. Generate risk ID
        const riskIdResult = await client.query(
          'SELECT generate_risk_id($1) as risk_id',
          [projectId]
        );
        const riskId = riskIdResult.rows[0].risk_id;

        // 2. Create PKG node first
        const pkgNodeResult = await client.query(`
          INSERT INTO pkg_nodes (
            project_id, type, attrs, created_by_ai, ai_confidence, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [
          projectId,
          'Risk',
          JSON.stringify({
            risk_id: riskId,
            title: risk.title,
            description: risk.description,
            category: risk.type,
            probability: risk.probability,
            impact: risk.impact,
            status: 'identified'
          }),
          true,
          risk.confidence,
          1 // System user
        ]);

        const pkgNodeId = pkgNodeResult.rows[0].id;

        // 3. Create risk in risks table
        const result = await client.query(`
          INSERT INTO risks (
            risk_id, project_id, title, description, category,
            probability, impact, status,
            ai_detected, ai_confidence, detection_source, source_identifier,
            created_by, pkg_node_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (project_id, detection_source, source_identifier)
            WHERE ai_detected = TRUE AND source_identifier IS NOT NULL
          DO NOTHING
          RETURNING *
        `, [
          riskId,
          projectId,
          risk.title,
          risk.description,
          risk.type || 'technical',
          risk.probability || 3,
          risk.impact || 3,
          'identified',
          true,
          risk.confidence,
          risk.type,
          risk.sourceIdentifier,
          1,
          pkgNodeId
        ]);

        if (result.rows.length > 0) {
          // Update PKG node with source_id
          await client.query(`
            UPDATE pkg_nodes
            SET source_table = $1, source_id = $2
            WHERE id = $3
          `, ['risks', result.rows[0].id, pkgNodeId]);

          autoCreated.push(result.rows[0]);

          // Create PKG edge if there's a source entity
          if (risk.sourceNodeId) {
            await client.query(`
              INSERT INTO pkg_edges (
                project_id, type, from_node_id, to_node_id,
                confidence, evidence_quote, created_by_ai
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
              projectId,
              'evidence_of',
              risk.sourceNodeId,
              pkgNodeId,
              risk.confidence,
              risk.evidenceQuote,
              true
            ]);
          }
        }

        await client.query('COMMIT');

      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Failed to auto-create risk: ${risk.title}`, err);
      } finally {
        client.release();
      }
    }
  }

  return autoCreated;
}
```

---

## ✅ Acceptance Criteria

**Sub-Story 5.2.5.1: PKG Context Assembly**
- [ ] AI agents query pkg_nodes instead of raw tables
- [ ] Context includes PKG edges (relationships)
- [ ] Agent type filters appropriate PKG node types
- [ ] Context assembly time < 500ms

**Sub-Story 5.2.5.2: RAG Integration**
- [ ] RAG search uses rag_documents table with full-text search
- [ ] Search results ranked by relevance
- [ ] LLM prompts include grounded context
- [ ] Citation instructions in system prompt

**Sub-Story 5.2.5.3: Citation Support**
- [ ] AI responses include citation references
- [ ] Citations stored as evidence records
- [ ] Frontend displays clickable citation links
- [ ] Citations link to source entities (decisions, meetings, risks)

**Sub-Story 5.2.5.4: PKG Write Integration**
- [ ] Decision proposals create PKG nodes
- [ ] Risk auto-creation creates PKG nodes
- [ ] Bi-directional sync (PKG ↔ source tables)
- [ ] PKG edges created for evidence relationships

---

## 🧪 Testing

### **Integration Tests**

```javascript
// Test PKG context assembly
describe('AI Agent PKG Integration', () => {
  test('assembleContext uses PKG nodes', async () => {
    const context = await aiAgent.assembleContext({
      projectId: 1,
      userPrompt: 'What are the risks?',
      agentType: 'risk_detector'
    });

    expect(context.pkgNodes).toBeDefined();
    expect(context.pkgNodes.length).toBeGreaterThan(0);
    expect(context.pkgNodes[0]).toHaveProperty('type');
    expect(context.pkgNodes[0]).toHaveProperty('attrs');
  });

  test('RAG search returns relevant documents', async () => {
    const rag = await aiAgent.performRAGSearch(1, 'cutover rollback');

    expect(rag.documents).toBeDefined();
    expect(rag.documents.length).toBeGreaterThan(0);
    expect(rag.documents[0]).toHaveProperty('snippet');
    expect(rag.documents[0]).toHaveProperty('relevance');
  });

  test('Citations extracted and stored', async () => {
    const response = await aiAgent.callLLM({
      sessionId: 'test-session',
      context: mockContext,
      userPrompt: 'What decisions were made?',
      agentType: 'decision_assistant'
    });

    expect(response.citations).toBeDefined();
    expect(response.citations.length).toBeGreaterThan(0);
    expect(response.citations[0]).toHaveProperty('sourceRef');
  });

  test('Decision proposal creates PKG node', async () => {
    const result = await aiDecisionMaker.proposeDecision({
      projectId: 1,
      decisionTitle: 'Test Decision',
      decisionDescription: 'Test description',
      decisionType: 'technical',
      impactLevel: 'medium',
      rationale: 'Test rationale',
      alternatives: [],
      sessionId: 'test-session',
      userId: 1
    });

    expect(result.pkgNodeId).toBeDefined();

    // Verify PKG node exists
    const pkgNode = await pool.query('SELECT * FROM pkg_nodes WHERE id = $1', [result.pkgNodeId]);
    expect(pkgNode.rows.length).toBe(1);
    expect(pkgNode.rows[0].type).toBe('Decision');
  });
});
```

---

## 🚀 Story 5.2.5 Complete!

After completing all 4 sub-stories, you will have:

✅ **PKG-Aware AI Agents**
- Agents query unified knowledge graph
- Context includes relationships (edges)
- Faster, more comprehensive context assembly

✅ **Grounded AI Responses**
- RAG search provides relevant excerpts
- Responses cite sources
- Evidence trail for all AI claims

✅ **Citation Support**
- Clickable citation links in UI
- Citations stored as evidence
- Full traceability

✅ **PKG Write Integration**
- AI-generated entities create PKG nodes
- Bi-directional sync with source tables
- Evidence edges link sources to entities

**Your AI agents are now PKG/RAG-powered and ready for the Sidecar Bot (Story 5.4)!** 🎉

---

*Generated: 2025-11-19*
*Story: 5.2.5 - AI Agent Integration with PKG/RAG*
*Prerequisites: Stories 5.1 (AIPM Foundation) + 5.2 (AI Agents)*
