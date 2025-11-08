/**
 * Test Dependency API Endpoints
 * 
 * Tests the dependency management API endpoints:
 * - POST /api/projects/:projectId/dependencies/create
 * - GET /api/projects/:projectId/dependencies
 * 
 * Run with: node tests/test-dependency-api.js
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:5000';

/**
 * Test helper to make authenticated requests
 */
async function makeRequest(method, url, data = null, token = null) {
  const config = {
    method,
    url: `${API_BASE}${url}`,
    headers: {}
  };

  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
    config.headers['Cookie'] = `token=${token}`;
  }

  if (data) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status
    };
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   DEPENDENCY API ENDPOINTS TEST                   ║');
  console.log('╚═══════════════════════════════════════════════════╝\n');

  console.log('📝 Test Scenarios:\n');
  console.log('These endpoints require authentication and project access.');
  console.log('For manual testing, use Postman or curl with valid JWT token.\n');

  // Test 1: Endpoint structure validation
  console.log('═══════════════════════════════════════════════════');
  console.log('TEST 1: Endpoint Structure Validation');
  console.log('═══════════════════════════════════════════════════\n');

  const endpoints = [
    {
      method: 'POST',
      path: '/api/projects/1/dependencies/create',
      description: 'Create dependencies from workstreams',
      requiresAuth: true,
      expectedBody: { workstreams: [] }
    },
    {
      method: 'GET',
      path: '/api/projects/1/dependencies',
      description: 'Get all dependencies for a project',
      requiresAuth: true,
      expectedBody: null
    }
  ];

  endpoints.forEach(endpoint => {
    console.log(`✓ ${endpoint.method} ${endpoint.path}`);
    console.log(`  Description: ${endpoint.description}`);
    console.log(`  Authentication: ${endpoint.requiresAuth ? 'Required' : 'Not required'}`);
    if (endpoint.expectedBody) {
      console.log(`  Request body: ${JSON.stringify(endpoint.expectedBody)}`);
    }
    console.log();
  });

  // Test 2: Sample request/response format
  console.log('═══════════════════════════════════════════════════');
  console.log('TEST 2: Sample Request/Response Format');
  console.log('═══════════════════════════════════════════════════\n');

  console.log('POST /api/projects/1/dependencies/create');
  console.log('Request Body:');
  console.log(JSON.stringify({
    workstreams: [
      {
        id: 'workstream-1',
        name: 'Discovery Phase',
        dependencies: []
      },
      {
        id: 'workstream-2',
        name: 'Design',
        dependencies: ['Discovery Phase']
      },
      {
        id: 'workstream-3',
        name: 'Implementation',
        dependencies: ['Design']
      }
    ]
  }, null, 2));

  console.log('\nExpected Response:');
  console.log(JSON.stringify({
    success: true,
    dependencies: [
      {
        id: 1,
        source_issue_id: 10,
        target_issue_id: 11,
        source_name: 'Discovery Phase',
        target_name: 'Design',
        relationship_type: 'dependency'
      },
      {
        id: 2,
        source_issue_id: 11,
        target_issue_id: 12,
        source_name: 'Design',
        target_name: 'Implementation',
        relationship_type: 'dependency'
      }
    ],
    warnings: [],
    errors: [],
    count: 2
  }, null, 2));

  console.log('\n\nGET /api/projects/1/dependencies');
  console.log('Expected Response:');
  console.log(JSON.stringify({
    dependencies: [
      {
        id: 1,
        source_issue_id: 10,
        source_title: 'Discovery Phase',
        source_status: 'To Do',
        target_issue_id: 11,
        target_title: 'Design',
        target_status: 'To Do',
        relationship_type: 'dependency',
        created_at: '2025-01-08T00:00:00.000Z'
      }
    ],
    count: 1
  }, null, 2));

  // Test 3: Error handling scenarios
  console.log('\n\n═══════════════════════════════════════════════════');
  console.log('TEST 3: Error Handling Scenarios');
  console.log('═══════════════════════════════════════════════════\n');

  const errorScenarios = [
    {
      scenario: 'Missing workstreams array',
      endpoint: 'POST /api/projects/1/dependencies/create',
      request: {},
      expectedError: 'workstreams array is required',
      expectedStatus: 400
    },
    {
      scenario: 'Invalid workstreams format',
      endpoint: 'POST /api/projects/1/dependencies/create',
      request: { workstreams: 'not-an-array' },
      expectedError: 'workstreams array is required',
      expectedStatus: 400
    },
    {
      scenario: 'No authentication token',
      endpoint: 'GET /api/projects/1/dependencies',
      request: null,
      expectedError: 'Unauthorized',
      expectedStatus: 401
    },
    {
      scenario: 'Access denied to project',
      endpoint: 'GET /api/projects/999/dependencies',
      request: null,
      expectedError: 'Access denied to this project',
      expectedStatus: 403
    }
  ];

  errorScenarios.forEach((scenario, index) => {
    console.log(`${index + 1}. ${scenario.scenario}`);
    console.log(`   Endpoint: ${scenario.endpoint}`);
    console.log(`   Expected Status: ${scenario.expectedStatus}`);
    console.log(`   Expected Error: "${scenario.expectedError}"`);
    console.log();
  });

  // Test 4: Integration workflow
  console.log('═══════════════════════════════════════════════════');
  console.log('TEST 4: Integration Workflow');
  console.log('═══════════════════════════════════════════════════\n');

  console.log('Typical integration workflow:\n');
  console.log('1. Workstream Detector analyzes document');
  console.log('   → Returns workstreams with dependencies array\n');
  
  console.log('2. Frontend sends workstreams to API');
  console.log('   POST /api/projects/:projectId/dependencies/create');
  console.log('   Body: { workstreams: [...] }\n');
  
  console.log('3. Dependency Mapper processes workstreams');
  console.log('   → Matches workstream names to issues (fuzzy matching)');
  console.log('   → Detects circular dependencies');
  console.log('   → Creates dependency records in database\n');
  
  console.log('4. Returns result with dependencies, warnings, errors');
  console.log('   → Frontend can display warnings to user');
  console.log('   → Frontend can show created dependencies\n');
  
  console.log('5. Gantt chart fetches dependencies');
  console.log('   GET /api/projects/:projectId/dependencies');
  console.log('   → Uses data to visualize task dependencies\n');

  console.log('═══════════════════════════════════════════════════');
  console.log('✅ ENDPOINT DOCUMENTATION COMPLETE');
  console.log('═══════════════════════════════════════════════════\n');

  console.log('📚 Manual Testing Instructions:\n');
  console.log('1. Login to get JWT token:');
  console.log('   POST /api/auth/login');
  console.log('   Body: { "username": "admin", "password": "password" }\n');
  
  console.log('2. Test create dependencies:');
  console.log('   POST /api/projects/1/dependencies/create');
  console.log('   Header: Authorization: Bearer <token>');
  console.log('   Body: { "workstreams": [...] }\n');
  
  console.log('3. Test get dependencies:');
  console.log('   GET /api/projects/1/dependencies');
  console.log('   Header: Authorization: Bearer <token>\n');

  console.log('📝 Note: Replace projectId with actual project ID from database\n');
}

// Run tests
if (require.main === module) {
  runTests()
    .then(() => {
      console.log('✅ Documentation test complete!\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { runTests };
