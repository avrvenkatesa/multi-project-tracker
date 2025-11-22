const contextAssembly = require('./contextAssembly');

class PromptBuilderService {
  constructor() {
    this.providers = {
      claude: 'claude-3-5-sonnet-20241022',
      openai: 'gpt-4-turbo-preview',
      gemini: 'gemini-1.5-pro'
    };

    this.tokenCosts = {
      claude: { input: 3, output: 15 },
      openai: { input: 10, output: 30 },
      gemini: { input: 1.25, output: 5 }
    };

    this.maxTokens = {
      claude: 4096,
      openai: 4096,
      gemini: 8192
    };
  }

  getProviderConfig() {
    const primary = process.env.PRIMARY_LLM_PROVIDER || 'claude';
    const fallback = process.env.FALLBACK_LLM_PROVIDER || 'openai';

    const apiKeys = {
      claude: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      gemini: process.env.GOOGLE_AI_API_KEY
    };

    if (!apiKeys[primary]) {
      console.warn(`Primary provider ${primary} has no API key, using fallback ${fallback}`);
      return { provider: fallback, apiKey: apiKeys[fallback] };
    }

    return { provider: primary, apiKey: apiKeys[primary], fallback };
  }

  async buildExtractionPrompt({ message, context, source, provider }) {
    const activeProvider = provider || this.getProviderConfig().provider;

    const systemPrompt = this.buildSystemPrompt(activeProvider);
    const projectContext = this.buildProjectContext(context);
    const conversationContext = this.buildConversationContext(context);
    const entitySchema = this.buildEntitySchema(activeProvider);
    const examples = this.buildExamples(activeProvider);

    let prompt;

    switch (activeProvider) {
      case 'claude':
        prompt = this.buildClaudePrompt({
          message,
          projectContext,
          conversationContext,
          entitySchema,
          examples,
          source
        });
        break;
      
      case 'openai':
        prompt = this.buildOpenAIPrompt({
          message,
          projectContext,
          conversationContext,
          entitySchema,
          examples,
          source
        });
        break;
      
      case 'gemini':
        prompt = this.buildGeminiPrompt({
          message,
          projectContext,
          conversationContext,
          entitySchema,
          examples,
          source
        });
        break;
      
      default:
        throw new Error(`Unsupported provider: ${activeProvider}`);
    }

    const tokens = this.estimateTokens(prompt, activeProvider);

    return {
      prompt,
      systemPrompt,
      provider: activeProvider,
      estimatedTokens: tokens
    };
  }

  buildSystemPrompt(provider) {
    const basePrompt = `You are an expert AI entity extraction specialist for project management systems. Your role is to analyze conversations, messages, and documents to identify and extract structured project entities.

Your capabilities:
- Detect Decisions, Risks, Action Items, Tasks, and other project entities
- Extract key information: title, description, priority, deadlines, owners
- Identify relationships between entities
- Provide confidence scores for your detections
- Cite specific evidence from the source material

Guidelines:
- Be conservative: Only extract entities with high confidence (≥0.7)
- Preserve context: Include relevant background information
- Cite evidence: Reference specific quotes or mentions
- Identify users: Extract mentioned people and their roles
- Link entities: Connect related decisions, risks, and tasks
- Use structured output: Follow the provided JSON schema exactly`;

    switch (provider) {
      case 'claude':
        return basePrompt + '\n\nUse clear reasoning and provide your analysis in well-structured JSON format.';
      
      case 'openai':
        return basePrompt + '\n\nRespond with valid JSON only, following the schema provided.';
      
      case 'gemini':
        return basePrompt + '\n\nProvide your response as valid JSON matching the schema below.';
      
      default:
        return basePrompt;
    }
  }

  buildProjectContext(context) {
    if (!context || !context.projectMetadata) {
      return 'No project context available.';
    }

    const { projectMetadata, pkgEntities, ragDocuments } = context;

    let contextText = `Project: ${projectMetadata.name}\n`;
    if (projectMetadata.description) {
      contextText += `Description: ${projectMetadata.description}\n`;
    }

    if (pkgEntities && pkgEntities.length > 0) {
      contextText += '\nExisting Entities (Top 5):\n';
      pkgEntities.slice(0, 5).forEach((entity, idx) => {
        contextText += `${idx + 1}. [${entity.type}] ${entity.title} (ID: ${entity.entityId})\n`;
        if (entity.description) {
          const shortDesc = entity.description.substring(0, 100);
          contextText += `   ${shortDesc}${entity.description.length > 100 ? '...' : ''}\n`;
        }
      });
    }

    if (ragDocuments && ragDocuments.length > 0) {
      contextText += '\nRelevant Documents:\n';
      ragDocuments.slice(0, 3).forEach((doc, idx) => {
        contextText += `${idx + 1}. ${doc.title || doc.type}\n`;
        if (doc.content) {
          const summary = doc.content.substring(0, 200);
          contextText += `   ${summary}${doc.content.length > 200 ? '...' : ''}\n`;
        }
      });
    }

    return contextText;
  }

