/**
 * Resource Parser - Test Suite
 * 
 * Tests all parsing strategies and user matching logic.
 * Run with: node tests/test-resource-parser.js
 */

const resourceParser = require('../services/resource-parser');

// Mock users for testing
const mockUsers = [
  { id: 1, username: 'jdoe', full_name: 'John Doe' },
  { id: 2, username: 'jsmith', full_name: 'Jane Smith' },
  { id: 3, username: 'bwilson', full_name: 'Bob Wilson' },
  { id: 4, username: 'sjohnson', full_name: 'Sarah Johnson' }
];

/**
 * Test 1: Parse Resource Table
 */
function testParseResourceTable() {
  console.log('═══════════════════════════════════════════');
  console.log('TEST 1: Parse Resource Table');
  console.log('═══════════════════════════════════════════\n');

  const documentText = `
Resource Allocation:

| Task Component  | Resource   | Role      | Effort   |
|-----------------|------------|-----------|----------|
| API Development | John Doe   | Developer | 80 hours |
| Database Design | Jane Smith | DBA       | 40 hours |
| Testing         | Bob Wilson | QA        | 60h      |
| Documentation   | Sarah Johnson | Tech Writer | 3 days |
  `;

  const resources = resourceParser.parseResourceTable(documentText);
  
  console.log(`\n✓ Parsed ${resources.length} resources from table`);
  
  // Verify results
  const expected = [
    { name: 'John Doe', effort: 80, unit: 'hours', task: 'API Development' },
    { name: 'Jane Smith', effort: 40, unit: 'hours', task: 'Database Design' },
    { name: 'Bob Wilson', effort: 60, unit: 'h', task: 'Testing' },
    { name: 'Sarah Johnson', effort: 3, unit: 'days', task: 'Documentation' }
  ];
  
  let passed = true;
  for (let i = 0; i < expected.length; i++) {
    if (resources[i].name !== expected[i].name ||
        resources[i].effort !== expected[i].effort ||
        resources[i].task !== expected[i].task) {
      console.error(`❌ Mismatch at index ${i}`);
      passed = false;
    }
  }
  
  if (passed && resources.length === expected.length) {
    console.log('✅ TEST 1 PASSED\n');
    return true;
  } else {
    console.log('❌ TEST 1 FAILED\n');
    return false;
  }
}

/**
 * Test 2: Parse Resource List
 */
function testParseResourceList() {
  console.log('═══════════════════════════════════════════');
  console.log('TEST 2: Parse Resource List');
  console.log('═══════════════════════════════════════════\n');

  const documentText = `
Additional assignments:
- Infrastructure Setup: Mike Chen (DevOps) - 5 days
- Code Review: Jane Smith (Senior Dev) - 20 hours
- Security Audit: Alice Brown (Security) - 40h
  `;

  const resources = resourceParser.parseResourceList(documentText);
  
  console.log(`\n✓ Parsed ${resources.length} resources from list`);
  
  if (resources.length === 3 &&
      resources[0].name === 'Mike Chen' &&
      resources[0].effort === 5 &&
      resources[0].unit === 'days' &&
      resources[1].name === 'Jane Smith' &&
      resources[2].name === 'Alice Brown') {
    console.log('✅ TEST 2 PASSED\n');
    return true;
  } else {
    console.log('❌ TEST 2 FAILED\n');
    console.log('Resources:', resources);
    return false;
  }
}

/**
 * Test 3: Parse Resource Paragraphs
 */
function testParseResourceParagraphs() {
  console.log('═══════════════════════════════════════════');
  console.log('TEST 3: Parse Resource Paragraphs');
  console.log('═══════════════════════════════════════════\n');

  const documentText = `
The API development will be handled by John Doe (Senior Developer) - 80 hours.
Jane Smith (Database Administrator) will spend 40 hours on database optimization.
Testing activities will be managed by Bob Wilson (QA Engineer) - 60 hours.
  `;

  const resources = resourceParser.parseResourceParagraphs(documentText);
  
  console.log(`\n✓ Parsed ${resources.length} resources from paragraphs`);
  
  if (resources.length >= 2) {
    console.log('✅ TEST 3 PASSED\n');
    return true;
  } else {
    console.log('❌ TEST 3 FAILED\n');
    console.log('Resources:', resources);
    return false;
  }
}

/**
 * Test 4: User Matching - Exact Match
 */
function testUserMatchingExact() {
  console.log('═══════════════════════════════════════════');
  console.log('TEST 4: User Matching - Exact Match');
  console.log('═══════════════════════════════════════════\n');

  const match = resourceParser.findMatchingUser('John Doe', mockUsers);
  
  if (match && match.user.id === 1 && match.confidence === 1.0) {
    console.log('✓ Exact match found: John Doe → user.id = 1');
    console.log('✅ TEST 4 PASSED\n');
    return true;
  } else {
    console.log('❌ TEST 4 FAILED\n');
    console.log('Match:', match);
    return false;
  }
}

