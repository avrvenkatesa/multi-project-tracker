# Story 5.2.1: AI Agent Core Engine - Replit Implementation Guide

## 🎯 Objective
Build the core AI agent orchestration engine that uses the AIPM foundation (PKG + RAG) to provide intelligent project management assistance.

---

## 📋 Prerequisites

Before starting, verify Story 5.1 is complete:
- ✅ `pkg_nodes` and `pkg_edges` tables exist (Story 5.1.2)
- ✅ `rag_documents` table exists with full-text search (Story 5.1.3)
- ✅ `decisions`, `meetings`, `evidence` tables exist (Story 5.1.1)

---

## 🏗️ Implementation Tasks

### **Task 1: Create AI Agent Database Schema**

**File: `db/028_add_ai_agent_tables.sql`**

```sql
-- AI Agent Sessions Table
-- Tracks AI agent invocations and conversations
CREATE TABLE IF NOT EXISTS ai_agent_sessions (
  id SERIAL PRIMARY KEY,
  session_id UUID UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Agent type
  agent_type VARCHAR(50) NOT NULL,
  -- Types: 'decision_assistant', 'risk_detector', 'meeting_analyzer', 'knowledge_explorer'

  -- Context
  user_id INTEGER NOT NULL REFERENCES users(id),
  user_prompt TEXT NOT NULL,

  -- Agent state
  status VARCHAR(20) DEFAULT 'in_progress',
  -- Status: 'in_progress', 'completed', 'failed', 'cancelled'

  -- Results
  agent_response TEXT,
  confidence_score DECIMAL(3,2), -- 0.00 to 1.00

  -- Context used
  pkg_nodes_used INTEGER[], -- Array of PKG node IDs used
  rag_docs_used INTEGER[], -- Array of RAG document IDs used

  -- Metadata
  model_used VARCHAR(50), -- 'claude-3-opus', 'gpt-4', etc.
  tokens_used INTEGER,
  latency_ms INTEGER,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT valid_status CHECK (status IN ('in_progress', 'completed', 'failed', 'cancelled'))
);

-- AI Agent Proposals Table
-- Stores AI-generated proposals awaiting human approval
CREATE TABLE IF NOT EXISTS ai_agent_proposals (
  id SERIAL PRIMARY KEY,
  proposal_id VARCHAR(20) UNIQUE NOT NULL, -- PROP-00001 format
  session_id UUID NOT NULL REFERENCES ai_agent_sessions(session_id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Proposal details
  proposal_type VARCHAR(50) NOT NULL,
  -- Types: 'decision', 'risk', 'action_item', 'meeting_summary', 'pkg_update'

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  rationale TEXT,

  -- AI confidence
  confidence_score DECIMAL(3,2) NOT NULL,
  evidence_ids INTEGER[], -- IDs from evidence table

  -- HITL (Human-in-the-loop) workflow
  status VARCHAR(20) DEFAULT 'pending_review',
  -- Status: 'pending_review', 'approved', 'rejected', 'modified', 'auto_approved'

  reviewed_by INTEGER REFERENCES users(id),
  review_notes TEXT,
  reviewed_at TIMESTAMP,

  -- If approved, link to created entity
  created_entity_type VARCHAR(50), -- 'decision', 'risk', etc.
  created_entity_id INTEGER,

  -- Metadata
  proposed_data JSONB, -- Full JSON of proposed entity
  modifications JSONB, -- User modifications if status = 'modified'

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT valid_proposal_status CHECK (
    status IN ('pending_review', 'approved', 'rejected', 'modified', 'auto_approved')
  )
);

-- AI Agent Audit Log
-- Detailed logging of agent actions for transparency
CREATE TABLE IF NOT EXISTS ai_agent_audit_log (
  id SERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES ai_agent_sessions(session_id) ON DELETE CASCADE,

  -- Action details
  action_type VARCHAR(50) NOT NULL,
  -- Types: 'pkg_query', 'rag_search', 'llm_call', 'proposal_created', 'entity_created'

  action_description TEXT,

  -- Context
  input_data JSONB,
  output_data JSONB,

  -- Performance
  execution_time_ms INTEGER,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_ai_sessions_project ON ai_agent_sessions(project_id);
CREATE INDEX idx_ai_sessions_user ON ai_agent_sessions(user_id);
CREATE INDEX idx_ai_sessions_status ON ai_agent_sessions(status);
CREATE INDEX idx_ai_sessions_created ON ai_agent_sessions(created_at DESC);

CREATE INDEX idx_ai_proposals_session ON ai_agent_proposals(session_id);
CREATE INDEX idx_ai_proposals_project ON ai_agent_proposals(project_id);
CREATE INDEX idx_ai_proposals_status ON ai_agent_proposals(status);
CREATE INDEX idx_ai_proposals_type ON ai_agent_proposals(proposal_type);

CREATE INDEX idx_ai_audit_session ON ai_agent_audit_log(session_id);
CREATE INDEX idx_ai_audit_type ON ai_agent_audit_log(action_type);
CREATE INDEX idx_ai_audit_created ON ai_agent_audit_log(created_at DESC);

-- Helper function for proposal ID generation
CREATE OR REPLACE FUNCTION generate_proposal_id()
RETURNS VARCHAR AS $$
DECLARE
  next_num INTEGER;
  new_id VARCHAR(20);
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(proposal_id FROM 6) AS INTEGER)), 0) + 1
  INTO next_num
  FROM ai_agent_proposals;

  new_id := 'PROP-' || LPAD(next_num::TEXT, 5, '0');
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_ai_proposals_updated_at
  BEFORE UPDATE ON ai_agent_proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();

-- Add constraints for data integrity
ALTER TABLE ai_agent_proposals
  ADD CONSTRAINT valid_confidence CHECK (confidence_score BETWEEN 0.00 AND 1.00);

ALTER TABLE ai_agent_sessions
  ADD CONSTRAINT valid_session_confidence CHECK (
    confidence_score IS NULL OR confidence_score BETWEEN 0.00 AND 1.00
  );

COMMENT ON TABLE ai_agent_sessions IS 'Tracks AI agent invocations and conversation sessions';
COMMENT ON TABLE ai_agent_proposals IS 'AI-generated proposals awaiting human approval (HITL)';
COMMENT ON TABLE ai_agent_audit_log IS 'Detailed audit trail of all AI agent actions';
```

