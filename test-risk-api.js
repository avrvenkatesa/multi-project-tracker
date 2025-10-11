const axios = require('axios');

const API_BASE = 'http://localhost:5000/api';

// Test configuration
const testUser = {
  email: 'admin@example.com',
  password: 'admin123'
};

let authCookie = '';
let projectId = null;
let riskId = null;

async function testRiskRegisterAPI() {
  console.log('🧪 Testing Risk Register API Endpoints\n');
  
  try {
    // Step 1: Login to get authentication cookie
    console.log('1️⃣  Testing Login...');
    const loginRes = await axios.post(`${API_BASE}/auth/login`, testUser, {
      withCredentials: true
    });
    
    // Extract cookie from response headers
    const cookies = loginRes.headers['set-cookie'];
    if (cookies && cookies.length > 0) {
      authCookie = cookies.find(c => c.startsWith('token='));
      console.log('   ✅ Login successful, cookie obtained\n');
    } else {
      console.log('   ❌ No authentication cookie received\n');
      return;
    }
    
    // Step 2: Get projects to find a project ID
    console.log('2️⃣  Getting projects...');
    const projectsRes = await axios.get(`${API_BASE}/projects`, {
      headers: { Cookie: authCookie },
      withCredentials: true
    });
    
    if (projectsRes.data.length > 0) {
      projectId = projectsRes.data[0].id;
      console.log(`   ✅ Found project ID: ${projectId}\n`);
    } else {
      console.log('   ⚠️  No projects found. Please create a project first.\n');
      return;
    }
    
    // Step 3: Test GET risk categories
    console.log('3️⃣  Testing GET /api/projects/:projectId/risk-categories...');
    const categoriesRes = await axios.get(`${API_BASE}/projects/${projectId}/risk-categories`, {
      headers: { Cookie: authCookie },
      withCredentials: true
    });
    console.log(`   ✅ Retrieved ${categoriesRes.data.length} risk categories`);
    console.log(`   Categories: ${categoriesRes.data.map(c => c.name).join(', ')}\n`);
    
    // Step 4: Test POST create risk
    console.log('4️⃣  Testing POST /api/projects/:projectId/risks...');
    const newRisk = {
      title: 'Test Risk - API Verification',
      description: 'This is a test risk created via API testing',
      category: 'Technical',
      probability: 3,
      impact: 4,
      response_strategy: 'Mitigate',
      mitigation_plan: 'Implement proper testing procedures',
      status: 'identified'
    };
    
    const createRes = await axios.post(`${API_BASE}/projects/${projectId}/risks`, newRisk, {
      headers: { Cookie: authCookie },
      withCredentials: true
    });
    
    riskId = createRes.data.id;
    console.log(`   ✅ Risk created successfully`);
    console.log(`   Risk ID: ${createRes.data.risk_id}`);
    console.log(`   Risk Score: ${createRes.data.risk_score}`);
    console.log(`   Risk Level: ${createRes.data.risk_level}\n`);
    
    // Step 5: Test GET risks for project
    console.log('5️⃣  Testing GET /api/projects/:projectId/risks...');
    const risksRes = await axios.get(`${API_BASE}/projects/${projectId}/risks`, {
      headers: { Cookie: authCookie },
      withCredentials: true
    });
    console.log(`   ✅ Retrieved ${risksRes.data.length} risk(s) for project\n`);
    
    // Step 6: Test GET single risk
    console.log('6️⃣  Testing GET /api/risks/:riskId...');
    const riskRes = await axios.get(`${API_BASE}/risks/${riskId}`, {
      headers: { Cookie: authCookie },
      withCredentials: true
    });
    console.log(`   ✅ Retrieved risk details`);
    console.log(`   Title: ${riskRes.data.title}`);
    console.log(`   Status: ${riskRes.data.status}\n`);
    
    // Step 7: Test PATCH update risk
    console.log('7️⃣  Testing PATCH /api/risks/:riskId...');
    const updateData = {
      status: 'mitigating',
      probability: 2,
      impact: 3
    };
    
    const updateRes = await axios.patch(`${API_BASE}/risks/${riskId}`, updateData, {
      headers: { Cookie: authCookie },
      withCredentials: true
    });
    console.log(`   ✅ Risk updated successfully`);
    console.log(`   New Status: ${updateRes.data.status}`);
    console.log(`   New Score: ${updateRes.data.risk_score}`);
    console.log(`   New Level: ${updateRes.data.risk_level}\n`);
    
    // Step 8: Test DELETE risk
    console.log('8️⃣  Testing DELETE /api/risks/:riskId...');
    const deleteRes = await axios.delete(`${API_BASE}/risks/${riskId}`, {
      headers: { Cookie: authCookie },
      withCredentials: true
    });
    console.log(`   ✅ ${deleteRes.data.message}\n`);
    
    console.log('✅ All Risk Register API tests passed successfully! 🎉\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  }
}

// Run tests
testRiskRegisterAPI();
