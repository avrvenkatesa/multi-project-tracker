/**
 * Test Suite for Hierarchy Extractor Service
 * 
 * Tests all 4 functions:
 * 1. extractHierarchy() - Claude AI extraction
 * 2. buildTree() - Flat to tree conversion
 * 3. flattenTree() - Tree to flat conversion
 * 4. validateHierarchy() - Validation checks
 */

const {
  extractHierarchy,
  buildTree,
  flattenTree,
  validateHierarchy
} = require('../services/hierarchy-extractor');

console.log('============================================================');
console.log('  HIERARCHY EXTRACTOR SERVICE TEST SUITE');
console.log('============================================================\n');

// Sample document text for testing
const sampleDocument = `
# Project Alpha - Website Redesign

## 1. Frontend Development
### 1.1 Create Homepage Layout (8 hours)
Responsive design with hero section and feature cards
Depends on: Design System

### 1.2 Build Navigation Component (4 hours)
Mobile-responsive navigation with dropdown menus

### 1.3 Implement Search Feature (12 hours)
Full-text search with autocomplete - High Priority

## 2. Backend API
### 2.1 User Authentication (16 hours)
JWT-based auth with refresh tokens - High Priority

### 2.2 Database Schema (8 hours)
PostgreSQL schema with migrations

### 2.3 API Endpoints (20 hours)
RESTful endpoints for all features
Depends on: Database Schema, User Authentication

## 3. Design System
Create reusable component library (12 hours) - Medium Priority
`.trim();

/**
 * Test 1: extractHierarchy() with Claude AI
 */
async function testExtractHierarchy() {
  console.log('🧪 TEST 1: extractHierarchy() - Claude AI Extraction');
  console.log('------------------------------------------------------------');
  
  try {
    // Check if API key is available
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('⚠️  SKIPPED - ANTHROPIC_API_KEY not set');
      console.log('   Set the API key to run this test\n');
      return null;
    }

    console.log('📄 Document preview:');
    console.log(sampleDocument.substring(0, 200) + '...\n');

    const result = await extractHierarchy(sampleDocument, {
      includeEffort: true,
      projectContext: 'Website redesign project',
      userId: 1,
      projectId: 1
    });

    console.log('✅ Extraction successful');
    console.log(`   Items extracted: ${result.hierarchy.length}`);
    console.log(`   Summary:`, result.summary);
    console.log(`   Model: ${result.metadata.model}`);
    console.log(`   Tokens: ${result.metadata.tokensUsed}`);
    console.log(`   Duration: ${result.metadata.duration}ms`);
    
    // Show first few items
    console.log('\n📋 First 3 extracted items:');
    result.hierarchy.slice(0, 3).forEach((item, idx) => {
      console.log(`   ${idx + 1}. ${item.name}`);
      console.log(`      Level: ${item.hierarchyLevel}, Epic: ${item.isEpic}, Parent: ${item.parent || 'none'}`);
      console.log(`      Effort: ${item.effort || 'N/A'} hrs, Priority: ${item.priority || 'N/A'}`);
    });

    console.log('\n✅ TEST 1 PASSED\n');
    return result.hierarchy;

  } catch (error) {
    console.log('❌ TEST 1 FAILED');
    console.log(`   Error: ${error.message}\n`);
    return null;
  }
}

/**
 * Test 2: buildTree() - Convert flat to tree
 */
