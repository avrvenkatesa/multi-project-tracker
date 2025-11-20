const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');

/**
 * AI Agent Service
 * Core orchestration layer for AI-powered project management
 */

class AIAgentService {
  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    this.defaultModel = process.env.AI_MODEL || 'claude-sonnet-4-5-20250929';
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
   * ENHANCED: Uses ts_headline for snippets with highlighted keywords
   */
  async performRAGSearch(projectId, userPrompt, limit = 10) {
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
  /**
   * Call LLM with grounded context
   * ENHANCED: Uses grounded prompts with citation extraction
   */
  async callLLM({ sessionId, context, userPrompt, agentType }) {
    const startTime = Date.now();

    // Build grounded prompt with citation instructions
    const { system, user } = this.buildGroundedPrompt(userPrompt, context, agentType);

    // DEBUG: Verify prompt construction
    this.debugPromptConstruction(context, system);

    // Prepare messages for LLM
    const messages = [
      {
        role: 'user',
        content: user
      }
    ];

    let response;
    let tokensUsed = 0;

    try {
      // Call LLM API (example with Anthropic Claude)
      if (this.defaultModel.startsWith('claude')) {
        response = await this.callClaude(system, messages);
        tokensUsed = response.usage?.input_tokens + response.usage?.output_tokens || 0;
      } else if (this.defaultModel.startsWith('gpt')) {
        response = await this.callOpenAI(system, messages);
        tokensUsed = response.usage?.total_tokens || 0;
      } else {
        throw new Error(`Unsupported model: ${this.defaultModel}`);
      }

      const latency = Date.now() - startTime;

      // Extract citations from response
      let finalResponse = response.content;
      let citations = this.extractCitations(response.content, context);

      // FALLBACK: If no citations were included, add them automatically
      if (citations.length === 0 && (context.pkgNodes.length > 0 || context.ragDocuments.length > 0)) {
        console.warn('LLM did not include citations. Adding them automatically...');
        finalResponse = this.addMissingCitations(response.content, context);
        citations = this.extractCitations(finalResponse, context);
      }

      // Log to audit trail
      await this.logAction({
        sessionId,
        actionType: 'llm_call_grounded',
        actionDescription: `Called ${this.defaultModel} with PKG/RAG grounding`,
        inputData: { userPrompt, contextSize: system.length },
        outputData: { 
          responseLength: finalResponse?.length || 0,
          tokensUsed,
          citationCount: citations.length
        },
        executionTimeMs: latency
      });

      return {
        response: finalResponse,
        tokensUsed,
        latency,
        citations
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
   * ENHANCED: Uses prefill technique to force citation compliance
   */
  async callClaude(systemPrompt, messages) {
    // Add assistant message prefill to force citation format
    const messagesWithPrefill = [
      ...messages,
      {
        role: 'assistant',
        content: 'I will provide a comprehensive answer with citations in [Source: Title] format after every fact. Here is my response:\n\n'
      }
    ];

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
        temperature: 0.3,  // Lower temperature for more deterministic, instruction-following behavior
        system: systemPrompt,
        messages: messagesWithPrefill
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Prepend the prefill text to the response
    const fullContent = 'I will provide a comprehensive answer with citations in [Source: Title] format after every fact. Here is my response:\n\n' + data.content[0].text;

    return {
      content: fullContent,
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
   * Complete agent session with citations
   * ENHANCED: Now accepts and stores citations as evidence
   */
  async completeSession({ sessionId, response, confidenceScore, pkgNodesUsed, ragDocsUsed, tokensUsed, latency, citations }) {
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

    // Store citations as evidence
    if (citations && citations.length > 0) {
      await this.storeCitations(sessionId, citations);
    }

    return result.rows[0];
  }

  /**
   * FALLBACK: Add citations to response if LLM didn't include them
   * This is a safety net if the LLM ignores citation instructions
   */
  addMissingCitations(response, context) {
    const availableSources = this.extractAvailableSourceTitles(context);

    // Split response into sentences
    const sentences = response.split(/([.!?]+\s+)/);
    let citedResponse = '';
    let sourceIndex = 0;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];

      // Skip empty sentences or punctuation
      if (!sentence.trim() || /^[.!?]+\s*$/.test(sentence)) {
        citedResponse += sentence;
        continue;
      }

      // Skip if already has citation
      if (/\[Source:/.test(sentence)) {
        citedResponse += sentence;
        continue;
      }

      // Skip markdown headers
      if (/^#{1,6}\s/.test(sentence.trim())) {
        citedResponse += sentence;
        continue;
      }

      // Skip bullets without content
      if (/^[-*]\s*$/.test(sentence.trim())) {
        citedResponse += sentence;
        continue;
      }

      // Try to find relevant source by matching keywords
      let matchedSource = null;
      for (const source of availableSources) {
        const sourceKeywords = source.toLowerCase().split(/\s+/);
        const sentenceText = sentence.toLowerCase();

        // If 60%+ of source keywords appear in sentence, it's a match
        const matchCount = sourceKeywords.filter(kw => sentenceText.includes(kw)).length;
        if (matchCount / sourceKeywords.length >= 0.6) {
          matchedSource = source;
          break;
        }
      }

      // If no match found, use round-robin from available sources
      if (!matchedSource && availableSources.length > 0) {
        matchedSource = availableSources[sourceIndex % availableSources.length];
        sourceIndex++;
      }

      // Add citation before sentence-ending punctuation
      if (matchedSource) {
        const citedSentence = sentence.replace(/([.!?]+)(\s*)$/, ` [Source: ${matchedSource}]$1$2`);
        citedResponse += citedSentence;
      } else {
        citedResponse += sentence;
      }
    }

    return citedResponse;
  }

  /**
   * Extract citations from AI response
   * Parses [Source: ...] format and links to PKG/RAG entities
   */
  extractCitations(response, context) {
    const citations = [];
    const citationRegex = /\[Source:\s*([^\]]+)\]/g;
    let match;

    while ((match = citationRegex.exec(response)) !== null) {
      const sourceRef = match[1].trim();

      // Find matching PKG node
      const pkgNode = context.pkgNodes.find(node => {
        const attrs = node.attrs || {};
        return attrs.decision_id === sourceRef ||
               attrs.meeting_id === sourceRef ||
               attrs.risk_id === sourceRef ||
               attrs.title === sourceRef ||
               attrs.issue_id === sourceRef;
      });

      // Find matching RAG document
      const ragDoc = context.ragDocuments.find(doc =>
        doc.title === sourceRef ||
        (doc.meta && doc.meta.meeting_id === sourceRef)
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
          docId: ragDoc.id,           // Primary key of rag_documents table
          sourceType: ragDoc.source_type,
          sourceId: ragDoc.id          // Use document ID as source_id for evidence linking
        });
      }
    }

    return citations;
  }

  /**
   * Store citations as evidence links
   * Creates evidence records linking AI response → source entities
   * ENHANCED: Now stores both PKG node and RAG document citations
   */
  async storeCitations(sessionId, citations) {
    for (const citation of citations) {
      try {
        if (citation.type === 'pkg_node') {
          // Create evidence record linking AI response → PKG entity
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
        } else if (citation.type === 'rag_document') {
          // Create evidence record linking AI response → RAG document
          // Use docId (primary key) for proper linkage
          await pool.query(`
            INSERT INTO evidence (
              entity_type, entity_id, evidence_type, source_type, source_id, quote_text, confidence
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            'ai_session',
            sessionId,
            'citation',
            'rag_documents',
            citation.docId,              // Use document primary key for proper linkage
            citation.sourceRef,
            'high'
          ]);
        }
      } catch (error) {
        console.error('Failed to store citation:', error);
        // Continue with next citation even if one fails
      }
    }
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
  /**
   * Extract available source titles from context for concrete citation examples
   * This helps the LLM see the ACTUAL sources it can cite
   */
  extractAvailableSourceTitles(context) {
    const titles = [];

    // Extract titles from PKG nodes
    if (context.pkgNodes && Array.isArray(context.pkgNodes)) {
      context.pkgNodes.forEach(node => {
        const attrs = node.attrs || {};
        const title = attrs.title ||
                     attrs.risk_id ||
                     attrs.decision_id ||
                     attrs.meeting_id ||
                     attrs.issue_id ||
                     attrs.task_id;
        if (title) {
          titles.push(String(title));
        }
      });
    }

    // Extract titles from RAG documents
    if (context.ragDocuments && Array.isArray(context.ragDocuments)) {
      context.ragDocuments.forEach(doc => {
        if (doc.title) {
          titles.push(String(doc.title));
        }
      });
    }

    // Remove duplicates and return
    return [...new Set(titles)];
  }

  /**
   * Debug citation context - helps troubleshoot citation issues
   */
  debugCitationContext(context) {
    const sources = this.extractAvailableSourceTitles(context);
    console.log('=== CITATION DEBUG ===');
    console.log(`Total sources available: ${sources.length}`);
    console.log('Sample sources:', sources.slice(0, 5));
    console.log('PKG nodes:', context.pkgNodes?.length || 0);
    console.log('RAG documents:', context.ragDocuments?.length || 0);
    console.log('======================');
  }

  /**
   * Debug helper to verify prompt construction
   */
  debugPromptConstruction(context, systemPrompt) {
    const sources = this.extractAvailableSourceTitles(context);
    console.log('=== PROMPT CONSTRUCTION DEBUG ===');
    console.log('Available sources count:', sources.length);
    console.log('Sample sources:', sources.slice(0, 5));
    console.log('System prompt includes sources?', systemPrompt.includes('AVAILABLE SOURCES'));
    console.log('Context includes [SOURCE: markers?', this.buildContextText(context).includes('[SOURCE:'));
    console.log('==================================');
  }

  /**
   * Build grounded prompt with citation instructions
   * ENHANCED: Ultra-explicit with visual separators and concrete examples
   */
  buildGroundedPrompt(userPrompt, context, agentType) {
    // Extract actual available source titles for concrete examples
    const availableSources = this.extractAvailableSourceTitles(context);

    // Build concrete citation examples using actual sources
    const exampleCitations = availableSources.slice(0, 3).map(source =>
      `"Information from the project [Source: ${source}]."`
    ).join('\n');

    // Build the sources list for the prompt
    const sourcesListText = availableSources.length > 0
      ? `\nAVAILABLE SOURCES (use exact titles for citations):\n${availableSources.slice(0, 20).map((s, i) => `${i + 1}. "${s}"`).join('\n')}\n${availableSources.length > 20 ? `\n... and ${availableSources.length - 20} more sources available\n` : ''}`
      : '';

    const systemPrompt = `You are an AI project management assistant. You MUST include citations for every fact.

ABSOLUTE REQUIREMENT - THIS IS NOT OPTIONAL:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every single factual claim MUST be followed by [Source: Title].
Responses without citations are INCORRECT and WILL BE REJECTED.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${sourcesListText}

CITATION RULES (MANDATORY - NO EXCEPTIONS):

1. After EVERY fact, add [Source: Title] using exact titles from above
2. Format: "The task was completed [Source: Create VM Inventory]."
3. Multiple facts = multiple citations: "Task X was done [Source: Task X]. Task Y was completed [Source: Task Y]."
4. Context items are marked [SOURCE: Title] - those are your citation targets
5. If you can't cite a fact, DO NOT include that fact

CORRECT FORMAT:
${exampleCitations || '"The migration uses 7 steps [Source: Migration Strategy]."'}

WRONG FORMAT (WILL BE REJECTED):
"The migration uses 7 steps." ← MISSING CITATION - INCORRECT!

Agent Mode: ${agentType}

PROJECT CONTEXT (cite these sources using [Source: Title]):
${this.buildContextText(context)}

FINAL REMINDER: Your response MUST include [Source: Title] after every factual statement. This is not negotiable.`;

    const wrappedUserPrompt = `${userPrompt}

CRITICAL INSTRUCTION:
You MUST add [Source: Title] after EVERY fact using the exact source titles from the list above.

Required format example:
"The RPO and RTO requirements were defined [Source: Define RPO and RTO Requirements]. The VM inventory was created [Source: Create VM Inventory]. The backup validation is in progress [Source: Backup Validation Strategy]."

Every factual sentence needs a citation. No exceptions.`;

    return {
      system: systemPrompt,
      user: wrappedUserPrompt
    };
  }

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
          
          // Extract title/identifier from attrs - MUST MATCH extractAvailableSourceTitles
          const title = attrs.title || 
                       attrs.risk_id || 
                       attrs.decision_id || 
                       attrs.meeting_id ||
                       attrs.issue_id ||
                       attrs.task_id ||
                       `${type} #${node.id}`;
          
          // **CRITICAL**: Show the source identifier clearly so LLM can cite it
          text += `### [SOURCE: ${title}]\n\n`;
          
          // Add description if available
          if (attrs.description) {
            const desc = attrs.description.substring(0, 300);
            text += `${desc}${attrs.description.length > 300 ? '...' : ''}\n\n`;
          }
          
          // Add metadata in structured format
          const metadata = [];
          if (attrs.status) metadata.push(`Status: ${attrs.status}`);
          if (attrs.priority) metadata.push(`Priority: ${attrs.priority}`);
          if (attrs.owner) metadata.push(`Owner: ${attrs.owner}`);
          if (attrs.due_date) metadata.push(`Due: ${attrs.due_date}`);
          
          if (metadata.length > 0) {
            text += metadata.join(' | ') + '\n\n';
          }
          
          // Add AI detection info
          if (node.created_by_ai) {
            text += `_(AI-detected, confidence: ${node.ai_confidence})_\n\n`;
          }
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
        const title = doc.title || doc.meta?.title || 'Document';
        
        // **CRITICAL**: Show the source identifier clearly
        text += `### [SOURCE: ${title}]\n\n`;
        
        text += `Type: ${doc.source_type}\n\n`;
        
        // Use snippet from ts_headline (highlighted excerpts) if available, otherwise fallback to content
        const content = doc.snippet || doc.content;
        if (content) {
          text += `${content.substring(0, 400)}...\n\n`;
        }
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

  /**
   * Submit user feedback on an AI agent response
   */
  async submitFeedback({ sessionId, projectId, userId, feedbackType, feedbackText = null, feedbackTags = null }) {
    try {
      const result = await pool.query(`
        INSERT INTO ai_agent_session_feedback (
          session_id,
          project_id,
          user_id,
          feedback_type,
          feedback_text,
          feedback_tags
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (session_id, user_id)
        DO UPDATE SET
          feedback_type = EXCLUDED.feedback_type,
          feedback_text = EXCLUDED.feedback_text,
          feedback_tags = EXCLUDED.feedback_tags,
          created_at = NOW()
        RETURNING *
      `, [sessionId, projectId, userId, feedbackType, feedbackText, feedbackTags]);

      return result.rows[0];
    } catch (error) {
      console.error('Error submitting feedback:', error);
      throw error;
    }
  }
}

module.exports = new AIAgentService();