  buildConversationContext(context) {
    if (!context || !context.recentConversation || context.recentConversation.length === 0) {
      return 'No recent conversation history.';
    }

    let conversationText = 'Recent Conversation:\n';
    
    context.recentConversation.slice(0, 10).forEach((msg, idx) => {
      const timestamp = new Date(msg.createdAt).toLocaleString();
      conversationText += `[${timestamp}] ${msg.content}\n`;
    });

    return conversationText;
  }

  buildEntitySchema(provider) {
    const schema = {
      entities: {
        type: 'array',
        items: {
          entity_type: 'string (Decision | Risk | Action Item | Task | None)',
          confidence: 'number (0.0 - 1.0)',
          title: 'string (max 100 chars)',
          description: 'string (max 500 chars)',
          priority: 'string (Critical | High | Medium | Low)',
          impact: 'string (Critical | High | Medium | Low) - for Risks only',
          tags: 'array of strings',
          mentioned_users: 'array of strings',
          related_entity_ids: 'array of integers',
          reasoning: 'string - why classified this way',
          citations: 'array of strings - specific quotes',
          deadline: 'string (ISO date) - for Action Items/Tasks',
          owner: 'string - assigned person if mentioned'
        }
      }
    };

    switch (provider) {
      case 'claude':
        return `<schema>
${JSON.stringify(schema, null, 2)}
</schema>`;
      
      case 'openai':
        return `### Entity Schema\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``;
      
      case 'gemini':
        return `ENTITY SCHEMA:\n${JSON.stringify(schema, null, 2)}`;
      
      default:
        return JSON.stringify(schema, null, 2);
    }
  }

  buildExamples(provider) {
    const examples = [
      {
        input: 'We decided to migrate from MySQL to PostgreSQL for better JSON support and scalability.',
        output: {
          entities: [{
            entity_type: 'Decision',
            confidence: 0.95,
            title: 'Migration from MySQL to PostgreSQL',
            description: 'Database migration decision to leverage better JSON support and scalability features in PostgreSQL',
            priority: 'High',
            tags: ['database', 'migration', 'postgresql', 'mysql'],
            mentioned_users: [],
            related_entity_ids: [],
            reasoning: 'Clear decision statement with rationale provided',
            citations: ['migrate from MySQL to PostgreSQL for better JSON support and scalability'],
            deadline: null,
            owner: null
          }]
        }
      },
      {
        input: 'There is a critical security vulnerability in our authentication system. Users can bypass 2FA. @john please fix this ASAP.',
        output: {
          entities: [{
            entity_type: 'Risk',
            confidence: 0.98,
            title: 'Critical 2FA bypass vulnerability',
            description: 'Security vulnerability allowing users to bypass two-factor authentication in the auth system',
            priority: 'Critical',
            impact: 'Critical',
            tags: ['security', 'authentication', '2fa', 'vulnerability'],
            mentioned_users: ['john'],
            related_entity_ids: [],
            reasoning: 'Explicit mention of security vulnerability with critical impact',
            citations: ['critical security vulnerability', 'Users can bypass 2FA'],
            deadline: null,
            owner: 'john'
          }]
        }
      },
      {
        input: 'The weather is nice today. I had coffee this morning.',
        output: {
          entities: [{
            entity_type: 'None',
            confidence: 0.99,
            title: 'Not project-related',
            description: 'Casual conversation with no project management relevance',
            priority: 'Low',
            tags: [],
            mentioned_users: [],
            related_entity_ids: [],
            reasoning: 'No project-related content detected',
            citations: [],
            deadline: null,
            owner: null
          }]
        }
      }
    ];

    switch (provider) {
      case 'claude':
        return examples.map((ex, idx) => 
          `<example${idx + 1}>
<input>${ex.input}</input>
<output>${JSON.stringify(ex.output, null, 2)}</output>
</example${idx + 1}>`
        ).join('\n\n');
      
      case 'openai':
        return examples.map((ex, idx) => 
          `**Example ${idx + 1}:**\n\nInput: "${ex.input}"\n\nOutput:\n\`\`\`json\n${JSON.stringify(ex.output, null, 2)}\n\`\`\``
        ).join('\n\n');
      
      case 'gemini':
        return examples.map((ex, idx) => 
          `EXAMPLE ${idx + 1}:\nInput: ${ex.input}\nOutput: ${JSON.stringify(ex.output, null, 2)}`
        ).join('\n\n');
      
      default:
        return JSON.stringify(examples, null, 2);
    }
  }

  buildClaudePrompt({ message, projectContext, conversationContext, entitySchema, examples, source }) {
    return `<project_context>
${projectContext}
</project_context>

<conversation_history>
${conversationContext}
</conversation_history>

<message_to_analyze>
Source: ${source?.type || 'unknown'}
Content: ${message}
</message_to_analyze>

${entitySchema}

<examples>
${examples}
</examples>

<instructions>
Analyze the message above and extract any project entities (Decisions, Risks, Action Items, Tasks).

Requirements:
1. Only extract entities with confidence ≥ 0.7
2. Use the project context and conversation history for additional context
3. Cite specific quotes that support your extraction
4. Identify mentioned users and related entities
5. Provide clear reasoning for your classification
6. Return valid JSON matching the schema exactly

If no project-related entities are found, return entity_type: "None" with appropriate reasoning.
</instructions>`;
  }

  buildOpenAIPrompt({ message, projectContext, conversationContext, entitySchema, examples, source }) {
    return `# Project Context
${projectContext}

# Conversation History
${conversationContext}

# Message to Analyze
**Source:** ${source?.type || 'unknown'}
**Content:** ${message}

${entitySchema}

# Examples
${examples}

# Instructions
Analyze the message above and extract any project entities (Decisions, Risks, Action Items, Tasks).

**Requirements:**
- Only extract entities with confidence ≥ 0.7
- Use the project context and conversation history for additional context
- Cite specific quotes that support your extraction
- Identify mentioned users and related entities
- Provide clear reasoning for your classification
- Return valid JSON matching the schema exactly

If no project-related entities are found, return entity_type: "None" with appropriate reasoning.

**Return only valid JSON. No additional text.**`;
  }

  buildGeminiPrompt({ message, projectContext, conversationContext, entitySchema, examples, source }) {
    return `PROJECT CONTEXT:
${projectContext}

CONVERSATION HISTORY:
${conversationContext}

MESSAGE TO ANALYZE:
Source: ${source?.type || 'unknown'}
Content: ${message}

${entitySchema}

EXAMPLES:
${examples}

INSTRUCTIONS:
Analyze the message above and extract any project entities (Decisions, Risks, Action Items, Tasks).

Requirements:
1. Only extract entities with confidence >= 0.7
2. Use the project context and conversation history for additional context
3. Cite specific quotes that support your extraction
4. Identify mentioned users and related entities
5. Provide clear reasoning for your classification
6. Return valid JSON matching the schema exactly

If no project-related entities are found, return entity_type: "None" with appropriate reasoning.

Respond with valid JSON only.`;
  }

  estimateTokens(prompt, provider) {
    const avgCharsPerToken = {
      claude: 4,
      openai: 4,
      gemini: 4
    };

    const chars = typeof prompt === 'string' 
      ? prompt.length 
      : JSON.stringify(prompt).length;

    return Math.ceil(chars / (avgCharsPerToken[provider] || 4));
  }

  estimateCost(inputTokens, outputTokens, provider) {
    const costs = this.tokenCosts[provider];
    if (!costs) {
      return 0;
    }

    const inputCost = (inputTokens / 1000000) * costs.input;
    const outputCost = (outputTokens / 1000000) * costs.output;

    return {
      inputCost: parseFloat(inputCost.toFixed(6)),
      outputCost: parseFloat(outputCost.toFixed(6)),
      totalCost: parseFloat((inputCost + outputCost).toFixed(6)),
      provider
    };
  }

  getMaxTokens(provider) {
    return this.maxTokens[provider] || 4096;
  }

  validateProvider(provider) {
    if (!this.providers[provider]) {
      throw new Error(`Invalid provider: ${provider}. Supported: ${Object.keys(this.providers).join(', ')}`);
    }

    const apiKeys = {
      claude: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      gemini: process.env.GOOGLE_AI_API_KEY
    };

    if (!apiKeys[provider]) {
      throw new Error(`API key not found for provider: ${provider}`);
    }

    return true;
  }
}

module.exports = new PromptBuilderService();
