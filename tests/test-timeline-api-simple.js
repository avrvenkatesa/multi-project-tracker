/**
 * Simple Timeline Extraction API Verification
 * 
 * Verifies that the endpoint exists and returns proper error codes
 * Run with: node tests/test-timeline-api-simple.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function testEndpoint() {
  console.log('=== TIMELINE EXTRACTION API ENDPOINT VERIFICATION ===\n');

  try {
    // Test 1: Verify endpoint exists (should return 401 without auth)
    console.log('Test 1: Verify endpoint exists and requires authentication...');
    try {
      await axios.post(
        `${BASE_URL}/api/projects/1/extract-timeline`,
        {
          documentText: 'Test'
        }
      );
      console.log('❌ Should have returned 401 for missing auth');
      process.exit(1);
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✓ Endpoint exists and requires authentication (401)');
      } else {
        console.error('❌ Unexpected error:', error.response?.status, error.response?.data);
        process.exit(1);
      }
    }

    // Test 2: Verify server is running and responsive
    console.log('\nTest 2: Verify server health...');
    const healthResponse = await axios.get(`${BASE_URL}/api/health`);
    console.log('✓ Server is healthy:', healthResponse.data);

    console.log('\n✅ All endpoint verification tests passed!');
    console.log('\n📋 Summary:');
    console.log('  - Endpoint: POST /api/projects/:projectId/extract-timeline');
    console.log('  - Authentication: Required ✓');
    console.log('  - Server Status: Running ✓');
    console.log('\n💡 To test with actual data, authenticate first:');
    console.log('   1. Create/login with valid user credentials');
    console.log('   2. Use the returned JWT token in Authorization header');
    console.log('   3. POST timeline document text to the endpoint');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Verification failed!');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    process.exit(1);
  }
}

testEndpoint();
