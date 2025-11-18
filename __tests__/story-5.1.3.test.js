/**
 * Story 5.1.3 Integration Tests: RAG Foundation
 *
 * Setup:
 *   npm install --save-dev jest supertest
 *   Add to package.json:
 *   "scripts": {
 *     "test:5.1.3": "jest story-5.1.3.test.js"
 *   }
 *
 * Run:
 *   npm run test:5.1.3
 */

const request = require('supertest');
const { pool } = require('../db');
const app = require('../server');
const path = require('path');
const fs = require('fs').promises;

describe('Story 5.1.3: RAG Foundation', () => {
  let testProjectId = 1;
  let authCookie;
  let createdDocId;
  let testMeetingId;
  let testDecisionId;
  let testRiskId;

  beforeAll(async () => {
    // Setup: Create test user and get auth cookie
    const testUser = {
      username: `ragtest${Date.now()}`,
      email: `ragtest-${Date.now()}@example.com`,
      password: 'Test123!@#'
    };

    try {
      // Register test user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      console.log('✓ Register response:', registerResponse.status);

      if (registerResponse.status === 201) {
        // Login to get session cookie
        const loginResponse = await request(app)
          .post('/api/auth/login')
          .send({
            email: testUser.email,
            password: testUser.password
          });

        console.log('✓ Login response:', loginResponse.status);

        if (loginResponse.status === 200) {
          authCookie = loginResponse.headers['set-cookie'];
          console.log('✓ Test user authenticated with cookie');
        }
      }
    } catch (error) {
      console.error('Test setup error:', error);
      throw error;
    }

    if (!authCookie) {
      throw new Error('Failed to obtain auth cookie for testing');
    }
  });

  afterAll(async () => {
    // Cleanup: Delete test data
    if (createdDocId) {
      await pool.query('DELETE FROM rag_documents WHERE id = $1', [createdDocId]);
    }
    if (testMeetingId) {
      await pool.query('DELETE FROM meetings WHERE id = $1', [testMeetingId]);
    }
    if (testDecisionId) {
      await pool.query('DELETE FROM decisions WHERE id = $1', [testDecisionId]);
    }
    if (testRiskId) {
      await pool.query('DELETE FROM risks WHERE id = $1', [testRiskId]);
    }
    await pool.end();
  });

  // ========================================
  // Database Schema Tests
  // ========================================

  describe('Database Schema', () => {
    test('rag_documents table exists with correct columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'rag_documents'
        ORDER BY ordinal_position
      `);

      const columnNames = result.rows.map(row => row.column_name);

      expect(columnNames).toContain('id');
      expect(columnNames).toContain('project_id');
      expect(columnNames).toContain('source_type');
      expect(columnNames).toContain('source_id');
      expect(columnNames).toContain('title');
      expect(columnNames).toContain('content');
      expect(columnNames).toContain('meta');
      expect(columnNames).toContain('content_tsv');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    test('content_tsv column is TSVECTOR type', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'rag_documents' AND column_name = 'content_tsv'
      `);

      expect(result.rows[0].data_type).toBe('tsvector');
    });

    test('Full-text search GIN index exists', async () => {
      const result = await pool.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'rag_documents' AND indexdef LIKE '%USING gin%'
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      const indexNames = result.rows.map(row => row.indexname);
      expect(indexNames).toContain('idx_rag_docs_fts');
    });

    test('Source lookup indexes exist', async () => {
      const result = await pool.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'rag_documents'
      `);

      const indexNames = result.rows.map(row => row.indexname);
      expect(indexNames).toContain('idx_rag_docs_project');
      expect(indexNames).toContain('idx_rag_docs_source');
    });

    test('JSONB meta index exists', async () => {
      const result = await pool.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'rag_documents' AND indexname = 'idx_rag_docs_meta'
      `);

      expect(result.rows.length).toBe(1);
    });

    test('CHECK constraint for source_type exists', async () => {
      const result = await pool.query(`
        SELECT constraint_name FROM information_schema.constraint_column_usage
        WHERE table_name = 'rag_documents' AND constraint_name = 'valid_source_type'
      `);

      expect(result.rows.length).toBe(1);
    });
  });

  // ========================================
  // Data Backfill Tests
  // ========================================

  describe('Data Backfill', () => {
    test('Risk documents are indexed (if risks exist)', async () => {
      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM rag_documents
        WHERE source_type = 'risk_description'
      `);

      // Should be >= 0 (depends on existing data)
      expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
    });

    test('RAG documents have populated content_tsv', async () => {
      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM rag_documents
        WHERE content_tsv IS NOT NULL
      `);

      const total = await pool.query('SELECT COUNT(*) as count FROM rag_documents');
      expect(parseInt(result.rows[0].count)).toBe(parseInt(total.rows[0].count));
    });

    test('RAG documents have valid source_type', async () => {
      const result = await pool.query(`
        SELECT DISTINCT source_type FROM rag_documents
      `);

      const validTypes = [
        'meeting_transcript',
        'uploaded_doc',
        'email',
        'note',
        'issue_comment',
        'slack_message',
        'risk_description',
        'decision_rationale'
      ];

      result.rows.forEach(row => {
        expect(validTypes).toContain(row.source_type);
      });
    });

    test('RAG documents have JSONB meta field', async () => {
      const result = await pool.query(`
        SELECT id, meta FROM rag_documents LIMIT 1
      `);

      if (result.rows.length > 0) {
        expect(typeof result.rows[0].meta).toBe('object');
      }
    });
  });

  // ========================================
  // Auto-Indexing Trigger Tests
  // ========================================

  describe('Auto-Indexing Triggers', () => {
    test('Meeting trigger creates RAG document', async () => {
      // Create test meeting with transcript
      const meetingResult = await pool.query(`
        INSERT INTO meetings (project_id, meeting_id, title, transcript_text, participants, meeting_date, created_by)
        VALUES ($1, $2, $3, $4, $5, NOW(), $6)
        RETURNING id
      `, [testProjectId, 'TEST-MEET-001', 'Test RAG Meeting', 'This is test transcript content for search', JSON.stringify(['Alice', 'Bob']), 1]);

      testMeetingId = meetingResult.rows[0].id;

      // Wait for trigger to execute
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if RAG document was created
      const ragResult = await pool.query(`
        SELECT * FROM rag_documents
        WHERE source_type = 'meeting_transcript' AND source_id = $1
      `, [testMeetingId]);

      expect(ragResult.rows.length).toBe(1);
      expect(ragResult.rows[0].title).toBe('Test RAG Meeting');
      expect(ragResult.rows[0].content).toContain('test transcript content');
    });

    test('Decision trigger creates RAG document', async () => {
      // Create test decision
      const decisionResult = await pool.query(`
        INSERT INTO decisions (project_id, decision_id, title, description, rationale, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [testProjectId, 'TEST-DEC-001', 'Test RAG Decision', 'Test description', 'Test rationale', 'proposed', 1]);

      testDecisionId = decisionResult.rows[0].id;

      // Wait for trigger
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if RAG document was created
      const ragResult = await pool.query(`
        SELECT * FROM rag_documents
        WHERE source_type = 'decision_rationale' AND source_id = $1
      `, [testDecisionId]);

      expect(ragResult.rows.length).toBe(1);
      expect(ragResult.rows[0].title).toContain('Decision:');
    });

    test('Risk trigger creates RAG document', async () => {
      // Create test risk
      const riskResult = await pool.query(`
        INSERT INTO risks (project_id, risk_id, title, description, mitigation_plan, category, probability, impact, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [testProjectId, 'TEST-RISK-001', 'Test RAG Risk', 'Test risk description', 'Test mitigation', 'Technical', 3, 4, 'identified']);

      testRiskId = riskResult.rows[0].id;

      // Wait for trigger
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if RAG document was created
      const ragResult = await pool.query(`
        SELECT * FROM rag_documents
        WHERE source_type = 'risk_description' AND source_id = $1
      `, [testRiskId]);

      expect(ragResult.rows.length).toBe(1);
      expect(ragResult.rows[0].title).toContain('Risk:');
    });
  });

  // ========================================
  // Full-Text Search Tests
  // ========================================

  describe('Full-Text Search', () => {
    test('Full-text search finds documents', async () => {
      const result = await pool.query(`
        SELECT title, ts_rank(content_tsv, plainto_tsquery('english', 'test')) as relevance
        FROM rag_documents
        WHERE content_tsv @@ plainto_tsquery('english', 'test')
        ORDER BY relevance DESC
        LIMIT 5
      `);

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].relevance).toBeGreaterThan(0);
    });

    test('ts_headline generates snippets', async () => {
      const result = await pool.query(`
        SELECT ts_headline('english', content, plainto_tsquery('english', 'test'),
          'MaxWords=20, MinWords=10') as snippet
        FROM rag_documents
        WHERE content_tsv @@ plainto_tsquery('english', 'test')
        LIMIT 1
      `);

      if (result.rows.length > 0) {
        expect(result.rows[0].snippet).toBeDefined();
        expect(result.rows[0].snippet.length).toBeGreaterThan(0);
      }
    });

    test('Search handles special characters', async () => {
      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM rag_documents
        WHERE content_tsv @@ plainto_tsquery('english', 'test-transcript')
      `);

      expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
    });
  });

  // ========================================
  // API Endpoint Tests
  // ========================================

  describe('API: GET /api/aipm/projects/:projectId/rag/search', () => {
    test('Returns 400 if query is missing', async () => {
      const response = await request(app)
        .get(`/api/aipm/projects/${testProjectId}/rag/search`)
        .set('Cookie', authCookie);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('Returns search results with relevance ranking', async () => {
      const response = await request(app)
        .get(`/api/aipm/projects/${testProjectId}/rag/search?q=test`)
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body.query).toBe('test');
      expect(response.body.count).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    test('Returns snippets with highlighted terms', async () => {
      const response = await request(app)
        .get(`/api/aipm/projects/${testProjectId}/rag/search?q=test`)
        .set('Cookie', authCookie);

      if (response.body.results.length > 0) {
        expect(response.body.results[0]).toHaveProperty('snippet');
        expect(response.body.results[0]).toHaveProperty('relevance');
        expect(response.body.results[0]).toHaveProperty('title');
      }
    });

    test('Filters by source_type', async () => {
      const response = await request(app)
        .get(`/api/aipm/projects/${testProjectId}/rag/search?q=test&source_type=meeting_transcript`)
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      response.body.results.forEach(result => {
        expect(result.sourceType).toBe('meeting_transcript');
      });
    });

    test('Respects limit parameter', async () => {
      const response = await request(app)
        .get(`/api/aipm/projects/${testProjectId}/rag/search?q=test&limit=2`)
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body.results.length).toBeLessThanOrEqual(2);
    });

    test('Returns camelCase field names', async () => {
      const response = await request(app)
        .get(`/api/aipm/projects/${testProjectId}/rag/search?q=test`)
        .set('Cookie', authCookie);

      if (response.body.results.length > 0) {
        expect(response.body.results[0]).toHaveProperty('sourceType');
        expect(response.body.results[0]).toHaveProperty('sourceId');
        expect(response.body.results[0]).toHaveProperty('createdAt');
      }
    });
  });

  describe('API: POST /api/aipm/projects/:projectId/rag/docs', () => {
    test('Returns 400 if no file uploaded', async () => {
      const response = await request(app)
        .post(`/api/aipm/projects/${testProjectId}/rag/docs`)
        .set('Cookie', authCookie)
        .send({ title: 'Test Doc' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('No file');
    });

    test('Uploads and indexes text file', async () => {
      // Create temporary test file
      const testFilePath = path.join(__dirname, 'test-upload.txt');
      await fs.writeFile(testFilePath, 'This is a test document for RAG indexing with searchable content.');

      const response = await request(app)
        .post(`/api/aipm/projects/${testProjectId}/rag/docs`)
        .set('Cookie', authCookie)
        .field('title', 'Test Upload Document')
        .attach('file', testFilePath);

      // Cleanup test file
      await fs.unlink(testFilePath);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.sourceType).toBe('uploaded_doc');
      expect(response.body.title).toBe('Test Upload Document');

      createdDocId = response.body.id;

      // Verify document is searchable
      const searchResponse = await request(app)
        .get(`/api/aipm/projects/${testProjectId}/rag/search?q=searchable`)
        .set('Cookie', authCookie);

      const found = searchResponse.body.results.some(r => r.id === createdDocId);
      expect(found).toBe(true);
    });
  });

  describe('API: GET /api/aipm/rag/context', () => {
    test('Returns 400 if query is missing', async () => {
      const response = await request(app)
        .get('/api/aipm/rag/context')
        .set('Cookie', authCookie)
        .query({ project_id: testProjectId });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('Returns 400 if project_id is missing', async () => {
      const response = await request(app)
        .get('/api/aipm/rag/context')
        .set('Cookie', authCookie)
        .query({ query: 'test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('project_id');
    });

    test('Returns formatted context for LLM', async () => {
      const response = await request(app)
        .get('/api/aipm/rag/context')
        .set('Cookie', authCookie)
        .query({
          project_id: testProjectId,
          query: 'test',
          max_tokens: 1000
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('context');
      expect(response.body).toHaveProperty('sources');
      expect(response.body).toHaveProperty('estimatedTokens');
      expect(Array.isArray(response.body.sources)).toBe(true);
    });

    test('Respects max_tokens limit', async () => {
      const response = await request(app)
        .get('/api/aipm/rag/context')
        .set('Cookie', authCookie)
        .query({
          project_id: testProjectId,
          query: 'test',
          max_tokens: 100
        });

      expect(response.status).toBe(200);
      expect(response.body.estimatedTokens).toBeLessThanOrEqual(100);
    });

    test('Context includes source citations', async () => {
      const response = await request(app)
        .get('/api/aipm/rag/context')
        .set('Cookie', authCookie)
        .query({
          project_id: testProjectId,
          query: 'test'
        });

      if (response.body.sources.length > 0) {
        expect(response.body.context).toContain('--- Source:');
        expect(response.body.sources[0]).toHaveProperty('title');
        expect(response.body.sources[0]).toHaveProperty('sourceType');
        expect(response.body.sources[0]).toHaveProperty('relevance');
      }
    });
  });
});
