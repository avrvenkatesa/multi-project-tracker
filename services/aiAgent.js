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
   * ENHANCED: Now uses modular helper methods for better maintainability
   */
  async assembleContext({ projectId, userPrompt, agentType }) {
    const startTime = Date.now();

    try {
      // 1. RAG Search - Find relevant documents
      const ragResults = await this.performRAGSearch(projectId, userPrompt);

      // 2. PKG Query - Get relevant nodes
      const pkgResults = await this.queryPKG(projectId, userPrompt, agentType);

      // 3. PKG Edges - Get relationships between entities
      const pkgEdges = await this.queryPKGEdges(projectId, pkgResults.nodeIds);

      const executionTime = Date.now() - startTime;

      return {
        ragDocuments: ragResults.documents,
        pkgNodes: pkgResults.nodes,
        pkgEdges: pkgEdges,
        metadata: {
          executionTimeMs: executionTime,
          ragDocsCount: ragResults.documents.length,
          pkgNodesCount: pkgResults.nodes.length,
          pkgEdgesCount: pkgEdges.length
        }
      };
    } catch (error) {
      console.error('Context assembly error:', error);
      throw error;
    }
  }

  /**
   * Perform RAG search for relevant documents
   */
  async performRAGSearch(projectId, userPrompt) {
    const result = await pool.query(`
      SELECT
        id,
        source_type,
        source_id,
        content_text,
        metadata,
        ts_rank(content_tsv, to_tsquery('english', $1)) as relevance
      FROM rag_documents
      WHERE project_id = $2
        AND content_tsv @@ to_tsquery('english', $1)
      ORDER BY relevance DESC
      LIMIT 10
    `, [this.prepareSearchQuery(userPrompt), projectId]);

    return {
      documents: result.rows
    };
  }

  /**
   * Query PKG for relevant nodes based on agent type and user prompt
   */
  async queryPKG(projectId, userPrompt, agentType) {
    // Agent-specific PKG type filters
    const typeFilters = {
      'knowledge_explorer': ['Task', 'Risk', 'Decision', 'Meeting'],
      'decision_assistant': ['Decision', 'Risk', 'Task'],
      'risk_detector': ['Risk', 'Task', 'Decision'],
      'meeting_analyzer': ['Meeting', 'Decision', 'Task']
    };

    const relevantTypes = typeFilters[agentType] || ['Task', 'Risk', 'Decision'];

    // Query PKG nodes with type filtering and AI priority
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
      LIMIT 50
    `, [projectId, nodeIds]);

    return result.rows;
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
   * ENHANCED: Now formats PKG nodes by type with better structure
   */
  buildContextText(context) {
    let text = '# Project Context\n\n';

    // 1. PKG Nodes (grouped by type)
    if (context.pkgNodes && context.pkgNodes.length > 0) {
      const nodesByType = {};
      context.pkgNodes.forEach(node => {
        if (!nodesByType[node.type]) {
          nodesByType[node.type] = [];
        }
        nodesByType[node.type].push(node);
      });

      Object.keys(nodesByType).forEach(type => {
        text += `## ${type}s\n\n`;
        nodesByType[type].forEach(node => {
          // Guard against null/undefined attrs
          const attrs = node.attrs || {};
          
          // Extract title/identifier from attrs
          const title = attrs.title || 
                       attrs.risk_id || 
                       attrs.decision_id || 
                       attrs.issue_id ||
                       `${type} #${node.id}`;
          
          text += `**${title}**\n`;
          
          // Add description if available
          if (attrs.description) {
            const desc = attrs.description.substring(0, 200);
            text += `  ${desc}${attrs.description.length > 200 ? '...' : ''}\n`;
          }
          
          // Add status if available
          if (attrs.status) {
            text += `  Status: ${attrs.status}\n`;
          }
          
          // Add priority if available
          if (attrs.priority) {
            text += `  Priority: ${attrs.priority}\n`;
          }
          
          // Add AI detection info
          if (node.created_by_ai) {
            text += `  _(AI-detected, confidence: ${node.ai_confidence})_\n`;
          }
          
          text += '\n';
        });
      });
    }

    // 2. PKG Relationships
    if (context.pkgEdges && context.pkgEdges.length > 0) {
      text += '## Relationships\n\n';
      context.pkgEdges.forEach(edge => {
        text += `- **${edge.type}**: ${edge.from_node_id} → ${edge.to_node_id}`;
        
        // Add confidence if available
        if (edge.confidence) {
          text += ` (confidence: ${edge.confidence})`;
        }
        
        text += '\n';
        
        // Add evidence quote if available
        if (edge.evidence_quote) {
          text += `  Evidence: "${edge.evidence_quote}"\n`;
        }
      });
      text += '\n';
    }

    // 3. RAG Documents (relevant excerpts)
    if (context.ragDocuments && context.ragDocuments.length > 0) {
      text += '## Relevant Documents\n\n';
      context.ragDocuments.forEach((doc, idx) => {
        text += `### ${idx + 1}. ${doc.metadata?.title || 'Document'} (${doc.source_type})\n`;
        text += `${doc.content_text.substring(0, 300)}...\n\n`;
      });
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
