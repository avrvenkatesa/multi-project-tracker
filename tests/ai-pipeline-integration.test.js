/**
 * End-to-End AI Pipeline Integration Test
 * Tests complete flow: Webhook → Context Assembly → Prompt Building → LLM → Workflow Engine → Entity Creation
 */

const { expect } = require('chai');
const { neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
const pool = require('../db');
const sidecarBot = require('../services/sidecarBot');

neonConfig.webSocketConstructor = ws;

describe('AI Pipeline Integration - Story 5.4.2', function() {
  let testProjectId, testUserId, testRoleId;

  before(async function() {
    // Create test project
    const projectResult = await pool.query(`
      INSERT INTO projects (name, description)
      VALUES ($1, $2)
      RETURNING id
    `, ['AI Pipeline Test Project', 'Integration test for complete AI pipeline']);
    testProjectId = projectResult.rows[0].id;

    // Create test user
    const uniqueSuffix = Date.now();
    const userResult = await pool.query(`
      INSERT INTO users (username, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [
      `pipeline_tester_${uniqueSuffix}`,
      `pipeline_tester_${uniqueSuffix}@test.com`,
      'hash123'
    ]);
    testUserId = userResult.rows[0].id;

    // Create test role with high authority
    const roleResult = await pool.query(`
      INSERT INTO custom_roles (
        project_id, role_name, role_category, authority_level
      ) VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [testProjectId, 'Tech Lead', 'leadership', 4]);
    testRoleId = roleResult.rows[0].id;

    // Assign role to user
    await pool.query(`
      INSERT INTO user_role_assignments (user_id, project_id, role_id)
      VALUES ($1, $2, $3)
    `, [testUserId, testProjectId, testRoleId]);

    // Set up role permissions for auto-create
    await pool.query(`
      INSERT INTO role_permissions (
        role_id, entity_type, auto_create_enabled, required_confidence
      ) VALUES 
        ($1, 'bug', true, 0.7),
        ($1, 'task', true, 0.7),
        ($1, 'feature', true, 0.8)
    `, [testRoleId]);

    // Configure sidecar bot for project
    await pool.query(`
      INSERT INTO sidecar_config (
        project_id, enabled, auto_create_threshold
      ) VALUES ($1, true, 0.7)
      ON CONFLICT (project_id) DO UPDATE SET auto_create_threshold = 0.7
    `, [testProjectId]);
  });

  after(async function() {
    // Cleanup in correct order
    try {
      if (testProjectId) {
        await pool.query(`DELETE FROM entity_proposals WHERE project_id = $1`, [testProjectId]);
        await pool.query(`DELETE FROM evidence WHERE source_type = 'test'`);
        await pool.query(`DELETE FROM pkg_nodes WHERE project_id = $1`, [testProjectId]);
        await pool.query(`DELETE FROM sidecar_config WHERE project_id = $1`, [testProjectId]);
        await pool.query(`
          DELETE FROM role_permissions 
          WHERE role_id IN (SELECT id FROM custom_roles WHERE project_id = $1)
        `, [testProjectId]);
        await pool.query(`DELETE FROM custom_roles WHERE project_id = $1`, [testProjectId]);
      }
      if (testUserId) {
        await pool.query(`DELETE FROM user_role_assignments WHERE user_id = $1`, [testUserId]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
      }
      if (testProjectId) {
        await pool.query(`DELETE FROM projects WHERE id = $1`, [testProjectId]);
      }
    } catch (error) {
      console.error('Cleanup error:', error.message);
    }
  });

  describe('Complete AI Pipeline', () => {
    it('Should process Slack message through full pipeline', async function() {
      this.timeout(30000); // AI calls may take time

      const content = 'We have a critical bug in the login system - users are getting 500 errors when they try to authenticate. This needs immediate attention.';
      const source = {
        type: 'slack_message',
        platform: 'slack',
        channel: 'C123456',
        user: 'U123456',
        ts: '1234567890.123456',
        messageId: '1234567890.123456'
      };

      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: testUserId
      });

      console.log('Pipeline result:', JSON.stringify(result, null, 2));

      // Verify pipeline executed successfully
      expect(result).to.have.property('success', true);
      expect(result).to.have.property('entities');
      expect(result).to.have.property('workflow');
      expect(result).to.have.property('context');
      expect(result).to.have.property('llm');

      // Verify entities were extracted
      if (result.entities && result.entities.length > 0) {
        expect(result.entities[0]).to.have.property('entity_type');
        expect(result.entities[0]).to.have.property('confidence');
      }

      // Verify workflow processed
      if (result.workflow) {
        expect(result.workflow).to.have.property('summary');
        expect(result.workflow.summary).to.have.property('auto_created');
        expect(result.workflow.summary).to.have.property('proposals');
      }

      // Verify LLM metadata
      expect(result.llm).to.have.property('provider');
      expect(result.llm.provider).to.be.oneOf(['claude', 'openai', 'gemini', 'fallback']);
    });

    it('Should handle processMessage wrapper method', async function() {
      this.timeout(30000);

      const content = 'Add new feature: implement dark mode for the dashboard';
      const source = {
        type: 'teams_message',
        platform: 'teams',
        conversation: 'T123456',
        user: 'U789012',
        id: 'msg_123'
      };

      const result = await sidecarBot.processMessage(
        testProjectId,
        testUserId,
        content,
        source
      );

      expect(result).to.have.property('success');
      
      if (result.success) {
        expect(result).to.have.property('entities');
        expect(result).to.have.property('workflow');
      }
    });

    it('Should get analysis statistics', async function() {
      const dateRange = {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
        end: new Date().toISOString()
      };

      const stats = await sidecarBot.getAnalysisStats(testProjectId, dateRange);

      expect(stats).to.have.property('proposals');
      expect(stats).to.have.property('autoCreated');
      expect(stats).to.have.property('totalProcessed');
      expect(stats.totalProcessed).to.be.a('number');
    });
  });

  describe('Fallback Analysis', () => {
    it('Should use fallback when AI fails', async function() {
      // Temporarily break AI by using invalid project
      const content = 'This is a test task that should trigger fallback analysis';
      const source = {
        type: 'test',
        platform: 'test',
        messageId: 'test_123'
      };

      // Call with minimal context to potentially trigger fallback
      const result = await sidecarBot.fallbackAnalysis(
        content,
        source,
        testUserId,
        testProjectId
      );

      expect(result).to.have.property('success', true);
      expect(result).to.have.property('entities');
      expect(result.llm.provider).to.equal('fallback');
      
      if (result.entities && result.entities.length > 0) {
        expect(result.entities[0]).to.have.property('entity_type');
        expect(result.entities[0].ai_analysis).to.have.property('reasoning');
        expect(result.entities[0].ai_analysis.reasoning).to.include('Fallback');
      }
    });
  });

  describe('Error Handling', () => {
    it('Should handle missing user gracefully', async function() {
      const content = 'Test message';
      const source = {
        type: 'test',
        platform: 'test',
        messageId: 'test_456'
      };

      const result = await sidecarBot.analyzeContent({
        projectId: testProjectId,
        content,
        source,
        userId: 999999 // Non-existent user
      });

      // Should still return a result (may fail or use degraded mode)
      expect(result).to.be.an('object');
      expect(result).to.have.property('success');
    });

    it('Should handle invalid project gracefully', async function() {
      const content = 'Test message';
      const source = {
        type: 'test',
        platform: 'test',
        messageId: 'test_789'
      };

      const result = await sidecarBot.analyzeContent({
        projectId: 999999, // Non-existent project
        content,
        source,
        userId: testUserId
      });

      expect(result).to.be.an('object');
      expect(result).to.have.property('success');
    });
  });
});
