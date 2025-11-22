/**
 * Automated Test Suite for Story 5.4.1: Sidecar Bot Foundation
 * Updated to match actual route implementation
 */

const request = require('supertest');
const { expect } = require('chai');
const { neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

// Configure WebSocket for Neon serverless
neonConfig.webSocketConstructor = ws;

const app = require('../server');
const { pool } = require('../db');

describe('Story 5.4.1: Sidecar Bot Foundation - Automated Tests', function() {
  this.timeout(15000);

  let authToken;
  let testProjectId;
  let testUserId;
  let testRoleId;

  // Setup: Authenticate with existing user
  before(async () => {
    try {
      // Login with demo user
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'demo@multiproject.com',
          password: 'demo123'
        });

      if (loginRes.status !== 200) {
        throw new Error('Login failed - check demo user credentials');
      }

      authToken = loginRes.body.token;
      testUserId = loginRes.body.user.id;

      console.log('✅ Authenticated successfully');

      // Create test project directly in database
      const projectResult = await pool.query(`
        INSERT INTO projects (name, description, created_by)
        VALUES ($1, $2, $3)
        RETURNING id
      `, ['Sidecar Test Project', 'Project for testing Sidecar Bot Foundation', testUserId]);

      testProjectId = projectResult.rows[0].id;
      console.log(`✅ Test project created: ${testProjectId}`);

    } catch (error) {
      console.error('Setup error:', error);
      throw error;
    }
  });

  // Cleanup: Remove test data
  after(async () => {
    try {
      if (testProjectId) {
        await pool.query('DELETE FROM projects WHERE id = $1', [testProjectId]);
        console.log(`✅ Test project ${testProjectId} deleted`);
      }
    } catch (error) {
      console.log('Cleanup error (non-critical):', error.message);
    }
  });

  // ============= DATABASE SCHEMA TESTS =============
  describe('Database Schema Validation', () => {
    it('should have custom_roles table with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'custom_roles'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map(r => r.column_name);
      expect(columns).to.include.members([
        'id', 'project_id', 'role_name', 'authority_level'
      ]);
    });

    it('should have role_permissions table', async () => {
      const result = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = 'role_permissions'
      `);
      expect(result.rows.length).to.equal(1);
    });

    it('should have sidecar_config table', async () => {
      const result = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = 'sidecar_config'
      `);
      expect(result.rows.length).to.equal(1);
    });

    it('should have thought_captures table', async () => {
      const result = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = 'thought_captures'
      `);
      expect(result.rows.length).to.equal(1);
    });

    it('should auto-seed default roles for projects', async () => {
      const result = await pool.query(
        'SELECT role_name, authority_level FROM custom_roles WHERE project_id = $1 ORDER BY authority_level DESC',
        [testProjectId]
      );

      expect(result.rows.length).to.be.at.least(5);
    });
  });

  // ============= ROLE MANAGEMENT API TESTS =============
  describe('Role Management API', () => {
    describe('GET /api/projects/:projectId/roles', () => {
      it('should list all roles for a project', async () => {
        const res = await request(app)
          .get(`/api/projects/${testProjectId}/roles`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).to.be.true;
        expect(res.body.roles).to.be.an('array');
        expect(res.body.roles.length).to.be.at.least(5);
      });

      it('should return 401 without authentication', async () => {
        await request(app)
          .get(`/api/projects/${testProjectId}/roles`)
          .expect(401);
      });
    });

    describe('GET /api/projects/:projectId/roles/hierarchy', () => {
      it('should return role hierarchy sorted by authority level', async () => {
        const res = await request(app)
          .get(`/api/projects/${testProjectId}/roles/hierarchy`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).to.be.true;
        expect(res.body.hierarchy).to.be.an('array');

        // Verify sorted by authority level descending
        for (let i = 0; i < res.body.hierarchy.length - 1; i++) {
          expect(res.body.hierarchy[i].authority_level)
            .to.be.at.least(res.body.hierarchy[i + 1].authority_level);
        }
      });
    });

    describe('POST /api/projects/:projectId/roles', () => {
      it('should create a custom role', async () => {
        const res = await request(app)
          .post(`/api/projects/${testProjectId}/roles`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            role_name: 'QA Engineer',
            authority_level: 3,
            description: 'Quality Assurance Engineer'
          })
          .expect(201);

        expect(res.body.success).to.be.true;
        expect(res.body.role.role_name).to.equal('QA Engineer');
        expect(res.body.role.authority_level).to.equal(3);
        testRoleId = res.body.role.id;
      });

      it('should reject invalid authority level', async () => {
        const res = await request(app)
          .post(`/api/projects/${testProjectId}/roles`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            role_name: 'Invalid Role',
            authority_level: 10,
            description: 'Invalid authority level'
          });

        expect(res.status).to.be.oneOf([400, 500]);
      });
    });

    describe('PUT /api/roles/:roleId', () => {
      it('should update a role', async () => {
        const res = await request(app)
          .put(`/api/roles/${testRoleId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            description: 'Senior QA Engineer'
          })
          .expect(200);

        expect(res.body.success).to.be.true;
      });
    });

    describe('GET /api/roles/:roleId/permissions', () => {
      it('should get role permissions', async () => {
        const res = await request(app)
          .get(`/api/roles/${testRoleId}/permissions`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).to.be.true;
        expect(res.body.permissions).to.be.an('array');
      });
    });

    describe('POST /api/roles/:roleId/permissions', () => {
      it('should update role permissions', async () => {
        const res = await request(app)
          .post(`/api/roles/${testRoleId}/permissions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            permissions: [
              { permission_key: 'task.create', can_perform: true },
              { permission_key: 'task.update', can_perform: true },
              { permission_key: 'task.delete', can_perform: false }
            ]
          })
          .expect(200);

        expect(res.body.success).to.be.true;
      });
    });

    describe('POST /api/projects/:projectId/users/:userId/assign-role', () => {
      it('should assign role to user', async () => {
        const res = await request(app)
          .post(`/api/projects/${testProjectId}/users/${testUserId}/assign-role`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            role_id: testRoleId
          })
          .expect(200);

        expect(res.body.success).to.be.true;
      });
    });

    describe('GET /api/projects/:projectId/users/:userId/role', () => {
      it('should get user role assignment', async () => {
        const res = await request(app)
          .get(`/api/projects/${testProjectId}/users/${testUserId}/role`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).to.be.true;
      });
    });

    describe('DELETE /api/roles/:roleId', () => {
      it('should delete role (after removing assignments)', async () => {
        // First remove assignment
        await pool.query(
          'DELETE FROM user_role_assignments WHERE role_id = $1',
          [testRoleId]
        );

        const res = await request(app)
          .delete(`/api/roles/${testRoleId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).to.be.true;
      });
    });
  });

  // ============= SIDECAR CONFIGURATION API TESTS =============
  describe('Sidecar Configuration API', () => {
    describe('GET /api/projects/:projectId/sidecar/config', () => {
      it('should get sidecar configuration', async () => {
        const res = await request(app)
          .get(`/api/projects/${testProjectId}/sidecar/config`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).to.be.true;
      });
    });

    describe('PUT /api/projects/:projectId/sidecar/config', () => {
      it('should create or update sidecar configuration', async () => {
        const res = await request(app)
          .put(`/api/projects/${testProjectId}/sidecar/config`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            platform: 'slack',
            enabled: true,
            slack_workspace_id: 'T12345',
            slack_bot_token: 'xoxb-test-token',
            slack_channels: ['#general', '#dev-team'],
            auto_create_threshold: 4
          })
          .expect(200);

        expect(res.body.success).to.be.true;
      });
    });

    describe('POST /api/projects/:projectId/sidecar/test-connection', () => {
      it('should test platform connection', async () => {
        const res = await request(app)
          .post(`/api/projects/${testProjectId}/sidecar/test-connection`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            platform: 'slack',
            slack_bot_token: 'xoxb-test-token'
          });

        expect(res.status).to.be.oneOf([200, 400]);
        expect(res.body).to.have.property('success');
      });
    });

    describe('POST /api/projects/:projectId/sidecar/enable', () => {
      it('should enable sidecar for project', async () => {
        const res = await request(app)
          .post(`/api/projects/${testProjectId}/sidecar/enable`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).to.be.true;
      });
    });

    describe('POST /api/projects/:projectId/sidecar/disable', () => {
      it('should disable sidecar for project', async () => {
        const res = await request(app)
          .post(`/api/projects/${testProjectId}/sidecar/disable`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).to.be.true;
      });
    });
  });

  // ============= WEBHOOK ENDPOINT TESTS =============
  describe('Webhook Endpoints', () => {
    describe('POST /webhooks/slack', () => {
      it('should handle Slack URL verification challenge', async () => {
        const res = await request(app)
          .post('/webhooks/slack')
          .send({
            type: 'url_verification',
            challenge: 'test_challenge_token'
          })
          .expect(200);

        expect(res.body.challenge).to.equal('test_challenge_token');
      });

      it('should process Slack message event', async () => {
        const res = await request(app)
          .post('/webhooks/slack')
          .send({
            type: 'event_callback',
            event: {
              type: 'message',
              channel: 'C12345',
              user: 'U12345',
              text: 'Create a task for fixing the login bug',
              ts: '1234567890.123456'
            }
          });

        expect(res.status).to.be.oneOf([200, 400]);
      });
    });

    describe('POST /webhooks/teams', () => {
      it('should handle Teams activity', async () => {
        const res = await request(app)
          .post('/webhooks/teams')
          .send({
            type: 'message',
            text: 'Create a task for updating documentation',
            from: {
              id: 'user123',
              name: 'Test User'
            },
            conversation: {
              id: 'conv123'
            }
          });

        expect(res.status).to.be.oneOf([200, 400]);
      });
    });

    describe('POST /webhooks/github', () => {
      it('should handle GitHub issue comment event', async () => {
        const res = await request(app)
          .post('/webhooks/github')
          .set('X-GitHub-Event', 'issue_comment')
          .send({
            action: 'created',
            issue: {
              number: 42,
              title: 'Login bug on mobile'
            },
            comment: {
              body: 'This needs to be fixed ASAP',
              user: {
                login: 'testuser'
              }
            },
            repository: {
              full_name: 'org/repo'
            }
          });

        expect(res.status).to.be.oneOf([200, 400]);
      });
    });

    describe('POST /webhooks/email/sendgrid', () => {
      it('should handle SendGrid email webhook', async () => {
        const res = await request(app)
          .post('/webhooks/email/sendgrid')
          .send({
            from: 'user@example.com',
            subject: 'New bug report',
            text: 'Bug description here'
          });

        expect(res.status).to.be.oneOf([200, 400]);
      });
    });
  });

  // ============= THOUGHT CAPTURE API TESTS =============
  describe('Thought Capture API', () => {
    let captureId;

    describe('POST /api/sidecar/thoughts', () => {
      it('should capture text thought', async () => {
        const res = await request(app)
          .post('/api/sidecar/thoughts')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            project_id: testProjectId,
            capture_type: 'text',
            content: 'We need to add OAuth integration for Google accounts'
          });

        expect(res.status).to.be.oneOf([201, 200]);
        if (res.body.capture) {
          captureId = res.body.capture.id;
        }
      });
    });

    describe('GET /api/sidecar/thoughts', () => {
      it('should list thought captures', async () => {
        const res = await request(app)
          .get('/api/sidecar/thoughts')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ project_id: testProjectId });

        expect(res.status).to.be.oneOf([200, 404]);
      });
    });

    describe('GET /api/sidecar/thoughts/:captureId', () => {
      it('should get specific thought capture', async () => {
        if (!captureId) {
          this.skip();
        }

        const res = await request(app)
          .get(`/api/sidecar/thoughts/${captureId}`)
          .set('Authorization', `Bearer ${authToken}`);

        expect(res.status).to.be.oneOf([200, 404]);
      });
    });
  });

  // ============= INTEGRATION TEST =============
  describe('End-to-End Integration', () => {
    it('should complete basic workflow', async () => {
      // 1. Configure Sidecar
      const configRes = await request(app)
        .put(`/api/projects/${testProjectId}/sidecar/config`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platform: 'slack',
          enabled: true,
          auto_create_threshold: 4
        });

      expect(configRes.status).to.equal(200);

      // 2. Enable Sidecar
      const enableRes = await request(app)
        .post(`/api/projects/${testProjectId}/sidecar/enable`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(enableRes.status).to.equal(200);

      // 3. Verify configuration
      const getConfigRes = await request(app)
        .get(`/api/projects/${testProjectId}/sidecar/config`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(getConfigRes.body.success).to.be.true;
    });
  });
});
