/**
 * Integration Tests: Hallway Meetings System
 * 
 * Tests for hallway meeting capture, transcription, and analysis
 * Covers: API endpoints, services, wake-word settings, speaker mapping
 */

const { expect } = require('chai');
const request = require('supertest');
const { pool } = require('../db');
const hallwayMeetingService = require('../services/hallwayMeetingService');
const hallwayAnalysisService = require('../services/hallwayAnalysisService');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

describe('Hallway Meetings Integration Tests', () => {
  let authToken;
  let testUserId;
  let testProjectId;
  let testMeetingId;
  let testParticipantId;

  beforeAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const registerRes = await request(BASE_URL)
      .post('/api/auth/register')
      .send({
        username: 'hallway_test_user',
        email: 'hallway_test@example.com',
        password: 'testpass123',
        role: 'System Administrator'
      });

    const loginRes = await request(BASE_URL)
      .post('/api/auth/login')
      .send({
        email: 'hallway_test@example.com',
        password: 'testpass123'
      });

    expect(loginRes.status).to.equal(200);
    expect(loginRes.body).to.have.property('token');
    authToken = loginRes.body.token;
    testUserId = loginRes.body.user.id;

    const projectRes = await request(BASE_URL)
      .post('/api/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Hallway Test Project',
        description: 'Test project for hallway meetings'
      });

    if (projectRes.status === 201) {
      testProjectId = projectRes.body.id;
    } else {
      const projects = await request(BASE_URL)
        .get('/api/projects')
        .set('Authorization', `Bearer ${authToken}`);
      
      if (projects.body.projects && projects.body.projects.length > 0) {
        testProjectId = projects.body.projects[0].id;
      }
    }
  });

  afterAll(async () => {
    try {
      if (testMeetingId) {
        await pool.query('DELETE FROM hallway_entity_detections WHERE meeting_id = $1', [testMeetingId]);
        await pool.query('DELETE FROM hallway_transcript_chunks WHERE meeting_id = $1', [testMeetingId]);
        await pool.query('DELETE FROM hallway_speaker_mappings WHERE meeting_id = $1', [testMeetingId]);
        await pool.query('DELETE FROM hallway_participants WHERE meeting_id = $1', [testMeetingId]);
        await pool.query('DELETE FROM hallway_meetings WHERE id = $1', [testMeetingId]);
      }

      await pool.query('DELETE FROM user_wake_word_settings WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM wake_word_detections WHERE user_id = $1', [testUserId]);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  describe('POST /api/hallway-meetings/start', () => {
    it('should create meeting with manual activation', async () => {
      const res = await request(BASE_URL)
        .post('/api/hallway-meetings/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: testProjectId,
          title: 'Test Manual Meeting',
          activationMethod: 'manual'
        });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('meeting');
      expect(res.body.meeting).to.have.property('id');
      expect(res.body.meeting.meetingTitle).to.equal('Test Manual Meeting');
      expect(res.body.meeting.activationMode).to.equal('manual');
      expect(res.body.meeting.status).to.equal('recording');
      expect(res.body.meeting.startedBy).to.equal(testUserId);

      testMeetingId = res.body.meeting.id;
    });

    it('should create meeting with wake-word activation', async () => {
      const res = await request(BASE_URL)
        .post('/api/hallway-meetings/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: testProjectId,
          title: 'Test Wake-Word Meeting',
          activationMethod: 'wake_word',
          wakeWord: 'hey team',
          confidence: 0.85
        });

      expect(res.status).to.equal(201);
      expect(res.body.meeting.activationMode).to.equal('wake_word');
      expect(res.body.meeting.wakeWordDetected).to.equal('hey team');

      const meetingId = res.body.meeting.id;
      await pool.query('DELETE FROM hallway_meetings WHERE id = $1', [meetingId]);
    });

    it('should create meeting without project ID', async () => {
      const res = await request(BASE_URL)
        .post('/api/hallway-meetings/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Unlinked Meeting',
          activationMethod: 'manual'
        });

      expect(res.status).to.equal(201);
      expect(res.body.meeting.projectId).to.be.null;

      const meetingId = res.body.meeting.id;
      await pool.query('DELETE FROM hallway_meetings WHERE id = $1', [meetingId]);
    });

    it('should reject unauthorized user', async () => {
      const res = await request(BASE_URL)
        .post('/api/hallway-meetings/start')
        .send({
          title: 'Unauthorized Meeting'
        });

      expect(res.status).to.equal(401);
    });

    it('should reject invalid project', async () => {
      const res = await request(BASE_URL)
        .post('/api/hallway-meetings/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          projectId: 999999,
          title: 'Invalid Project Meeting'
        });

      expect(res.status).to.equal(403);
      expect(res.body.error).to.include('Project not found');
    });

    it('should validate required fields', async () => {
      const res = await request(BASE_URL)
        .post('/api/hallway-meetings/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          activationMethod: 'manual'
        });

      expect(res.status).to.equal(400);
    });
  });

  describe('GET /api/hallway-meetings/:id', () => {
    it('should get meeting details', async () => {
      if (!testMeetingId) return;

      const res = await request(BASE_URL)
        .get(`/api/hallway-meetings/${testMeetingId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('meeting');
      expect(res.body.meeting.id).to.equal(testMeetingId);
      expect(res.body.meeting).to.have.property('participants');
      expect(res.body.meeting).to.have.property('transcriptChunks');
    });

    it('should reject access to other users meeting', async () => {
      if (!testMeetingId) return;

      const otherUserRes = await request(BASE_URL)
        .post('/api/auth/register')
        .send({
          username: 'other_hallway_user',
          email: 'other_hallway@example.com',
          password: 'testpass123',
          role: 'Team Member'
        });

      const loginRes = await request(BASE_URL)
        .post('/api/auth/login')
        .send({
          email: 'other_hallway@example.com',
          password: 'testpass123'
        });

      const otherToken = loginRes.body.token;

      const res = await request(BASE_URL)
        .get(`/api/hallway-meetings/${testMeetingId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).to.equal(403);
    });
  });

  describe('POST /api/hallway-meetings/:id/participants', () => {
    it('should add manual participant entry', async () => {
      if (!testMeetingId) return;

      const res = await request(BASE_URL)
        .post(`/api/hallway-meetings/${testMeetingId}/participants`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'John Doe',
          email: 'john.doe@example.com',
          role: 'Product Manager'
        });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('participant');
      expect(res.body.participant.name).to.equal('John Doe');
      expect(res.body.participant.email).to.equal('john.doe@example.com');
      expect(res.body.participant.role).to.equal('Product Manager');

      testParticipantId = res.body.participant.id;
    });

    it('should add registered user participant', async () => {
      if (!testMeetingId) return;

      const res = await request(BASE_URL)
        .post(`/api/hallway-meetings/${testMeetingId}/participants`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: testUserId
        });

      expect(res.status).to.equal(201);
      expect(res.body.participant.user_id).to.equal(testUserId);
    });

    it('should increment participants_count', async () => {
      if (!testMeetingId) return;

      const beforeRes = await request(BASE_URL)
        .get(`/api/hallway-meetings/${testMeetingId}`)
        .set('Authorization', `Bearer ${authToken}`);

      const beforeCount = beforeRes.body.meeting.participants_count;

      await request(BASE_URL)
        .post(`/api/hallway-meetings/${testMeetingId}/participants`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Jane Smith',
          role: 'Designer'
        });

      const afterRes = await request(BASE_URL)
        .get(`/api/hallway-meetings/${testMeetingId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(afterRes.body.meeting.participants_count).to.equal(beforeCount + 1);
    });

    it('should validate required name field', async () => {
      if (!testMeetingId) return;

      const res = await request(BASE_URL)
        .post(`/api/hallway-meetings/${testMeetingId}/participants`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          email: 'noname@example.com'
        });

      expect(res.status).to.equal(400);
    });
  });

  describe('GET /api/hallway-meetings/:id/participants', () => {
    it('should list all participants', async () => {
      if (!testMeetingId) return;

      const res = await request(BASE_URL)
        .get(`/api/hallway-meetings/${testMeetingId}/participants`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('participants');
      expect(res.body.participants).to.be.an('array');
      expect(res.body.participants.length).to.be.greaterThan(0);
    });
  });

  describe('PUT /api/hallway-meetings/:id/participants/:pid/map-speaker', () => {
    it('should map speaker to participant', async () => {
      if (!testMeetingId || !testParticipantId) return;

      const res = await request(BASE_URL)
        .put(`/api/hallway-meetings/${testMeetingId}/participants/${testParticipantId}/map-speaker`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          speakerLabel: 'Speaker 0'
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('mapping');
      expect(res.body.mapping.speaker_label).to.equal('Speaker 0');
      expect(res.body.mapping.participant_id).to.equal(testParticipantId);
    });

    it('should validate speaker label', async () => {
      if (!testMeetingId || !testParticipantId) return;

      const res = await request(BASE_URL)
        .put(`/api/hallway-meetings/${testMeetingId}/participants/${testParticipantId}/map-speaker`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).to.equal(400);
    });
  });

  describe('POST /api/hallway-meetings/:id/transcript', () => {
    it('should add transcript chunks', async () => {
      if (!testMeetingId) return;

      const res = await request(BASE_URL)
        .post(`/api/hallway-meetings/${testMeetingId}/transcript`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          chunks: [
            {
              speaker: 'Speaker 0',
              text: 'Hello everyone, lets discuss the new feature.',
              timestamp: new Date().toISOString(),
              confidence: 0.92
            },
            {
              speaker: 'Speaker 1',
              text: 'I think we should focus on user experience first.',
              timestamp: new Date().toISOString(),
              confidence: 0.88
            }
          ]
        });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('chunks');
      expect(res.body.chunks).to.be.an('array');
      expect(res.body.chunks.length).to.equal(2);
    });

    it('should update speaking_time_seconds', async () => {
      if (!testMeetingId) return;

      const dbRes = await pool.query(
        'SELECT speaking_time_seconds FROM hallway_meetings WHERE id = $1',
        [testMeetingId]
      );

      expect(dbRes.rows[0].speaking_time_seconds).to.be.greaterThan(0);
    });

    it('should validate chunks array', async () => {
      if (!testMeetingId) return;

      const res = await request(BASE_URL)
        .post(`/api/hallway-meetings/${testMeetingId}/transcript`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).to.equal(400);
    });
  });

  describe('GET /api/hallway-meetings/:id/transcript', () => {
    it('should get full transcript as JSON', async () => {
      if (!testMeetingId) return;

      const res = await request(BASE_URL)
        .get(`/api/hallway-meetings/${testMeetingId}/transcript?format=json`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('transcript');
      expect(res.body.transcript).to.be.an('array');
    });

    it('should get full transcript as text', async () => {
      if (!testMeetingId) return;

      const res = await request(BASE_URL)
        .get(`/api/hallway-meetings/${testMeetingId}/transcript?format=text`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('transcript');
      expect(typeof res.body.transcript).to.equal('string');
    });
  });

  describe('GET /api/hallway-meetings/:id/entities', () => {
    it('should return detected entities', async () => {
      if (!testMeetingId) return;

      await pool.query(
        `INSERT INTO hallway_entity_detections 
         (meeting_id, entity_type, entity_text, confidence, detected_at) 
         VALUES ($1, $2, $3, $4, NOW())`,
        [testMeetingId, 'decision', 'We will launch next week', 0.85]
      );

      const res = await request(BASE_URL)
        .get(`/api/hallway-meetings/${testMeetingId}/entities`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('entities');
      expect(res.body.entities).to.be.an('array');
      expect(res.body.entities.length).to.be.greaterThan(0);
    });

    it('should filter by entity_type', async () => {
      if (!testMeetingId) return;

      await pool.query(
        `INSERT INTO hallway_entity_detections 
         (meeting_id, entity_type, entity_text, confidence, detected_at) 
         VALUES ($1, $2, $3, $4, NOW())`,
        [testMeetingId, 'risk', 'Database migration concerns', 0.78]
      );

      const res = await request(BASE_URL)
        .get(`/api/hallway-meetings/${testMeetingId}/entities?type=risk`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.entities).to.be.an('array');
      expect(res.body.entities.every(e => e.entity_type === 'risk')).to.be.true;
    });
  });

  describe('POST /api/hallway-meetings/:id/entities/:entityId/dismiss', () => {
    it('should dismiss entity', async () => {
      if (!testMeetingId) return;

      const entityRes = await pool.query(
        `INSERT INTO hallway_entity_detections 
         (meeting_id, entity_type, entity_text, confidence, detected_at) 
         VALUES ($1, $2, $3, $4, NOW()) 
         RETURNING id`,
        [testMeetingId, 'task', 'Update documentation', 0.70]
      );

      const entityId = entityRes.rows[0].id;

      const res = await request(BASE_URL)
        .post(`/api/hallway-meetings/${testMeetingId}/entities/${entityId}/dismiss`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);

      const checkRes = await pool.query(
        'SELECT dismissed FROM hallway_entity_detections WHERE id = $1',
        [entityId]
      );

      expect(checkRes.rows[0].dismissed).to.be.true;
    });
  });

  describe('PUT /api/hallway-meetings/:id/end', () => {
    it('should end meeting and trigger analysis', async () => {
      if (!testMeetingId) return;

      const res = await request(BASE_URL)
        .put(`/api/hallway-meetings/${testMeetingId}/end`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('meeting');
      expect(res.body.meeting.status).to.equal('completed');
      expect(res.body.meeting.ended_at).to.not.be.null;
    });

    it('should calculate correct duration', async () => {
      if (!testMeetingId) return;

      const dbRes = await pool.query(
        'SELECT started_at, ended_at, duration_seconds FROM hallway_meetings WHERE id = $1',
        [testMeetingId]
      );

      const meeting = dbRes.rows[0];
      const calculatedDuration = Math.floor(
        (new Date(meeting.ended_at) - new Date(meeting.started_at)) / 1000
      );

      expect(meeting.duration_seconds).to.be.closeTo(calculatedDuration, 2);
    });

    it('should only allow organizer to end meeting', async () => {
      const newMeetingRes = await request(BASE_URL)
        .post('/api/hallway-meetings/start')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Another Test Meeting',
          activationMethod: 'manual'
        });

      const newMeetingId = newMeetingRes.body.meeting.id;

      const otherUserRes = await request(BASE_URL)
        .post('/api/auth/login')
        .send({
          email: 'other_hallway@example.com',
          password: 'testpass123'
        });

      const otherToken = otherUserRes.body.token;

      const res = await request(BASE_URL)
        .put(`/api/hallway-meetings/${newMeetingId}/end`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).to.equal(403);

      await pool.query('DELETE FROM hallway_meetings WHERE id = $1', [newMeetingId]);
    });
  });

  describe('GET /api/hallway-meetings/active', () => {
    it('should get all active meetings for user', async () => {
      const res = await request(BASE_URL)
        .get('/api/hallway-meetings/active')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('meetings');
      expect(res.body.meetings).to.be.an('array');
    });
  });

  describe('GET /api/hallway-meetings/project/:projectId', () => {
    it('should get meetings for project with pagination', async () => {
      if (!testProjectId) return;

      const res = await request(BASE_URL)
        .get(`/api/hallway-meetings/project/${testProjectId}?limit=10&offset=0`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('meetings');
      expect(res.body).to.have.property('total');
      expect(res.body.meetings).to.be.an('array');
    });
  });

  describe('Wake-Word Settings', () => {
    it('should get default settings for new user', async () => {
      const res = await request(BASE_URL)
        .get('/api/hallway-meetings/settings/wake-word')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('activationMode');
      expect(res.body.wakeWordSensitivity).to.be.a('number');
    });

    it('should save custom wake-words', async () => {
      const res = await request(BASE_URL)
        .put('/api/hallway-meetings/settings/wake-word')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          activationMode: 'wake_word',
          wakeWords: ['hey team', 'quick meeting', 'lets huddle'],
          sensitivity: 0.75,
          autoStartRecording: true
        });

      expect(res.status).to.equal(200);
      expect(res.body.settings.customWakeWords).to.deep.equal(['hey team', 'quick meeting', 'lets huddle']);
      expect(res.body.settings.wakeWordSensitivity).to.equal(0.75);
    });

    it('should validate wake_word_sensitivity range', async () => {
      const res = await request(BASE_URL)
        .put('/api/hallway-meetings/settings/wake-word')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sensitivity: 1.5
        });

      expect(res.status).to.equal(400);
      expect(res.body.error).to.include('wake_word_sensitivity');
    });

    it('should save scheduled hours settings', async () => {
      const res = await request(BASE_URL)
        .put('/api/hallway-meetings/settings/wake-word')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          activationMode: 'scheduled',
          scheduledTimes: {
            activeDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            startTime: '09:00',
            endTime: '17:00'
          }
        });

      expect(res.status).to.equal(200);
      expect(res.body.settings.scheduledConfig).to.have.property('activeDays');
      expect(res.body.settings.scheduledConfig.activeDays).to.include('monday');
    });
  });

  describe('POST /api/hallway-meetings/settings/wake-word/detect', () => {
    it('should log wake-word detection event', async () => {
      const res = await request(BASE_URL)
        .post('/api/hallway-meetings/settings/wake-word/detect')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          wakeWord: 'hey team',
          confidence: 0.88
        });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('detection');
      expect(res.body.detection.wakeWord).to.equal('hey team');
      expect(res.body.detection.confidence).to.equal(0.88);
    });
  });

  describe('GET /api/hallway-meetings/settings/wake-word/detections', () => {
    it('should get detection history', async () => {
      const res = await request(BASE_URL)
        .get('/api/hallway-meetings/settings/wake-word/detections')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('detections');
      expect(res.body.detections).to.be.an('array');
    });
  });

  describe('Hallway Meeting Service', () => {
    it('should start meeting and return ID', async () => {
      const result = await hallwayMeetingService.startMeeting(
        testUserId,
        testProjectId,
        {
          meetingTitle: 'Service Test Meeting',
          activationMode: 'manual'
        }
      );

      expect(result).to.have.property('id');
      expect(result.startedBy).to.equal(testUserId);
      expect(result.status).to.equal('recording');

      await pool.query('DELETE FROM hallway_meetings WHERE id = $1', [result.id]);
    });

    it('should generate full transcript', async () => {
      if (!testMeetingId) return;

      const transcript = await hallwayMeetingService.getFullTranscript(testMeetingId, 'text');

      expect(transcript).to.be.a('string');
      expect(transcript.length).to.be.greaterThan(0);
    });

    it('should get meeting statistics', async () => {
      if (!testMeetingId) return;

      const stats = await hallwayMeetingService.getMeetingStats(testMeetingId);

      expect(stats).to.have.property('totalChunks');
      expect(stats).to.have.property('speakerCount');
      expect(stats).to.have.property('entityCounts');
    });
  });

  describe('Hallway Analysis Service', () => {
    it('should analyze meeting and extract entities', async () => {
      if (!testMeetingId) return;

      const result = await hallwayAnalysisService.analyzeHallwayMeeting(
        testMeetingId,
        testUserId
      );

      expect(result).to.have.property('success');
    });

    it('should get meeting statistics', async () => {
      if (!testMeetingId) return;

      const stats = await hallwayAnalysisService.getMeetingStats(testMeetingId);

      expect(stats).to.have.property('totalEntities');
      expect(stats).to.have.property('decisions');
      expect(stats).to.have.property('risks');
      expect(stats).to.have.property('actionItems');
    });

    it('should calculate sentiment score', async () => {
      const sentiment = hallwayAnalysisService.calculateSentiment(
        'Great job everyone! This is looking fantastic.'
      );

      expect(sentiment).to.be.a('number');
      expect(sentiment).to.be.within(-1, 1);
    });

    it('should generate fallback summary', async () => {
      const summary = hallwayAnalysisService.generateFallbackSummary(
        'Test transcript for summary generation.',
        [],
        10
      );

      expect(summary).to.be.a('string');
      expect(summary.length).to.be.greaterThan(0);
    });
  });
});
