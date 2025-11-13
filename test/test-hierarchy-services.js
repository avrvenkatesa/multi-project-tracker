/**
 * Test Script for Hierarchical Issue Management Services
 * 
 * Tests:
 * 1. calculateRollupEffort - Sum effort from child issues
 * 2. getHierarchicalBreakdown - Build tree structure
 * 3. createHierarchicalIssues - Create epics and tasks from workstreams
 * 
 * Run with: node test/test-hierarchy-services.js
 */

const { pool } = require('../db');
const {
  calculateRollupEffort,
  updateAllParentEfforts,
  estimateWithDependencies,
  getHierarchicalBreakdown
} = require('../services/effort-estimation-service');

const {
  createHierarchicalIssues
} = require('../services/dependency-mapper');

// Test data IDs (will be populated during test)
let testProjectId;
let testEpicId;
let testTask1Id;
let testTask2Id;
let testTask3Id;
let testUserId = 1; // Assuming user ID 1 exists

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * Log test result
 */
function logTest(name, passed, message = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${status}: ${name}${message ? ' - ' + message : ''}`);
  results.tests.push({ name, passed, message });
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
}

/**
 * Setup: Create test data
 */
async function setupTestData() {
  console.log('\n🏗️  Setting up test data...');
  
  try {
    // 1. Insert test project
    const projectResult = await pool.query(
      `INSERT INTO projects (name, description, created_at)
       VALUES ('Test Hierarchy Project', 'Test project for hierarchy functions', NOW())
       RETURNING id`
    );
    testProjectId = projectResult.rows[0].id;
    console.log(`  ✓ Created test project #${testProjectId}`);

    // 2. Insert epic issue
    const epicResult = await pool.query(
      `INSERT INTO issues 
       (project_id, title, description, status, priority, parent_issue_id, 
        hierarchy_level, is_epic, created_at, updated_at)
       VALUES ($1, 'Epic: Cloud Migration', 'Migrate all services to cloud', 'In Progress', 'high', 
        NULL, 0, TRUE, NOW(), NOW())
       RETURNING id`,
      [testProjectId]
    );
    testEpicId = epicResult.rows[0].id;
    console.log(`  ✓ Created epic issue #${testEpicId}`);

    // 3. Insert child task 1 (8 hours)
    const task1Result = await pool.query(
      `INSERT INTO issues 
       (project_id, title, description, status, priority, parent_issue_id, 
        hierarchy_level, is_epic, estimated_effort_hours, created_at, updated_at)
       VALUES ($1, 'Setup AWS Infrastructure', 'Configure VPC and networking', 'In Progress', 'high',
        $2, 1, FALSE, 8, NOW(), NOW())
       RETURNING id`,
      [testProjectId, testEpicId]
    );
    testTask1Id = task1Result.rows[0].id;
    console.log(`  ✓ Created task #${testTask1Id} (8 hours)`);

    // 4. Insert child task 2 (4 hours)
    const task2Result = await pool.query(
      `INSERT INTO issues 
       (project_id, title, description, status, priority, parent_issue_id, 
        hierarchy_level, is_epic, estimated_effort_hours, created_at, updated_at)
       VALUES ($1, 'Database Migration', 'Migrate PostgreSQL to RDS', 'To Do', 'medium',
        $2, 1, FALSE, 4, NOW(), NOW())
       RETURNING id`,
      [testProjectId, testEpicId]
    );
    testTask2Id = task2Result.rows[0].id;
    console.log(`  ✓ Created task #${testTask2Id} (4 hours)`);

    // 5. Insert child task 3 (16 hours)
    const task3Result = await pool.query(
      `INSERT INTO issues 
       (project_id, title, description, status, priority, parent_issue_id, 
        hierarchy_level, is_epic, estimated_effort_hours, created_at, updated_at)
       VALUES ($1, 'Application Deployment', 'Deploy apps to ECS', 'To Do', 'high',
        $2, 1, FALSE, 16, NOW(), NOW())
       RETURNING id`,
      [testProjectId, testEpicId]
    );
    testTask3Id = task3Result.rows[0].id;
    console.log(`  ✓ Created task #${testTask3Id} (16 hours)`);

    console.log('✅ Test data setup complete\n');
    return true;
  } catch (error) {
    console.error('❌ Error setting up test data:', error);
    throw error;
  }
}

