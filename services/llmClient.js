const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { pool } = require('../db');

class LLMClientService {
  constructor() {
    this.clients = {};
    this.maxRetries = 3;
    this.baseDelay = 1000;
    
    this.initializeClients();
  }

  initializeClients() {
    if (process.env.ANTHROPIC_API_KEY) {
      this.clients.claude = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }

    if (process.env.OPENAI_API_KEY) {
      this.clients.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }

    if (process.env.GOOGLE_AI_API_KEY) {
      this.clients.gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    }
  }

  getProviderFromConfig() {
    const primary = process.env.PRIMARY_LLM_PROVIDER || 'claude';
    const fallback = process.env.FALLBACK_LLM_PROVIDER || 'openai';

    return { primary, fallback };
  }

  async extractEntities({ prompt, systemPrompt, context, provider }) {
    const { primary, fallback } = this.getProviderFromConfig();
    const activeProvider = provider || primary;

    try {
      console.log(`[LLM Client] Using provider: ${activeProvider}`);
      
      const result = await this.callProvider(activeProvider, prompt, systemPrompt);
      
      await this.trackUsage(
        result.usage.inputTokens,
        result.usage.outputTokens,
        activeProvider,
        context?.projectMetadata?.id
      );

      return {
        entities: result.entities,
        usage: result.usage,
        provider: activeProvider,
        model: result.model
      };

    } catch (error) {
      console.error(`[LLM Client] Provider ${activeProvider} failed:`, error.message);

      if (activeProvider !== fallback && this.clients[fallback]) {
        console.log(`[LLM Client] Falling back to ${fallback}`);
        
        try {
          const result = await this.callProvider(fallback, prompt, systemPrompt);
          
          await this.trackUsage(
            result.usage.inputTokens,
            result.usage.outputTokens,
            fallback,
            context?.projectMetadata?.id
          );

          return {
            entities: result.entities,
            usage: result.usage,
            provider: fallback,
            model: result.model,
            fallbackUsed: true
          };
        } catch (fallbackError) {
          console.error(`[LLM Client] Fallback provider ${fallback} also failed:`, fallbackError.message);
          throw new Error(`All providers failed. Primary: ${error.message}, Fallback: ${fallbackError.message}`);
        }
      }

      throw error;
    }
  }

  async callProvider(provider, prompt, systemPrompt) {
    switch (provider) {
      case 'claude':
        return await this.callClaude(prompt, systemPrompt);
      case 'openai':
        return await this.callOpenAI(prompt, systemPrompt);
      case 'gemini':
        return await this.callGemini(prompt, systemPrompt);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  async callClaude(prompt, systemPrompt) {
    if (!this.clients.claude) {
      throw new Error('Claude client not initialized. Check ANTHROPIC_API_KEY.');
    }

    return await this.retryWithBackoff(async () => {
      const response = await this.clients.claude.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 0.3,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0].text;
      const entities = this.parseResponse(content, 'claude');

      return {
        entities,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        },
        model: response.model
      };
    }, 'claude');
  }

  async callOpenAI(prompt, systemPrompt) {
    if (!this.clients.openai) {
      throw new Error('OpenAI client not initialized. Check OPENAI_API_KEY.');
    }

    return await this.retryWithBackoff(async () => {
      const response = await this.clients.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        max_tokens: 4096,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.choices[0].message.content;
      const entities = this.parseResponse(content, 'openai');

      return {
        entities,
        usage: {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens
        },
        model: response.model
      };
    }, 'openai');
  }

  async callGemini(prompt, systemPrompt) {
    if (!this.clients.gemini) {
      throw new Error('Gemini client not initialized. Check GOOGLE_AI_API_KEY.');
    }

    return await this.retryWithBackoff(async () => {
      const model = this.clients.gemini.getGenerativeModel({
        model: 'gemini-1.5-pro',
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json'
        }
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const content = response.text();

      const entities = this.parseResponse(content, 'gemini');

      const inputTokens = response.usageMetadata?.promptTokenCount || 0;
      const outputTokens = response.usageMetadata?.candidatesTokenCount || 0;

      return {
        entities,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens
        },
        model: 'gemini-1.5-pro'
      };
    }, 'gemini');
  }

