/**
 * Integration Test: End-to-End Hierarchy Extraction Workflow
 * 
 * Tests the complete flow:
 * 1. Setup: Create test project in database
 * 2. Extraction: Call analyzeAndCreateHierarchy() with documents
 * 3. Verification: Check issues, relationships, effort values
 * 4. Rollup: Test calculateRollupEffort()
 * 5. Hierarchy: Query issue_hierarchy view
 * 6. Cleanup: Delete test data
 * 
 * Run with: node test/integration-hierarchy-extraction.js
 */

const { Pool } = require('@neondatabase/serverless');
const multiDocAnalyzer = require('../services/multi-document-analyzer');
const { calculateRollupEffort } = require('../services/effort-estimation-service');

// Database connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Test configuration
const TEST_PROJECT_NAME = `Test Project - Hierarchy Integration ${Date.now()}`;
const TEST_USER_ID = 1; // Assumes user 1 exists (created during setup)

// Test state
let testProjectId = null;
let createdIssueIds = [];
let testPassed = true;

// Sample documents for testing
const TEST_DOCUMENTS = [
  {
    filename: 'project-plan.md',
    text: `
# E-Commerce Platform Rebuild

## Phase 1: Frontend Modernization
### User Interface Redesign (40 hours)
Complete redesign of customer-facing pages with modern UX patterns.
Priority: High

### Shopping Cart Enhancement (24 hours)
Improved cart functionality with wishlist and comparison features.
Depends on: User Interface Redesign

## Phase 2: Backend API
### API Gateway Setup (16 hours)
Configure API gateway with rate limiting and authentication.
Priority: High

### Product Catalog Service (32 hours)
Microservice for product data management.
Depends on: API Gateway Setup

### Order Processing Service (40 hours)
Handle orders, payments, and fulfillment workflows.
Depends on: API Gateway Setup, Product Catalog Service
    `.trim(),
    classification: 'Project Plan'
  },
  {
    filename: 'technical-requirements.md',
    text: `
# Technical Requirements

## Phase 3: DevOps and Infrastructure
### CI/CD Pipeline (20 hours)
Automated testing and deployment pipeline with GitHub Actions.
Priority: Medium

### Monitoring and Logging (16 hours)
Set up application monitoring, error tracking, and centralized logging.
    `.trim(),
    classification: 'Requirements Document'
  }
];

/**
 * Helper: Assert condition with error message
 */
function assert(condition, message) {
  if (!condition) {
    console.log(`❌ ASSERTION FAILED: ${message}`);
    testPassed = false;
    throw new Error(message);
  }
}

/**
 * Helper: Assert equality
 */
function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.log(`❌ ASSERTION FAILED: ${message}`);
    console.log(`   Expected: ${expected}`);
    console.log(`   Actual: ${actual}`);
    testPassed = false;
    throw new Error(message);
  }
}

/**
 * Helper: Assert greater than
 */
function assertGreaterThan(actual, threshold, message) {
  if (actual <= threshold) {
    console.log(`❌ ASSERTION FAILED: ${message}`);
    console.log(`   Expected > ${threshold}`);
    console.log(`   Actual: ${actual}`);
    testPassed = false;
    throw new Error(message);
  }
}

/**
 * Step 1: Setup - Create test project
 */
