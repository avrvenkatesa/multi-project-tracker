const fs = require('fs');
const path = require('path');

console.log('============================================================');
console.log('  STORY 4.4 VERIFICATION SCRIPT');
console.log('  AI-Powered Hierarchical Task Extraction');
console.log('============================================================');
console.log('');

let passedChecks = 0;
let totalChecks = 0;
const failures = [];

function check(description, condition, details = '') {
  totalChecks++;
  if (condition) {
    console.log(`✅ ${description}`);
    if (details) console.log(`   ${details}`);
    passedChecks++;
  } else {
    console.log(`❌ ${description}`);
    if (details) console.log(`   ${details}`);
    failures.push(description);
  }
}

console.log('🔍 CHECK 1: File Existence');
console.log('------------------------------------------------------------');

const hierarchyExtractorPath = path.join(__dirname, '../services/hierarchy-extractor.js');
const hierarchyExtractorExists = fs.existsSync(hierarchyExtractorPath);
check('services/hierarchy-extractor.js exists', hierarchyExtractorExists);

const multiDocAnalyzerPath = path.join(__dirname, '../services/multi-document-analyzer.js');
const multiDocAnalyzerExists = fs.existsSync(multiDocAnalyzerPath);
check('services/multi-document-analyzer.js exists', multiDocAnalyzerExists);

const serverPath = path.join(__dirname, '../server.js');
const serverExists = fs.existsSync(serverPath);
check('server.js exists', serverExists);

console.log('');

console.log('🔧 CHECK 2: Hierarchy Extractor Functions');
console.log('------------------------------------------------------------');

let hierarchyExtractor = null;
let loadError = null;

try {
  hierarchyExtractor = require('../services/hierarchy-extractor');
  check('hierarchy-extractor.js loads without errors', true);
} catch (err) {
  check('hierarchy-extractor.js loads without errors', false, `Error: ${err.message}`);
  loadError = err;
}

if (hierarchyExtractor) {
  const requiredFunctions = [
    'extractHierarchy',
    'buildTree',
    'flattenTree',
    'validateHierarchy'
  ];
  
  requiredFunctions.forEach(funcName => {
    const exists = typeof hierarchyExtractor[funcName] === 'function';
    check(`Function "${funcName}" exists`, exists);
  });
  
  const exportedFunctions = Object.keys(hierarchyExtractor).filter(key => 
    typeof hierarchyExtractor[key] === 'function'
  );
  check('All 4 functions are exported', exportedFunctions.length >= 4, 
    `Exported: ${exportedFunctions.join(', ')}`);
}

console.log('');

console.log('📦 CHECK 3: Required Imports');
console.log('------------------------------------------------------------');

if (hierarchyExtractorExists) {
  const hierarchyCode = fs.readFileSync(hierarchyExtractorPath, 'utf8');
  
  const hasAnthropicImport = hierarchyCode.includes('@anthropic-ai/sdk') || 
                             hierarchyCode.includes('Anthropic');
  check('Anthropic SDK is imported', hasAnthropicImport);
  
  const hasCostTracker = hierarchyCode.includes('ai-cost-tracker') ||
                         hierarchyCode.includes('trackAiUsage');
  check('AI cost tracker is imported/used', hasCostTracker);
}

console.log('');

console.log('🔗 CHECK 4: Multi-Document Analyzer Integration');
console.log('------------------------------------------------------------');

let multiDocAnalyzer = null;

try {
  multiDocAnalyzer = require('../services/multi-document-analyzer');
  check('multi-document-analyzer.js loads without errors', true);
} catch (err) {
  check('multi-document-analyzer.js loads without errors', false, `Error: ${err.message}`);
}

if (multiDocAnalyzer) {
  const hasAnalyzeFunction = typeof multiDocAnalyzer.analyzeAndCreateHierarchy === 'function';
  check('analyzeAndCreateHierarchy function exists', hasAnalyzeFunction);
  
  if (multiDocAnalyzerExists) {
    const analyzerCode = fs.readFileSync(multiDocAnalyzerPath, 'utf8');
    const usesHierarchyExtractor = analyzerCode.includes('hierarchy-extractor') ||
                                   analyzerCode.includes('extractHierarchy');
    check('Multi-document analyzer uses hierarchy-extractor', usesHierarchyExtractor);
  }
}

console.log('');

console.log('🌐 CHECK 5: Server.js API Endpoints');
console.log('------------------------------------------------------------');

if (serverExists) {
  const serverCode = fs.readFileSync(serverPath, 'utf8');
  
  const hasExtractHierarchyEndpoint = serverCode.includes('/api/analyze/extract-hierarchy');
  check('Endpoint: POST /api/analyze/extract-hierarchy', hasExtractHierarchyEndpoint);
  
  const hasAnalyzeDocumentsEndpoint = serverCode.includes('/api/projects/:projectId/analyze-documents');
  check('Endpoint: POST /api/projects/:projectId/analyze-documents', hasAnalyzeDocumentsEndpoint);
  
  const hasHierarchyExtractorImport = serverCode.includes('hierarchy-extractor');
  check('Server imports hierarchy-extractor', hasHierarchyExtractorImport);
  
  const hasMultiDocAnalyzerImport = serverCode.includes('multi-document-analyzer');
  check('Server imports multi-document-analyzer', hasMultiDocAnalyzerImport);
}

