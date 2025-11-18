/**
 * Story 5.1.4: PKG Performance Tests
 * 
 * Validates query performance at scale for:
 * - PKG node queries
 * - Complex graph joins
 * - RAG full-text search
 */

const { pool } = require('../../db');
const { performance } = require('perf_hooks');

describe('PKG Performance Tests', () => {
  test('Query PKG nodes should complete in <500ms', async () => {
    const nodeCount = await pool.query('SELECT COUNT(*) FROM pkg_nodes');
    console.log(`Current node count: ${nodeCount.rows[0].count}`);

    // Measure query performance
    const start = performance.now();

    await pool.query(`
      SELECT * FROM pkg_nodes
      WHERE project_id IN (SELECT id FROM projects LIMIT 10)
      ORDER BY created_at DESC
      LIMIT 100
    `);

    const duration = performance.now() - start;

    console.log(`Query duration: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(500);
  });

  test('Complex PKG graph query should complete in <1s', async () => {
    const start = performance.now();

    // Get all nodes with edges (JOIN query)
    await pool.query(`
      SELECT n.*, array_agg(e.type) as edge_types
      FROM pkg_nodes n
      LEFT JOIN pkg_edges e ON (e.from_node_id = n.id OR e.to_node_id = n.id)
      WHERE n.project_id IN (SELECT id FROM projects LIMIT 5)
      GROUP BY n.id
      LIMIT 50
    `);

    const duration = performance.now() - start;

    console.log(`Complex query duration: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(1000);
  });

  test('RAG search on documents should complete in <300ms', async () => {
    const docCount = await pool.query('SELECT COUNT(*) FROM rag_documents');
    console.log(`Current RAG document count: ${docCount.rows[0].count}`);

    const start = performance.now();

    await pool.query(`
      SELECT
        id, title,
        ts_rank(content_tsv, plainto_tsquery('english', $1)) as relevance
      FROM rag_documents
      WHERE content_tsv @@ plainto_tsquery('english', $1)
      ORDER BY relevance DESC
      LIMIT 20
    `, ['migration deployment rollback']);

    const duration = performance.now() - start;

    console.log(`RAG search duration: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(300);
  });

  test('PKG type filtering should be indexed and fast', async () => {
    const start = performance.now();

    await pool.query(`
      SELECT * FROM pkg_nodes
      WHERE type = 'Task'
      LIMIT 100
    `);

    const duration = performance.now() - start;

    console.log(`Type filter query duration: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(100); // Should be very fast with index
  });

  test('JSONB attribute query should complete in <200ms', async () => {
    const start = performance.now();

    await pool.query(`
      SELECT * FROM pkg_nodes
      WHERE attrs->>'status' = 'Done'
      LIMIT 50
    `);

    const duration = performance.now() - start;

    console.log(`JSONB query duration: ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(200);
  });
});
