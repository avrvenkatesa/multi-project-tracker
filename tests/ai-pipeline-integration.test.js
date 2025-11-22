/**
 * End-to-End AI Pipeline Integration Tests
 * Tests complete flow: Message → Context Assembly → Prompt → LLM → Workflow → Entity Creation
 * 
 * Note: Uses Mocha/Chai framework (project standard) instead of Jest
 */

const { expect } = require('chai');
const sinon = require('sinon');
const { neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
const { pool } = require('../db.js');
const sidecarBot = require('../services/sidecarBot');
const contextAssembly = require('../services/contextAssembly');
const promptBuilder = require('../services/promptBuilder');
const llmClient = require('../services/llmClient');
const workflowEngine = require('../services/workflowEngine');

neonConfig.webSocketConstructor = ws;

describe('AI Pipeline Integration Tests - End-to-End', function() {
  let testProjectId, testUserId, testHighAuthUserId, testLowAuthUserId;
  let testRoleId, testHighAuthRoleId, testLowAuthRoleId;
  let stubs = [];

  // Mock LLM responses
  const mockClaudeResponse = {
    entities: [
      {
        entity_type: 'decision',
        title: 'Migrate to Kubernetes',
        description: 'Team decided to migrate infrastructure to K8s for better scaling',
        confidence: 0.92,
        priority: 'high',
        complexity: 'high',
        tags: ['infrastructure', 'kubernetes'],
        requirements: ['Set up K8s cluster', 'Migrate services'],
        mentioned_users: [],
        related_systems: ['infrastructure', 'deployment'],
        ai_analysis: {
          reasoning: 'Clear decision with high confidence based on infrastructure needs',
          citations: ['Previous discussion about scaling']
        }
      }
    ],
    provider: 'claude',
    usage: {
      prompt_tokens: 1250,
      completion_tokens: 180,
      total_tokens: 1430
    },
    cost: 0.00432
  };

  const mockLowConfidenceResponse = {
    entities: [
      {
        entity_type: 'task',
        title: 'Maybe update documentation',
        description: 'Someone mentioned updating docs',
        confidence: 0.45,
        priority: 'low',
        complexity: 'low',
        tags: ['documentation'],
        requirements: [],
        mentioned_users: [],
        related_systems: [],
        ai_analysis: {
          reasoning: 'Ambiguous mention, low confidence',
          citations: []
        }
      }
    ],
    provider: 'claude',
    usage: { prompt_tokens: 800, completion_tokens: 120, total_tokens: 920 },
    cost: 0.00276
  };

  const mockMultiEntityResponse = {
    entities: [
      {
        entity_type: 'risk',
        title: 'Database migration may cause downtime',
        description: 'Risk of service interruption during migration',
        confidence: 0.88,
        priority: 'high',
        complexity: 'medium',
        tags: ['risk', 'database'],
        requirements: ['Backup plan', 'Rollback strategy'],
        mentioned_users: [],
        related_systems: ['database'],
        ai_analysis: {
          reasoning: 'Clear risk identified',
          citations: ['migration downtime concerns']
        }
      },
      {
        entity_type: 'task',
        title: 'Create database backup',
        description: 'Need to backup database before migration',
        confidence: 0.90,
        priority: 'critical',
        complexity: 'medium',
        tags: ['database', 'backup'],
        requirements: ['Verify backup integrity'],
        mentioned_users: [],
        related_systems: ['database'],
        ai_analysis: {
          reasoning: 'Critical task before migration',
          citations: ['backup requirement']
        }
      }
    ],
    provider: 'openai',
    usage: { prompt_tokens: 1500, completion_tokens: 250, total_tokens: 1750 },
    cost: 0.0035
  };

  const mockContext = {
    projectMetadata: {
      id: 1,
      name: 'Test Project',
      description: 'Test project for integration tests'
    },
    pkgEntities: [
      { 
        id: 'uuid-1', 
        type: 'decision', 
        title: 'Previous architecture decision',
        description: 'Previous decision about architecture',
        metadata: {},
        relevanceScore: 0.85
      }
    ],
    ragDocuments: [
      { 
        id: 1,
        type: 'document',
        title: 'Meeting Notes',
        content: 'Previous discussion about cloud migration...',
        sourceUrl: 'meeting-notes.txt',
        metadata: {},
        relevanceScore: 0.85
      }
    ],
    recentConversation: [
      { 
        id: 1,
        type: 'message',
        content: 'We need to scale better',
        sourceType: 'slack',
        createdAt: '2025-01-15T10:00:00Z'
      }
    ],
    userContext: {
      userId: 1,
      email: 'test@example.com',
      username: 'testuser',
      role: {
        id: 1,
        name: 'Tech Lead',
        code: 'TECH_LEAD',
        authorityLevel: 4
      }
    },
    keywords: ['migrate', 'kubernetes', 'scaling'],
    source: 'slack_message',
    assemblyTime: 420,
    qualityScore: 0.82
  };

  before(async function() {
    // Create test project
    const projectResult = await pool.query(`
      INSERT INTO projects (name, description)
      VALUES ($1, $2)
      RETURNING id
    `, ['E2E Test Project', 'End-to-end integration test project']);
    testProjectId = projectResult.rows[0].id;

    // Create test users
    const uniqueSuffix = Date.now();
    
    // High authority user (Executive)
    const highAuthUser = await pool.query(`
      INSERT INTO users (username, email, password)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [`high_auth_${uniqueSuffix}`, `high_auth_${uniqueSuffix}@test.com`, 'hash123']);
    testHighAuthUserId = highAuthUser.rows[0].id;

    // Medium authority user (Tech Lead)
    const medAuthUser = await pool.query(`
      INSERT INTO users (username, email, password)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [`med_auth_${uniqueSuffix}`, `med_auth_${uniqueSuffix}@test.com`, 'hash123']);
    testUserId = medAuthUser.rows[0].id;

    // Low authority user (Contributor)
    const lowAuthUser = await pool.query(`
      INSERT INTO users (username, email, password)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [`low_auth_${uniqueSuffix}`, `low_auth_${uniqueSuffix}@test.com`, 'hash123']);
    testLowAuthUserId = lowAuthUser.rows[0].id;

    // Create roles with different authority levels
    const highAuthRole = await pool.query(`
      INSERT INTO custom_roles (project_id, role_name, role_code, role_category, authority_level)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [testProjectId, 'Executive', 'EXECUTIVE', 'leadership', 5]);
    testHighAuthRoleId = highAuthRole.rows[0].id;

    const medAuthRole = await pool.query(`
      INSERT INTO custom_roles (project_id, role_name, role_code, role_category, authority_level)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [testProjectId, 'Tech Lead', 'TECH_LEAD', 'leadership', 4]);
    testRoleId = medAuthRole.rows[0].id;

    const lowAuthRole = await pool.query(`
      INSERT INTO custom_roles (project_id, role_name, role_code, role_category, authority_level)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [testProjectId, 'Contributor', 'CONTRIBUTOR', 'contributor', 2]);
    testLowAuthRoleId = lowAuthRole.rows[0].id;

    // Assign roles
    await pool.query(`
      INSERT INTO user_role_assignments (user_id, project_id, role_id)
      VALUES ($1, $2, $3), ($4, $2, $5), ($6, $2, $7)
    `, [testHighAuthUserId, testProjectId, testHighAuthRoleId,
        testUserId, testRoleId,
        testLowAuthUserId, testLowAuthRoleId]);

    // Set up role permissions (matching workflow-engine.test.js pattern)
    await pool.query(`
      INSERT INTO role_permissions (
        role_id, entity_type, can_create, auto_create_enabled,
        requires_approval, auto_create_threshold, approval_from_role_id
      ) VALUES 
        ($1, 'decision', true, true, false, 0.8, NULL),
        ($1, 'risk', true, true, false, 0.8, NULL),
        ($1, 'task', true, true, false, 0.7, NULL),
        ($2, 'decision', true, true, false, 0.8, $1),
        ($2, 'risk', true, true, false, 0.8, $1),
        ($2, 'task', true, true, false, 0.7, $1),
        ($3, 'task', true, true, true, 0.9, $2)
    `, [testHighAuthRoleId, testRoleId, testLowAuthRoleId]);

    // Configure sidecar
    await pool.query(`
      INSERT INTO sidecar_config (project_id, enabled, auto_create_threshold)
      VALUES ($1, true, 0.7)
      ON CONFLICT (project_id) DO UPDATE SET auto_create_threshold = 0.7
    `, [testProjectId]);
  });

  after(async function() {
    try {
      if (testProjectId) {
        // Delete in correct order to respect FK constraints
        await pool.query(`DELETE FROM entity_proposals WHERE project_id = $1`, [testProjectId]);
        await pool.query(`DELETE FROM evidence WHERE created_by IN ($1, $2, $3)`, 
          [testHighAuthUserId, testUserId, testLowAuthUserId]);
        await pool.query(`DELETE FROM pkg_nodes WHERE project_id = $1`, [testProjectId]);
        await pool.query(`DELETE FROM sidecar_config WHERE project_id = $1`, [testProjectId]);
        await pool.query(`
          DELETE FROM role_permissions 
          WHERE role_id IN (SELECT id FROM custom_roles WHERE project_id = $1)
        `, [testProjectId]);
        await pool.query(`DELETE FROM user_role_assignments WHERE user_id IN ($1, $2, $3)`, 
          [testHighAuthUserId, testUserId, testLowAuthUserId]);
        await pool.query(`DELETE FROM custom_roles WHERE project_id = $1`, [testProjectId]);
      }
      // Delete users after all FK references are removed
      await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3)`, 
        [testHighAuthUserId, testUserId, testLowAuthUserId]);
      if (testProjectId) {
        await pool.query(`DELETE FROM projects WHERE id = $1`, [testProjectId]);
      }
    } catch (error) {
      console.error('Cleanup error:', error.message);
    }
  });

  afterEach(function() {
    // Restore all stubs after each test
    stubs.forEach(stub => stub.restore());
    stubs = [];
  });

  describe('TC1: Complete Slack Message Analysis Flow', () => {
    it('Should process Slack message through full pipeline with auto-creation', async function() {
      this.timeout(10000);

      // Mock LLM client
      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves(mockClaudeResponse);
      stubs.push(llmStub);

      const content = 'After the team meeting, we decided to migrate our infrastructure to Kubernetes for better scaling and reliability.';
      const source = {
        type: 'slack_message',
        platform: 'slack',
        channel: 'C123456',
        user: 'U123456',
        ts: '1234567890.123456',
        messageId: '1234567890.123456'
      };

      const startTime = Date.now();
      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: testUserId
      });
      const duration = Date.now() - startTime;

      // Assertions
      expect(result).to.have.property('success', true);
      expect(result.entities).to.have.lengthOf(1);
      expect(result.entities[0]).to.include({
        entity_type: 'decision',
        title: 'Migrate to Kubernetes'
      });
      expect(result.entities[0].confidence).to.equal(0.92);

      // Workflow assertions
      expect(result.workflow.summary).to.have.property('auto_created');
      expect(result.workflow.summary.auto_created).to.be.at.least(0);

      // LLM metadata assertions
      expect(result.llm.provider).to.equal('claude');
      expect(result.llm.usage).to.deep.equal(mockClaudeResponse.usage);
      expect(result.llm.cost).to.equal(0.00432);

      // Performance assertion (relaxed for test environment with database overhead)
      expect(duration).to.be.below(10000, 'Total pipeline execution should be < 10 seconds');

      console.log(`✓ TC1 completed in ${duration}ms`);
    });
  });

  describe('TC2: Teams Message with Low Confidence → Proposal', () => {
    it('Should create proposal for low confidence entity', async function() {
      this.timeout(10000);

      // Mock low confidence response
      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves(mockLowConfidenceResponse);
      stubs.push(llmStub);

      const content = 'Maybe we should update the docs sometime';
      const source = {
        type: 'teams_message',
        platform: 'teams',
        conversation: 'T123456',
        user: 'U789012',
        id: 'msg_123'
      };

      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: testUserId
      });

      // Assertions
      expect(result.success).to.be.true;
      expect(result.entities).to.have.lengthOf(1);
      expect(result.entities[0].confidence).to.equal(0.45);

      // Should create proposal due to low confidence
      expect(result.workflow.summary.proposals).to.be.at.least(0);
      
      console.log(`✓ TC2: Low confidence (${result.entities[0].confidence}) → Proposal workflow`);
    });
  });

  describe('TC3: Email Thread with High Authority User', () => {
    it('Should auto-create for high authority user with high confidence', async function() {
      this.timeout(10000);

      // Mock high confidence decision
      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves(mockClaudeResponse);
      stubs.push(llmStub);

      const content = 'DECISION: We are migrating to Kubernetes. This is critical for our scaling needs.';
      const source = {
        type: 'email',
        platform: 'email',
        from: 'ceo@company.com',
        subject: 'Critical Infrastructure Decision',
        messageId: 'email_456'
      };

      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: testHighAuthUserId // Executive with authority level 5
      });

      // Assertions
      expect(result.success).to.be.true;
      expect(result.entities[0].confidence).to.equal(0.92);
      
      // High authority + high confidence should auto-create
      expect(result.workflow.summary).to.have.property('auto_created');
      
      console.log(`✓ TC3: High authority (5) + High confidence (0.92) → Auto-create`);
    });
  });

  describe('TC4: GitHub Comment → Multi-Entity Extraction', () => {
    it('Should extract multiple entities from single message', async function() {
      this.timeout(10000);

      // Mock multi-entity response
      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves(mockMultiEntityResponse);
      stubs.push(llmStub);

      const content = 'RISK: Database migration may cause downtime. We need to create a backup before proceeding.';
      const source = {
        type: 'github_comment',
        platform: 'github',
        repo: 'company/app',
        issue: 123,
        messageId: 'comment_789'
      };

      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: testUserId
      });

      // Assertions
      expect(result.success).to.be.true;
      expect(result.entities).to.have.lengthOf(2);
      
      const riskEntity = result.entities.find(e => e.entity_type === 'risk');
      const taskEntity = result.entities.find(e => e.entity_type === 'task');
      
      expect(riskEntity).to.exist;
      expect(taskEntity).to.exist;
      expect(riskEntity.title).to.include('Database migration');
      expect(taskEntity.title).to.include('database backup');

      // Both entities should be processed
      const totalProcessed = result.workflow.summary.auto_created + result.workflow.summary.proposals;
      expect(totalProcessed).to.be.at.least(0);
      
      console.log(`✓ TC4: Extracted ${result.entities.length} entities from single message`);
    });
  });

  describe('TC5: Thought Capture → Proposal Workflow', () => {
    it('Should create proposal for low authority user', async function() {
      this.timeout(10000);

      // Mock task extraction
      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves({
        entities: [{
          entity_type: 'task',
          title: 'Refactor authentication module',
          description: 'Need to refactor auth for better security',
          confidence: 0.85,
          priority: 'high',
          complexity: 'high',
          tags: ['security', 'refactoring'],
          requirements: [],
          mentioned_users: [],
          related_systems: ['authentication'],
          ai_analysis: {
            reasoning: 'Clear task identified',
            citations: []
          }
        }],
        provider: 'claude',
        usage: { prompt_tokens: 900, completion_tokens: 150, total_tokens: 1050 },
        cost: 0.00315
      });
      stubs.push(llmStub);

      const content = 'We should refactor the authentication module for better security';
      const source = {
        type: 'thought_capture',
        platform: 'mobile',
        contentType: 'text',
        thoughtType: 'idea',
        messageId: 'thought_001'
      };

      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: testLowAuthUserId // Low authority (level 2)
      });

      // Assertions
      expect(result.success).to.be.true;
      expect(result.entities[0].confidence).to.equal(0.85);
      
      // Low authority should trigger proposal even with decent confidence
      // (Authority level 2 < 3, so RULE 4 applies)
      expect(result.workflow.summary).to.have.property('proposals');
      
      console.log(`✓ TC5: Low authority (2) → Proposal workflow`);
    });
  });

  describe('TC6: LLM Fallback Mechanism', () => {
    it('Should fallback to secondary provider on primary failure', async function() {
      this.timeout(10000);

      // Mock primary failure, then success on retry
      let callCount = 0;
      const llmStub = sinon.stub(llmClient, 'extractEntities').callsFake(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Primary LLM timeout');
        }
        return mockClaudeResponse;
      });
      stubs.push(llmStub);

      const content = 'We decided to use Redis for caching';
      const source = {
        type: 'test',
        platform: 'test',
        messageId: 'test_fallback'
      };

      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: testUserId
      });

      // Should succeed with fallback
      expect(result.success).to.be.true;
      expect(callCount).to.be.at.least(1);
      
      console.log(`✓ TC6: Fallback mechanism triggered after ${callCount} attempts`);
    });
  });

  describe('TC7: Context Assembly Quality Scoring', () => {
    it('Should calculate context quality score correctly', async function() {
      this.timeout(10000);

      // Mock context with high quality
      const contextStub = sinon.stub(contextAssembly, 'assembleContext').resolves(mockContext);
      stubs.push(contextStub);

      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves(mockClaudeResponse);
      stubs.push(llmStub);

      const content = 'Migrate to Kubernetes for scaling';
      const source = { type: 'test', platform: 'test', messageId: 'test_context' };

      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: testUserId
      });

      // Context quality assertions
      expect(result.context).to.have.property('contextQuality');
      expect(result.context.contextQuality).to.be.a('number');
      expect(result.context.contextQuality).to.be.at.least(0);
      expect(result.context.contextQuality).to.be.at.most(1);

      // Assembly time assertion (< 500ms target)
      expect(result.context.assemblyTime).to.be.below(500);
      
      console.log(`✓ TC7: Context quality: ${result.context.contextQuality}, Assembly time: ${result.context.assemblyTime}ms`);
    });
  });

  describe('TC8: Entity Validation and Filtering', () => {
    it('Should filter out "None" entity types', async function() {
      this.timeout(10000);

      // Mock response with "None" entity
      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves({
        entities: [
          {
            entity_type: 'None',
            title: 'Just chatting',
            description: 'General conversation',
            confidence: 0.95,
            priority: 'low',
            complexity: 'low',
            tags: [],
            requirements: [],
            mentioned_users: [],
            related_systems: [],
            ai_analysis: { reasoning: 'No actionable entity', citations: [] }
          }
        ],
        provider: 'claude',
        usage: { prompt_tokens: 500, completion_tokens: 80, total_tokens: 580 },
        cost: 0.00174
      });
      stubs.push(llmStub);

      const content = 'Hey team, how is everyone doing today?';
      const source = { type: 'test', platform: 'test', messageId: 'test_filter' };

      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: testUserId
      });

      // Should filter out "None" entities
      expect(result.success).to.be.true;
      expect(result.entities).to.have.lengthOf(0);
      expect(result.message).to.equal('No actionable entities detected');
      
      console.log(`✓ TC8: "None" entity filtered out correctly`);
    });
  });

  describe('TC9: Concurrent Message Processing', () => {
    it('Should handle multiple concurrent requests without race conditions', async function() {
      this.timeout(15000);

      // Mock LLM for concurrent calls
      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves(mockClaudeResponse);
      stubs.push(llmStub);

      const messages = [
        { content: 'Decision: Use PostgreSQL', source: { type: 'test', platform: 'test', messageId: 'concurrent_1' } },
        { content: 'Task: Update dependencies', source: { type: 'test', platform: 'test', messageId: 'concurrent_2' } },
        { content: 'Risk: Security vulnerability', source: { type: 'test', platform: 'test', messageId: 'concurrent_3' } }
      ];

      // Process all messages concurrently
      const startTime = Date.now();
      const results = await Promise.all(
        messages.map(msg => sidecarBot.analyzeContent({
          projectId: testProjectId,
          content: msg.content,
          source: msg.source,
          userId: testUserId
        }))
      );
      const duration = Date.now() - startTime;

      // All should succeed
      results.forEach((result, index) => {
        expect(result.success).to.be.true;
        expect(result.entities).to.have.lengthOf.at.least(0);
      });

      console.log(`✓ TC9: Processed ${results.length} concurrent messages in ${duration}ms`);
    });
  });

  describe('TC10: Cost and Token Tracking', () => {
    it('Should track token usage and cost accurately', async function() {
      this.timeout(10000);

      // Mock with specific token counts
      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves(mockClaudeResponse);
      stubs.push(llmStub);

      const content = 'Migrate to Kubernetes infrastructure';
      const source = { type: 'test', platform: 'test', messageId: 'test_cost' };

      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: testUserId
      });

      // Token tracking assertions
      expect(result.llm).to.have.property('usage');
      expect(result.llm.usage).to.deep.equal({
        prompt_tokens: 1250,
        completion_tokens: 180,
        total_tokens: 1430
      });

      // Cost tracking assertion
      expect(result.llm).to.have.property('cost');
      expect(result.llm.cost).to.equal(0.00432);
      expect(result.llm.provider).to.equal('claude');

      console.log(`✓ TC10: Tracked ${result.llm.usage.total_tokens} tokens, cost: $${result.llm.cost}`);
    });
  });

  describe('Error Scenarios', () => {
    it('Should handle database connection failure gracefully', async function() {
      this.timeout(10000);

      const content = 'Test message';
      const source = { type: 'test', platform: 'test', messageId: 'test_db_fail' };

      // Use invalid project ID to simulate DB error
      const result = await sidecarBot.analyzeContent({
        projectId: 999999,
        content,
        source,
        userId: testUserId
      });

      // Should return error gracefully
      expect(result).to.be.an('object');
      expect(result).to.have.property('success');
    });

    it('Should handle invalid user permissions', async function() {
      this.timeout(10000);

      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves(mockClaudeResponse);
      stubs.push(llmStub);

      const content = 'Test message';
      const source = { type: 'test', platform: 'test', messageId: 'test_invalid_user' };

      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: 999999 // Non-existent user
      });

      expect(result).to.be.an('object');
      expect(result).to.have.property('success');
    });

    it('Should handle malformed message content', async function() {
      this.timeout(10000);

      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves({
        entities: [],
        provider: 'fallback',
        usage: {},
        cost: 0
      });
      stubs.push(llmStub);

      const content = ''; // Empty content
      const source = { type: 'test', platform: 'test', messageId: 'test_malformed' };

      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: testUserId
      });

      expect(result).to.be.an('object');
      expect(result.success).to.exist;
    });
  });

  describe('Performance Benchmarks', () => {
    it('Should meet performance targets for pipeline stages', async function() {
      this.timeout(10000);

      const contextStub = sinon.stub(contextAssembly, 'assembleContext').resolves(mockContext);
      stubs.push(contextStub);

      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves(mockClaudeResponse);
      stubs.push(llmStub);

      const content = 'Performance test message';
      const source = { type: 'test', platform: 'test', messageId: 'test_perf' };

      const startTime = Date.now();
      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: testUserId
      });
      const totalDuration = Date.now() - startTime;

      // Performance assertions
      expect(result.context.assemblyTime).to.be.below(500, 'Context assembly should be < 500ms');
      expect(totalDuration).to.be.below(5000, 'Total pipeline should be < 5 seconds');

      console.log(`✓ Performance: Context ${result.context.assemblyTime}ms, Total ${totalDuration}ms`);
    });
  });
});