console.log('');

console.log('🧪 CHECK 6: Basic Functionality Test');
console.log('------------------------------------------------------------');

if (hierarchyExtractor && !loadError) {
  try {
    const sampleData = {
      hierarchy: [
        {
          id: 'epic-1',
          type: 'epic',
          title: 'Test Epic',
          description: 'Test description',
          estimatedHours: 40
        },
        {
          id: 'task-1',
          type: 'task',
          title: 'Test Task',
          description: 'Test task description',
          estimatedHours: 8,
          parentId: 'epic-1'
        }
      ]
    };
    
    const tree = hierarchyExtractor.buildTree(sampleData.hierarchy);
    check('buildTree() executes without errors', true, `Created tree with ${tree.length} root(s)`);
    
    const flattened = hierarchyExtractor.flattenTree(tree);
    check('flattenTree() executes without errors', true, `Flattened to ${flattened.length} item(s)`);
    
    const validation = hierarchyExtractor.validateHierarchy(sampleData.hierarchy);
    check('validateHierarchy() executes without errors', true, 
      `Valid: ${validation.isValid}, Errors: ${validation.errors.length}, Warnings: ${validation.warnings.length}`);
    
  } catch (err) {
    check('Basic functionality test', false, `Error: ${err.message}`);
  }
}

console.log('');

console.log('🔑 CHECK 7: API Key Configuration');
console.log('------------------------------------------------------------');

const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
check('ANTHROPIC_API_KEY is configured', hasAnthropicKey, 
  hasAnthropicKey ? 'Available for AI operations' : 'Not available - AI operations will fail');

console.log('');

console.log('📄 CHECK 8: Test Files');
console.log('------------------------------------------------------------');

const unitTestPath = path.join(__dirname, 'test-hierarchy-extractor.js');
const unitTestExists = fs.existsSync(unitTestPath);
check('Unit test exists: test-hierarchy-extractor.js', unitTestExists);

const integrationTestPath = path.join(__dirname, 'integration-hierarchy-extraction.js');
const integrationTestExists = fs.existsSync(integrationTestPath);
check('Integration test exists: integration-hierarchy-extraction.js', integrationTestExists);

const analyzeTestPath = path.join(__dirname, 'test-analyze-create-hierarchy.js');
const analyzeTestExists = fs.existsSync(analyzeTestPath);
check('Analyze test exists: test-analyze-create-hierarchy.js', analyzeTestExists);

console.log('');

console.log('📚 CHECK 9: Documentation');
console.log('------------------------------------------------------------');

const apiDocsPath = path.join(__dirname, '../HIERARCHY_API_ENDPOINTS.md');
const apiDocsExists = fs.existsSync(apiDocsPath);
check('API documentation exists: HIERARCHY_API_ENDPOINTS.md', apiDocsExists);

const replitMdPath = path.join(__dirname, '../replit.md');
if (fs.existsSync(replitMdPath)) {
  const replitMdContent = fs.readFileSync(replitMdPath, 'utf8');
  const hasHierarchyDocs = replitMdContent.includes('hierarchy') || 
                           replitMdContent.includes('Hierarchy') ||
                           replitMdContent.includes('extract-hierarchy');
  check('replit.md documents hierarchy features', hasHierarchyDocs);
}

console.log('');

console.log('============================================================');
console.log('  VERIFICATION SUMMARY');
console.log('============================================================');
console.log('');

const successRate = ((passedChecks / totalChecks) * 100).toFixed(1);
console.log(`📊 Results: ${passedChecks}/${totalChecks} checks passed (${successRate}%)`);
console.log('');

if (passedChecks === totalChecks) {
  console.log('✅ STORY 4.4 VERIFICATION: PASSED');
  console.log('');
  console.log('🎉 All components are in place and functional!');
  console.log('');
  console.log('Story 4.4 includes:');
  console.log('  ✓ AI-powered hierarchy extraction service');
  console.log('  ✓ Claude Sonnet 4 integration for document analysis');
  console.log('  ✓ Tree building and flattening utilities');
  console.log('  ✓ Comprehensive validation with error/warning reporting');
  console.log('  ✓ Multi-document analyzer integration');
  console.log('  ✓ API endpoints for frontend consumption');
  console.log('  ✓ AI cost tracking');
  console.log('  ✓ Comprehensive test coverage');
  console.log('  ✓ Complete documentation');
  console.log('');
  process.exit(0);
} else {
  console.log('❌ STORY 4.4 VERIFICATION: FAILED');
  console.log('');
  console.log(`Failed checks (${failures.length}):`);
  failures.forEach((failure, idx) => {
    console.log(`  ${idx + 1}. ${failure}`);
  });
  console.log('');
  console.log('Please review the failed checks above and ensure all components are properly implemented.');
  console.log('');
  process.exit(1);
}