/**
 * Test 5: User Matching - Partial Match
 */
function testUserMatchingPartial() {
  console.log('═══════════════════════════════════════════');
  console.log('TEST 5: User Matching - Partial Match');
  console.log('═══════════════════════════════════════════\n');

  const match = resourceParser.findMatchingUser('John D', mockUsers);
  
  if (match && match.user.id === 1 && match.confidence >= 0.8) {
    console.log(`✓ Partial match found: "John D" → John Doe (confidence: ${match.confidence})`);
    console.log('✅ TEST 5 PASSED\n');
    return true;
  } else {
    console.log('❌ TEST 5 FAILED\n');
    console.log('Match:', match);
    return false;
  }
}

/**
 * Test 6: User Matching - Fuzzy Match
 */
function testUserMatchingFuzzy() {
  console.log('═══════════════════════════════════════════');
  console.log('TEST 6: User Matching - Fuzzy Match');
  console.log('═══════════════════════════════════════════\n');

  const match = resourceParser.findMatchingUser('Jon Doe', mockUsers); // Typo: Jon instead of John
  
  if (match && match.user.id === 1) {
    console.log(`✓ Fuzzy match found: "Jon Doe" → John Doe (confidence: ${match.confidence.toFixed(2)})`);
    console.log('✅ TEST 6 PASSED\n');
    return true;
  } else {
    console.log('❌ TEST 6 FAILED\n');
    console.log('Match:', match);
    return false;
  }
}

/**
 * Test 7: User Matching - First Name Only
 */
function testUserMatchingFirstName() {
  console.log('═══════════════════════════════════════════');
  console.log('TEST 7: User Matching - First Name Only');
  console.log('═══════════════════════════════════════════\n');

  const match = resourceParser.findMatchingUser('Sarah', mockUsers);
  
  if (match && match.user.id === 4 && match.confidence >= 0.7) {
    console.log(`✓ First name match found: "Sarah" → Sarah Johnson (confidence: ${match.confidence})`);
    console.log('✅ TEST 7 PASSED\n');
    return true;
  } else {
    console.log('❌ TEST 7 FAILED\n');
    console.log('Match:', match);
    return false;
  }
}

/**
 * Test 8: Match Resources to Users
 */
function testMatchResourcesToUsers() {
  console.log('═══════════════════════════════════════════');
  console.log('TEST 8: Match Resources to Users');
  console.log('═══════════════════════════════════════════\n');

  const resources = [
    { name: 'John Doe', task: 'API Development', effort: 80, unit: 'hours' },
    { name: 'Jane Smith', task: 'Database', effort: 40, unit: 'hours' },
    { name: 'Unknown Person', task: 'Mystery', effort: 20, unit: 'hours' }
  ];

  const matched = resourceParser.matchResourcesToUsers(resources, mockUsers);
  
  console.log(`\n✓ Processed ${matched.length} resources`);
  console.log(`  Matched: ${matched.filter(r => r.userId).length}`);
  console.log(`  Need review: ${matched.filter(r => r.needsReview).length}`);
  
  if (matched[0].userId === 1 &&
      matched[1].userId === 2 &&
      matched[2].userId === null) {
    console.log('✅ TEST 8 PASSED\n');
    return true;
  } else {
    console.log('❌ TEST 8 FAILED\n');
    console.log('Matched:', matched);
    return false;
  }
}

/**
 * Test 9: Normalize Effort to Hours
 */
function testNormalizeEffort() {
  console.log('═══════════════════════════════════════════');
  console.log('TEST 9: Normalize Effort to Hours');
  console.log('═══════════════════════════════════════════\n');

  const tests = [
    { value: 40, unit: 'hours', expected: 40 },
    { value: 5, unit: 'days', expected: 40 },
    { value: 2.5, unit: 'days', expected: 20 },
    { value: 60, unit: 'h', expected: 60 },
    { value: 3, unit: 'd', expected: 24 }
  ];

  let passed = true;
  for (const test of tests) {
    const result = resourceParser.normalizeEffortToHours(test.value, test.unit);
    const status = result === test.expected ? '✓' : '❌';
    console.log(`  ${status} ${test.value} ${test.unit} → ${result} hours (expected: ${test.expected})`);
    if (result !== test.expected) {
      passed = false;
    }
  }

  if (passed) {
    console.log('✅ TEST 9 PASSED\n');
    return true;
  } else {
    console.log('❌ TEST 9 FAILED\n');
    return false;
  }
}

/**
 * Test 10: Deduplicate Resources
 */