  parseResponse(content, provider) {
    try {
      let cleanContent = content.trim();

      if (cleanContent.startsWith('#') || cleanContent.includes('## ')) {
        return cleanContent;
      }

      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/```\n?/g, '');
      }

      const parsed = JSON.parse(cleanContent);

      if (!parsed.entities || !Array.isArray(parsed.entities)) {
        throw new Error('Response missing entities array');
      }

      const validatedEntities = parsed.entities.map(entity => 
        this.validateEntity(entity)
      );

      return validatedEntities;

    } catch (error) {
      console.error(`[LLM Client] Failed to parse ${provider} response:`, error.message);
      console.error('Raw content:', content.substring(0, 200));
      throw new Error(`Failed to parse ${provider} response: ${error.message}`);
    }
  }

  validateEntity(entity) {
    const validTypes = ['Decision', 'Risk', 'Action Item', 'Task', 'None'];
    const validPriorities = ['Critical', 'High', 'Medium', 'Low'];

    if (!entity.entity_type || !validTypes.includes(entity.entity_type)) {
      throw new Error(`Invalid entity_type: ${entity.entity_type}`);
    }

    if (typeof entity.confidence !== 'number' || entity.confidence < 0 || entity.confidence > 1) {
      throw new Error(`Invalid confidence: ${entity.confidence}`);
    }

    if (!entity.title || typeof entity.title !== 'string') {
      throw new Error('Missing or invalid title');
    }

    if (!entity.description || typeof entity.description !== 'string') {
      throw new Error('Missing or invalid description');
    }

    if (entity.priority && !validPriorities.includes(entity.priority)) {
      entity.priority = 'Medium';
    }

    return {
      entity_type: entity.entity_type,
      confidence: parseFloat(entity.confidence.toFixed(2)),
      title: entity.title.substring(0, 100),
      description: entity.description.substring(0, 500),
      priority: entity.priority || 'Medium',
      impact: entity.impact || null,
      tags: Array.isArray(entity.tags) ? entity.tags : [],
      mentioned_users: Array.isArray(entity.mentioned_users) ? entity.mentioned_users : [],
      related_entity_ids: Array.isArray(entity.related_entity_ids) ? entity.related_entity_ids : [],
      reasoning: entity.reasoning || '',
      citations: Array.isArray(entity.citations) ? entity.citations : [],
      deadline: entity.deadline || null,
      owner: entity.owner || null
    };
  }

  async retryWithBackoff(fn, provider) {
    let lastError;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        const shouldRetry = this.shouldRetry(error, attempt);
        
        if (!shouldRetry) {
          throw error;
        }

        const delay = this.baseDelay * Math.pow(2, attempt);
        console.log(`[LLM Client] Retry attempt ${attempt + 1}/${this.maxRetries} for ${provider} after ${delay}ms`);
        
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  shouldRetry(error, attempt) {
    if (attempt >= this.maxRetries - 1) {
      return false;
    }

    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.status || error.code;

    if (errorCode === 429) {
      return true;
    }

    if (errorCode === 401 || errorCode === 403) {
      return false;
    }

    if (errorCode >= 500 && errorCode < 600) {
      return true;
    }

    if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
      return true;
    }

    if (errorCode >= 400 && errorCode < 500) {
      return false;
    }

    return true;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async trackUsage(inputTokens, outputTokens, provider, projectId = null) {
    try {
      const costs = {
        claude: { input: 3, output: 15 },
        openai: { input: 10, output: 30 },
        gemini: { input: 1.25, output: 5 }
      };

      const providerCosts = costs[provider] || { input: 0, output: 0 };
      
      const inputCost = (inputTokens / 1000000) * providerCosts.input;
      const outputCost = (outputTokens / 1000000) * providerCosts.output;
      const totalCost = inputCost + outputCost;

      await pool.query(
        `INSERT INTO ai_cost_tracking (
          project_id,
          feature_type,
          provider,
          model,
          input_tokens,
          output_tokens,
          total_tokens,
          estimated_cost,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          projectId,
          'entity_extraction',
          provider,
          this.getModelName(provider),
          inputTokens,
          outputTokens,
          inputTokens + outputTokens,
          totalCost
        ]
      );

      console.log(`[LLM Client] Tracked usage: ${provider} - Input: ${inputTokens}, Output: ${outputTokens}, Cost: $${totalCost.toFixed(6)}`);

    } catch (error) {
      console.error('[LLM Client] Failed to track usage:', error.message);
    }
  }

  getModelName(provider) {
    const models = {
      claude: 'claude-3-5-sonnet-20241022',
      openai: 'gpt-4-turbo-preview',
      gemini: 'gemini-1.5-pro'
    };
    return models[provider] || 'unknown';
  }

  async getUsageStats(projectId, startDate, endDate) {
    try {
      const result = await pool.query(
        `SELECT 
          provider,
          COUNT(*) as request_count,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(estimated_cost) as total_cost
        FROM ai_cost_tracking
        WHERE project_id = $1
          AND created_at >= $2
          AND created_at <= $3
          AND feature_type = 'entity_extraction'
        GROUP BY provider
        ORDER BY total_cost DESC`,
        [projectId, startDate, endDate]
      );

      return result.rows.map(row => ({
        provider: row.provider,
        requestCount: parseInt(row.request_count),
        totalInputTokens: parseInt(row.total_input_tokens),
        totalOutputTokens: parseInt(row.total_output_tokens),
        totalTokens: parseInt(row.total_tokens),
        totalCost: parseFloat(row.total_cost)
      }));

    } catch (error) {
      console.error('[LLM Client] Failed to get usage stats:', error.message);
      return [];
    }
  }
}

module.exports = new LLMClientService();