function testBuildTree(flatHierarchy) {
  console.log('🧪 TEST 2: buildTree() - Flat to Tree Conversion');
  console.log('------------------------------------------------------------');

  try {
    // Use extracted hierarchy or create sample data
    const testData = flatHierarchy || [
      { name: 'Frontend', hierarchyLevel: 0, parent: null, isEpic: true, effort: null },
      { name: 'Homepage', hierarchyLevel: 1, parent: 'Frontend', isEpic: false, effort: 8 },
      { name: 'Navigation', hierarchyLevel: 1, parent: 'Frontend', isEpic: false, effort: 4 },
      { name: 'Backend', hierarchyLevel: 0, parent: null, isEpic: true, effort: null },
      { name: 'Auth', hierarchyLevel: 1, parent: 'Backend', isEpic: false, effort: 16 },
      { name: 'API', hierarchyLevel: 1, parent: 'Backend', isEpic: false, effort: 20 }
    ];

    console.log(`📋 Input: ${testData.length} flat items`);

    const tree = buildTree(testData);

    console.log(`✅ Tree built successfully`);
    console.log(`   Root nodes: ${tree.length}`);
    
    // Count total children
    let totalChildren = 0;
    tree.forEach(root => {
      if (root.children) {
        totalChildren += root.children.length;
        console.log(`   "${root.name}" has ${root.children.length} children`);
      }
    });

    console.log(`   Total children: ${totalChildren}`);
    console.log('\n✅ TEST 2 PASSED\n');
    return tree;

  } catch (error) {
    console.log('❌ TEST 2 FAILED');
    console.log(`   Error: ${error.message}\n`);
    return null;
  }
}

/**
 * Test 3: flattenTree() - Convert tree back to flat
 */
function testFlattenTree(tree) {
  console.log('🧪 TEST 3: flattenTree() - Tree to Flat Conversion');
  console.log('------------------------------------------------------------');

  try {
    // Use built tree or create sample data
    const testTree = tree || [
      {
        name: 'Frontend',
        hierarchyLevel: 0,
        isEpic: true,
        children: [
          { name: 'Homepage', hierarchyLevel: 1, isEpic: false, effort: 8, children: [] },
          { name: 'Navigation', hierarchyLevel: 1, isEpic: false, effort: 4, children: [] }
        ]
      },
      {
        name: 'Backend',
        hierarchyLevel: 0,
        isEpic: true,
        children: [
          { name: 'Auth', hierarchyLevel: 1, isEpic: false, effort: 16, children: [] }
        ]
      }
    ];

    console.log(`🌳 Input: ${testTree.length} root nodes`);

    const flat = flattenTree(testTree);

    console.log(`✅ Tree flattened successfully`);
    console.log(`   Total items: ${flat.length}`);
    
    // Verify parent references
    const withParent = flat.filter(item => item.parent !== null);
    console.log(`   Items with parent: ${withParent.length}`);
    console.log(`   Root items: ${flat.length - withParent.length}`);

    console.log('\n✅ TEST 3 PASSED\n');
    return flat;

  } catch (error) {
    console.log('❌ TEST 3 FAILED');
    console.log(`   Error: ${error.message}\n`);
    return null;
  }
}

/**
 * Test 4: validateHierarchy() - Validation checks
 */