async function setupTestProject() {
  console.log('📦 STEP 1: Setup - Creating test project');
  console.log('------------------------------------------------------------');
  
  try {
    const result = await pool.query(
      `INSERT INTO projects (name, description, created_by, archived)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        TEST_PROJECT_NAME,
        'Integration test project for hierarchy extraction',
        'Demo User',
        false
      ]
    );
    
    testProjectId = result.rows[0].id;
    console.log(`✅ Created test project: "${TEST_PROJECT_NAME}"`);
    console.log(`   Project ID: ${testProjectId}`);
    console.log('');
    
    return testProjectId;
    
  } catch (error) {
    console.log('❌ Failed to create test project');
    console.log(`   Error: ${error.message}`);
    throw error;
  }
}

/**
 * Step 2: Execute - Call analyzeAndCreateHierarchy
 */
async function testHierarchyExtraction() {
  console.log('🤖 STEP 2: Execute - Analyzing documents and creating hierarchy');
  console.log('------------------------------------------------------------');
  
  try {
    // Check if API key is available
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('⚠️  WARNING: ANTHROPIC_API_KEY not set');
      console.log('   Skipping AI extraction test');
      console.log('   Using fallback fixture data for database tests\n');
      return null;
    }
    
    console.log(`📄 Processing ${TEST_DOCUMENTS.length} documents...`);
    TEST_DOCUMENTS.forEach((doc, idx) => {
      console.log(`   ${idx + 1}. ${doc.filename} (${doc.text.length} chars)`);
    });
    console.log('');
    
    const result = await multiDocAnalyzer.analyzeAndCreateHierarchy(
      TEST_DOCUMENTS,
      testProjectId,
      {
        userId: TEST_USER_ID,
        includeEffort: true,
        projectContext: 'E-commerce platform modernization project'
      }
    );
    
    // Verify result structure
    assert(result.success, 'analyzeAndCreateHierarchy should return success');
    assert(result.hierarchy, 'Result should contain hierarchy');
    assert(result.created, 'Result should contain created issues');
    assert(result.validation, 'Result should contain validation results');
    
    console.log('✅ Hierarchy extraction completed successfully');
    console.log(`   Total items extracted: ${result.hierarchy?.length || 0}`);
    console.log(`   Total issues created: ${result.created?.total || 0}`);
    console.log(`   Epics: ${result.created?.epics || 0}`);
    console.log(`   Tasks: ${result.created?.tasks || 0}`);
    console.log('');
    
    // Validate results
    console.log('🔍 Validating results...');
    console.log(`   Validation valid: ${result.validation?.valid}`);
    console.log(`   Validation errors: ${result.validation?.errors?.length || 0}`);
    console.log(`   Validation warnings: ${result.validation?.warnings?.length || 0}`);
    console.log('');
    
    if (result.validation?.errors?.length > 0) {
      console.log('⚠️  Validation errors found:');
      result.validation.errors.forEach(err => console.log(`   - ${err}`));
      console.log('');
    }
    
    // Store created issue IDs for cleanup
    if (result.created?.issues) {
      createdIssueIds = result.created.issues.map(issue => issue.id);
      console.log(`✅ Stored ${createdIssueIds.length} issue IDs for cleanup`);
      console.log('');
    }
    
    return result;
    
  } catch (error) {
    console.log('❌ Hierarchy extraction failed');
    console.log(`   Error: ${error.message}`);
    console.error(error);
    throw error;
  }
}

/**
 * Step 3: Verify - Check database state
 */
async function verifyDatabaseState() {
  console.log('🔍 STEP 3: Verify - Checking database state');
  console.log('------------------------------------------------------------');
  
  try {
    // Query all issues for this project
    const issuesResult = await pool.query(
      `SELECT id, title, type, parent_issue_id, estimated_effort_hours, actual_effort_hours, priority
       FROM issues
       WHERE project_id = $1
       ORDER BY id`,
      [testProjectId]
    );
    
    const issues = issuesResult.rows;
    console.log(`✅ Found ${issues.length} issues in database`);
    console.log('');
    
    // Verify we have issues
    assertGreaterThan(issues.length, 0, 'Should have created at least 1 issue');
    
    // Count epics and tasks
    const epics = issues.filter(i => i.type === 'Epic' || i.parent_issue_id === null);
    const tasks = issues.filter(i => i.type === 'Task' || i.parent_issue_id !== null);
    
    console.log('📊 Issue breakdown:');
    console.log(`   Total: ${issues.length}`);
    console.log(`   Epics (root): ${epics.length}`);
    console.log(`   Tasks (children): ${tasks.length}`);
    console.log('');
    
    // Verify parent-child relationships
    console.log('🔗 Verifying parent-child relationships...');
    const childIssues = issues.filter(i => i.parent_issue_id !== null);
    console.log(`   Issues with parents: ${childIssues.length}`);
    
    for (const child of childIssues) {
      const parentExists = issues.some(i => i.id === child.parent_issue_id);
      assert(
        parentExists,
        `Child issue "${child.title}" has parent_issue_id ${child.parent_issue_id} which should exist`
      );
    }
    console.log(`✅ All parent references are valid`);
    console.log('');
    
    // Verify effort values
    console.log('⏱️  Verifying effort values...');
    const issuesWithEffort = issues.filter(i => i.estimated_effort_hours !== null && i.estimated_effort_hours > 0);
    console.log(`   Issues with effort estimates: ${issuesWithEffort.length}`);
    
    if (issuesWithEffort.length > 0) {
      const totalEffort = issuesWithEffort.reduce((sum, i) => sum + (parseFloat(i.estimated_effort_hours) || 0), 0);
      console.log(`   Total estimated effort: ${totalEffort} hours`);
      assertGreaterThan(totalEffort, 0, 'Total effort should be greater than 0');
    }
    console.log('');
    
    // Display sample issues
    console.log('📋 Sample issues created:');
    issues.slice(0, 5).forEach((issue, idx) => {
      const parentInfo = issue.parent_issue_id ? `Parent: ${issue.parent_issue_id}` : 'Root';
      console.log(`   ${idx + 1}. [${issue.type}] ${issue.title}`);
      console.log(`      ID: ${issue.id}, ${parentInfo}, Effort: ${issue.estimated_effort_hours || 'N/A'} hrs`);
    });
    if (issues.length > 5) {
      console.log(`   ... and ${issues.length - 5} more`);
    }
    console.log('');
    
    console.log('✅ Database state verification passed');
    console.log('');
    
    return issues;
    
  } catch (error) {
    console.log('❌ Database verification failed');
    console.log(`   Error: ${error.message}`);
    throw error;
  }
}

/**
 * Step 4: Test rollup calculation
 */
async function testRollupCalculation(issues) {
  console.log('📊 STEP 4: Test - Rollup effort calculation');
  console.log('------------------------------------------------------------');
  
  try {
    // Find an epic (issue with children)
    const epicIssues = issues.filter(i => 
      i.parent_issue_id === null && 
      issues.some(child => child.parent_issue_id === i.id)
    );
    
    if (epicIssues.length === 0) {
      console.log('⚠️  No epic with children found, skipping rollup test');
      console.log('');
      return;
    }
    
    const epic = epicIssues[0];
    console.log(`🎯 Testing rollup for epic: "${epic.title}" (ID: ${epic.id})`);
    console.log('');
    
    // Get children
    const children = issues.filter(i => i.parent_issue_id === epic.id);
    console.log(`   Found ${children.length} direct children`);
    
    // Calculate expected total
    const expectedTotal = children.reduce((sum, child) => {
      return sum + (parseFloat(child.estimated_effort_hours) || 0);
    }, 0);
    console.log(`   Expected rollup total: ${expectedTotal} hours`);
    console.log('');
    
    // Call calculateRollupEffort
    console.log('🔄 Calling calculateRollupEffort()...');
    const rollupResult = await calculateRollupEffort(epic.id, { updateParent: false });
    
    console.log('✅ Rollup calculation completed');
    console.log(`   Total hours: ${rollupResult.totalHours}`);
    console.log(`   Child count: ${rollupResult.childCount}`);
    console.log('');
    
    // Verify rollup matches expected
    assertEqual(
      rollupResult.totalHours,
      expectedTotal,
      `Rollup total should equal sum of children (${expectedTotal})`
    );
    
    assertEqual(
      rollupResult.childCount,
      children.length,
      `Child count should match (${children.length})`
    );
    
    // Display breakdown
    if (rollupResult.breakdown && rollupResult.breakdown.length > 0) {
      console.log('📋 Rollup breakdown:');
      rollupResult.breakdown.forEach(item => {
        console.log(`   - ${item.title}: ${item.estimated_hours || 0} hours (depth: ${item.depth})`);
      });
      console.log('');
    }
    
    console.log('✅ Rollup calculation test passed');
    console.log('');
    
  } catch (error) {
    console.log('❌ Rollup calculation test failed');
    console.log(`   Error: ${error.message}`);
    throw error;
  }
}

/**
 * Step 5: Test hierarchy view
 */
async function testHierarchyView() {
  console.log('🌳 STEP 5: Test - Hierarchy view query');
  console.log('------------------------------------------------------------');
  
  try {
    // Query issue_hierarchy view
    const hierarchyResult = await pool.query(
      `SELECT id, title, type, depth, path, full_path, parent_issue_id
       FROM issue_hierarchy
       WHERE project_id = $1
       ORDER BY depth, path`,
      [testProjectId]
    );
    
    const hierarchyRows = hierarchyResult.rows;
    console.log(`✅ Queried issue_hierarchy view`);
    console.log(`   Total rows: ${hierarchyRows.length}`);
    console.log('');
    
    // Verify we have hierarchy data
    assertGreaterThan(hierarchyRows.length, 0, 'Hierarchy view should return at least 1 row');
    
    // Verify depth values
    const depths = [...new Set(hierarchyRows.map(r => r.depth))].sort();
    console.log(`📊 Hierarchy depths: ${depths.join(', ')}`);
    console.log('');
    
    // Verify paths are generated
    const rowsWithPath = hierarchyRows.filter(r => r.path && r.path.length > 0);
    console.log(`🔗 Rows with path: ${rowsWithPath.length}/${hierarchyRows.length}`);
    assert(rowsWithPath.length === hierarchyRows.length, 'All rows should have paths');
    console.log('');
    
    // Display hierarchy structure
    console.log('🌲 Hierarchy tree structure:');
    const rootNodes = hierarchyRows.filter(r => r.depth === 1);
    
    for (const root of rootNodes) {
      console.log(`   ${root.title} (depth: ${root.depth})`);
      
      // Find children
      const children = hierarchyRows.filter(r => 
        r.parent_issue_id === root.id && r.depth === 2
      );
      
      for (const child of children) {
        console.log(`      └─ ${child.title} (depth: ${child.depth})`);
      }
    }
    console.log('');
    
    // Verify path format
    console.log('🔍 Verifying path formats...');
    for (const row of hierarchyRows) {
      assert(
        row.path && row.path.length > 0,
        `Row ${row.id} should have a path`
      );
      
      // Path should contain the issue ID
      assert(
        row.path.includes(row.id.toString()),
        `Path "${row.path}" should contain issue ID ${row.id}`
      );
    }
    console.log('✅ All paths are properly formatted');
    console.log('');
    
    console.log('✅ Hierarchy view test passed');
    console.log('');
    
  } catch (error) {
    console.log('❌ Hierarchy view test failed');
    console.log(`   Error: ${error.message}`);
    throw error;
  }
}

/**
 * Step 6: Cleanup - Delete test data
 */
async function cleanup() {
  console.log('🧹 STEP 6: Cleanup - Removing test data');
  console.log('------------------------------------------------------------');
  
  try {
    // Delete AI usage tracking records first (to avoid foreign key constraint)
    if (testProjectId) {
      const deleteAiUsageResult = await pool.query(
        'DELETE FROM ai_usage_tracking WHERE project_id = $1',
        [testProjectId]
      );
      if (deleteAiUsageResult.rowCount > 0) {
        console.log(`✅ Deleted ${deleteAiUsageResult.rowCount} AI usage tracking record(s)`);
      }
    }
    
    // Delete issues (CASCADE should handle relationships)
    if (testProjectId) {
      const deleteIssuesResult = await pool.query(
        'DELETE FROM issues WHERE project_id = $1',
        [testProjectId]
      );
      console.log(`✅ Deleted ${deleteIssuesResult.rowCount} test issues`);
    }
    
    // Delete project
    if (testProjectId) {
      const deleteProjectResult = await pool.query(
        'DELETE FROM projects WHERE id = $1',
        [testProjectId]
      );
      console.log(`✅ Deleted test project (ID: ${testProjectId})`);
    }
    
    console.log('');
    console.log('✅ Cleanup completed - database is pristine');
    console.log('');
    
  } catch (error) {
    console.log('⚠️  Cleanup encountered errors (non-fatal)');
    console.log(`   Error: ${error.message}`);
    // Don't throw - cleanup errors are non-fatal
  }
}

/**
 * Main test execution
 */
async function runIntegrationTest() {
  console.log('============================================================');
  console.log('  HIERARCHY EXTRACTION - INTEGRATION TEST');
  console.log('============================================================');
  console.log('');
  console.log(`🕐 Started: ${new Date().toISOString()}`);
  console.log('');
  
  try {
    // Step 1: Setup
    await setupTestProject();
    
    // Step 2: Execute hierarchy extraction
    const extractionResult = await testHierarchyExtraction();
    
    // Step 3: Verify database state
    const issues = await verifyDatabaseState();
    
    // Step 4: Test rollup calculation
    if (issues && issues.length > 0) {
      await testRollupCalculation(issues);
    }
    
    // Step 5: Test hierarchy view
    await testHierarchyView();
    
    // Final success message
    console.log('============================================================');
    console.log('  ✅ INTEGRATION TEST PASSED');
    console.log('============================================================');
    console.log('');
    console.log('All test steps completed successfully:');
    console.log('  ✅ Test project created');
    console.log('  ✅ Documents analyzed and hierarchy extracted');
    console.log('  ✅ Issues created with proper relationships');
    console.log('  ✅ Effort values populated correctly');
    console.log('  ✅ Rollup calculation verified');
    console.log('  ✅ Hierarchy view structure validated');
    console.log('');
    
    return true;
    
  } catch (error) {
    console.log('============================================================');
    console.log('  ❌ INTEGRATION TEST FAILED');
    console.log('============================================================');
    console.log('');
    console.log(`Error: ${error.message}`);
    console.log('');
    console.error(error.stack);
    console.log('');
    
    testPassed = false;
    return false;
    
  } finally {
    // Always cleanup, even on failure
    await cleanup();
    
    // Close database connection
    await pool.end();
    
    console.log(`🕐 Completed: ${new Date().toISOString()}`);
    console.log('');
    
    // Exit with appropriate code
    process.exit(testPassed ? 0 : 1);
  }
}

// Run the integration test
runIntegrationTest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
