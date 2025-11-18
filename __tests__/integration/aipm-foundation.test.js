/**
 * Story 5.1.4: AIPM Foundation - Integration Tests
 * 
 * End-to-end tests validating:
 * - Decision → PKG Node → RAG document flow
 * - Meeting → Evidence → PKG edges
 * - Issue Hierarchy → PKG edges
 * - PKG API endpoints
 * - RAG search functionality
 */

const request = require('supertest');
const app = require('../../server');
const { pool } = require('../../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

describe('AIPM Foundation - Integration Tests', () => {
  let testProjectId;
  let testUserId;
  let authCookie;

  beforeAll(async () => {
    // Create test user
    const userResult = await pool.query(`
      INSERT INTO users (username, email, password_hash, role)
      VALUES ('aipm-test-user', 'aipm-test@example.com', 'hashed_password', 'Developer')
      ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username
      RETURNING id
    `);
    testUserId = userResult.rows[0].id;

    // Generate auth token
    const token = jwt.sign(
      { id: testUserId, username: 'aipm-test-user', email: 'aipm-test@example.com', role: 'Developer' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    authCookie = `token=${token}`;

    // Create test project
    const projectResult = await pool.query(`
      INSERT INTO projects (name, description, created_by)
      VALUES ('AIPM Test Project', 'Integration test project', $1)
      RETURNING id
    `, [testUserId]);
    testProjectId = projectResult.rows[0].id;

    // Add user as project member
    await pool.query(`
      INSERT INTO project_members (project_id, user_id, role, status)
      VALUES ($1, $2, 'Project Manager', 'active')
      ON CONFLICT (project_id, user_id) DO NOTHING
    `, [testProjectId, testUserId]);

    console.log('✓ Test setup complete');
    console.log(`  Project ID: ${testProjectId}, User ID: ${testUserId}`);
  });

  afterAll(async () => {
    // Cleanup test data (cascading deletes will handle related records)
    await pool.query('DELETE FROM projects WHERE id = $1', [testProjectId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  // ============= Test Suite 1: Decision → PKG → RAG Flow =============
  describe('Decision → PKG → RAG Flow', () => {
    let decisionId;
    let pkgNodeId;

    test('Creating decision auto-creates PKG node', async () => {
      // 1. Create decision via API
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/decisions`)
        .set('Cookie', authCookie)
        .send({
          title: 'Adopt microservices architecture',
          description: 'Migrate from monolith to microservices for better scalability',
          decisionType: 'architectural',
          impactLevel: 'high',
          rationale: 'Current monolith limits team autonomy and deployment speed',
          alternativesConsidered: [
            { option: 'Modular monolith', pros: 'Simpler', cons: 'Still coupled' },
            { option: 'Serverless', pros: 'Auto-scaling', cons: 'Vendor lock-in' }
          ]
        })
        .expect(201);

      decisionId = response.body.id;
      expect(response.body.decisionId).toMatch(/^DEC-\d{5}$/);

      // 2. Verify PKG node auto-created
      const pkgNodes = await pool.query(`
        SELECT * FROM pkg_nodes
        WHERE source_table = 'decisions' AND source_id = $1
      `, [decisionId]);

      expect(pkgNodes.rows).toHaveLength(1);
      pkgNodeId = pkgNodes.rows[0].id;

      expect(pkgNodes.rows[0].type).toBe('Decision');
      expect(pkgNodes.rows[0].attrs.title).toBe('Adopt microservices architecture');
      expect(pkgNodes.rows[0].attrs.impact_level).toBe('high');

      // 3. Verify decision has pkg_node_id backfilled
      const decision = await pool.query(
        'SELECT pkg_node_id FROM decisions WHERE id = $1',
        [decisionId]
      );
      expect(decision.rows[0].pkg_node_id).toBe(pkgNodeId);
    });

    test('Updating decision syncs to PKG node', async () => {
      // Update decision status
      await request(app)
        .patch(`/api/decisions/${decisionId}`)
        .set('Cookie', authCookie)
        .send({ status: 'approved' })
        .expect(200);

      // Verify PKG node updated
      const pkgNode = await pool.query(
        'SELECT attrs FROM pkg_nodes WHERE id = $1',
        [pkgNodeId]
      );
      expect(pkgNode.rows[0].attrs.status).toBe('approved');
    });

    test('Decision indexed in RAG', async () => {
      // Check if decision rationale indexed in RAG
      const ragDocs = await pool.query(`
        SELECT * FROM rag_documents
        WHERE source_type = 'decision_rationale' AND source_id = $1
      `, [decisionId]);

      expect(ragDocs.rows.length).toBeGreaterThan(0);
      expect(ragDocs.rows[0].content).toContain('microservices');
    });

    test('Can search for decision via RAG', async () => {
      const response = await request(app)
        .get(`/api/aipm/projects/${testProjectId}/rag/search`)
        .set('Cookie', authCookie)
        .query({ q: 'microservices scalability' })
        .expect(200);

      expect(response.body.results.length).toBeGreaterThan(0);
      const foundDecision = response.body.results.find(
        r => r.sourceType === 'decision_rationale' && r.sourceId === decisionId
      );
      expect(foundDecision).toBeDefined();
    });
  });

  // ============= Test Suite 2: Meeting → Evidence → PKG Edges =============
  describe('Meeting → Evidence → PKG Edges Flow', () => {
    let meetingId;
    let actionItemId;
    let evidenceId;

    test('Creating meeting with transcript creates RAG document', async () => {
      // 1. Create meeting
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/meetings`)
        .set('Cookie', authCookie)
        .send({
          title: 'Sprint Planning - Week 45',
          meetingDate: '2025-11-20T10:00:00Z',
          durationMinutes: 60,
          participants: JSON.stringify(['alice', 'bob', 'charlie']),
          transcriptText: `
            Alice: We discussed the API migration plan.
            Bob: We need to complete the database migration by next Friday.
            Charlie: I'll create an action item to document the rollback procedure.
          `
        })
        .expect(201);

      meetingId = response.body.id;
      expect(response.body.meetingId).toMatch(/^MTG-\d{5}$/);

      // 2. Verify RAG document auto-created via trigger
      const ragDocs = await pool.query(`
        SELECT * FROM rag_documents
        WHERE source_type = 'meeting_transcript' AND source_id = $1
      `, [meetingId]);

      expect(ragDocs.rows).toHaveLength(1);
      expect(ragDocs.rows[0].content).toContain('database migration');

      // 3. Verify PKG node created for meeting
      const pkgNode = await pool.query(`
        SELECT * FROM pkg_nodes
        WHERE source_table = 'meetings' AND source_id = $1
      `, [meetingId]);

      expect(pkgNode.rows).toHaveLength(1);
      expect(pkgNode.rows[0].type).toBe('Meeting');
    });

    test('Creating evidence links meeting to action item via PKG edge', async () => {
      // 1. First create an action item
      const actionResponse = await request(app)
        .post(`/api/projects/${testProjectId}/action-items`)
        .set('Cookie', authCookie)
        .send({
          title: 'Document rollback procedure',
          description: 'Create rollback documentation for database migration',
          priority: 'high',
          assignee_id: testUserId,
          source_meeting_id: meetingId
        })
        .expect(201);

      actionItemId = actionResponse.body.id;

      // 2. Create evidence linking meeting quote → action item
      const evidenceResponse = await request(app)
        .post(`/api/evidence`)
        .set('Cookie', authCookie)
        .send({
          entityType: 'action-item',
          entityId: actionItemId,
          evidenceType: 'transcript_quote',
          sourceType: 'meeting',
          sourceId: meetingId,
          quoteText: "I'll create an action item to document the rollback procedure.",
          confidence: 'high'
        })
        .expect(201);

      evidenceId = evidenceResponse.body.id;

      // 3. Verify PKG edge created (evidence_of: Meeting → ActionItem)
      const meetingPkgNode = await pool.query(
        'SELECT id FROM pkg_nodes WHERE source_table = $1 AND source_id = $2',
        ['meetings', meetingId]
      );

      const actionPkgNode = await pool.query(
        'SELECT id FROM pkg_nodes WHERE source_table = $1 AND source_id = $2',
        ['action_items', actionItemId]
      );

      const pkgEdge = await pool.query(`
        SELECT * FROM pkg_edges
        WHERE type = 'evidence_of'
          AND from_node_id = $1
          AND to_node_id = $2
      `, [meetingPkgNode.rows[0].id, actionPkgNode.rows[0].id]);

      expect(pkgEdge.rows.length).toBeGreaterThan(0);
      expect(pkgEdge.rows[0].evidence_quote).toContain('rollback procedure');

      // 4. Verify evidence has pkg_edge_id backfilled
      const evidence = await pool.query(
        'SELECT pkg_edge_id FROM evidence WHERE id = $1',
        [evidenceId]
      );
      expect(evidence.rows[0].pkg_edge_id).toBeDefined();
    });
  });

  // ============= Test Suite 3: Issue Hierarchy → PKG Edges =============
  describe('Issue Hierarchy → PKG Edges', () => {
    let parentIssueId;
    let childIssueId;

    test('Parent-child issue relationship creates PKG edge', async () => {
      // 1. Create parent issue
      const parentResponse = await request(app)
        .post(`/api/projects/${testProjectId}/issues`)
        .set('Cookie', authCookie)
        .send({
          title: 'Epic: API Refactoring',
          description: 'Modernize API infrastructure',
          is_epic: true
        })
        .expect(201);

      parentIssueId = parentResponse.body.id;

      // 2. Create child issue
      const childResponse = await request(app)
        .post(`/api/projects/${testProjectId}/issues`)
        .set('Cookie', authCookie)
        .send({
          title: 'Migrate authentication service',
          description: 'Move auth to separate microservice',
          parent_issue_id: parentIssueId
        })
        .expect(201);

      childIssueId = childResponse.body.id;

      // 3. Verify PKG nodes created
      const parentPkg = await pool.query(
        'SELECT id FROM pkg_nodes WHERE source_table = $1 AND source_id = $2',
        ['issues', parentIssueId]
      );

      const childPkg = await pool.query(
        'SELECT id FROM pkg_nodes WHERE source_table = $1 AND source_id = $2',
        ['issues', childIssueId]
      );

      // 4. Verify parent_of edge created
      const edge = await pool.query(`
        SELECT * FROM pkg_edges
        WHERE type = 'parent_of'
          AND from_node_id = $1
          AND to_node_id = $2
      `, [parentPkg.rows[0].id, childPkg.rows[0].id]);

      expect(edge.rows).toHaveLength(1);
    });
  });

  // ============= Test Suite 4: PKG API Tests =============
  describe('PKG API Endpoints', () => {
    test('GET /api/aipm/projects/:id/pkg returns nodes and edges', async () => {
      const response = await request(app)
        .get(`/api/aipm/projects/${testProjectId}/pkg`)
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.nodes).toBeDefined();
      expect(response.body.edges).toBeDefined();
      expect(response.body.nodes.length).toBeGreaterThan(0);

      // Verify has different types
      const types = new Set(response.body.nodes.map(n => n.type));
      expect(types.has('Task') || types.has('Decision') || types.has('Meeting')).toBe(true);
    });

    test('GET /api/aipm/pkg/query filters by type', async () => {
      // First ensure we have a decision to query
      await request(app)
        .post(`/api/projects/${testProjectId}/decisions`)
        .set('Cookie', authCookie)
        .send({
          title: 'Test Decision for Query',
          decisionType: 'technical',
          impactLevel: 'medium'
        });

      const response = await request(app)
        .get('/api/aipm/pkg/query')
        .set('Cookie', authCookie)
        .query({ project_id: testProjectId, type: 'Decision' })
        .expect(200);

      expect(response.body.nodes).toBeDefined();
      response.body.nodes.forEach(node => {
        expect(node.type).toBe('Decision');
      });
    });

    test('GET /api/aipm/pkg/query filters by JSONB attrs', async () => {
      const response = await request(app)
        .get('/api/aipm/pkg/query')
        .set('Cookie', authCookie)
        .query({
          project_id: testProjectId,
          type: 'Decision',
          attr_filter: JSON.stringify({ impact_level: 'high' })
        })
        .expect(200);

      response.body.nodes.forEach(node => {
        expect(node.attrs.impact_level).toBe('high');
      });
    });
  });

  // ============= Test Suite 5: RAG Search Tests =============
  describe('RAG Search', () => {
    test('Search returns relevant results with snippets', async () => {
      const response = await request(app)
        .get(`/api/aipm/projects/${testProjectId}/rag/search`)
        .set('Cookie', authCookie)
        .query({ q: 'database migration rollback' })
        .expect(200);

      expect(response.body.results.length).toBeGreaterThan(0);

      const firstResult = response.body.results[0];
      expect(firstResult).toHaveProperty('snippet');
      expect(firstResult).toHaveProperty('relevance');
      expect(firstResult.snippet).toContain('<b>'); // Highlighted terms
    });

    test('Search can filter by source_type', async () => {
      const response = await request(app)
        .get(`/api/aipm/projects/${testProjectId}/rag/search`)
        .set('Cookie', authCookie)
        .query({ q: 'migration', source_type: 'meeting_transcript' })
        .expect(200);

      response.body.results.forEach(result => {
        expect(result.sourceType).toBe('meeting_transcript');
      });
    });

    test('Search handles empty results gracefully', async () => {
      const response = await request(app)
        .get(`/api/aipm/projects/${testProjectId}/rag/search`)
        .set('Cookie', authCookie)
        .query({ q: 'xyznonexistentquery9999' })
        .expect(200);

      expect(response.body.results).toEqual([]);
      expect(response.body.count).toBe(0);
    });
  });
});
