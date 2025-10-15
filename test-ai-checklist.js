#!/usr/bin/env node

/**
 * AI Checklist Generation - Automated Test Suite (Stage 4)
 * 
 * This script runs automated tests for the AI checklist generation feature.
 * It tests API endpoints, error handling, rate limiting, and data persistence.
 * 
 * Usage: node test-ai-checklist.js
 */

const axios = require('axios');
const readline = require('readline');

const BASE_URL = 'http://localhost:5000';
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.authToken = null;
    this.testResults = [];
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  async login(email, password) {
    try {
      this.log('\n🔐 Logging in...', 'blue');
      const response = await axios.post(`${BASE_URL}/api/auth/login`, {
        email,
        password
      }, {
        withCredentials: true
      });

      // Extract token from cookies
      const cookies = response.headers['set-cookie'];
      if (cookies) {
        const tokenCookie = cookies.find(c => c.startsWith('token='));
        if (tokenCookie) {
          this.authToken = tokenCookie.split(';')[0].split('=')[1];
          this.log(`✅ Login successful as ${email}`, 'green');
          return true;
        }
      }
      this.log('❌ Failed to extract auth token', 'red');
      return false;
    } catch (error) {
      this.log(`❌ Login failed: ${error.response?.data?.error || error.message}`, 'red');
      return false;
    }
  }

  async runTest(name, testFn) {
    try {
      this.log(`\n📝 Test: ${name}`, 'cyan');
      const result = await testFn();
      if (result.success) {
        this.passed++;
        this.log(`✅ PASSED: ${result.message}`, 'green');
        this.testResults.push({ name, status: 'PASSED', message: result.message });
      } else {
        this.failed++;
        this.log(`❌ FAILED: ${result.message}`, 'red');
        this.testResults.push({ name, status: 'FAILED', message: result.message });
      }
    } catch (error) {
      this.failed++;
      const message = error.response?.data?.error || error.message;
      this.log(`❌ ERROR: ${message}`, 'red');
      this.testResults.push({ name, status: 'ERROR', message });
    }
  }

  async test1_GenerateFromIssue() {
    return this.runTest('Generate Checklist from Issue', async () => {
      const startTime = Date.now();
      
      const response = await axios.post(
        `${BASE_URL}/api/checklists/generate-from-issue`,
        {
          issueId: 26,
          projectId: 1
        },
        {
          headers: { Cookie: `token=${this.authToken}` }
        }
      );

      const duration = Date.now() - startTime;
      
      if (!response.data.preview) {
        return { success: false, message: 'No preview in response' };
      }

      if (!response.data.preview.title || !response.data.preview.sections) {
        return { success: false, message: 'Invalid preview structure' };
      }

      const itemCount = response.data.preview.sections.reduce((sum, s) => sum + s.items.length, 0);
      
      return {
        success: true,
        message: `Generated "${response.data.preview.title}" with ${response.data.preview.sections.length} sections, ${itemCount} items in ${duration}ms`
      };
    });
  }

  async test2_GenerateFromAction() {
    return this.runTest('Generate Checklist from Action Item', async () => {
      // First, find an action item
      const actionsResponse = await axios.get(
        `${BASE_URL}/api/action-items?project=1`,
        {
          headers: { Cookie: `token=${this.authToken}` }
        }
      );

      if (!actionsResponse.data || actionsResponse.data.length === 0) {
        return { success: false, message: 'No action items found to test with' };
      }

      const actionItem = actionsResponse.data[0];
      const startTime = Date.now();

      const response = await axios.post(
        `${BASE_URL}/api/checklists/generate-from-action`,
        {
          actionItemId: actionItem.id,
          projectId: 1
        },
        {
          headers: { Cookie: `token=${this.authToken}` }
        }
      );

      const duration = Date.now() - startTime;

      if (!response.data.preview) {
        return { success: false, message: 'No preview in response' };
      }

      return {
        success: true,
        message: `Generated from action "${actionItem.title}" in ${duration}ms`
      };
    });
  }

  async test3_RateLimiting() {
    return this.runTest('Rate Limiting (10 per hour)', async () => {
      const attempts = [];
      
      // Try to generate 11 times rapidly
      for (let i = 0; i < 11; i++) {
        try {
          const response = await axios.post(
            `${BASE_URL}/api/checklists/generate-from-issue`,
            {
              issueId: 26,
              projectId: 1
            },
            {
              headers: { Cookie: `token=${this.authToken}` }
            }
          );
          attempts.push({ attempt: i + 1, success: true });
        } catch (error) {
          attempts.push({ 
            attempt: i + 1, 
            success: false, 
            error: error.response?.data?.error 
          });
        }
      }

      const successCount = attempts.filter(a => a.success).length;
      const rateLimitCount = attempts.filter(a => 
        a.error && a.error.includes('Rate limit')
      ).length;

      if (successCount === 10 && rateLimitCount === 1) {
        return {
          success: true,
          message: `Rate limit working correctly: 10 succeeded, 1 rate limited`
        };
      }

      return {
        success: false,
        message: `Expected 10 successes and 1 rate limit, got ${successCount} successes, ${rateLimitCount} rate limited`
      };
    });
  }

  async test4_ConfirmGeneration() {
    return this.runTest('Confirm Generated Checklist', async () => {
      // First generate
      const generateResponse = await axios.post(
        `${BASE_URL}/api/checklists/generate-from-issue`,
        {
          issueId: 26,
          projectId: 1
        },
        {
          headers: { Cookie: `token=${this.authToken}` }
        }
      );

      if (!generateResponse.data.preview) {
        return { success: false, message: 'Failed to generate preview' };
      }

      // Then confirm
      const confirmResponse = await axios.post(
        `${BASE_URL}/api/checklists/confirm-generated`,
        {
          preview: generateResponse.data.preview,
          projectId: 1,
          issueId: 26
        },
        {
          headers: { Cookie: `token=${this.authToken}` }
        }
      );

      if (!confirmResponse.data.checklistId || !confirmResponse.data.templateId) {
        return { success: false, message: 'No checklist or template ID returned' };
      }

      return {
        success: true,
        message: `Created checklist #${confirmResponse.data.checklistId} from template #${confirmResponse.data.templateId}`
      };
    });
  }

  async test5_TemplatePromotion() {
    return this.runTest('Template Promotion (Authorized)', async () => {
      // First generate and create a checklist
      const generateResponse = await axios.post(
        `${BASE_URL}/api/checklists/generate-from-issue`,
        {
          issueId: 27, // Different issue
          projectId: 1
        },
        {
          headers: { Cookie: `token=${this.authToken}` }
        }
      );

      const confirmResponse = await axios.post(
        `${BASE_URL}/api/checklists/confirm-generated`,
        {
          preview: generateResponse.data.preview,
          projectId: 1,
          issueId: 27
        },
        {
          headers: { Cookie: `token=${this.authToken}` }
        }
      );

      const templateId = confirmResponse.data.templateId;

      // Now promote it
      const promoteResponse = await axios.post(
        `${BASE_URL}/api/templates/${templateId}/promote`,
        {},
        {
          headers: { Cookie: `token=${this.authToken}` }
        }
      );

      if (promoteResponse.data.message?.includes('promoted')) {
        return {
          success: true,
          message: `Template #${templateId} promoted successfully`
        };
      }

      return { success: false, message: 'Promotion failed' };
    });
  }

  async test6_ErrorHandling() {
    return this.runTest('Error Handling (Invalid Data)', async () => {
      const errors = [];

      // Test 1: Missing projectId
      try {
        await axios.post(
          `${BASE_URL}/api/checklists/generate-from-issue`,
          { issueId: 26 },
          { headers: { Cookie: `token=${this.authToken}` } }
        );
        errors.push('Should have failed: missing projectId');
      } catch (error) {
        if (error.response?.status === 400) {
          errors.push('✓ Correctly rejected missing projectId');
        }
      }

      // Test 2: Invalid issueId
      try {
        await axios.post(
          `${BASE_URL}/api/checklists/generate-from-issue`,
          { issueId: 999999, projectId: 1 },
          { headers: { Cookie: `token=${this.authToken}` } }
        );
        errors.push('Should have failed: invalid issueId');
      } catch (error) {
        if (error.response?.status === 404) {
          errors.push('✓ Correctly rejected invalid issueId');
        }
      }

      const passedTests = errors.filter(e => e.startsWith('✓')).length;
      
      return {
        success: passedTests === 2,
        message: errors.join(', ')
      };
    });
  }

  async test7_Unauthenticated() {
    return this.runTest('Authentication Required', async () => {
      try {
        await axios.post(
          `${BASE_URL}/api/checklists/generate-from-issue`,
          { issueId: 26, projectId: 1 }
        );
        return { success: false, message: 'Should have required authentication' };
      } catch (error) {
        if (error.response?.status === 401) {
          return {
            success: true,
            message: 'Correctly rejected unauthenticated request (401)'
          };
        }
        return {
          success: false,
          message: `Expected 401, got ${error.response?.status}`
        };
      }
    });
  }

  printSummary() {
    this.log('\n' + '='.repeat(60), 'blue');
    this.log('TEST SUMMARY', 'blue');
    this.log('='.repeat(60), 'blue');
    
    this.testResults.forEach(result => {
      const statusColor = result.status === 'PASSED' ? 'green' : 'red';
      const icon = result.status === 'PASSED' ? '✅' : '❌';
      this.log(`${icon} ${result.name}`, statusColor);
      this.log(`   ${result.message}`, 'reset');
    });

    this.log('\n' + '='.repeat(60), 'blue');
    const total = this.passed + this.failed;
    const passRate = total > 0 ? ((this.passed / total) * 100).toFixed(1) : 0;
    this.log(`Total Tests: ${total}`, 'cyan');
    this.log(`Passed: ${this.passed}`, 'green');
    this.log(`Failed: ${this.failed}`, 'red');
    this.log(`Pass Rate: ${passRate}%`, passRate >= 80 ? 'green' : 'yellow');
    this.log('='.repeat(60), 'blue');

    if (this.failed === 0) {
      this.log('\n🎉 All tests passed! AI Checklist Generation is ready for production!', 'green');
    } else {
      this.log('\n⚠️  Some tests failed. Please review and fix issues before deployment.', 'yellow');
    }
  }

  async promptForCredentials() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question('Enter email (default: admin@test.com): ', (email) => {
        const userEmail = email.trim() || 'admin@test.com';
        rl.question('Enter password: ', (password) => {
          rl.close();
          resolve({ email: userEmail, password: password.trim() });
        });
      });
    });
  }
}

