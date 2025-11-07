/**
 * Test Timeline Extraction API Endpoint
 * 
 * Tests the POST /api/projects/:projectId/extract-timeline endpoint
 * Run with: node tests/test-timeline-api-endpoint.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

// Sample timeline document
const sampleDocument = `
PROJECT TIMELINE: E-Commerce Platform Migration

Phase 1: Planning & Analysis (Week 1-4)
- Requirements gathering
- System architecture design
- Risk assessment
Deliverables: Technical specification, Migration plan

Phase 2: Development (Month 2-4)
- Backend API development
- Database migration scripts
- Frontend updates
Deliverables: Migrated codebase, Test results

Phase 3: Testing & Deployment (Month 5-6)
- UAT testing
- Performance optimization
- Production rollout
Deliverables: Production deployment, Documentation

Milestones:
- Requirements Approval (Week 4)
- Development Complete (End of Phase 2)
- Go-Live (End of Phase 3)

Key Tasks:
- Task: Database Schema Design (Week 2-3, 10 days)
- Task: API Migration (Month 2-3, 30 days)
- Task: Performance Testing (Month 5, 15 days)
`;

async function testTimelineExtraction() {
  console.log('=== TIMELINE EXTRACTION API ENDPOINT TEST ===\n');

  try {
    // Step 1: Login to get auth token
    console.log('Step 1: Authenticating...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });

    const token = loginResponse.data.token;
    console.log('✓ Authentication successful\n');

    // Step 2: Test timeline extraction
    console.log('Step 2: Extracting timeline from document...');
    const extractResponse = await axios.post(
      `${BASE_URL}/api/projects/1/extract-timeline`,
      {
        documentText: sampleDocument,
        projectStartDate: '2025-01-01'
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const { success, timeline, aiCost } = extractResponse.data;

    console.log('✓ Timeline extraction successful!\n');
    console.log('Response:');
    console.log('  Success:', success);
    console.log('\nAI Cost Information:');
    console.log('  Method:', aiCost.method);
    console.log('  Tokens Used:', aiCost.tokensUsed);
    console.log('  Prompt Tokens:', aiCost.promptTokens);
    console.log('  Completion Tokens:', aiCost.completionTokens);
    console.log('  Cost (USD):', `$${aiCost.costUsd.toFixed(6)}`);

    console.log('\nExtracted Timeline:');
    console.log('-------------------');
    console.log(`Phases: ${timeline.phases.length}`);
    timeline.phases.forEach((phase, i) => {
      console.log(`  ${i + 1}. ${phase.name}`);
      console.log(`     Dates: ${phase.startDate} to ${phase.endDate}`);
      console.log(`     Deliverables: ${phase.deliverables?.length || 0}`);
    });

    console.log(`\nMilestones: ${timeline.milestones.length}`);
    timeline.milestones.forEach((milestone, i) => {
      console.log(`  ${i + 1}. ${milestone.name}`);
      console.log(`     Due: ${milestone.dueDate || 'TBD'}`);
    });

    console.log(`\nTasks: ${timeline.tasks.length}`);
    timeline.tasks.forEach((task, i) => {
      console.log(`  ${i + 1}. ${task.name}`);
      console.log(`     Phase: ${task.phase}`);
      console.log(`     Duration: ${task.duration} days`);
    });

    console.log('\n✅ All tests passed!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

// Test error handling
async function testErrorHandling() {
  console.log('\n=== ERROR HANDLING TESTS ===\n');

  try {
    console.log('Test 1: Missing documentText...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });

    const token = loginResponse.data.token;

    try {
      await axios.post(
        `${BASE_URL}/api/projects/1/extract-timeline`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('❌ Should have returned 400 error');
    } catch (err) {
      if (err.response && err.response.status === 400) {
        console.log('✓ Correctly returned 400 error for missing documentText');
        console.log('  Error message:', err.response.data.error);
      } else {
        throw err;
      }
    }

    console.log('\nTest 2: Unauthorized access (no token)...');
    try {
      await axios.post(
        `${BASE_URL}/api/projects/1/extract-timeline`,
        {
          documentText: 'Test'
        }
      );
      console.log('❌ Should have returned 401 error');
    } catch (err) {
      if (err.response && err.response.status === 401) {
        console.log('✓ Correctly returned 401 error for unauthorized access');
      } else {
        throw err;
      }
    }

    console.log('\n✅ Error handling tests passed!');

  } catch (error) {
    console.error('\n❌ Error handling test failed!');
    console.error('Error:', error.message);
  }
}

// Run tests
(async () => {
  await testTimelineExtraction();
  await testErrorHandling();
})();
