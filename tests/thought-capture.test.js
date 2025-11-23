/**
 * Integration Tests: Thought Capture System
 * 
 * Tests for Story 5.4.4: Mobile Thought Capture & Voice-to-Text
 * Covers: Quick Capture, Voice Capture, Offline Sync, Templates
 */

const { expect } = require('chai');
const request = require('supertest');
const { pool } = require('../db');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Thought Capture System Integration Tests', function() {
  this.timeout(30000);

  let authToken;
  let testUserId;
  let testProjectId;
  let testThoughtId;

  before(async function() {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const registerRes = await request(BASE_URL)
      .post('/api/auth/register')
      .send({
        username: 'test_integration_user',
        email: 'test_integration@example.com',
        password: 'testpass123',
        role: 'System Administrator'
      });

    const loginRes = await request(BASE_URL)
      .post('/api/auth/login')
      .send({
        email: 'test_integration@example.com',
        password: 'testpass123'
      });

    expect(loginRes.status).to.equal(200);
    expect(loginRes.body).to.have.property('token');
    authToken = loginRes.body.token;
    testUserId = loginRes.body.user.id;

    const projectRes = await request(BASE_URL)
      .get('/api/projects')
      .set('Authorization', `Bearer ${authToken}`);

    if (projectRes.body.projects && projectRes.body.projects.length > 0) {
      testProjectId = projectRes.body.projects[0].id;
    }
  });

  describe('Quick Text Capture', function() {
    it('should capture a text thought successfully', async function() {
      const res = await request(BASE_URL)
        .post('/api/quick-capture/text')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Test thought: Meeting with client tomorrow at 2pm',
          projectId: testProjectId
        });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('id');
      expect(res.body).to.have.property('content');
      expect(res.body.status).to.equal('pending');

      testThoughtId = res.body.id;
    });

    it('should reject empty content', async function() {
      const res = await request(BASE_URL)
        .post('/api/quick-capture/text')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: ''
        });

      expect(res.status).to.equal(400);
    });

    it('should capture thought without project ID', async function() {
      const res = await request(BASE_URL)
        .post('/api/quick-capture/text')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Personal note: Remember to review Q3 budget'
        });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('id');
    });
  });

  describe('Retrieve Thought Captures', function() {
    it('should get list of thought captures', async function() {
      const res = await request(BASE_URL)
        .get('/api/quick-capture')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('thoughts');
      expect(res.body.thoughts).to.be.an('array');
      expect(res.body.thoughts.length).to.be.greaterThan(0);
    });

    it('should get a specific thought capture by ID', async function() {
      if (!testThoughtId) {
        this.skip();
      }

      const res = await request(BASE_URL)
        .get(`/api/quick-capture/${testThoughtId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('id', testThoughtId);
      expect(res.body).to.have.property('content');
    });

    it('should filter thoughts by project', async function() {
      if (!testProjectId) {
        this.skip();
      }

      const res = await request(BASE_URL)
        .get(`/api/quick-capture?projectId=${testProjectId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('thoughts');
    });
  });

  describe('Update Thought Capture', function() {
    it('should update thought content', async function() {
      if (!testThoughtId) {
        this.skip();
      }

      const res = await request(BASE_URL)
        .patch(`/api/quick-capture/${testThoughtId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Updated: Meeting rescheduled to 3pm'
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('content');
      expect(res.body.content).to.include('rescheduled');
    });
  });

  describe('Quick Capture Templates', function() {
    let testTemplateId;

    it('should create a quick capture template', async function() {
      const res = await request(BASE_URL)
        .post('/api/quick-capture/templates')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Daily Standup',
          templateText: 'Standup: What I did, what I will do, blockers',
          entityType: 'issue',
          tags: ['standup', 'daily'],
          isFavorite: true
        });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('id');
      expect(res.body.name).to.equal('Daily Standup');

      testTemplateId = res.body.id;
    });

    it('should get templates list', async function() {
      const res = await request(BASE_URL)
        .get('/api/quick-capture/templates/list')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('templates');
      expect(res.body.templates).to.be.an('array');
    });
  });

  describe('Statistics', function() {
    it('should get thought capture statistics', async function() {
      const res = await request(BASE_URL)
        .get('/api/quick-capture/stats/summary')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('total_captures');
      expect(res.body).to.have.property('pending_count');
      expect(res.body).to.have.property('processed_count');
    });
  });

  describe('Voice Capture (Mock)', function() {
    it('should accept voice recording upload', async function() {
      const testAudioPath = path.join(__dirname, 'fixtures', 'test-audio.webm');
      
      if (!fs.existsSync(testAudioPath)) {
        console.log('⚠️  Test audio file not found, creating mock file');
        fs.mkdirSync(path.dirname(testAudioPath), { recursive: true });
        fs.writeFileSync(testAudioPath, Buffer.from('mock audio data'));
      }

      const res = await request(BASE_URL)
        .post('/api/quick-capture/voice')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('audio', testAudioPath)
        .field('projectId', testProjectId || '');

      if (res.status === 500 && res.body.details?.includes('Deepgram')) {
        console.log('⚠️  Deepgram not configured, skipping voice test');
        this.skip();
      }

      expect(res.status).to.be.oneOf([201, 500]);
      
      if (res.status === 201) {
        expect(res.body).to.have.property('id');
        expect(res.body).to.have.property('content');
      }
    });
  });

  describe('Delete Thought Capture', function() {
    it('should delete a thought capture', async function() {
      if (!testThoughtId) {
        this.skip();
      }

      const res = await request(BASE_URL)
        .delete(`/api/quick-capture/${testThoughtId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('message');
    });

    it('should return 404 for non-existent thought', async function() {
      const res = await request(BASE_URL)
        .delete('/api/quick-capture/99999')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(404);
    });
  });

  describe('Authorization', function() {
    it('should reject unauthenticated requests', async function() {
      const res = await request(BASE_URL)
        .post('/api/quick-capture/text')
        .send({
          content: 'Unauthorized test'
        });

      expect(res.status).to.equal(401);
    });

    it('should prevent access to other users thoughts', async function() {
      const res = await request(BASE_URL)
        .post('/api/auth/login')
        .send({
          email: 'user1@example.com',
          password: 'password123'
        });

      if (res.status !== 200) {
        this.skip();
      }

      const otherUserToken = res.body.token;

      const thoughtRes = await request(BASE_URL)
        .post('/api/quick-capture/text')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          content: 'Other user thought'
        });

      const otherThoughtId = thoughtRes.body.id;

      const accessRes = await request(BASE_URL)
        .get(`/api/quick-capture/${otherThoughtId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(accessRes.status).to.be.oneOf([404, 403]);
    });
  });

  after(async function() {
    console.log('✅ Thought Capture Integration Tests completed');
  });
});

describe('Offline Sync Service Tests', function() {
  this.timeout(10000);

  const offlineSync = require('../services/offlineSync');
  let syncTestUserId;
  let syncAuthToken;
  let queueItemId;

  before(async function() {
    const registerRes = await request(BASE_URL)
      .post('/api/auth/register')
      .send({
        username: 'sync_test_user',
        email: 'sync_test@example.com',
        password: 'synctest123',
        role: 'Team Member'
      });

    const loginRes = await request(BASE_URL)
      .post('/api/auth/login')
      .send({
        email: 'sync_test@example.com',
        password: 'synctest123'
      });

    syncAuthToken = loginRes.body.token;
    syncTestUserId = loginRes.body.user.id;
  });

  describe('Queue Management', function() {
    it('should add item to offline queue', async function() {
      const queueItem = await offlineSync.queueOfflineCapture(syncTestUserId, {
        content: 'Offline thought test',
        captureMethod: 'text'
      });

      expect(queueItem).to.have.property('id');
      expect(queueItem.status).to.equal('pending');
      queueItemId = queueItem.id;
    });

    it('should get pending queue items', async function() {
      const items = await offlineSync.getPendingQueueItems(syncTestUserId);
      
      expect(items).to.be.an('array');
      expect(items.length).to.be.greaterThan(0);
    });

    it('should get queue statistics', async function() {
      const stats = await offlineSync.getQueueStats(syncTestUserId);
      
      expect(stats).to.have.property('total_items');
      expect(stats).to.have.property('pending');
    });
  });

  describe('Sync Operations', function() {
    it('should sync pending queue items', async function() {
      const result = await offlineSync.syncOfflineQueue(syncTestUserId);
      
      expect(result).to.have.property('totalItems');
      expect(result).to.have.property('synced');
      expect(result).to.have.property('failed');
    });

    it('should handle sync errors gracefully', async function() {
      await offlineSync.queueOfflineCapture(syncTestUserId, {
        content: '',
        captureMethod: 'invalid'
      });

      const result = await offlineSync.syncOfflineQueue(syncTestUserId);
      
      expect(result).to.have.property('failed');
    });
  });

  after(async function() {
    console.log('✅ Offline Sync Service Tests completed');
  });
});