/**
 * Test 1: calculateRollupEffort
 */
async function testCalculateRollupEffort() {
  console.log('🧪 Test 1: calculateRollupEffort');
  
  try {
    const result = await calculateRollupEffort(testEpicId, { updateParent: false });
    
    console.log('  Result:', JSON.stringify(result, null, 2));
    
    // Verify totalHours = 28 (8+4+16)
    const expectedTotal = 28;
    if (result.totalHours === expectedTotal) {
      logTest('Total hours calculation', true, `${result.totalHours}h = 8+4+16`);
    } else {
      logTest('Total hours calculation', false, `Expected ${expectedTotal}, got ${result.totalHours}`);
    }
    
    // Verify childCount = 3
    if (result.childCount === 3) {
      logTest('Child count', true, `${result.childCount} children`);
    } else {
      logTest('Child count', false, `Expected 3, got ${result.childCount}`);
    }
    
    // Verify breakdown exists
    if (result.breakdown && result.breakdown.length === 3) {
      logTest('Breakdown array', true, `${result.breakdown.length} items`);
    } else {
      logTest('Breakdown array', false, 'Breakdown missing or incorrect length');
    }
    
    // Test with updateParent = true
    const updateResult = await calculateRollupEffort(testEpicId, { updateParent: true });
    
    // Verify epic was updated
    const epicCheck = await pool.query(
      'SELECT effort_hours FROM issues WHERE id = $1',
      [testEpicId]
    );
    const updatedEffort = parseFloat(epicCheck.rows[0].effort_hours);
    
    if (updatedEffort === expectedTotal) {
      logTest('Parent update', true, `Epic effort_hours updated to ${updatedEffort}h`);
    } else {
      logTest('Parent update', false, `Expected ${expectedTotal}, got ${updatedEffort}`);
    }
    
  } catch (error) {
    logTest('calculateRollupEffort execution', false, error.message);
    console.error('  Error:', error);
  }
  
  console.log('');
}

/**
 * Test 2: getHierarchicalBreakdown
 */
async function testGetHierarchicalBreakdown() {
  console.log('🧪 Test 2: getHierarchicalBreakdown');
  
  try {
    const result = await getHierarchicalBreakdown(testEpicId);
    
    console.log('  Tree structure:', JSON.stringify(result.tree, null, 2));
    
    // Verify tree structure exists
    if (result.tree && result.tree.id === testEpicId) {
      logTest('Tree structure', true, `Root is epic #${testEpicId}`);
    } else {
      logTest('Tree structure', false, 'Tree root is incorrect');
    }
    
    // Verify tree has 3 children
    if (result.tree.children && result.tree.children.length === 3) {
      logTest('Tree children', true, `${result.tree.children.length} children`);
    } else {
      logTest('Tree children', false, `Expected 3 children, got ${result.tree.children?.length || 0}`);
    }
    
    // Verify flatList contains 4 items (1 epic + 3 tasks)
    if (result.flatList && result.flatList.length === 4) {
      logTest('Flat list', true, `${result.flatList.length} total items`);
    } else {
      logTest('Flat list', false, `Expected 4 items, got ${result.flatList?.length || 0}`);
    }
    
    // Verify totalEffort (56h = epic 28h + tasks 28h, since epic was updated by previous test)
    // Note: This sums all effort values including parent rollups
    if (result.totalEffort === 56) {
      logTest('Total effort calculation', true, `${result.totalEffort}h (includes parent rollup)`);
    } else {
      logTest('Total effort calculation', false, `Expected 56h, got ${result.totalEffort}h`);
    }
    
  } catch (error) {
    logTest('getHierarchicalBreakdown execution', false, error.message);
    console.error('  Error:', error);
  }
  
  console.log('');
}

/**
 * Test 3: createHierarchicalIssues
 */
