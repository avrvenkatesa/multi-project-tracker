const { expect } = require('chai');
const contextAssembly = require('../services/contextAssembly');
const promptBuilder = require('../services/promptBuilder');
const llmClient = require('../services/llmClient');

describe('AI Analysis Engine - Story 5.4.2', function() {
  this.timeout(10000);

  describe('Context Assembly Service', () => {
    it('should extract keywords from message', function() {
      const keywords = contextAssembly.extractKeywords(
        'We decided to migrate from MySQL to PostgreSQL for better performance'
      );

      expect(keywords).to.be.an('array');
      expect(keywords).to.include('decided');
      expect(keywords).to.include('migrate');
      expect(keywords).to.include('mysql');
      expect(keywords).to.include('postgresql');
      expect(keywords).to.not.include('to'); // stop word
      expect(keywords).to.not.include('for'); // stop word
    });

    it('should filter stop words', function() {
      const keywords = contextAssembly.extractKeywords(
        'The quick brown fox jumps across the lazy dog'
      );

      expect(keywords).to.not.include('the'); // stop word
      expect(keywords).to.include('across'); // NOT a stop word
      expect(keywords).to.include('quick');
      expect(keywords).to.include('brown');
      expect(keywords).to.include('jumps');
    });

    it('should limit keywords to 10', function() {
      const longMessage = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13';
      const keywords = contextAssembly.extractKeywords(longMessage);

      expect(keywords).to.have.lengthOf.at.most(10);
    });

    it('should calculate context quality score', function() {
      const context = {
        projectMetadata: { id: 1, name: 'Test' },
        pkgEntities: [{ id: 1 }, { id: 2 }],
        ragDocuments: [{ id: 1 }],
        recentConversation: [{ id: 1 }],
        userContext: { userId: 1 }
      };

      const score = contextAssembly.calculateContextQuality(context);
      
      expect(score).to.be.a('number');
      expect(score).to.be.at.least(0);
      expect(score).to.be.at.most(1);
      expect(score).to.be.greaterThan(0.4); // Reasonable with some data
    });

    it('should score empty context low', function() {
      const context = {
        projectMetadata: null,
        pkgEntities: [],
        ragDocuments: [],
        recentConversation: [],
        userContext: null
      };

      const score = contextAssembly.calculateContextQuality(context);
      
      expect(score).to.equal(0);
    });

    it('should get context summary', async function() {
      const context = {
        projectMetadata: { id: 1 },
        pkgEntities: [{ id: 1 }, { id: 2 }],
        ragDocuments: [{ id: 1 }],
        recentConversation: [{ id: 1 }],
        userContext: null,
        qualityScore: 0.75,
        assemblyTime: 250,
        keywords: ['test', 'keywords']
      };

      const summary = await contextAssembly.getContextSummary(context);

      expect(summary).to.be.an('object');
      expect(summary.hasProjectMetadata).to.be.true;
      expect(summary.pkgEntityCount).to.equal(2);
      expect(summary.ragDocumentCount).to.equal(1);
      expect(summary.qualityScore).to.equal(0.75);
      expect(summary.assemblyTime).to.equal(250);
      expect(summary.keywords).to.deep.equal(['test', 'keywords']);
    });
  });

  describe('Prompt Builder Service', () => {
    const mockContext = {
      projectMetadata: {
        id: 1,
        name: 'Test Project',
        description: 'A test project for AI analysis'
      },
      pkgEntities: [
        { type: 'decision', title: 'Use PostgreSQL', description: 'DB choice', entityId: 1 }
      ],
      ragDocuments: [
        { type: 'meeting', title: 'Sprint Planning', content: 'Discussed features' }
      ],
      recentConversation: [],
      userContext: null,
      keywords: ['database', 'performance']
    };

    it('should build extraction prompt for Claude', async function() {
      const result = await promptBuilder.buildExtractionPrompt({
        message: 'We decided to migrate to PostgreSQL for better JSON support',
        context: mockContext,
        source: { type: 'slack', platform: 'slack' },
        provider: 'claude'
      });

      expect(result).to.be.an('object');
      expect(result.prompt).to.be.a('string');
      expect(result.systemPrompt).to.be.a('string');
      expect(result.provider).to.equal('claude');
      expect(result.estimatedTokens).to.be.a('number');
      expect(result.prompt).to.include('<project_context>');
      expect(result.prompt).to.include('<message_to_analyze>');
      expect(result.prompt).to.include('PostgreSQL');
      expect(result.prompt).to.include('Test Project');
    });

    it('should build extraction prompt for OpenAI', async function() {
      const result = await promptBuilder.buildExtractionPrompt({
        message: 'Critical bug in authentication system',
        context: mockContext,
        source: { type: 'github', platform: 'github' },
        provider: 'openai'
      });

      expect(result).to.be.an('object');
      expect(result.provider).to.equal('openai');
      expect(result.prompt).to.include('# Project Context');
      expect(result.prompt).to.include('# Message to Analyze');
      expect(result.prompt).to.include('authentication');
    });

    it('should build extraction prompt for Gemini', async function() {
      const result = await promptBuilder.buildExtractionPrompt({
        message: 'Action required: update dependencies by Friday',
        context: mockContext,
        source: { type: 'email', platform: 'email' },
        provider: 'gemini'
      });

      expect(result).to.be.an('object');
      expect(result.provider).to.equal('gemini');
      expect(result.prompt).to.include('PROJECT CONTEXT:');
      expect(result.prompt).to.include('MESSAGE TO ANALYZE:');
      expect(result.prompt).to.include('dependencies');
    });

    it('should build system prompt', function() {
      const claudePrompt = promptBuilder.buildSystemPrompt('claude');
      const openaiPrompt = promptBuilder.buildSystemPrompt('openai');
      const geminiPrompt = promptBuilder.buildSystemPrompt('gemini');

      expect(claudePrompt).to.include('entity extraction specialist');
      expect(openaiPrompt).to.include('valid JSON');
      expect(geminiPrompt).to.include('valid JSON');
    });

    it('should build project context', function() {
      const contextText = promptBuilder.buildProjectContext(mockContext);

      expect(contextText).to.include('Test Project');
      expect(contextText).to.include('Use PostgreSQL');
      expect(contextText).to.include('Sprint Planning');
    });

    it('should handle missing context', function() {
      const contextText = promptBuilder.buildProjectContext({});

      expect(contextText).to.equal('No project context available.');
    });

    it('should estimate tokens accurately', function() {
      const prompt = 'This is a test prompt for token estimation';
      const tokens = promptBuilder.estimateTokens(prompt, 'claude');

      expect(tokens).to.be.a('number');
      expect(tokens).to.be.greaterThan(0);
      expect(tokens).to.be.lessThan(100);
    });

    it('should estimate costs for all providers', function() {
      const claudeCost = promptBuilder.estimateCost(1000, 500, 'claude');
      expect(claudeCost.provider).to.equal('claude');
      expect(claudeCost.totalCost).to.be.a('number');
      expect(claudeCost.inputCost).to.equal(0.003); // 1000 / 1M * $3
      expect(claudeCost.outputCost).to.equal(0.0075); // 500 / 1M * $15

      const openaiCost = promptBuilder.estimateCost(1000, 500, 'openai');
      expect(openaiCost.totalCost).to.be.greaterThan(claudeCost.totalCost);

      const geminiCost = promptBuilder.estimateCost(1000, 500, 'gemini');
      expect(geminiCost.totalCost).to.be.lessThan(claudeCost.totalCost);
    });

    it('should validate providers', function() {
      // Valid provider names should not throw for unknown provider
      expect(() => promptBuilder.validateProvider('invalid')).to.throw('Invalid provider');
      
      // Note: validateProvider also checks for API keys, which may not be set in test env
      // So we only test the invalid provider case which should always fail
    });

    it('should get max tokens for each provider', function() {
      expect(promptBuilder.getMaxTokens('claude')).to.equal(4096);
      expect(promptBuilder.getMaxTokens('openai')).to.equal(4096);
      expect(promptBuilder.getMaxTokens('gemini')).to.equal(8192);
    });
  });

  describe('LLM Client Service', () => {
    it('should parse valid JSON response', function() {
      const response = JSON.stringify({
        entities: [{
          entity_type: 'Decision',
          confidence: 0.95,
          title: 'Migrate to PostgreSQL',
          description: 'Decision to migrate database from MySQL to PostgreSQL',
          priority: 'High',
          tags: ['database', 'migration'],
          mentioned_users: [],
          related_entity_ids: [],
          reasoning: 'Clear decision statement',
          citations: ['migrate to PostgreSQL'],
          deadline: null,
          owner: null
        }]
      });

      const entities = llmClient.parseResponse(response, 'openai');

      expect(entities).to.be.an('array');
      expect(entities).to.have.lengthOf(1);
      expect(entities[0].entity_type).to.equal('Decision');
      expect(entities[0].confidence).to.equal(0.95);
      expect(entities[0].title).to.equal('Migrate to PostgreSQL');
    });

    it('should parse response with markdown code blocks', function() {
      const response = '```json\n{"entities": [{"entity_type": "Task", "confidence": 0.8, "title": "Test", "description": "Test task", "priority": "Medium", "tags": [], "mentioned_users": [], "related_entity_ids": [], "reasoning": "test", "citations": []}]}\n```';

      const entities = llmClient.parseResponse(response, 'claude');

      expect(entities).to.be.an('array');
      expect(entities[0].entity_type).to.equal('Task');
    });

    it('should validate entity structure', function() {
      const validEntity = {
        entity_type: 'Risk',
        confidence: 0.87,
        title: 'Performance issue',
        description: 'Database queries are slow',
        priority: 'High',
        tags: ['performance'],
        mentioned_users: ['john'],
        related_entity_ids: [1, 2],
        reasoning: 'Performance concerns mentioned',
        citations: ['queries are slow'],
        deadline: null,
        owner: 'john'
      };

      const validated = llmClient.validateEntity(validEntity);

      expect(validated).to.be.an('object');
      expect(validated.entity_type).to.equal('Risk');
      expect(validated.confidence).to.equal(0.87);
      expect(validated.tags).to.include('performance');
    });

    it('should truncate long titles and descriptions', function() {
      const entity = {
        entity_type: 'Decision',
        confidence: 0.9,
        title: 'A'.repeat(200),
        description: 'B'.repeat(1000),
        priority: 'Medium'
      };

      const validated = llmClient.validateEntity(entity);

      expect(validated.title).to.have.lengthOf(100);
      expect(validated.description).to.have.lengthOf(500);
    });

    it('should reject invalid entity types', function() {
      const invalidEntity = {
        entity_type: 'InvalidType',
        confidence: 0.8,
        title: 'Test',
        description: 'Test'
      };

      expect(() => llmClient.validateEntity(invalidEntity)).to.throw();
    });

    it('should reject invalid confidence scores', function() {
      const tooHigh = {
        entity_type: 'Task',
        confidence: 1.5,
        title: 'Test',
        description: 'Test'
      };

      const negative = {
        entity_type: 'Task',
        confidence: -0.2,
        title: 'Test',
        description: 'Test'
      };

      expect(() => llmClient.validateEntity(tooHigh)).to.throw();
      expect(() => llmClient.validateEntity(negative)).to.throw();
    });

    it('should determine retry logic correctly', function() {
      // Should retry on rate limits
      expect(llmClient.shouldRetry({ status: 429 }, 0)).to.be.true;
      
      // Should retry on 5xx errors
      expect(llmClient.shouldRetry({ status: 500 }, 0)).to.be.true;
      expect(llmClient.shouldRetry({ status: 503 }, 0)).to.be.true;
      
      // Should NOT retry on 4xx (except 429)
      expect(llmClient.shouldRetry({ status: 401 }, 0)).to.be.false;
      expect(llmClient.shouldRetry({ status: 404 }, 0)).to.be.false;
      
      // Should retry on timeouts
      expect(llmClient.shouldRetry({ message: 'timeout' }, 0)).to.be.true;
      
      // Should NOT retry after max attempts
      expect(llmClient.shouldRetry({ status: 500 }, 3)).to.be.false;
    });

    it('should get correct model names', function() {
      expect(llmClient.getModelName('claude')).to.equal('claude-3-5-sonnet-20241022');
      expect(llmClient.getModelName('openai')).to.equal('gpt-4-turbo-preview');
      expect(llmClient.getModelName('gemini')).to.equal('gemini-1.5-pro');
      expect(llmClient.getModelName('unknown')).to.equal('unknown');
    });

    it('should handle missing entities array in response', function() {
      const badResponse = JSON.stringify({ message: 'Hello' });

      expect(() => llmClient.parseResponse(badResponse, 'claude')).to.throw('missing entities array');
    });

    it('should handle malformed JSON', function() {
      const badJSON = 'This is not JSON';

      expect(() => llmClient.parseResponse(badJSON, 'openai')).to.throw();
    });

    it('should auto-correct invalid priority', function() {
      const entity = {
        entity_type: 'Task',
        confidence: 0.8,
        title: 'Test',
        description: 'Test',
        priority: 'UltraHigh' // Invalid
      };

      const validated = llmClient.validateEntity(entity);
      expect(validated.priority).to.equal('Medium'); // Auto-corrected
    });
  });

  describe('Integration Tests', () => {
    it('should complete full workflow: context → prompt → validation', async function() {
      const mockContext = {
        projectMetadata: { id: 1, name: 'Integration Test' },
        pkgEntities: [],
        ragDocuments: [],
        recentConversation: [],
        userContext: null,
        qualityScore: 0.5,
        assemblyTime: 100,
        keywords: ['security', 'vulnerability']
      };

      // Build prompt
      const promptData = await promptBuilder.buildExtractionPrompt({
        message: 'We have a critical security vulnerability in the auth system',
        context: mockContext,
        source: { type: 'slack' },
        provider: 'claude'
      });

      expect(promptData.prompt).to.include('vulnerability');
      expect(promptData.estimatedTokens).to.be.greaterThan(0);

      // Simulate LLM response
      const mockLLMResponse = JSON.stringify({
        entities: [{
          entity_type: 'Risk',
          confidence: 0.92,
          title: 'Security vulnerability in auth',
          description: 'Critical security issue requiring immediate attention',
          priority: 'Critical',
          impact: 'Critical',
          tags: ['security', 'auth'],
          mentioned_users: [],
          related_entity_ids: [],
          reasoning: 'Explicit mention of critical security vulnerability',
          citations: ['critical security vulnerability in the auth system'],
          deadline: null,
          owner: null
        }]
      });

      // Parse and validate
      const entities = llmClient.parseResponse(mockLLMResponse, 'claude');

      expect(entities).to.have.lengthOf(1);
      expect(entities[0].entity_type).to.equal('Risk');
      expect(entities[0].confidence).to.equal(0.92);
      expect(entities[0].priority).to.equal('Critical');
    });
  });
});
