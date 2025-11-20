const { pool } = require('../db');
const aiAgentService = require('./aiAgent');
const axios = require('axios');

/**
 * AI Agent Streaming Service
 * Provides real-time streaming responses for better UX
 */

class AIAgentStreaming {
  /**
   * Stream chat response in real-time
   */
  async streamChatResponse({ projectId, userId, prompt, agentType, responseStream }) {
    let streamActive = true;
    
    // Set up heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (streamActive && responseStream.writable) {
        responseStream.write(': heartbeat\n\n');
      }
    }, 15000); // Every 15 seconds

    try {
      // 1. Create session
      const session = await aiAgentService.createSession({
        projectId,
        userId,
        agentType,
        userPrompt: prompt
      });

      // Send session ID immediately
      if (responseStream.writable) {
        responseStream.write(`data: ${JSON.stringify({ type: 'session', sessionId: session.session_id })}\n\n`);
      }

      // 2. Assemble context
      if (responseStream.writable) {
        responseStream.write(`data: ${JSON.stringify({ type: 'status', message: 'Assembling context...' })}\n\n`);
      }

      const context = await aiAgentService.assembleContext({
        projectId,
        userPrompt: prompt,
        agentType
      });

      if (responseStream.writable) {
        responseStream.write(`data: ${JSON.stringify({
          type: 'context',
          pkgNodes: context.pkgNodes.length,
          ragDocs: context.ragDocuments.length
        })}\n\n`);
      }

      // 3. Call LLM with streaming
      if (responseStream.writable) {
        responseStream.write(`data: ${JSON.stringify({ type: 'status', message: 'Generating response...' })}\n\n`);
      }

      const llmResult = await this.streamLLMResponse({
        sessionId: session.session_id,
        context,
        userPrompt: prompt,
        agentType,
        responseStream
      });

      // FIXED: Extract citations directly from response
      const citations = aiAgentService.extractCitations(llmResult.fullResponse, context);
      
      // 4. Complete session (this saves citations to database)
      await aiAgentService.completeSession({
        sessionId: session.session_id,
        response: llmResult.fullResponse,
        confidenceScore: 0.85,
        pkgNodesUsed: context.pkgNodes.map(n => n.id),
        ragDocsUsed: context.ragDocuments.map(d => d.id),
        tokensUsed: llmResult.tokensUsed,
        latency: llmResult.latency,
        citations: citations
      });

      // Send completion
      if (responseStream.writable) {
        responseStream.write(`data: ${JSON.stringify({ type: 'complete', sessionId: session.session_id })}\n\n`);
      }

      // FIXED: Fetch enriched citations from database (with URLs and tooltips for frontend)
      let enrichedCitations = [];
      try {
        // Query database directly instead of HTTP call (more efficient)
        const sessionResult = await pool.query(`
          SELECT id FROM ai_agent_sessions WHERE session_id = $1
        `, [session.session_id]);

        if (sessionResult.rows.length > 0) {
          const sessionIntId = sessionResult.rows[0].id;

          // FIXED: Fetch enriched citations with PKG node data AND RAG document data
          const result = await pool.query(`
            -- PKG node citations
            SELECT
              'pkg_node' as citation_type,
              e.quote_text as source_ref,
              e.source_type,
              e.source_id,
              p.type as node_type,
              p.attrs
            FROM evidence e
            LEFT JOIN pkg_nodes p ON e.source_type = p.source_table 
              AND e.source_id = p.source_id::text
            WHERE e.entity_type = 'ai_session'
              AND e.entity_id = $1
              AND e.source_type != 'rag_documents'

            UNION ALL

            -- RAG document citations
            SELECT
              'rag_document' as citation_type,
              e.quote_text as source_ref,
              e.source_type,
              e.source_id,
              NULL as node_type,
              jsonb_build_object(
                'id', r.id,
                'title', r.title,
                'source_type', r.source_type
              ) as attrs
            FROM evidence e
            LEFT JOIN rag_documents r ON e.source_id = r.id::text
            WHERE e.entity_type = 'ai_session'
              AND e.entity_id = $1
              AND e.source_type = 'rag_documents'
          `, [sessionIntId]);

          // Transform citations with URLs and tooltips (including projectId)
          enrichedCitations = result.rows.map(row => {
            const baseInfo = {
              type: row.citation_type,
              sourceRef: row.source_ref
            };

            if (row.citation_type === 'pkg_node') {
              const urlMap = {
                'Decision': '/index.html',
                'Meeting': '/index.html',
                'Risk': '/risks.html',
                'Task': '/index.html'
              };
              
              const safeSourceId = String(row.source_id || '').replace(/[^\w-]/g, '');
              const basePath = urlMap[row.node_type];
              
              if (!basePath) {
                return {
                  ...baseInfo,
                  nodeType: row.node_type,
                  url: '#',
                  tooltip: 'Unknown entity type'
                };
              }

              // Use 'project' param for index.html (Kanban board), 'projectId' for others
              // Use URL hash fragment to auto-open the modal for the specific item
              const projectParam = basePath === '/index.html' ? 'project' : 'projectId';
              const hashFragment = row.node_type === 'Task' ? `#task-${safeSourceId}` : 
                                   row.node_type === 'Risk' ? `#risk-${safeSourceId}` :
                                   row.node_type === 'Decision' ? `#decision-${safeSourceId}` :
                                   row.node_type === 'Meeting' ? `#meeting-${safeSourceId}` : '';
              const citationUrl = `${basePath}?${projectParam}=${encodeURIComponent(projectId)}${hashFragment}`;
              
              return {
                ...baseInfo,
                nodeType: row.node_type,
                sourceTable: row.source_type,
                sourceId: safeSourceId,
                title: row.attrs?.title || row.source_ref,
                url: citationUrl,
                tooltip: `View ${row.node_type?.toLowerCase() || 'entity'}: ${(row.attrs?.title || row.source_ref || '').substring(0, 100)}`
              };
            } else if (row.citation_type === 'rag_document') {
              // RAG document citation
              const safeDocId = String(row.source_id || '').replace(/[^\w-]/g, '');
              
              return {
                ...baseInfo,
                docId: safeDocId,
                sourceType: row.attrs?.source_type,
                title: row.attrs?.title || row.source_ref,
                url: `/documents.html?projectId=${encodeURIComponent(projectId)}&id=${encodeURIComponent(safeDocId)}`,
                tooltip: `View document: ${(row.attrs?.title || row.source_ref || '').substring(0, 100)}`
              };
            }
          });

          console.log(`✅ Fetched ${enrichedCitations.length} enriched citations for session ${session.session_id}`);
        }
      } catch (err) {
        console.error('Failed to fetch enriched citations:', err);
        // Fallback: send empty citations if fetch fails
        enrichedCitations = [];
      }

      // FIXED: Send enriched citations with URLs and tooltips (not raw citations)
      if (responseStream.writable) {
        responseStream.write(`data: ${JSON.stringify({ 
          type: 'citations', 
          citations: enrichedCitations
        })}\n\n`);
      }

      streamActive = false;
      clearInterval(heartbeat);
      responseStream.end();

    } catch (error) {
      console.error('Streaming error:', error);
      streamActive = false;
      clearInterval(heartbeat);
      
      // Send structured error event with proper SSE framing
      if (responseStream.writable) {
        responseStream.write(`event: error\n`);
        responseStream.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      }
      
      // Ensure stream is properly closed
      if (!responseStream.closed) {
        responseStream.end();
      }
    }
  }

  /**
   * Stream LLM response with Server-Sent Events
   */
  async streamLLMResponse({ sessionId, context, userPrompt, agentType, responseStream }) {
    const startTime = Date.now();
    let fullResponse = '';
    let tokensUsed = 0;

    // FIXED: Use grounded prompt with citation instructions
    const { system: systemPrompt, user: userPromptWrapped } = aiAgentService.buildGroundedPrompt(userPrompt, context, agentType);

    // DEBUG: Verify prompt construction
    aiAgentService.debugPromptConstruction(context, systemPrompt);

    try {
      // Stream from Anthropic Claude
      if (aiAgentService.defaultModel.startsWith('claude')) {
        // ENHANCED: Add prefill to force citation format
        const messagesWithPrefill = [
          { role: 'user', content: userPromptWrapped },
          { 
            role: 'assistant', 
            content: 'I will provide a comprehensive answer with citations in [Source: Title] format after every fact.'
          }
        ];

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': aiAgentService.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: aiAgentService.defaultModel,
            max_tokens: 4096,
            temperature: 0.3,  // Lower temperature for instruction-following
            system: systemPrompt,
            messages: messagesWithPrefill,
            stream: true
          })
        });

        // Check response status
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
        }

        if (!response.body) {
          throw new Error('No response body from Anthropic API');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          // Check if stream is still writable
          if (!responseStream.writable) {
            console.log('Client disconnected, aborting stream');
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (!responseStream.writable) break;

            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === 'content_block_delta') {
                  const text = parsed.delta?.text || '';
                  fullResponse += text;

                  // Stream to client (with writable check)
                  if (responseStream.writable) {
                    responseStream.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
                  }
                }

                if (parsed.usage) {
                  tokensUsed = parsed.usage.input_tokens + parsed.usage.output_tokens;
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }
      // Stream from OpenAI GPT
      else if (aiAgentService.defaultModel.startsWith('gpt')) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiAgentService.apiKey}`
          },
          body: JSON.stringify({
            model: aiAgentService.defaultModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPromptWrapped }
            ],
            max_tokens: 4096,
            temperature: 0.3,
            stream: true
          })
        });

        // Check response status
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
        }

        if (!response.body) {
          throw new Error('No response body from OpenAI API');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          // Check if stream is still writable
          if (!responseStream.writable) {
            console.log('Client disconnected, aborting stream');
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (!responseStream.writable) break;

            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const text = parsed.choices?.[0]?.delta?.content || '';

                if (text) {
                  fullResponse += text;
                  // Stream to client (with writable check)
                  if (responseStream.writable) {
                    responseStream.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
                  }
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      const latency = Date.now() - startTime;

      // ENHANCED: Prepend prefill text for Claude responses
      if (aiAgentService.defaultModel.startsWith('claude')) {
        fullResponse = 'I will provide a comprehensive answer with citations in [Source: Title] format after every fact. ' + fullResponse;
      }

      // FALLBACK: If no citations were included, add them automatically
      let citations = aiAgentService.extractCitations(fullResponse, context);
      if (citations.length === 0 && (context.pkgNodes.length > 0 || context.ragDocuments.length > 0)) {
        console.warn('⚠️ LLM did not include citations. Adding them automatically...');
        fullResponse = aiAgentService.addMissingCitations(fullResponse, context);
        citations = aiAgentService.extractCitations(fullResponse, context);
        console.log(`✅ Added ${citations.length} citations automatically`);
      } else {
        console.log(`✅ LLM included ${citations.length} citations`);
      }

      // Log to audit
      await aiAgentService.logAction({
        sessionId,
        actionType: 'llm_call_streaming',
        actionDescription: `Streamed response from ${aiAgentService.defaultModel}`,
        inputData: { userPrompt },
        outputData: { responseLength: fullResponse.length, tokensUsed, citationCount: citations.length },
        executionTimeMs: latency
      });

      return {
        fullResponse,
        tokensUsed,
        latency
      };

    } catch (error) {
      console.error('LLM streaming error:', error);
      throw error;
    }
  }
}

module.exports = new AIAgentStreaming();