async function testCreateHierarchicalIssues() {
  console.log('🧪 Test 3: createHierarchicalIssues');
  
  try {
    // Create mock workstreams: 1 epic + 2 tasks
    const mockWorkstreams = [
      {
        name: 'Epic: API Development',
        title: 'API Development Epic',
        description: 'Build RESTful API services',
        isEpic: true,
        hierarchyLevel: 0,
        effort: 50,
        priority: 'high',
        createdBy: 'Test User'
      },
      {
        name: 'Task: Auth Endpoints',
        title: 'Implement Authentication Endpoints',
        description: 'Create login, logout, refresh token endpoints',
        isEpic: false,
        hierarchyLevel: 1,
        parent: 'Epic: API Development',
        effort: 12,
        priority: 'high',
        createdBy: 'Test User'
      },
      {
        name: 'Task: User CRUD',
        title: 'User CRUD Operations',
        description: 'Create endpoints for user management',
        isEpic: false,
        hierarchyLevel: 1,
        parent: 'Epic: API Development',
        effort: 8,
        priority: 'medium',
        createdBy: 'Test User'
      }
    ];
    
    const result = await createHierarchicalIssues(mockWorkstreams, testProjectId, testUserId);
    
    console.log('  Result:', JSON.stringify(result, null, 2));
    
    // Verify 3 issues were created
    if (result.created.length === 3) {
      logTest('Issues created count', true, `${result.created.length} issues`);
    } else {
      logTest('Issues created count', false, `Expected 3, got ${result.created.length}`);
    }
    
    // Verify 1 epic was created
    if (result.epics.length === 1) {
      logTest('Epics created', true, `${result.epics.length} epic`);
    } else {
      logTest('Epics created', false, `Expected 1, got ${result.epics.length}`);
    }
    
    // Verify 2 tasks were created
    if (result.tasks.length === 2) {
      logTest('Tasks created', true, `${result.tasks.length} tasks`);
    } else {
      logTest('Tasks created', false, `Expected 2, got ${result.tasks.length}`);
    }
    
    // Verify issues exist in database
    const epicId = result.epics[0].id;
    const dbCheck = await pool.query(
      'SELECT COUNT(*) as count FROM issues WHERE project_id = $1 AND parent_issue_id = $2',
      [testProjectId, epicId]
    );
    
    const childrenInDb = parseInt(dbCheck.rows[0].count);
    if (childrenInDb === 2) {
      logTest('Database verification', true, `2 children found for epic #${epicId}`);
    } else {
      logTest('Database verification', false, `Expected 2 children, found ${childrenInDb}`);
    }
    
    // Verify no errors
    if (result.errors.length === 0) {
      logTest('No errors', true, 'All issues created successfully');
    } else {
      logTest('No errors', false, `${result.errors.length} errors: ${result.errors.join(', ')}`);
    }
    
  } catch (error) {
    logTest('createHierarchicalIssues execution', false, error.message);
    console.error('  Error:', error);
  }
  
  console.log('');
}

/**
 * Cleanup: Remove test data
 */
async function cleanupTestData() {
  console.log('🧹 Cleaning up test data...');
  
  try {
    // Delete test issues first
    if (testProjectId) {
      const issuesDeleted = await pool.query(
        'DELETE FROM issues WHERE project_id = $1',
        [testProjectId]
      );
      console.log(`  ✓ Deleted ${issuesDeleted.rowCount} test issue(s)`);
      
      // Then delete test project
      await pool.query('DELETE FROM projects WHERE id = $1', [testProjectId]);
      console.log(`  ✓ Deleted test project #${testProjectId}`);
    }
    
    console.log('✅ Cleanup complete\n');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

/**
 * Print test summary
 */
function printSummary() {
  console.log('='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${results.passed + results.failed}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log('='.repeat(60));
  
  if (results.failed > 0) {
    console.log('\n❌ Failed tests:');
    results.tests
      .filter(t => !t.passed)
      .forEach(t => console.log(`  - ${t.name}: ${t.message}`));
  }
  
  console.log('');
  
  // Exit with error code if tests failed
  process.exit(results.failed > 0 ? 1 : 0);
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 HIERARCHICAL SERVICES TEST SUITE');
  console.log('='.repeat(60));
  
  try {
    // Setup
    await setupTestData();
    
    // Run tests
    await testCalculateRollupEffort();
    await testGetHierarchicalBreakdown();
    await testCreateHierarchicalIssues();
    
    // Cleanup
    await cleanupTestData();
    
    // Summary
    printSummary();
    
  } catch (error) {
    console.error('\n❌ Fatal error during test execution:', error);
    
    // Attempt cleanup even on error
    try {
      await cleanupTestData();
    } catch (cleanupError) {
      console.error('❌ Error during cleanup:', cleanupError);
    }
    
    process.exit(1);
  } finally {
    // Close database connection
    await pool.end();
  }
}

// Run tests
runTests();
