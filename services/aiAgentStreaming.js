const { pool } = require('../db');
const aiAgentService = require('./aiAgent');

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
      
      // 4. Complete session
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

      // FIXED: Always send citations event (even if empty) so frontend can finalize
      if (responseStream.writable) {
        responseStream.write(`data: ${JSON.stringify({ 
          type: 'citations', 
          citations: citations || []
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
            content: 'I will provide a comprehensive answer with citations in [Source: Title] format after every fact. Here is my response:\n\n'
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
        fullResponse = 'I will provide a comprehensive answer with citations in [Source: Title] format after every fact. Here is my response:\n\n' + fullResponse;
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