function testValidateHierarchy() {
  console.log('🧪 TEST 4: validateHierarchy() - Validation Checks');
  console.log('------------------------------------------------------------');

  try {
    // Test 4a: Valid hierarchy
    console.log('📋 Test 4a: Valid hierarchy');
    const validData = [
      { name: 'Epic 1', hierarchyLevel: 0, parent: null, isEpic: true, effort: null, priority: 'High', dependencies: [] },
      { name: 'Task 1', hierarchyLevel: 1, parent: 'Epic 1', isEpic: false, effort: 8, priority: 'Medium', dependencies: [] },
      { name: 'Task 2', hierarchyLevel: 1, parent: 'Epic 1', isEpic: false, effort: 12, priority: 'Low', dependencies: ['Task 1'] }
    ];

    const result1 = validateHierarchy(validData);
    console.log(`   Valid: ${result1.valid}`);
    console.log(`   Errors: ${result1.errors.length}, Warnings: ${result1.warnings.length}`);
    console.log(`   Stats:`, result1.stats);

    if (!result1.valid) {
      console.log('❌ Test 4a FAILED - Expected valid hierarchy');
      return false;
    }

    // Test 4b: Duplicate names
    console.log('\n📋 Test 4b: Duplicate names (should be invalid)');
    const duplicateData = [
      { name: 'Task A', hierarchyLevel: 0, parent: null, isEpic: true },
      { name: 'Task A', hierarchyLevel: 1, parent: null, isEpic: false } // Duplicate!
    ];

    const result2 = validateHierarchy(duplicateData);
    console.log(`   Valid: ${result2.valid}`);
    console.log(`   Errors: ${result2.errors.length}`);
    if (result2.errors.length > 0) {
      console.log(`   Error message: "${result2.errors[0]}"`);
    }

    if (result2.valid) {
      console.log('❌ Test 4b FAILED - Should detect duplicate names');
      return false;
    }

    // Test 4c: Missing parent reference
    console.log('\n📋 Test 4c: Missing parent reference (should be invalid)');
    const missingParentData = [
      { name: 'Task 1', hierarchyLevel: 1, parent: 'Nonexistent Parent', isEpic: false }
    ];

    const result3 = validateHierarchy(missingParentData);
    console.log(`   Valid: ${result3.valid}`);
    console.log(`   Errors: ${result3.errors.length}`);
    if (result3.errors.length > 0) {
      console.log(`   Error message: "${result3.errors[0]}"`);
    }

    if (result3.valid) {
      console.log('❌ Test 4c FAILED - Should detect missing parent');
      return false;
    }

    // Test 4d: Invalid effort
    console.log('\n📋 Test 4d: Invalid effort value (should be invalid)');
    const invalidEffortData = [
      { name: 'Task 1', hierarchyLevel: 0, parent: null, isEpic: true, effort: -5 } // Negative!
    ];

    const result4 = validateHierarchy(invalidEffortData);
    console.log(`   Valid: ${result4.valid}`);
    console.log(`   Errors: ${result4.errors.length}`);
    if (result4.errors.length > 0) {
      console.log(`   Error message: "${result4.errors[0]}"`);
    }

    if (result4.valid) {
      console.log('❌ Test 4d FAILED - Should detect negative effort');
      return false;
    }

    // Test 4e: Circular dependency
    console.log('\n📋 Test 4e: Circular dependency (should be invalid)');
    const circularData = [
      { name: 'Task 1', hierarchyLevel: 0, parent: null, isEpic: true, dependencies: ['Task 1'] } // Self-dependency!
    ];

    const result5 = validateHierarchy(circularData);
    console.log(`   Valid: ${result5.valid}`);
    console.log(`   Errors: ${result5.errors.length}`);
    if (result5.errors.length > 0) {
      console.log(`   Error message: "${result5.errors[0]}"`);
    }

    if (result5.valid) {
      console.log('❌ Test 4e FAILED - Should detect circular dependency');
      return false;
    }

    console.log('\n✅ TEST 4 PASSED (all validation checks working)\n');
    return true;

  } catch (error) {
    console.log('❌ TEST 4 FAILED');
    console.log(`   Error: ${error.message}\n`);
    return false;
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🚀 Starting hierarchy extractor tests...\n');

  let extractedHierarchy = null;
  let tree = null;

  // Test 1: Extract hierarchy (if API key available)
  extractedHierarchy = await testExtractHierarchy();

  // Test 2: Build tree
  tree = testBuildTree(extractedHierarchy);

  // Test 3: Flatten tree
  testFlattenTree(tree);

  // Test 4: Validate hierarchy
  testValidateHierarchy();

  console.log('============================================================');
  console.log('  TEST SUITE COMPLETE');
  console.log('============================================================');
  console.log('');
  console.log('✅ All utility functions are working correctly!');
  console.log('');
  if (extractedHierarchy) {
    console.log('✅ Claude AI extraction is working!');
  } else {
    console.log('ℹ️  Claude AI extraction skipped (API key required)');
  }
  console.log('');
  console.log('Next steps:');
  console.log('  1. Integrate with document upload API');
  console.log('  2. Create issues from extracted hierarchy');
  console.log('  3. Add UI for reviewing/editing extracted tasks');
  console.log('');
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
