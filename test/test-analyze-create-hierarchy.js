/**
 * Test for analyzeAndCreateHierarchy() Integration
 * 
 * Tests the end-to-end workflow:
 * 1. Document combination
 * 2. AI hierarchy extraction
 * 3. Validation
 * 4. Issue creation in database
 */

const multiDocAnalyzer = require('../services/multi-document-analyzer');

console.log('============================================================');
console.log('  ANALYZE AND CREATE HIERARCHY TEST');
console.log('============================================================\n');

// Sample documents for testing
const sampleDocuments = [
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
 * Main test function
 */
async function testAnalyzeAndCreateHierarchy() {
  console.log('🧪 Testing analyzeAndCreateHierarchy() workflow\n');
  
  // Test configuration
  const projectId = 1;  // Assume test project exists
  const userId = 1;     // Assume test user exists
  
  console.log('📋 Test Configuration:');
  console.log(`   Project ID: ${projectId}`);
  console.log(`   User ID: ${userId}`);
  console.log(`   Documents: ${sampleDocuments.length}`);
  console.log('');

  try {
    // Check if ANTHROPIC_API_KEY is available
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('⚠️  SKIPPED - ANTHROPIC_API_KEY not set');
      console.log('   This test requires Claude AI API access');
      console.log('   Set ANTHROPIC_API_KEY environment variable to run this test\n');
      return;
    }

    console.log('🚀 Calling analyzeAndCreateHierarchy()...\n');
    console.log('════════════════════════════════════════════════════════\n');

    const result = await multiDocAnalyzer.analyzeAndCreateHierarchy(
      sampleDocuments,
      projectId,
      {
        userId,
        includeEffort: true,
        projectContext: 'E-commerce platform modernization project'
      }
    );

    console.log('\n════════════════════════════════════════════════════════\n');
    console.log('📊 RESULTS:\n');

    if (result.success) {
      console.log('✅ SUCCESS!\n');
      
      console.log('📈 Extraction Summary:');
      if (result.extraction && result.extraction.summary) {
        console.log(`   Total Items: ${result.extraction.summary.totalItems || 0}`);
        console.log(`   Epics: ${result.extraction.summary.epics || 0}`);
        console.log(`   Tasks: ${result.extraction.summary.tasks || 0}`);
        console.log(`   Total Effort: ${result.extraction.summary.totalEffort || 0} hours`);
      }
      console.log('');

      console.log('🔍 Validation:');
      console.log(`   Valid: ${result.validation.valid}`);
      console.log(`   Errors: ${result.validation.errors.length}`);
      console.log(`   Warnings: ${result.validation.warnings.length}`);
      if (result.validation.warnings.length > 0) {
        result.validation.warnings.forEach(w => console.log(`     • ${w}`));
      }
      console.log('');

      console.log('🏗️  Created Issues:');
      console.log(`   Total: ${result.created.total}`);
      console.log(`   Epics: ${result.created.epics}`);
      console.log(`   Tasks: ${result.created.tasks}`);
      console.log('');

      if (result.created.issues && result.created.issues.length > 0) {
        console.log('📋 Issue List:');
        result.created.issues.slice(0, 5).forEach((issue, idx) => {
          console.log(`   ${idx + 1}. [${issue.type}] ${issue.title} (ID: ${issue.id})`);
        });
        if (result.created.issues.length > 5) {
          console.log(`   ... and ${result.created.issues.length - 5} more`);
        }
        console.log('');
      }

      if (result.creationErrors && result.creationErrors.length > 0) {
        console.log('⚠️  Creation Errors:');
        result.creationErrors.forEach(err => console.log(`   • ${err}`));
        console.log('');
      }

      console.log('✅ TEST PASSED\n');

    } else {
      console.log('❌ FAILED\n');
      
      console.log('Errors:');
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach(err => console.log(`   • ${err}`));
      } else {
        console.log('   No error details available');
      }
      console.log('');

      if (result.warnings && result.warnings.length > 0) {
        console.log('Warnings:');
        result.warnings.forEach(warn => console.log(`   • ${warn}`));
        console.log('');
      }

      if (result.stats) {
        console.log('Statistics:');
        console.log(`   ${JSON.stringify(result.stats, null, 2)}`);
        console.log('');
      }

      console.log('❌ TEST FAILED\n');
    }

  } catch (error) {
    console.log('❌ TEST FAILED WITH EXCEPTION\n');
    console.log(`Error: ${error.message}`);
    console.log('');
    console.error(error.stack);
  }

  console.log('============================================================');
  console.log('  TEST COMPLETE');
  console.log('============================================================');
}

// Run the test
testAnalyzeAndCreateHierarchy().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
