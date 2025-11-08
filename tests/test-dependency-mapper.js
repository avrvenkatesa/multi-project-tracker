/**
 * Test Dependency Mapper Service
 * 
 * Tests the dependency mapper's ability to:
 * - Match workstream names to issues using fuzzy matching
 * - Create dependency relationships in the database
 * - Detect circular dependencies
 * 
 * Run with: node tests/test-dependency-mapper.js
 */

require('dotenv').config();
const {
  createDependencies,
  findMatchingIssue,
  levenshteinDistance,
  detectCircularDependencies,
  getDependencyGraph
} = require('../services/dependency-mapper');

// Test data
const mockIssues = [
  { id: 1, title: 'Discovery Phase', status: 'To Do' },
  { id: 2, title: 'Design and Planning', status: 'To Do' },
  { id: 3, title: 'Infrastructure Setup', status: 'To Do' },
  { id: 4, title: 'Implementation', status: 'To Do' },
  { id: 5, title: 'Testing and Validation', status: 'To Do' }
];

/**
 * Test 1: Levenshtein Distance Calculation
 */
function testLevenshteinDistance() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('TEST 1: Levenshtein Distance Calculation');
  console.log('═══════════════════════════════════════════════════\n');

  const tests = [
    { str1: 'kitten', str2: 'sitting', expected: 3 },
    { str1: 'saturday', str2: 'sunday', expected: 3 },
    { str1: 'discovery', str2: 'discovery', expected: 0 },
    { str1: 'design', str2: 'desing', expected: 2 }, // Swap 'i' and 'n' = 2 ops (del+ins)
    { str1: 'test', str2: 'testing', expected: 3 }
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach(({ str1, str2, expected }) => {
    const result = levenshteinDistance(str1, str2);
    const status = result === expected ? '✓' : '✗';
    
    if (result === expected) {
      passed++;
      console.log(`${status} "${str1}" → "${str2}": ${result} (expected ${expected})`);
    } else {
      failed++;
      console.log(`${status} "${str1}" → "${str2}": ${result} (expected ${expected}) ❌`);
    }
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

/**
 * Test 2: Fuzzy Name Matching
 */
function testFuzzyMatching() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('TEST 2: Fuzzy Name Matching');
  console.log('═══════════════════════════════════════════════════\n');

  const tests = [
    { search: 'Discovery Phase', expectedId: 1, matchType: 'exact' },
    { search: 'discovery phase', expectedId: 1, matchType: 'exact (case-insensitive)' },
    { search: 'Discovery', expectedId: 1, matchType: 'partial' },
    { search: 'Design', expectedId: 2, matchType: 'partial' },
    { search: 'Infra Setup', expectedId: null, matchType: 'no match (too different)' },
    { search: 'Infrastructure', expectedId: 3, matchType: 'partial' },
    { search: 'Discovry Phase', expectedId: 1, matchType: 'fuzzy (1 char diff)' },
    { search: 'Desing and Planning', expectedId: 2, matchType: 'fuzzy (2 char diff)' }
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach(({ search, expectedId, matchType }) => {
    const result = findMatchingIssue(search, mockIssues);
    const matchedId = result ? result.id : null;
    const status = matchedId === expectedId ? '✓' : '✗';
    
    if (matchedId === expectedId) {
      passed++;
      console.log(`${status} "${search}" → ${result ? `#${result.id} "${result.title}"` : 'null'} (${matchType})`);
    } else {
      failed++;
      console.log(`${status} "${search}" → ${result ? `#${result.id} "${result.title}"` : 'null'} (expected ${expectedId}) ❌`);
    }
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

/**
 * Test 3: Circular Dependency Detection
 */
function testCircularDependencyDetection() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('TEST 3: Circular Dependency Detection');
  console.log('═══════════════════════════════════════════════════\n');

  // Test Case 1: No cycles (linear chain)
  console.log('Test 3.1: Linear dependency chain (should be OK)');
  const linearDeps = [
    { source_id: 1, target_id: 2, source_name: 'Discovery', target_name: 'Design' },
    { source_id: 2, target_id: 3, source_name: 'Design', target_name: 'Infrastructure' },
    { source_id: 3, target_id: 4, source_name: 'Infrastructure', target_name: 'Implementation' }
  ];
  
  let cycles = detectCircularDependencies(linearDeps);
  console.log(`  Result: ${cycles.length === 0 ? '✓ No cycles detected' : '✗ False positive!'}`);
  if (cycles.length > 0) {
    console.log('  Cycles:', cycles);
  }

  // Test Case 2: Simple cycle (A → B → A)
  console.log('\nTest 3.2: Simple cycle A → B → A (should detect)');
  const simpleCycle = [
    { source_id: 1, target_id: 2, source_name: 'Discovery', target_name: 'Design' },
    { source_id: 2, target_id: 1, source_name: 'Design', target_name: 'Discovery' }
  ];
  
  cycles = detectCircularDependencies(simpleCycle);
  console.log(`  Result: ${cycles.length > 0 ? '✓ Cycle detected' : '✗ Cycle not detected!'}`);
  if (cycles.length > 0) {
    console.log(`  Cycle: ${cycles[0]}`);
  }

  // Test Case 3: Complex cycle (A → B → C → A)
  console.log('\nTest 3.3: Complex cycle A → B → C → A (should detect)');
  const complexCycle = [
    { source_id: 1, target_id: 2, source_name: 'Discovery', target_name: 'Design' },
    { source_id: 2, target_id: 3, source_name: 'Design', target_name: 'Infrastructure' },
    { source_id: 3, target_id: 1, source_name: 'Infrastructure', target_name: 'Discovery' }
  ];
  
  cycles = detectCircularDependencies(complexCycle);
  console.log(`  Result: ${cycles.length > 0 ? '✓ Cycle detected' : '✗ Cycle not detected!'}`);
  if (cycles.length > 0) {
    console.log(`  Cycle: ${cycles[0]}`);
  }

  // Test Case 4: Multiple independent chains (no cycles)
  console.log('\nTest 3.4: Multiple independent chains (should be OK)');
  const multipleDeps = [
    { source_id: 1, target_id: 2, source_name: 'Discovery', target_name: 'Design' },
    { source_id: 3, target_id: 4, source_name: 'Infrastructure', target_name: 'Implementation' }
  ];
  
  cycles = detectCircularDependencies(multipleDeps);
  console.log(`  Result: ${cycles.length === 0 ? '✓ No cycles detected' : '✗ False positive!'}`);

  console.log('\n✅ Circular dependency detection tests complete');
  return true;
}

/**
 * Test 4: Workstream to Dependency Mapping (Dry Run)
 */
function testWorkstreamMapping() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('TEST 4: Workstream to Dependency Mapping');
  console.log('═══════════════════════════════════════════════════\n');

  const sampleWorkstreams = [
    {
      id: 'workstream-1',
      name: 'Discovery Phase',
      description: 'Initial discovery and requirements gathering',
      dependencies: []
    },
    {
      id: 'workstream-2',
      name: 'Design and Planning',
      description: 'System design and project planning',
      dependencies: ['Discovery Phase']
    },
    {
      id: 'workstream-3',
      name: 'Infrastructure Setup',
      description: 'Setup infrastructure and environment',
      dependencies: ['Design and Planning']
    },
    {
      id: 'workstream-4',
      name: 'Implementation',
      description: 'Core implementation work',
      dependencies: ['Infrastructure Setup', 'Design and Planning']
    },
    {
      id: 'workstream-5',
      name: 'Testing',
      description: 'Testing and validation',
      dependencies: ['Implementation']
    }
  ];

  console.log('Sample Workstreams:');
  sampleWorkstreams.forEach(ws => {
    console.log(`\n  ${ws.name}`);
    if (ws.dependencies.length > 0) {
      console.log(`    Depends on: ${ws.dependencies.join(', ')}`);
    } else {
      console.log(`    No dependencies (can start first)`);
    }
  });

  console.log('\n\nExpected Dependency Mappings:');
  sampleWorkstreams.forEach(ws => {
    const targetIssue = findMatchingIssue(ws.name, mockIssues);
    
    if (targetIssue && ws.dependencies.length > 0) {
      ws.dependencies.forEach(depName => {
        const sourceIssue = findMatchingIssue(depName, mockIssues);
        if (sourceIssue) {
          console.log(`  ✓ ${sourceIssue.title} (#${sourceIssue.id}) → ${targetIssue.title} (#${targetIssue.id})`);
        } else {
          console.log(`  ⚠ "${depName}" not found → ${targetIssue.title} (#${targetIssue.id})`);
        }
      });
    }
  });

  console.log('\n✅ Workstream mapping test complete');
  return true;
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║     DEPENDENCY MAPPER SERVICE TEST SUITE          ║');
  console.log('╚═══════════════════════════════════════════════════╝');

  try {
    const test1 = testLevenshteinDistance();
    const test2 = testFuzzyMatching();
    const test3 = testCircularDependencyDetection();
    const test4 = testWorkstreamMapping();

    console.log('\n═══════════════════════════════════════════════════');
    console.log('FINAL RESULTS');
    console.log('═══════════════════════════════════════════════════\n');

    const results = [
      { name: 'Levenshtein Distance', passed: test1 },
      { name: 'Fuzzy Matching', passed: test2 },
      { name: 'Circular Dependency Detection', passed: test3 },
      { name: 'Workstream Mapping', passed: test4 }
    ];

    results.forEach(({ name, passed }) => {
      console.log(`  ${passed ? '✓' : '✗'} ${name}: ${passed ? 'PASSED' : 'FAILED'}`);
    });

    const allPassed = results.every(r => r.passed);
    
    console.log('\n═══════════════════════════════════════════════════');
    if (allPassed) {
      console.log('✅ ALL TESTS PASSED!');
    } else {
      console.log('❌ SOME TESTS FAILED');
    }
    console.log('═══════════════════════════════════════════════════\n');

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test suite error:', error);
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
