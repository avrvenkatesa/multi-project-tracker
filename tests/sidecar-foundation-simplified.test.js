/**
 * Simplified Automated Test Suite for Story 5.4.1: Sidecar Bot Foundation
 *
 * Tests core API functionality using existing admin account
 */

const request = require('supertest');
const { expect } = require('chai');

const BASE_URL = 'http://localhost:5000';

describe('Story 5.4.1: Sidecar Bot Foundation - Simplified Tests', function() {
  this.timeout(10000);

  let authToken;
  let testProjectId;
  let testRoleId;

  before(async () => {
    console.log('Logging in with existing admin account...');
    const loginRes = await request(BASE_URL)
      .post('/api/auth/login')
      .send({
        email: 'demo@multiproject.com',
        password: 'demo123'
      });

    if (!loginRes.body.token) {
      throw new Error(`Failed to login: ${JSON.stringify(loginRes.body)}`);
    }

    authToken = loginRes.body.token;
    console.log('✅ Authenticated successfully');

    const projectRes = await request(BASE_URL)
      .post('/api/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: `Sidecar Test Project ${Date.now()}`,
        description: 'Project for testing Sidecar Bot Foundation'
      });

    if (!projectRes.body || !projectRes.body.id) {
      throw new Error(`Failed to create project: ${JSON.stringify(projectRes.body)}`);
    }

    testProjectId = projectRes.body.id;
    console.log('✅ Test project created:', testProjectId);
  });

  describe('Role Management API', () => {
    it('should list all roles for a project', async () => {
      const res = await request(BASE_URL)
        .get(`/api/projects/${testProjectId}/roles`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.roles).to.be.an('array');
      expect(res.body.roles.length).to.be.at.least(5);
    });

    it('should return role hierarchy', async () => {
      const res = await request(BASE_URL)
        .get(`/api/projects/${testProjectId}/roles/hierarchy`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.hierarchy).to.be.an('array');
    });

    it('should create a custom role', async () => {
      const res = await request(BASE_URL)
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
      testRoleId = res.body.role.id;
    });

    it('should get role permissions', async () => {
      const res = await request(BASE_URL)
        .get(`/api/roles/${testRoleId}/permissions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.permissions).to.be.an('array');
    });
  });

  describe('Sidecar Configuration API', () => {
    it('should get sidecar configuration', async () => {
      const res = await request(BASE_URL)
        .get(`/api/projects/${testProjectId}/sidecar/config`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.configs).to.be.an('array');
    });

    it('should create or update sidecar configuration', async () => {
      const res = await request(BASE_URL)
        .put(`/api/projects/${testProjectId}/sidecar/config`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platformType: 'slack',
          enabled: true,
          platformConfig: {
            workspaceId: 'T12345',
            botToken: 'xoxb-test-token'
          },
          autoCreateThreshold: 4
        })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.config.platform_type).to.equal('slack');
    });
  });

  describe('Webhook Endpoints', () => {
    it('should handle Slack URL verification challenge', async () => {
      const res = await request(BASE_URL)
        .post('/webhooks/slack')
        .send({
          type: 'url_verification',
          challenge: 'test_challenge_token'
        })
        .expect(200);

      expect(res.body.challenge).to.equal('test_challenge_token');
    });

    it('should process Slack message event', async () => {
      const res = await request(BASE_URL)
        .post('/webhooks/slack')
        .send({
          type: 'event_callback',
          event: {
            type: 'message',
            channel: 'C12345',
            user: 'U12345',
            text: 'Create a task for fixing the login bug'
          }
        })
        .expect(200);

      expect(res.body.success).to.be.true;
    });
  });

  describe('Thought Capture API', () => {
    it('should capture text thought', async () => {
      const res = await request(BASE_URL)
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
    });

    it('should list thought captures for project', async () => {
      const res = await request(BASE_URL)
        .get(`/api/sidecar/thoughts`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ projectId: testProjectId })
        .expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.captures).to.be.an('array');
    });
  });

  describe('Authentication - Bearer Token', () => {
    it('should accept Bearer token for authentication', async () => {
      const res = await request(BASE_URL)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.email).to.equal('demo@multiproject.com');
    });

    it('should reject requests without token', async () => {
      await request(BASE_URL)
        .get('/api/auth/me')
        .expect(401);
    });
  });
});
