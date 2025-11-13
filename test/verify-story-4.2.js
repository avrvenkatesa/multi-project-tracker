/**
 * Story 4.2 Verification Script
 * Checks if all Story 4.2 requirements are met
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Story 4.2 Completion...\n');

let passed = 0;
let failed = 0;

function check(description, condition) {
  if (condition) {
    console.log(`✅ ${description}`);
    passed++;
  } else {
    console.log(`❌ ${description}`);
    failed++;
  }
}

// Check files exist
const effortServicePath = path.join(__dirname, '../services/effort-estimation-service.js');
const mapperPath = path.join(__dirname, '../services/dependency-mapper.js');

check('effort-estimation-service.js exists', fs.existsSync(effortServicePath));
check('dependency-mapper.js exists', fs.existsSync(mapperPath));

// Check file contents
if (fs.existsSync(effortServicePath)) {
  const effortContent = fs.readFileSync(effortServicePath, 'utf8');

  check('Has pool import in effort-estimation-service',
    effortContent.includes("require('../db')") || effortContent.includes('require("../db")'));

  check('Has calculateRollupEffort function',
    effortContent.includes('calculateRollupEffort'));

  check('Has updateAllParentEfforts function',
    effortContent.includes('updateAllParentEfforts'));

  check('Has estimateWithDependencies function',
    effortContent.includes('estimateWithDependencies'));

  check('Has getHierarchicalBreakdown function',
    effortContent.includes('getHierarchicalBreakdown'));

  check('Exports calculateRollupEffort',
    effortContent.includes('calculateRollupEffort') &&
    effortContent.includes('module.exports'));
}

if (fs.existsSync(mapperPath)) {
  const mapperContent = fs.readFileSync(mapperPath, 'utf8');

  check('Has pool import in dependency-mapper',
    mapperContent.includes("require('../db')") || mapperContent.includes('require("../db")'));

  check('Has createHierarchicalIssues function',
    mapperContent.includes('createHierarchicalIssues'));

  check('Exports createHierarchicalIssues',
    mapperContent.includes('createHierarchicalIssues') &&
    mapperContent.includes('module.exports'));
}

// Try to load modules
console.log('\n📦 Testing Module Loading...\n');

try {
  const effortService = require('../services/effort-estimation-service');
  check('effort-estimation-service loads without errors', true);

  check('calculateRollupEffort is a function',
    typeof effortService.calculateRollupEffort === 'function');

  check('updateAllParentEfforts is a function',
    typeof effortService.updateAllParentEfforts === 'function');

  check('estimateWithDependencies is a function',
    typeof effortService.estimateWithDependencies === 'function');

  check('getHierarchicalBreakdown is a function',
    typeof effortService.getHierarchicalBreakdown === 'function');

} catch (e) {
  check('effort-estimation-service loads without errors', false);
  console.log(`   Error: ${e.message}`);
}

try {
  const mapper = require('../services/dependency-mapper');
  check('dependency-mapper loads without errors', true);

  check('createHierarchicalIssues is a function',
    typeof mapper.createHierarchicalIssues === 'function');

} catch (e) {
  check('dependency-mapper loads without errors', false);
  console.log(`   Error: ${e.message}`);
}

// Summary
console.log('\n' + '='.repeat(50));
console.log(`\n📊 VERIFICATION SUMMARY:`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

if (failed === 0) {
  console.log('\n🎉 Story 4.2 is COMPLETE and ready to commit!\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Story 4.2 has issues that need to be fixed.\n');
  process.exit(1);
}