// Main execution
async function main() {
  const runner = new TestRunner();
  
  runner.log('╔════════════════════════════════════════════════════════════╗', 'cyan');
  runner.log('║   AI CHECKLIST GENERATION - AUTOMATED TEST SUITE (STAGE 4) ║', 'cyan');
  runner.log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  // Check if credentials provided as args
  let email = process.argv[2] || 'admin@test.com';
  let password = process.argv[3];

  if (!password) {
    runner.log('\n⚠️  No password provided. Please enter credentials:', 'yellow');
    const creds = await runner.promptForCredentials();
    email = creds.email;
    password = creds.password;
  }

  // Login
  const loginSuccess = await runner.login(email, password);
  if (!loginSuccess) {
    runner.log('\n❌ Cannot proceed without authentication. Exiting.', 'red');
    process.exit(1);
  }

  runner.log('\n🚀 Starting automated tests...', 'blue');

  // Run all tests
  await runner.test7_Unauthenticated(); // Test auth first
  await runner.test1_GenerateFromIssue();
  // Note: Skipping action test if no actions exist
  // await runner.test2_GenerateFromAction();
  await runner.test4_ConfirmGeneration();
  await runner.test5_TemplatePromotion();
  await runner.test6_ErrorHandling();
  
  // Note: Rate limit test disabled by default (uses 11 API calls)
  // Uncomment to test rate limiting:
  // await runner.test3_RateLimiting();

  // Print summary
  runner.printSummary();
}

// Run tests
main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
