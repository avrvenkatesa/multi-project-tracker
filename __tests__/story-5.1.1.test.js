/**
 * Story 5.1.1 Integration Tests
 *
 * Setup:
 *   npm install --save-dev jest supertest
 *   Add to package.json:
 *   "scripts": {
 *     "test:5.1.1": "jest story-5.1.1.test.js"
 *   }
 *
 * Run:
 *   npm run test:5.1.1
 */

const request = require('supertest');
const { pool } = require('../db');

// Import your app (adjust path as needed)
const app = require('../server');

describe('Story 5.1.1: AIPM Foundation Tables', () => {
  let testProjectId = 1;
  let authToken;
  let createdDecisionId;
  let createdMeetingId;
  let createdEvidenceId;

  beforeAll(async () => {
    // Setup: Create test user and get auth token
    const testUser = {
      username: `testuser${Date.now()}`,
      email: `test-${Date.now()}@example.com`,
      password: 'Test123!@#'
    };

    try {
      // Register test user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      console.log('Register response:', registerResponse.status, registerResponse.body);

      if (registerResponse.status === 201) {
        // Login to get token
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password
          });

        console.log('Login response:', loginResponse.status, loginResponse.body);
        console.log('Login headers:', loginResponse.headers['set-cookie']);

        // Extract token from cookie
        if (loginResponse.status === 200) {
          const cookies = loginResponse.headers['set-cookie'];
          if (cookies) {
            const tokenCookie = cookies.find(c => c.startsWith('token='));
            if (tokenCookie) {
              authToken = tokenCookie.split(';')[0].split('=')[1];
            }
          }
        }
      } else {
        console.error('Registration failed:', registerResponse.status, registerResponse.body);
      }
    } catch (error) {
      console.error('Test setup error:', error);
      throw error;
    }

    // Verify we have an auth token
    if (!authToken) {
      throw new Error('Failed to obtain auth token for testing');
    }
  });

  afterAll(async () => {
    // Cleanup: Delete test data
    if (createdDecisionId) {
      await pool.query('DELETE FROM decisions WHERE id = $1', [createdDecisionId]);
    }
    if (createdMeetingId) {
      await pool.query('DELETE FROM meetings WHERE id = $1', [createdMeetingId]);
    }
    await pool.end();
  });

  // ========================================
  // Database Schema Tests
  // ========================================

  describe('Database Schema', () => {
    test('decisions table exists with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'decisions'
        ORDER BY ordinal_position
      `);

      const columnNames = result.rows.map(row => row.column_name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('decision_id');
      expect(columnNames).toContain('project_id');
      expect(columnNames).toContain('title');
      expect(columnNames).toContain('decision_type');
      expect(columnNames).toContain('impact_level');
      expect(columnNames).toContain('pkg_node_id');
      expect(columnNames).toContain('created_by_ai');
    });

    test('meetings table exists with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'meetings'
      `);

      const columnNames = result.rows.map(row => row.column_name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('meeting_id');
      expect(columnNames).toContain('transcript_text');
      expect(columnNames).toContain('participants');
      expect(columnNames).toContain('pkg_node_id');
    });

    test('evidence table exists with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'evidence'
      `);

      const columnNames = result.rows.map(row => row.column_name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('entity_type');
      expect(columnNames).toContain('entity_id');
      expect(columnNames).toContain('source_type');
      expect(columnNames).toContain('quote_text');
      expect(columnNames).toContain('pkg_edge_id');
    });

    test('foreign key columns added to existing tables', async () => {
      const result = await pool.query(`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_name IN ('action_items', 'risks', 'issues')
          AND column_name IN ('source_meeting_id', 'source_decision_id', 'related_decision_ids')
        ORDER BY table_name, column_name
      `);

      expect(result.rows.length).toBeGreaterThanOrEqual(4);
    });

    test('helper functions exist', async () => {
      const result = await pool.query(`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
          AND routine_name IN ('generate_decision_id', 'generate_meeting_id')
      `);

      expect(result.rows.length).toBeGreaterThanOrEqual(2);
    });

    test('indexes created on new tables', async () => {
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('decisions', 'meetings', 'evidence')
      `);

      expect(result.rows.length).toBeGreaterThan(10);
    });
  });

  // ========================================
  // Decisions API Tests
  // ========================================

  describe('Decisions API', () => {
    test('POST /api/decisions creates decision with auto-ID', async () => {
      const response = await request(app)
        .post('/api/decisions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          project_id: testProjectId,
          title: 'Test Decision - Jest',
          description: 'Automated test decision',
          decision_type: 'technical',
          impact_level: 'medium',
          status: 'proposed',
          rationale: 'Testing decision creation',
          alternatives_considered: [
            { option: 'Option A', pros: 'Simple', cons: 'Limited' },
            { option: 'Option B', pros: 'Robust', cons: 'Complex' }
          ]
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('decision_id');
      expect(response.body.decision_id).toMatch(/^DEC-\d{5}$/);
      expect(response.body.title).toBe('Test Decision - Jest');

      createdDecisionId = response.body.id;
    });

    test('GET /api/decisions/:id retrieves decision', async () => {
      const response = await request(app)
        .get(`/api/decisions/${createdDecisionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(createdDecisionId);
      expect(response.body.title).toBe('Test Decision - Jest');
      expect(response.body.alternatives_considered).toHaveLength(2);
    });

    test('PATCH /api/decisions/:id updates decision', async () => {
      const response = await request(app)
        .patch(`/api/decisions/${createdDecisionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'approved',
          decided_date: '2025-11-18T10:00:00Z'
        })
        .expect(200);

      expect(response.body.status).toBe('approved');
      expect(response.body.decided_date).toBeDefined();
    });

    test('PATCH updates updated_date via trigger', async () => {
      // Get initial updated_date
      const initial = await pool.query(
        'SELECT updated_date FROM decisions WHERE id = $1',
        [createdDecisionId]
      );
      const initialDate = initial.rows[0].updated_date;

      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update decision
      await request(app)
        .patch(`/api/decisions/${createdDecisionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ rationale: 'Updated rationale' })
        .expect(200);

      // Get new updated_date
      const updated = await pool.query(
        'SELECT updated_date FROM decisions WHERE id = $1',
        [createdDecisionId]
      );
      const updatedDate = updated.rows[0].updated_date;

      expect(new Date(updatedDate)).not.toEqual(new Date(initialDate));
    });

    test('GET /api/projects/:id/decisions lists decisions', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/decisions`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('decisions');
      expect(Array.isArray(response.body.decisions)).toBe(true);
      expect(response.body.decisions.length).toBeGreaterThan(0);
    });

    test('GET /api/projects/:id/decisions?status=approved filters by status', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/decisions?status=approved`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.decisions.every(d => d.status === 'approved')).toBe(true);
    });
  });

  // ========================================
  // Meetings API Tests
  // ========================================

  describe('Meetings API', () => {
    test('POST /api/meetings creates meeting with auto-ID', async () => {
      const response = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          project_id: testProjectId,
          title: 'Test Meeting - Jest',
          meeting_date: '2025-11-18T14:00:00Z',
          duration_minutes: 60,
          participants: ['user1@test.com', 'user2@test.com'],
          transcript_text: 'This is a test meeting transcript for automated testing.'
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('meeting_id');
      expect(response.body.meeting_id).toMatch(/^MTG-\d{5}$/);
      expect(response.body.participants).toHaveLength(2);

      createdMeetingId = response.body.id;
    });

    test('GET /api/meetings/:id retrieves meeting', async () => {
      const response = await request(app)
        .get(`/api/meetings/${createdMeetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(createdMeetingId);
      expect(response.body.title).toBe('Test Meeting - Jest');
      expect(response.body.transcript_text).toContain('automated testing');
    });

    test('PATCH /api/meetings/:id updates meeting', async () => {
      const response = await request(app)
        .patch(`/api/meetings/${createdMeetingId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          summary: 'AI-generated summary of the test meeting'
        })
        .expect(200);

      expect(response.body.summary).toBe('AI-generated summary of the test meeting');
    });
  });

  // ========================================
  // Evidence API Tests
  // ========================================

  describe('Evidence API', () => {
    test('POST /api/evidence creates evidence link', async () => {
      const response = await request(app)
        .post('/api/evidence')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          entity_type: 'decision',
          entity_id: createdDecisionId,
          evidence_type: 'transcript_quote',
          source_type: 'meeting',
          source_id: createdMeetingId,
          quote_text: 'The team agreed on this approach during the meeting.',
          confidence: 'high',
          extraction_method: 'manual'
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.entity_type).toBe('decision');
      expect(response.body.entity_id).toBe(createdDecisionId);

      createdEvidenceId = response.body.id;
    });

    test('GET /api/decisions/:id/evidence retrieves evidence', async () => {
      const response = await request(app)
        .get(`/api/decisions/${createdDecisionId}/evidence`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('evidence');
      expect(Array.isArray(response.body.evidence)).toBe(true);
      expect(response.body.evidence.length).toBeGreaterThan(0);

      const firstEvidence = response.body.evidence[0];
      expect(firstEvidence.quote_text).toContain('agreed on this approach');
    });

    test('POST /api/evidence rejects invalid entity_id', async () => {
      const response = await request(app)
        .post('/api/evidence')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          entity_type: 'decision',
          entity_id: 999999,
          source_type: 'meeting',
          source_id: createdMeetingId,
          quote_text: 'Should fail',
          confidence: 'high'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  // ========================================
  // Integration Tests
  // ========================================

  describe('Integration with Existing Features', () => {
    test('Can create action_item with source_meeting_id', async () => {
      const response = await request(app)
        .post('/api/action-items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          project_id: testProjectId,
          title: 'Test Action from Meeting',
          description: 'Action item linked to meeting',
          priority: 'medium',
          status: 'To Do',
          source_meeting_id: createdMeetingId,
          source_decision_id: createdDecisionId
        })
        .expect(201);

      expect(response.body.source_meeting_id).toBe(createdMeetingId);
      expect(response.body.source_decision_id).toBe(createdDecisionId);

      // Cleanup
      await pool.query('DELETE FROM action_items WHERE id = $1', [response.body.id]);
    });

    test('Can link risk to meeting', async () => {
      const riskResponse = await request(app)
        .post('/api/projects/1/risks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Risk from Meeting',
          category: 'technical',
          probability: 3,
          impact: 4,
          source_meeting_id: createdMeetingId
        })
        .expect(201);

      expect(riskResponse.body.source_meeting_id).toBe(createdMeetingId);

      // Cleanup
      await pool.query('DELETE FROM risks WHERE id = $1', [riskResponse.body.id]);
    });
  });

  // ========================================
  // Data Integrity Tests
  // ========================================

  describe('Data Integrity', () => {
    test('Auto-ID generation is sequential per project', async () => {
      const decision1 = await request(app)
        .post('/api/decisions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          project_id: testProjectId,
          title: 'Seq Test 1',
          decision_type: 'technical',
          impact_level: 'low'
        })
        .expect(201);

      const decision2 = await request(app)
        .post('/api/decisions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          project_id: testProjectId,
          title: 'Seq Test 2',
          decision_type: 'technical',
          impact_level: 'low'
        })
        .expect(201);

      const id1Num = parseInt(decision1.body.decision_id.replace('DEC-', ''));
      const id2Num = parseInt(decision2.body.decision_id.replace('DEC-', ''));

      expect(id2Num).toBe(id1Num + 1);

      // Cleanup
      await pool.query('DELETE FROM decisions WHERE id IN ($1, $2)',
        [decision1.body.id, decision2.body.id]);
    });

    test('JSONB columns store complex data correctly', async () => {
      const dbResult = await pool.query(`
        SELECT alternatives_considered
        FROM decisions
        WHERE id = $1
      `, [createdDecisionId]);

      expect(dbResult.rows[0].alternatives_considered).toBeDefined();
      expect(Array.isArray(dbResult.rows[0].alternatives_considered)).toBe(true);
      expect(dbResult.rows[0].alternatives_considered[0]).toHaveProperty('option');
    });

    test('Enum constraints enforced', async () => {
      const response = await request(app)
        .post('/api/decisions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          project_id: testProjectId,
          title: 'Invalid Decision Type',
          decision_type: 'invalid_type',
          impact_level: 'low'
        });

      // Should fail validation (400) or constraint (500)
      expect([400, 500]).toContain(response.status);
    });
  });
});
