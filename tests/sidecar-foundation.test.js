/**
 * Automated Test Suite for Story 5.4.1: Sidecar Bot Foundation
 *
 * Tests cover:
 * - Role Management API (7 endpoints)
 * - Sidecar Configuration API (5 endpoints)
 * - Webhook Endpoints (4 endpoints)
 * - Thought Capture API (3 endpoints)
 * - Database schema validation
 * - Permission enforcement
 * - Platform integrations
 */

const request = require('supertest');
const { expect } = require('chai');
const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE_URL = 'http://localhost:5000';

describe('Story 5.4.1: Sidecar Bot Foundation - Automated Tests', function() {
  this.timeout(10000);

  let authToken;
  let testProjectId;
  let testUserId;
  let testRoleId;
  let testConfigId;

  before(async () => {
    const timestamp = Date.now();
    const testEmail = `test-${timestamp}@example.com`;
    const testUsername = `testuser-${timestamp}`;
    
    const registerRes = await request(BASE_URL)
      .post('/api/auth/register')
      .send({
        username: testUsername,
        email: testEmail,
        password: 'testpassword123'
      });

    if (registerRes.status !== 201) {
      throw new Error(`Failed to register test user: ${JSON.stringify(registerRes.body)}`);
    }

    testUserId = registerRes.body.user.id;

    await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['System Administrator', testUserId]);

    const loginRes = await request(BASE_URL)
      .post('/api/auth/login')
      .send({
        email: testEmail,
        password: 'testpassword123'
      });

    console.log('DEBUG: Login response status:', loginRes.status);
    console.log('DEBUG: Login response body:', JSON.stringify(loginRes.body, null, 2));

    if (!loginRes.body.token) {
      throw new Error(`Failed to get auth token: ${JSON.stringify(loginRes.body)}`);
    }

    authToken = loginRes.body.token;
    console.log('DEBUG: Got auth token:', authToken.substring(0, 20) + '...');

    const projectRes = await request(BASE_URL)
      .post('/api/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Sidecar Test Project',
        description: 'Project for testing Sidecar Bot Foundation'
      });

    if (!projectRes.body || !projectRes.body.id) {
      throw new Error(`Failed to create project: ${JSON.stringify(projectRes.body)}`);
    }

    testProjectId = projectRes.body.id;
  });

  after(async () => {
    if (testProjectId) {
      await pool.query('DELETE FROM projects WHERE id = $1', [testProjectId]);
    }
    await pool.end();
  });

  describe('Database Schema Validation', () => {
    it('should have custom_roles table with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'custom_roles'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map(r => r.column_name);
      expect(columns).to.include.members([
        'id', 'project_id', 'role_name', 'authority_level',
        'description', 'created_at', 'updated_at'
      ]);
    });

    it('should have role_permissions table with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'role_permissions'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map(r => r.column_name);
      expect(columns).to.include.members([
        'id', 'role_id', 'permission_key', 'can_perform', 'created_at'
      ]);
    });

    it('should have sidecar_config table with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'sidecar_config'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map(r => r.column_name);
      expect(columns).to.include.members([
        'id', 'project_id', 'platform_type', 'enabled', 'platform_config',
        'auto_create_threshold', 'notification_settings', 'created_at', 'updated_at'
      ]);
    });

    it('should have thought_captures table with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'thought_captures'
        ORDER BY ordinal_position
      `);

      const columns = result.rows.map(r => r.column_name);
      expect(columns).to.include.members([
        'id', 'user_id', 'project_id', 'capture_type', 'raw_content',
        'transcription', 'ai_analysis', 'created_entities', 'created_at'
      ]);
    });

    it('should auto-seed default roles for new projects', async () => {
      const result = await pool.query(
        'SELECT role_name, authority_level FROM custom_roles WHERE project_id = $1 ORDER BY authority_level DESC',
        [testProjectId]
      );

      expect(result.rows.length).to.be.at.least(5);
      const roleNames = result.rows.map(r => r.role_name);
      expect(roleNames).to.include.members([
        'System Administrator',
        'Project Manager',
        'Team Lead',
        'Team Member',
        'Stakeholder'
      ]);
    });
  });

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
      it('should return role hierarchy', async () => {
        const res = await request(app)
          .get(`/api/projects/${testProjectId}/roles/hierarchy`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).to.be.true;
        expect(res.body.hierarchy).to.be.an('array');

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
            roleName: 'QA Engineer',
            authorityLevel: 3,
            roleDescription: 'Quality Assurance Engineer'
          })
          .expect(201);

        expect(res.body.success).to.be.true;
        expect(res.body.role.role_name).to.equal('QA Engineer');
        expect(res.body.role.authority_level).to.equal(3);
        testRoleId = res.body.role.id;
      });

      it('should reject invalid authority level', async () => {
        await request(app)
          .post(`/api/projects/${testProjectId}/roles`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            roleName: 'Invalid Role',
            authorityLevel: 10,
            roleDescription: 'Invalid authority level'
          })
          .expect(400);
      });

      it('should reject duplicate role name in same project', async () => {
        await request(app)
          .post(`/api/projects/${testProjectId}/roles`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            roleName: 'QA Engineer',
            authorityLevel: 3,
            roleDescription: 'Duplicate role'
          })
          .expect(409);
      });
    });

    describe('PUT /roles/:roleId', () => {
      it('should update a role', async () => {
        const res = await request(app)
          .put(`/api/roles/${testRoleId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            roleDescription: 'Senior QA Engineer'
          })
          .expect(200);

        expect(res.body.success).to.be.true;
        expect(res.body.role.description).to.equal('Senior QA Engineer');
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

    describe('PUT /api/roles/:roleId/permissions', () => {
      it('should update role permissions', async () => {
        const res = await request(app)
          .put(`/api/roles/${testRoleId}/permissions`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            entityType: 'task',
            canCreate: true,
            canRead: true,
            canUpdate: true,
            canDelete: false
          })
          .expect(200);

        expect(res.body.success).to.be.true;
        expect(res.body.permission).to.be.an('object');
      });
    });

    describe('POST /api/projects/:projectId/users/:userId/role', () => {
      it('should assign role to user', async () => {
        const res = await request(app)
          .post(`/api/projects/${testProjectId}/users/${testUserId}/role`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            roleId: testRoleId
          })
          .expect(200);

        expect(res.body.success).to.be.true;
        expect(res.body.assignment.role_id).to.equal(testRoleId);
      });
    });

    describe('GET /api/projects/:projectId/users/:userId/role', () => {
      it('should get user role assignment', async () => {
        const res = await request(app)
          .get(`/api/projects/${testProjectId}/users/${testUserId}/role`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).to.be.true;
        expect(res.body.role.id).to.equal(testRoleId);
      });
    });

    describe('DELETE /api/roles/:roleId', () => {
      it('should prevent deletion of roles with active assignments', async () => {
        await request(app)
          .delete(`/api/roles/${testRoleId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(409);
      });

      it('should delete role without assignments', async () => {
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

  describe('Sidecar Configuration API', () => {
    describe('GET /api/projects/:projectId/sidecar/config', () => {
      it('should get sidecar configuration', async () => {
        const res = await request(app)
          .get(`/api/projects/${testProjectId}/sidecar/config`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).to.be.true;
        expect(res.body.configs).to.be.an('array');
      });
    });

    describe('PUT /api/projects/:projectId/sidecar/config', () => {
      it('should create or update sidecar configuration', async () => {
        const res = await request(app)
          .put(`/api/projects/${testProjectId}/sidecar/config`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            platformType: 'slack',
            enabled: true,
            platformConfig: {
              workspaceId: 'T12345',
              botToken: 'xoxb-test-token',
              channels: ['#general', '#dev']
            },
            autoCreateThreshold: 4,
            notificationSettings: {
              notifyOnCreate: true,
              notifyChannel: '#notifications'
            }
          })
          .expect(200);

        expect(res.body.success).to.be.true;
        expect(res.body.config.platform_type).to.equal('slack');
        expect(res.body.config.enabled).to.be.true;
        testConfigId = res.body.config.id;
      });

      it('should validate platform_type', async () => {
        await request(app)
          .put(`/api/projects/${testProjectId}/sidecar/config`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            platformType: 'invalid_platform',
            enabled: true
          })
          .expect(400);
      });
    });

    describe('POST /api/projects/:projectId/sidecar/test-platform', () => {
      it('should test platform connection', async () => {
        const res = await request(app)
          .post(`/api/projects/${testProjectId}/sidecar/test-platform`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            platformType: 'slack',
            platformConfig: {
              workspaceId: 'T12345',
              botToken: 'xoxb-test-token'
            }
          })
          .expect(200);

        expect(res.body.success).to.be.defined;
        expect(res.body.message).to.be.a('string');
      });
    });

    describe('POST /api/projects/:projectId/sidecar/disable', () => {
      it('should disable sidecar for platform', async () => {
        const res = await request(app)
          .post(`/api/projects/${testProjectId}/sidecar/disable`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            platformType: 'slack'
          })
          .expect(200);

        expect(res.body.success).to.be.true;
      });
    });
  });

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
          })
          .expect(200);

        expect(res.body.success).to.be.true;
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
          })
          .expect(200);

        expect(res.body.success).to.be.true;
      });
    });

    describe('POST /webhooks/email', () => {
      it('should handle incoming email webhook', async () => {
        const res = await request(app)
          .post('/webhooks/email')
          .send({
            from: 'user@example.com',
            subject: 'New bug report: Login fails on mobile',
            body: 'Users are reporting login failures on mobile devices',
            headers: {
              'message-id': '<test123@example.com>'
            }
          })
          .expect(200);

        expect(res.body.success).to.be.true;
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
          })
          .expect(200);

        expect(res.body.success).to.be.true;
      });
    });
  });

  describe('Thought Capture API', () => {
    let captureId;

    describe('POST /api/sidecar/thoughts', () => {
      it('should capture text thought', async () => {
        const res = await request(app)
          .post('/api/sidecar/thoughts')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            projectId: testProjectId,
            captureType: 'text',
            content: 'We need to add OAuth integration for Google accounts'
          })
          .expect(201);

        expect(res.body.success).to.be.true;
        expect(res.body.capture.capture_type).to.equal('text');
        expect(res.body.capture.ai_analysis).to.be.an('object');
        captureId = res.body.capture.id;
      });

      it('should capture voice thought with transcription', async () => {
        const res = await request(app)
          .post('/api/sidecar/thoughts')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            projectId: testProjectId,
            captureType: 'voice',
            audioUrl: 'https://example.com/audio.mp3',
            transcription: 'Add a dark mode toggle to the settings page'
          })
          .expect(201);

        expect(res.body.success).to.be.true;
        expect(res.body.capture.capture_type).to.equal('voice');
        expect(res.body.capture.transcription).to.be.a('string');
      });

      it('should require content or transcription', async () => {
        await request(app)
          .post('/api/sidecar/thoughts')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            projectId: testProjectId,
            captureType: 'text'
          })
          .expect(400);
      });
    });

    describe('GET /api/sidecar/thoughts', () => {
      it('should list thought captures for project', async () => {
        const res = await request(app)
          .get(`/api/sidecar/thoughts`)
          .set('Authorization', `Bearer ${authToken}`)
          .query({ projectId: testProjectId })
          .expect(200);

        expect(res.body.success).to.be.true;
        expect(res.body.captures).to.be.an('array');
        expect(res.body.captures.length).to.be.at.least(2);
      });

      it('should filter by capture_type', async () => {
        const res = await request(app)
          .get(`/api/sidecar/thoughts`)
          .set('Authorization', `Bearer ${authToken}`)
          .query({ projectId: testProjectId, type: 'voice' })
          .expect(200);

        expect(res.body.captures.every(c => c.capture_type === 'voice')).to.be.true;
      });
    });

    describe('GET /api/sidecar/thoughts/:captureId', () => {
      it('should get specific thought capture', async () => {
        const res = await request(app)
          .get(`/api/sidecar/thoughts/${captureId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(res.body.success).to.be.true;
        expect(res.body.capture.id).to.equal(captureId);
        expect(res.body.capture.ai_analysis).to.be.an('object');
      });

      it('should return 404 for non-existent capture', async () => {
        await request(app)
          .get('/api/sidecar/thoughts/99999')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(404);
      });
    });
  });

  describe('End-to-End Integration', () => {
    it('should complete full workflow: configure platform -> receive webhook -> capture thought -> create entity', async () => {
      const configRes = await request(app)
        .put(`/api/projects/${testProjectId}/sidecar/config`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platformType: 'slack',
          enabled: true,
          platformConfig: { workspaceId: 'T12345' },
          autoCreateThreshold: 4
        })
        .expect(200);

      expect(configRes.body.success).to.be.true;

      const webhookRes = await request(app)
        .post('/webhooks/slack')
        .send({
          type: 'event_callback',
          event: {
            type: 'message',
            text: 'Critical bug: Payment processing fails for international cards',
            user: 'U12345',
            channel: 'C12345'
          }
        })
        .expect(200);

      expect(webhookRes.body.success).to.be.true;

      const capturesRes = await request(app)
        .get(`/api/sidecar/thoughts`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ projectId: testProjectId })
        .expect(200);

      const recentCapture = capturesRes.body.captures.find(c =>
        c.raw_content && c.raw_content.includes('Payment processing fails')
      );
      expect(recentCapture).to.exist;
      expect(recentCapture.ai_analysis).to.be.an('object');
    });
  });
});