**Run the migration:**
```bash
psql $DATABASE_URL -f db/028_add_ai_agent_tables.sql
```

---

### **Task 2: Create AI Agent Service Layer**

**File: `services/aiAgent.js`**

```javascript
const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');

/**
 * AI Agent Service
 * Core orchestration layer for AI-powered project management
 */

class AIAgentService {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    this.defaultModel = process.env.AI_MODEL || 'claude-3-sonnet-20240229';
  }

  /**
   * Create a new AI agent session
   */
  async createSession({ projectId, userId, agentType, userPrompt }) {
    const sessionId = uuidv4();

    const result = await pool.query(`
      INSERT INTO ai_agent_sessions (
        session_id, project_id, user_id, agent_type, user_prompt, model_used
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [sessionId, projectId, userId, agentType, userPrompt, this.defaultModel]);

    return result.rows[0];
  }

  /**
   * Assemble context from PKG and RAG for LLM
   */
  async assembleContext({ projectId, userPrompt, agentType }) {
    const startTime = Date.now();

    // 1. RAG Search - Find relevant documents
    const ragResults = await pool.query(`
      SELECT
        id,
        source_type,
        source_id,
        content_text,
        metadata,
        ts_rank(content_vector, to_tsquery('english', $1)) as relevance
      FROM rag_documents
      WHERE project_id = $2
        AND content_vector @@ to_tsquery('english', $1)
      ORDER BY relevance DESC
      LIMIT 10
    `, [this.prepareSearchQuery(userPrompt), projectId]);

    // 2. PKG Query - Get relevant nodes based on agent type
    let pkgQuery = `
      SELECT
        id,
        type,
        attrs,
        source_table,
        source_id,
        created_by_ai,
        ai_confidence
      FROM pkg_nodes
      WHERE project_id = $1
    `;

    // Filter by agent type
    if (agentType === 'decision_assistant') {
      pkgQuery += ` AND type IN ('Decision', 'Task', 'Risk')`;
    } else if (agentType === 'risk_detector') {
      pkgQuery += ` AND type IN ('Risk', 'Issue', 'Decision')`;
    } else if (agentType === 'meeting_analyzer') {
      pkgQuery += ` AND type IN ('Meeting', 'Decision', 'Task')`;
    }

    pkgQuery += ` ORDER BY created_at DESC LIMIT 20`;

    const pkgResults = await pool.query(pkgQuery, [projectId]);

    // 3. Get PKG edges for relationships
    const pkgNodeIds = pkgResults.rows.map(n => n.id);
    let edgeResults = { rows: [] };

    if (pkgNodeIds.length > 0) {
      edgeResults = await pool.query(`
        SELECT
          id,
          type,
          from_node_id,
          to_node_id,
          attrs
        FROM pkg_edges
        WHERE project_id = $1
          AND (from_node_id = ANY($2) OR to_node_id = ANY($2))
        LIMIT 50
      `, [projectId, pkgNodeIds]);
    }

    const executionTime = Date.now() - startTime;

    return {
      ragDocuments: ragResults.rows,
      pkgNodes: pkgResults.rows,
      pkgEdges: edgeResults.rows,
      metadata: {
        executionTimeMs: executionTime,
        ragDocsCount: ragResults.rows.length,
        pkgNodesCount: pkgResults.rows.length,
        pkgEdgesCount: edgeResults.rows.length
      }
    };
  }

  /**
   * Call LLM with assembled context
   */
  async callLLM({ sessionId, context, userPrompt, agentType }) {
    const startTime = Date.now();

    // Build system prompt based on agent type
    const systemPrompt = this.buildSystemPrompt(agentType);

    // Build context section
    const contextText = this.buildContextText(context);

    // Prepare messages for LLM
    const messages = [
      {
        role: 'user',
        content: `${contextText}\n\nUser Question: ${userPrompt}`
      }
    ];

    let response;
    let tokensUsed = 0;

    try {
      // Call LLM API (example with Anthropic Claude)
      if (this.defaultModel.startsWith('claude')) {
        response = await this.callClaude(systemPrompt, messages);
        tokensUsed = response.usage?.input_tokens + response.usage?.output_tokens || 0;
      } else if (this.defaultModel.startsWith('gpt')) {
        response = await this.callOpenAI(systemPrompt, messages);
        tokensUsed = response.usage?.total_tokens || 0;
      } else {
        throw new Error(`Unsupported model: ${this.defaultModel}`);
      }

      const latency = Date.now() - startTime;

      // Log to audit trail
      await this.logAction({
        sessionId,
        actionType: 'llm_call',
        actionDescription: `Called ${this.defaultModel}`,
        inputData: { userPrompt, contextDocsCount: context.ragDocuments.length },
        outputData: { responseLength: response.content?.length || 0 },
        executionTimeMs: latency
      });

      return {
        response: response.content,
        tokensUsed,
        latency
      };
    } catch (error) {
      console.error('LLM call failed:', error);

      // Log error
      await this.logAction({
        sessionId,
        actionType: 'llm_call',
        actionDescription: `LLM call failed: ${error.message}`,
        inputData: { userPrompt },
        outputData: { error: error.message },
        executionTimeMs: Date.now() - startTime
      });

      throw error;
    }
  }

  /**
   * Call Anthropic Claude API
   */
  async callClaude(systemPrompt, messages) {
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
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.content[0].text,
      usage: data.usage
    };
  }

  /**
   * Call OpenAI GPT API
   */
  async callOpenAI(systemPrompt, messages) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: data.usage
    };
  }

  /**
   * Complete agent session
   */
  async completeSession({ sessionId, response, confidenceScore, pkgNodesUsed, ragDocsUsed, tokensUsed, latency }) {
    const result = await pool.query(`
      UPDATE ai_agent_sessions
      SET
        status = 'completed',
        agent_response = $1,
        confidence_score = $2,
        pkg_nodes_used = $3,
        rag_docs_used = $4,
        tokens_used = $5,
        latency_ms = $6,
        completed_at = NOW()
      WHERE session_id = $7
      RETURNING *
    `, [response, confidenceScore, pkgNodesUsed, ragDocsUsed, tokensUsed, latency, sessionId]);

    return result.rows[0];
  }

  /**
   * Log agent action to audit trail
   */
  async logAction({ sessionId, actionType, actionDescription, inputData, outputData, executionTimeMs }) {
    await pool.query(`
      INSERT INTO ai_agent_audit_log (
        session_id, action_type, action_description, input_data, output_data, execution_time_ms
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [sessionId, actionType, actionDescription, inputData, outputData, executionTimeMs]);
  }

  /**
   * Helper: Build system prompt based on agent type
   */
  buildSystemPrompt(agentType) {
    const prompts = {
      decision_assistant: `You are an AI Project Manager assistant specialized in architectural decisions.
Your role is to help teams make informed decisions by:
- Analyzing context from project knowledge graph (PKG)
- Retrieving relevant past decisions and their outcomes
- Identifying potential impacts and risks
- Suggesting alternatives with pros/cons
- Providing evidence-based recommendations

Always cite your sources from the provided context.
Format responses in clear, structured markdown.`,

      risk_detector: `You are an AI Risk Detection specialist for project management.
Your role is to proactively identify risks by:
- Analyzing patterns across the project knowledge graph
- Detecting early warning signs in meeting transcripts
- Identifying dependency risks from task relationships
- Assessing impact and probability
- Suggesting mitigation strategies

Prioritize risks by severity (impact × probability).
Always provide evidence from project data.`,

      meeting_analyzer: `You are an AI Meeting Intelligence assistant.
Your role is to analyze meeting transcripts and:
- Extract key decisions made
- Identify action items and owners
- Detect risks or blockers mentioned
- Summarize main discussion points
- Link to related project entities (tasks, decisions, risks)

Provide structured outputs with clear citations.`,

      knowledge_explorer: `You are an AI Knowledge Graph explorer for project management.
Your role is to help users understand their project by:
- Traversing the project knowledge graph (PKG)
- Finding connections between entities
- Answering questions about project history
- Providing insights from aggregated data
- Recommending next steps

Always explain your reasoning and cite sources.`
    };

    return prompts[agentType] || prompts.knowledge_explorer;
  }

  /**
   * Helper: Build context text for LLM
   */
  buildContextText(context) {
    let text = '# Project Context\n\n';

    // Add RAG documents
    if (context.ragDocuments.length > 0) {
      text += '## Relevant Documents\n\n';
      context.ragDocuments.forEach((doc, idx) => {
        text += `### Document ${idx + 1} (${doc.source_type})\n`;
        text += `${doc.content_text.substring(0, 1000)}...\n\n`;
      });
    }

    // Add PKG nodes
    if (context.pkgNodes.length > 0) {
      text += '## Project Knowledge Graph Nodes\n\n';
      context.pkgNodes.forEach((node, idx) => {
        text += `### Node ${idx + 1}: ${node.type}\n`;
        text += `Attributes: ${JSON.stringify(node.attrs, null, 2)}\n\n`;
      });
    }

    // Add PKG edges
    if (context.pkgEdges.length > 0) {
      text += '## Relationships\n\n';
      context.pkgEdges.forEach((edge, idx) => {
        text += `- ${edge.type}: Node ${edge.from_node_id} → Node ${edge.to_node_id}\n`;
      });
      text += '\n';
    }

    return text;
  }

  /**
   * Helper: Prepare search query for PostgreSQL
   */
  prepareSearchQuery(userPrompt) {
    // Convert user prompt to tsquery format
    return userPrompt
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .join(' | ');
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId) {
    const result = await pool.query(
      'SELECT * FROM ai_agent_sessions WHERE session_id = $1',
      [sessionId]
    );
    return result.rows[0];
  }

  /**
   * Get session history for project
   */
  async getSessionHistory(projectId, limit = 20) {
    const result = await pool.query(`
      SELECT
        session_id,
        agent_type,
        user_prompt,
        status,
        confidence_score,
        created_at,
        completed_at
      FROM ai_agent_sessions
      WHERE project_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [projectId, limit]);

    return result.rows;
  }

  /**
   * Get audit log for session
   */
  async getAuditLog(sessionId) {
    const result = await pool.query(`
      SELECT *
      FROM ai_agent_audit_log
      WHERE session_id = $1
      ORDER BY created_at ASC
    `, [sessionId]);

    return result.rows;
  }
}

module.exports = new AIAgentService();
```

---

### **Task 3: Create AI Agent API Routes**

**File: `routes/aiAgent.js`**

```javascript
const express = require('express');
const router = express.Router();
const aiAgentService = require('../services/aiAgent');
const { authenticateToken } = require('../middleware/auth');

/**
 * POST /api/aipm/projects/:projectId/agent/chat
 * Send a message to the AI agent
 */
router.post('/projects/:projectId/agent/chat', authenticateToken, async (req, res) => {
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
router.get('/projects/:projectId/agent/sessions', authenticateToken, async (req, res) => {
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
router.get('/agent/sessions/:sessionId', authenticateToken, async (req, res) => {
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
```

---

### **Task 4: Register Routes in Server**

**File: `server.js` (or `app.js`)**

Add to your existing route registrations:

```javascript
const aiAgentRoutes = require('./routes/aiAgent');

// ... existing routes ...

app.use('/api/aipm', aiAgentRoutes);
```

---

### **Task 5: Environment Configuration**

**File: `.env`**

Add these environment variables:

```bash
# AI Agent Configuration
ANTHROPIC_API_KEY=your-anthropic-api-key-here
# OR
OPENAI_API_KEY=your-openai-api-key-here

# Default model (choose one)
AI_MODEL=claude-3-sonnet-20240229
# AI_MODEL=gpt-4-turbo-preview
```

---

### **Task 6: Install Dependencies**

```bash
npm install uuid
# If not already installed:
npm install dotenv
```

---

## ✅ Acceptance Criteria

**Database:**
- [ ] `ai_agent_sessions` table created
- [ ] `ai_agent_proposals` table created
- [ ] `ai_agent_audit_log` table created
- [ ] All indexes and constraints in place
- [ ] Helper function `generate_proposal_id()` working

**API Endpoints:**
- [ ] `POST /api/aipm/projects/:projectId/agent/chat` - Chat with AI agent
- [ ] `GET /api/aipm/projects/:projectId/agent/sessions` - Get session history
- [ ] `GET /api/aipm/agent/sessions/:sessionId` - Get session details
- [ ] `GET /api/aipm/agent/health` - Health check

**Functionality:**
- [ ] AI agent can assemble context from PKG + RAG
- [ ] LLM integration working (Claude or GPT)
- [ ] Sessions tracked in database
- [ ] Audit log captures all actions
- [ ] Context assembly returns relevant nodes/documents
- [ ] Responses include confidence scores and metadata

**Integration:**
- [ ] PKG queries work correctly
- [ ] RAG full-text search works
- [ ] Agent responses cite sources
- [ ] Session history accessible

---

## 🧪 Testing

### **Manual Test: Chat with AI Agent**

```bash
# 1. Get auth token (login first)
TOKEN="your-jwt-token"

# 2. Send message to AI agent
curl -X POST http://localhost:3000/api/aipm/projects/1/agent/chat \
  -H "Cookie: token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What are the highest priority risks in this project?",
    "agentType": "risk_detector"
  }'

# Expected response:
# {
#   "sessionId": "uuid-here",
#   "response": "Based on analysis of your project knowledge graph...",
#   "confidence": 0.85,
#   "context": {
#     "pkgNodesUsed": 15,
#     "ragDocsUsed": 8
#   },
#   "metadata": {
#     "tokensUsed": 1250,
#     "latencyMs": 3500,
#     "model": "claude-3-sonnet-20240229"
#   }
# }
```

### **Verify Session Tracking**

```sql
-- Check sessions
SELECT * FROM ai_agent_sessions ORDER BY created_at DESC LIMIT 5;

-- Check audit log
SELECT * FROM ai_agent_audit_log ORDER BY created_at DESC LIMIT 10;
```

---

## 📝 Implementation Notes

### **Agent Types Available:**
1. **`decision_assistant`** - Helps with architectural decisions
2. **`risk_detector`** - Proactively identifies risks
3. **`meeting_analyzer`** - Analyzes meeting transcripts
4. **`knowledge_explorer`** - General Q&A about project

### **Context Assembly Strategy:**
- RAG search limited to 10 most relevant documents
- PKG queries filtered by agent type
- PKG edges included for relationship context
- All queries optimized with indexes

### **LLM Provider Support:**
- **Anthropic Claude** (recommended): Models like `claude-3-opus`, `claude-3-sonnet`
- **OpenAI GPT**: Models like `gpt-4-turbo-preview`, `gpt-4`

### **Performance Targets:**
- Context assembly: < 500ms
- LLM response: 2-5 seconds (depends on provider)
- Total latency: < 6 seconds

---

## 🚀 Next Steps

After Story 5.2.1 is complete:
1. ✅ Run automated tests (use `/tmp/automate-story-5.2.1-tests.sh`)
2. 📝 Commit with detailed message
3. ➡️ Proceed to **Story 5.2.2**: Autonomous Decision Making (HITL workflow, proposals)

---

## 🆘 Troubleshooting

**Issue: "API key not configured"**
```bash
# Check .env file has API key
echo $ANTHROPIC_API_KEY
# or
echo $OPENAI_API_KEY

# Restart server after adding API key
```

**Issue: "Context assembly returns no results"**
```sql
-- Verify PKG and RAG have data
SELECT COUNT(*) FROM pkg_nodes;
SELECT COUNT(*) FROM rag_documents;
```

**Issue: "LLM call timeout"**
```javascript
// Increase timeout in fetch() calls
// Add timeout parameter to fetch options
```

---

**Questions?** All implementation files are ready. Start with Task 1 (database migration) and work through sequentially!
