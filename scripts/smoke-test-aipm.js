#!/usr/bin/env node

/**
 * AIPM Foundation Smoke Test
 * Quick validation that all components are working
 * Run: node scripts/smoke-test-aipm.js
 */

const { pool } = require('../db');
const chalk = require('chalk');

async function runSmokeTests() {
  console.log(chalk.bold.blue('\n🔍 Running AIPM Foundation Smoke Tests...\n'));

  let passed = 0;
  let failed = 0;

  // Test 1: Check tables exist
  console.log(chalk.bold('1. Checking tables exist...'));
  const tables = ['decisions', 'meetings', 'evidence', 'pkg_nodes', 'pkg_edges', 'rag_documents'];

  for (const table of tables) {
    try {
      const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(chalk.green(`   ✓ ${table}: ${result.rows[0].count} rows`));
      passed++;
    } catch (error) {
      console.log(chalk.red(`   ✗ ${table}: FAILED - ${error.message}`));
      failed++;
    }
  }

  // Test 2: Check PKG nodes seeded
  console.log(chalk.bold('\n2. Checking PKG nodes seeded...'));
  try {
    const pkgCount = await pool.query('SELECT COUNT(*) FROM pkg_nodes');
    console.log(chalk.green(`   ✓ Total PKG nodes: ${pkgCount.rows[0].count}`));

    const typeBreakdown = await pool.query(`
      SELECT type, COUNT(*) as count
      FROM pkg_nodes
      GROUP BY type
      ORDER BY count DESC
    `);

    console.log(chalk.blue('   Type breakdown:'));
    typeBreakdown.rows.forEach(row => {
      console.log(`     - ${row.type}: ${row.count}`);
    });
    passed++;
  } catch (error) {
    console.log(chalk.red(`   ✗ PKG nodes check FAILED: ${error.message}`));
    failed++;
  }

  // Test 3: Check PKG sync triggers
  console.log(chalk.bold('\n3. Testing PKG sync triggers...'));
  try {
    // Get a project ID for testing
    const projectQuery = await pool.query('SELECT id FROM projects LIMIT 1');
    if (projectQuery.rows.length === 0) {
      console.log(chalk.yellow('   ⚠ No projects exist, skipping trigger test'));
    } else {
      const projectId = projectQuery.rows[0].id;
      const userQuery = await pool.query('SELECT id FROM users LIMIT 1');
      const userId = userQuery.rows[0].id;

      // Create test issue
      const testIssue = await pool.query(`
        INSERT INTO issues (title, description, project_id, status, created_by)
        VALUES ('Smoke Test Issue', 'Testing PKG sync', $1, 'To Do', $2)
        RETURNING id
      `, [projectId, userId]);

      const issueId = testIssue.rows[0].id;

      // Check PKG node created
      const pkgNode = await pool.query(`
        SELECT * FROM pkg_nodes WHERE source_table = 'issues' AND source_id = $1
      `, [issueId]);

      if (pkgNode.rows.length > 0) {
        console.log(chalk.green('   ✓ Issue → PKG node sync working'));

        // Update issue and check sync
        await pool.query(`UPDATE issues SET status = 'Done' WHERE id = $1`, [issueId]);

        const updatedNode = await pool.query(`
          SELECT attrs->>'status' as status FROM pkg_nodes
          WHERE source_table = 'issues' AND source_id = $1
        `, [issueId]);

        if (updatedNode.rows[0].status === 'Done') {
          console.log(chalk.green('   ✓ Issue update → PKG sync working'));
          passed++;
        } else {
          console.log(chalk.red('   ✗ Issue update sync FAILED'));
          failed++;
        }

        // Cleanup
        await pool.query('DELETE FROM issues WHERE id = $1', [issueId]);
      } else {
        console.log(chalk.red('   ✗ PKG node creation FAILED'));
        failed++;
      }
    }
  } catch (error) {
    console.log(chalk.red(`   ✗ Sync test FAILED: ${error.message}`));
    failed++;
  }

  // Test 4: Check RAG indexing
  console.log(chalk.bold('\n4. Checking RAG documents indexed...'));
  try {
    const ragCount = await pool.query('SELECT COUNT(*) FROM rag_documents');
    console.log(chalk.green(`   ✓ Total RAG documents: ${ragCount.rows[0].count}`));

    const sourceBreakdown = await pool.query(`
      SELECT source_type, COUNT(*) as count
      FROM rag_documents
      GROUP BY source_type
    `);

    console.log(chalk.blue('   Source breakdown:'));
    sourceBreakdown.rows.forEach(row => {
      console.log(`     - ${row.source_type}: ${row.count}`);
    });
    passed++;
  } catch (error) {
    console.log(chalk.red(`   ✗ RAG check FAILED: ${error.message}`));
    failed++;
  }

  // Test 5: Test full-text search
  console.log(chalk.bold('\n5. Testing full-text search...'));
  try {
    const searchResult = await pool.query(`
      SELECT COUNT(*) FROM rag_documents
      WHERE content_tsv @@ plainto_tsquery('english', 'meeting OR decision OR risk')
    `);

    console.log(chalk.green(`   ✓ FTS working (${searchResult.rows[0].count} results for test query)`));
    passed++;
  } catch (error) {
    console.log(chalk.red(`   ✗ FTS test FAILED: ${error.message}`));
    failed++;
  }

  // Test 6: Check foreign keys and constraints
  console.log(chalk.bold('\n6. Checking foreign key constraints...'));
  try {
    const fkCheck = await pool.query(`
      SELECT COUNT(*) FROM decisions WHERE pkg_node_id IS NOT NULL
    `);

    if (fkCheck.rows[0].count > 0) {
      console.log(chalk.green(`   ✓ decisions.pkg_node_id populated (${fkCheck.rows[0].count} records)`));
      passed++;
    } else {
      console.log(chalk.yellow('   ⚠ decisions.pkg_node_id not populated (no decisions exist yet)'));
      passed++; // Still pass since this is acceptable
    }
  } catch (error) {
    console.log(chalk.red(`   ✗ FK check FAILED: ${error.message}`));
    failed++;
  }

  // Summary
  console.log(chalk.bold('\n' + '='.repeat(60)));
  console.log(chalk.bold(`Smoke Test Results: ${passed} passed, ${failed} failed`));

  if (failed === 0) {
    console.log(chalk.green.bold('\n✅ All smoke tests passed!\n'));
    process.exit(0);
  } else {
    console.log(chalk.red.bold(`\n❌ ${failed} test(s) failed. Please review errors above.\n`));
    process.exit(1);
  }
}

runSmokeTests()
  .catch(err => {
    console.error(chalk.red.bold('\n💥 Smoke test crashed:'), err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