function testDeduplicateResources() {
  console.log('═══════════════════════════════════════════');
  console.log('TEST 10: Deduplicate Resources');
  console.log('═══════════════════════════════════════════\n');

  const resources = [
    { name: 'John Doe', task: 'API Development', effort: 80 },
    { name: 'Jane Smith', task: 'Database', effort: 40 },
    { name: 'John Doe', task: 'API Development', effort: 80 }, // Duplicate
    { name: 'John Doe', task: 'Testing', effort: 20 } // Different task - not duplicate
  ];

  const unique = resourceParser.deduplicateResources(resources);
  
  console.log(`\n✓ Original: ${resources.length} resources`);
  console.log(`✓ Unique: ${unique.length} resources`);
  
  if (unique.length === 3) {
    console.log('✅ TEST 10 PASSED\n');
    return true;
  } else {
    console.log('❌ TEST 10 FAILED\n');
    console.log('Unique:', unique);
    return false;
  }
}

/**
 * Test 11: Levenshtein Distance
 */
function testLevenshteinDistance() {
  console.log('═══════════════════════════════════════════');
  console.log('TEST 11: Levenshtein Distance');
  console.log('═══════════════════════════════════════════\n');

  const tests = [
    { str1: 'John Doe', str2: 'John Doe', expected: 0 },
    { str1: 'John Doe', str2: 'Jon Doe', expected: 1 },
    { str1: 'Jane Smith', str2: 'Jane Smit', expected: 1 },
    { str1: 'Bob', str2: 'Robert', expected: 3 }
  ];

  let passed = true;
  for (const test of tests) {
    const result = resourceParser.levenshteinDistance(test.str1, test.str2);
    const status = result === test.expected ? '✓' : '❌';
    console.log(`  ${status} "${test.str1}" vs "${test.str2}" → distance: ${result} (expected: ${test.expected})`);
    if (result !== test.expected) {
      passed = false;
    }
  }

  if (passed) {
    console.log('✅ TEST 11 PASSED\n');
    return true;
  } else {
    console.log('❌ TEST 11 FAILED\n');
    return false;
  }
}

/**
 * Test 12: Full Integration Test
 */
function testFullIntegration() {
  console.log('═══════════════════════════════════════════');
  console.log('TEST 12: Full Integration Test');
  console.log('═══════════════════════════════════════════\n');

  const documentText = `
# Resource Allocation Plan

## Team Assignments

| Task Component  | Resource   | Role      | Effort   |
|-----------------|------------|-----------|----------|
| API Development | John Doe   | Developer | 80 hours |
| Database Design | Jane Smith | DBA       | 40 hours |

## Additional Work

- Testing: Bob Wilson (QA) - 3 days
- Documentation: Sarah Johnson (Tech Writer) - 20 hours

## Detailed Plans

The infrastructure setup will be handled by John Doe (DevOps) - 16 hours.
  `;

  const resources = [];
  
  // Parse using all strategies
  resources.push(...resourceParser.parseResourceTable(documentText));
  resources.push(...resourceParser.parseResourceList(documentText));
  resources.push(...resourceParser.parseResourceParagraphs(documentText));
  
  const unique = resourceParser.deduplicateResources(resources);
  
  // Normalize effort
  for (const resource of unique) {
    if (resource.effort && resource.unit) {
      resource.effort = resourceParser.normalizeEffortToHours(resource.effort, resource.unit);
      resource.unit = 'hours';
    }
  }
  
  // Match to users
  const matched = resourceParser.matchResourcesToUsers(unique, mockUsers);
  
  console.log('\n📊 Integration Test Results:');
  console.log(`   Total extracted: ${resources.length}`);
  console.log(`   Unique: ${unique.length}`);
  console.log(`   Matched: ${matched.filter(r => r.userId).length}`);
  console.log(`   Need review: ${matched.filter(r => r.needsReview).length}`);
  
  if (unique.length >= 4 && matched.filter(r => r.userId).length >= 3) {
    console.log('✅ TEST 12 PASSED\n');
    return true;
  } else {
    console.log('❌ TEST 12 FAILED\n');
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log('║   RESOURCE PARSER - COMPREHENSIVE TEST SUITE     ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  const results = [];
  
  results.push(testParseResourceTable());
  results.push(testParseResourceList());
  results.push(testParseResourceParagraphs());
  results.push(testUserMatchingExact());
  results.push(testUserMatchingPartial());
  results.push(testUserMatchingFuzzy());
  results.push(testUserMatchingFirstName());
  results.push(testMatchResourcesToUsers());
  results.push(testNormalizeEffort());
  results.push(testDeduplicateResources());
  results.push(testLevenshteinDistance());
  results.push(testFullIntegration());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log('═══════════════════════════════════════════════════');
  console.log('TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`Total Tests: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${total - passed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);
  
  if (passed === total) {
    console.log('🎉 ALL TESTS PASSED!\n');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED\n');
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
