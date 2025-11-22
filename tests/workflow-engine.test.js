const { expect } = require('chai');
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const workflowEngine = require('../services/workflowEngine');

describe('Workflow Engine - Story 5.4.2', function() {
  this.timeout(15000);

  let testProjectId;
  let testUserId;
  let testRoleId;
  let testApproverRoleId;

  before(async function() {
    const projectResult = await pool.query(`
      INSERT INTO projects (name, description, created_by)
      VALUES ('Workflow Test Project', 'Test project for workflow engine', 1)
      RETURNING id
    `);
    testProjectId = projectResult.rows[0].id;

    const userResult = await pool.query(`
      INSERT INTO users (username, email, password)
      VALUES ('workflow_tester', 'workflow@test.com', 'hashed_password')
      RETURNING id
    `);
    testUserId = userResult.rows[0].id;

    const roleResult = await pool.query(`
      INSERT INTO custom_roles (role_name, role_code, authority_level, role_category, project_id)
      VALUES ('Senior Engineer', 'SENIOR_ENG', 4, 'contributor', $1)
      RETURNING id
    `, [testProjectId]);
    testRoleId = roleResult.rows[0].id;

    const approverRoleResult = await pool.query(`
      INSERT INTO custom_roles (role_name, role_code, authority_level, role_category, project_id)
      VALUES ('Tech Lead', 'TECH_LEAD', 5, 'leadership', $1)
      RETURNING id
    `, [testProjectId]);
    testApproverRoleId = approverRoleResult.rows[0].id;

    await pool.query(`
      INSERT INTO user_role_assignments (user_id, role_id, project_id, is_primary, assigned_by)
      VALUES ($1, $2, $3, true, 1)
    `, [testUserId, testRoleId, testProjectId]);

    await pool.query(`
      INSERT INTO role_permissions (
        role_id, entity_type, can_create, auto_create_enabled,
        requires_approval, auto_create_threshold, approval_from_role_id
      ) VALUES ($1, 'Decision', true, true, false, 0.8, $2)
    `, [testRoleId, testApproverRoleId]);

    await pool.query(`
      INSERT INTO role_permissions (
        role_id, entity_type, can_create, auto_create_enabled,
        requires_approval, auto_create_threshold, approval_from_role_id
      ) VALUES ($1, 'Risk', true, true, true, 0.85, $2)
    `, [testRoleId, testApproverRoleId]);

    await pool.query(`
      INSERT INTO sidecar_config (project_id, customer_id, enabled, auto_create_threshold)
      VALUES ($1, 1, true, 0.8)
      ON CONFLICT (project_id) DO UPDATE SET auto_create_threshold = 0.8
    `, [testProjectId]);
  });

  after(async function() {
    if (testUserId) {
      await pool.query(`DELETE FROM user_role_assignments WHERE user_id = $1`, [testUserId]);
    }
    if (testRoleId || testApproverRoleId) {
      await pool.query(`DELETE FROM role_permissions WHERE role_id IN ($1, $2)`, [testRoleId, testApproverRoleId]);
    }
    if (testProjectId) {
      await pool.query(`DELETE FROM entity_proposals WHERE project_id = $1`, [testProjectId]);
      await pool.query(`DELETE FROM evidence WHERE source_type = 'test'`);
      await pool.query(`DELETE FROM pkg_nodes WHERE project_id = $1`, [testProjectId]);
      await pool.query(`DELETE FROM sidecar_config WHERE project_id = $1`, [testProjectId]);
    }
    if (testRoleId || testApproverRoleId) {
      await pool.query(`DELETE FROM custom_roles WHERE id IN ($1, $2)`, [testRoleId || 0, testApproverRoleId || 0]);
    }
    if (testUserId) {
      await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    }
    if (testProjectId) {
      await pool.query(`DELETE FROM projects WHERE id = $1`, [testProjectId]);
    }
  });

  describe('Decision Logic Rules', () => {
    it('RULE 1: High Confidence + High Authority → Auto-Create', async function() {
      const entity = {
        entity_type: 'Decision',
        title: 'Migrate to PostgreSQL',
        description: 'Decision to migrate database',
        confidence: 0.95,
        priority: 'High'
      };

      const permission = {
        auto_create_enabled: true,
        auto_create_threshold: 0.8,
        approval_from_role_id: testApproverRoleId
      };

      const config = { auto_create_threshold: 0.8 };

      const decision = await workflowEngine.determineAction(
        entity,
        4, // High authority
        permission,
        config
      );

      expect(decision.action).to.equal('auto_create');
      expect(decision.reason).to.include('High confidence');
    });

    it('RULE 2: Permission-Based Auto-Create (Medium Confidence)', async function() {
      const entity = {
        entity_type: 'Decision',
        title: 'Update dependencies',
        description: 'Decision to update npm packages',
        confidence: 0.75,
        priority: 'Medium'
      };

      const permission = {
        auto_create_enabled: true,
        auto_create_threshold: 0.8,
        approval_from_role_id: testApproverRoleId
      };

      const config = { auto_create_threshold: 0.8 };

      const decision = await workflowEngine.determineAction(
        entity,
        3,
        permission,
        config
      );

      expect(decision.action).to.equal('auto_create');
      expect(decision.reason).to.include('Permission-based');
    });

    it('RULE 3: Critical Impact Always Requires Review', async function() {
      const entity = {
        entity_type: 'Risk',
        title: 'Security vulnerability',
        description: 'Critical security issue',
        confidence: 0.95,
        impact: 'Critical'
      };

      const permission = {
        auto_create_enabled: true,
        auto_create_threshold: 0.8,
        approval_from_role_id: testApproverRoleId
      };

      const config = { auto_create_threshold: 0.8 };

      const decision = await workflowEngine.determineAction(
        entity,
        4, // Even high authority
        permission,
        config
      );

      expect(decision.action).to.equal('create_proposal');
      expect(decision.reason).to.include('Critical impact');
    });

    it('RULE 4: Low Confidence → Proposal', async function() {
      const entity = {
        entity_type: 'Task',
        title: 'Refactor code',
        description: 'Code refactoring task',
        confidence: 0.65,
        priority: 'Medium'
      };

      const permission = {
        auto_create_enabled: true,
        auto_create_threshold: 0.8,
        approval_from_role_id: testApproverRoleId
      };

      const config = { auto_create_threshold: 0.8 };

      const decision = await workflowEngine.determineAction(
        entity,
        4,
        permission,
        config
      );

      expect(decision.action).to.equal('create_proposal');
      expect(decision.reason).to.include('Low confidence');
    });

    it('RULE 4: Low Authority → Proposal', async function() {
      const entity = {
        entity_type: 'Decision',
        title: 'Choose framework',
        description: 'Framework selection decision',
        confidence: 0.85,
        priority: 'High'
      };

      const permission = {
        auto_create_enabled: true,
        auto_create_threshold: 0.8,
        approval_from_role_id: testApproverRoleId
      };

      const config = { auto_create_threshold: 0.8 };

      const decision = await workflowEngine.determineAction(
        entity,
        2, // Low authority
        permission,
        config
      );

      expect(decision.action).to.equal('create_proposal');
      expect(decision.reason).to.include('insufficient authority');
    });
  });

  describe('Auto-Create Entity', () => {
    it('should create entity in PKG with evidence', async function() {
      const entity = {
        entity_type: 'Decision',
        title: 'Use TypeScript',
        description: 'Decision to use TypeScript for type safety',
        confidence: 0.92,
        priority: 'High',
        tags: ['typescript', 'development'],
        reasoning: 'Team consensus on TypeScript benefits',
        citations: ['use TypeScript', 'type safety']
      };

      const source = {
        type: 'test',
        platform: 'test',
        id: 'test-123',
        metadata: { channel: 'engineering' }
      };

      const result = await workflowEngine.autoCreateEntity(
        entity,
        testUserId,
        testProjectId,
        source
      );

      expect(result.action).to.equal('auto_created');
      expect(result.entity_id).to.be.a('string');
      expect(result.evidence_id).to.be.a('number');

      const pkgNode = await pool.query(`
        SELECT * FROM pkg_nodes WHERE id = $1
      `, [result.entity_id]);

      expect(pkgNode.rows).to.have.lengthOf(1);
      expect(pkgNode.rows[0].type).to.equal('decision');
      expect(pkgNode.rows[0].created_by_ai).to.be.true;
      expect(pkgNode.rows[0].project_id).to.equal(testProjectId);

      const evidence = await pool.query(`
        SELECT * FROM evidence WHERE id = $1
      `, [result.evidence_id]);

      expect(evidence.rows).to.have.lengthOf(1);
      expect(evidence.rows[0].source_type).to.equal('test');
    });

    it('should normalize entity types correctly', function() {
      expect(workflowEngine.normalizeEntityType('Decision')).to.equal('decision');
      expect(workflowEngine.normalizeEntityType('Risk')).to.equal('risk');
      expect(workflowEngine.normalizeEntityType('Action Item')).to.equal('action_item');
      expect(workflowEngine.normalizeEntityType('Task')).to.equal('task');
    });
  });

  describe('Create Proposal', () => {
    it('should create proposal for approval', async function() {
      const entity = {
        entity_type: 'Risk',
        title: 'Database performance degradation',
        description: 'Queries are getting slower',
        confidence: 0.72,
        priority: 'High',
        impact: 'High',
        tags: ['performance', 'database'],
        reasoning: 'Multiple mentions of slow queries',
        citations: ['slow queries', 'performance issues']
      };

      const source = {
        type: 'test',
        platform: 'slack',
        id: 'msg-456'
      };

      const result = await workflowEngine.createProposal(
        entity,
        testUserId,
        testProjectId,
        testApproverRoleId,
        source
      );

      expect(result.action).to.equal('proposal_created');
      expect(result.proposal_id).to.be.a('number');
      expect(result.requires_approval_from).to.be.a('string');

      const proposal = await pool.query(`
        SELECT * FROM entity_proposals WHERE id = $1
      `, [result.proposal_id]);

      expect(proposal.rows).to.have.lengthOf(1);
      expect(proposal.rows[0].status).to.equal('pending');
      expect(proposal.rows[0].entity_type).to.equal('Risk');
      expect(proposal.rows[0].confidence).to.equal('0.72');
      expect(proposal.rows[0].requires_approval_from).to.equal(testApproverRoleId);
    });
  });

  describe('Process Extracted Entities', () => {
    it('should process multiple entities with mixed actions', async function() {
      const entities = [
        {
          entity_type: 'Decision',
          title: 'Use React',
          description: 'Framework decision',
          confidence: 0.95,
          priority: 'High',
          reasoning: 'Team expertise',
          citations: ['use React']
        },
        {
          entity_type: 'Risk',
          title: 'Budget overrun',
          description: 'Project over budget',
          confidence: 0.88,
          impact: 'Critical',
          reasoning: 'Financial analysis',
          citations: ['over budget']
        },
        {
          entity_type: 'Task',
          title: 'Write tests',
          description: 'Unit testing task',
          confidence: 0.65,
          priority: 'Medium',
          reasoning: 'Mentioned in passing',
          citations: ['write tests']
        }
      ];

      const source = {
        type: 'test',
        platform: 'email'
      };

      const result = await workflowEngine.processExtractedEntities({
        entities,
        userId: testUserId,
        projectId: testProjectId,
        source
      });

      expect(result.processed).to.equal(3);
      expect(result.results).to.have.lengthOf(3);
      expect(result.summary.auto_created).to.be.greaterThan(0);
      expect(result.summary.proposals).to.be.greaterThan(0);

      const autoCreated = result.results.filter(r => r.action === 'auto_created');
      const proposals = result.results.filter(r => r.action === 'proposal_created');

      expect(autoCreated.length).to.be.greaterThan(0);
      expect(proposals.length).to.be.greaterThan(0);
    });
  });

  describe('Approve/Reject Proposals', () => {
    let proposalId;

    beforeEach(async function() {
      const entity = {
        entity_type: 'Decision',
        title: 'Test Decision for Approval',
        description: 'Testing approval workflow',
        confidence: 0.75,
        priority: 'Medium',
        reasoning: 'Test reasoning',
        citations: ['test citation']
      };

      const result = await workflowEngine.createProposal(
        entity,
        testUserId,
        testProjectId,
        testApproverRoleId,
        { type: 'test' }
      );

      proposalId = result.proposal_id;
    });

    it('should approve proposal and create entity', async function() {
      const result = await workflowEngine.approveProposal(
        proposalId,
        testUserId,
        'Looks good, approved!'
      );

      expect(result.proposal_id).to.equal(proposalId);
      expect(result.status).to.equal('approved');
      expect(result.entity_id).to.be.a('string');
      expect(result.evidence_id).to.be.a('number');

      const proposal = await pool.query(`
        SELECT * FROM entity_proposals WHERE id = $1
      `, [proposalId]);

      expect(proposal.rows[0].status).to.equal('approved');
      expect(proposal.rows[0].reviewed_by).to.equal(testUserId);
      expect(proposal.rows[0].review_notes).to.equal('Looks good, approved!');

      const pkgNode = await pool.query(`
        SELECT * FROM pkg_nodes WHERE id = $1
      `, [result.entity_id]);

      expect(pkgNode.rows).to.have.lengthOf(1);
      expect(pkgNode.rows[0].created_by_ai).to.be.true;
    });

    it('should reject proposal', async function() {
      const result = await workflowEngine.rejectProposal(
        proposalId,
        testUserId,
        'Not relevant to project'
      );

      expect(result.proposal_id).to.equal(proposalId);
      expect(result.status).to.equal('rejected');

      const proposal = await pool.query(`
        SELECT * FROM entity_proposals WHERE id = $1
      `, [proposalId]);

      expect(proposal.rows[0].status).to.equal('rejected');
      expect(proposal.rows[0].reviewed_by).to.equal(testUserId);
      expect(proposal.rows[0].review_notes).to.equal('Not relevant to project');
    });

    it('should not approve already approved proposal', async function() {
      await workflowEngine.approveProposal(proposalId, testUserId);

      try {
        await workflowEngine.approveProposal(proposalId, testUserId);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).to.include('already approved');
      }
    });
  });

  describe('Get Proposals', () => {
    before(async function() {
      await pool.query(`DELETE FROM entity_proposals WHERE project_id = $1`, [testProjectId]);

      for (let i = 0; i < 3; i++) {
        await pool.query(`
          INSERT INTO entity_proposals (
            project_id, proposed_by, entity_type, proposed_data,
            ai_analysis, confidence, status, requires_approval_from
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          testProjectId,
          testUserId,
          'Decision',
          JSON.stringify({ title: `Decision ${i}` }),
          JSON.stringify({ reasoning: 'Test' }),
          0.8,
          'pending',
          testApproverRoleId
        ]);
      }

      await pool.query(`
        INSERT INTO entity_proposals (
          project_id, proposed_by, entity_type, proposed_data,
          ai_analysis, confidence, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        testProjectId,
        testUserId,
        'Risk',
        JSON.stringify({ title: 'Approved Risk' }),
        JSON.stringify({ reasoning: 'Test' }),
        0.85,
        'approved'
      ]);
    });

    it('should get pending proposals for project', async function() {
      const proposals = await workflowEngine.getPendingProposals(testProjectId);

      expect(proposals).to.be.an('array');
      expect(proposals.length).to.be.greaterThanOrEqual(3);
      proposals.forEach(p => {
        expect(p.status).to.equal('pending');
        expect(p.project_id).to.equal(testProjectId);
      });
    });

    it('should get pending proposals for specific role', async function() {
      const proposals = await workflowEngine.getPendingProposals(
        testProjectId,
        testApproverRoleId
      );

      expect(proposals).to.be.an('array');
      expect(proposals.length).to.be.greaterThanOrEqual(3);
      proposals.forEach(p => {
        expect(p.requires_approval_from).to.equal(testApproverRoleId);
      });
    });

    it('should get proposal statistics', async function() {
      const stats = await workflowEngine.getProposalStats(testProjectId);

      expect(stats).to.be.an('object');
      expect(stats.pending).to.be.a('string');
      expect(stats.approved).to.be.a('string');
      expect(stats.total).to.be.a('string');
      expect(stats.avg_confidence).to.not.be.null;

      expect(parseInt(stats.pending)).to.be.greaterThanOrEqual(3);
      expect(parseInt(stats.approved)).to.be.greaterThanOrEqual(1);
    });
  });

  describe('Sidecar Config', () => {
    it('should get sidecar config for project', async function() {
      const config = await workflowEngine.getSidecarConfig(testProjectId);

      expect(config).to.be.an('object');
      expect(config.auto_create_threshold).to.equal('0.8');
    });

    it('should return default config if not found', async function() {
      const config = await workflowEngine.getSidecarConfig(99999);

      expect(config).to.be.an('object');
      expect(config.auto_create_threshold).to.equal(0.8);
      expect(config.detection_types).to.include('Decision');
      expect(config.detection_types).to.include('Risk');
    });
  });

  describe('Error Handling', () => {
    it('should handle user with no role', async function() {
      const orphanUser = await pool.query(`
        INSERT INTO users (username, email, password)
        VALUES ('orphan', 'orphan@test.com', 'pass')
        RETURNING id
      `);

      const result = await workflowEngine.processExtractedEntities({
        entities: [{
          entity_type: 'Task',
          title: 'Test',
          description: 'Test',
          confidence: 0.9,
          reasoning: 'test',
          citations: []
        }],
        userId: orphanUser.rows[0].id,
        projectId: testProjectId,
        source: { type: 'test' }
      });

      expect(result.summary.skipped).to.equal(1);
      expect(result.results[0].action).to.equal('skipped');
      expect(result.results[0].reason).to.include('no role');

      await pool.query(`DELETE FROM users WHERE id = $1`, [orphanUser.rows[0].id]);
    });

    it('should handle database errors gracefully', async function() {
      const entity = {
        entity_type: 'Decision',
        title: 'Test',
        description: 'Test',
        confidence: 0.9,
        reasoning: 'test',
        citations: []
      };

      try {
        await workflowEngine.autoCreateEntity(
          entity,
          99999, // Invalid user ID
          testProjectId,
          { type: 'test' }
        );
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });
});
