/**
 * Resource Parsing API - Endpoint Test
 * 
 * Tests the POST /api/projects/:projectId/resources/parse endpoint
 * This is a documentation/example test showing expected usage.
 * 
 * Run with: node tests/test-resource-api.js
 */

console.log('╔═══════════════════════════════════════════════════╗');
console.log('║   RESOURCE PARSING API - ENDPOINT TEST           ║');
console.log('╚═══════════════════════════════════════════════════╝\n');

console.log('📝 Endpoint Documentation:\n');
console.log('POST /api/projects/:projectId/resources/parse');
console.log('Authentication: Required (JWT token)');
console.log('Authorization: Must be project member\n');

console.log('═══════════════════════════════════════════════════');
console.log('REQUEST FORMAT');
console.log('═══════════════════════════════════════════════════\n');

const sampleRequest = {
  documentText: `
# Resource Allocation Plan

| Task Component  | Resource   | Role      | Effort   |
|-----------------|------------|-----------|----------|
| API Development | John Doe   | Developer | 80 hours |
| Database Design | Jane Smith | DBA       | 40 hours |
| Testing         | Bob Wilson | QA        | 3 days   |

Additional assignments:
- Infrastructure Setup: Mike Chen (DevOps) - 5 days
- Documentation: Sarah Johnson (Tech Writer) - 20 hours
  `,
  autoAssign: true  // Optional: automatically assign to issues (default: false)
};

console.log('Request Body:');
console.log(JSON.stringify(sampleRequest, null, 2));

console.log('\n═══════════════════════════════════════════════════');
console.log('RESPONSE FORMAT');
console.log('═══════════════════════════════════════════════════\n');

const sampleResponse = {
  success: true,
  resources: [
    {
      task: 'API Development',
      name: 'John Doe',
      role: 'Developer',
      effort: 80,
      unit: 'hours',
      userId: 5,
      matchConfidence: 1.0,
      needsReview: false
    },
    {
      task: 'Database Design',
      name: 'Jane Smith',
      role: 'DBA',
      effort: 40,
      unit: 'hours',
      userId: 6,
      matchConfidence: 1.0,
      needsReview: false
    },
    {
      task: 'Testing',
      name: 'Bob Wilson',
      role: 'QA',
      effort: 24,  // 3 days converted to hours
      unit: 'hours',
      userId: 7,
      matchConfidence: 1.0,
      needsReview: false
    },
    {
      task: 'Infrastructure Setup',
      name: 'Mike Chen',
      role: 'DevOps',
      effort: 40,  // 5 days converted to hours
      unit: 'hours',
      userId: null,
      matchConfidence: 0,
      needsReview: true  // No matching user found
    },
    {
      task: 'Documentation',
      name: 'Sarah Johnson',
      role: 'Tech Writer',
      effort: 20,
      unit: 'hours',
      userId: 8,
      matchConfidence: 1.0,
      needsReview: false
    }
  ],
  assignments: [
    {
      issueId: 101,
      issueTitle: 'API Development',
      userId: 5,
      userName: 'John Doe',
      effortHours: 80
    },
    {
      issueId: 102,
      issueTitle: 'Database Design',
      userId: 6,
      userName: 'Jane Smith',
      effortHours: 40
    },
    {
      issueId: 103,
      issueTitle: 'Testing',
      userId: 7,
      userName: 'Bob Wilson',
      effortHours: 24
    },
    {
      issueId: 104,
      issueTitle: 'Documentation',
      userId: 8,
      userName: 'Sarah Johnson',
      effortHours: 20
    }
  ],
  needsReview: [
    {
      task: 'Infrastructure Setup',
      name: 'Mike Chen',
      role: 'DevOps',
      effort: 40,
      unit: 'hours',
      userId: null,
      matchConfidence: 0,
      needsReview: true
    }
  ],
  summary: {
    totalExtracted: 5,
    matched: 4,
    needsReview: 1,
    assigned: 4
  }
};

console.log('Response:');
console.log(JSON.stringify(sampleResponse, null, 2));

console.log('\n═══════════════════════════════════════════════════');
console.log('PARSING STRATEGIES');
console.log('═══════════════════════════════════════════════════\n');

console.log('1. TABLE PARSING');
console.log('   Detects markdown/plain text tables');
console.log('   Looks for: task, resource, role, effort columns');
console.log('   Example: | API Development | John Doe | Developer | 80 hours |\n');

console.log('2. LIST PARSING');
console.log('   Detects bullet lists with pattern');
console.log('   Format: - Task: Name (Role) - X hours');
console.log('   Example: - Infrastructure: Mike Chen (DevOps) - 5 days\n');

console.log('3. PARAGRAPH PARSING');
console.log('   Detects narrative text');
console.log('   Pattern: "Name (Role) will spend X hours on Task"');
console.log('   Example: John Doe (Developer) will spend 80 hours on API development\n');

console.log('═══════════════════════════════════════════════════');
console.log('USER MATCHING');
console.log('═══════════════════════════════════════════════════\n');

console.log('The service uses 5-tier fuzzy matching:');
console.log('  1. Exact full name match → 100% confidence');
console.log('  2. Exact username match → 100% confidence');
console.log('  3. Partial match (First + Last initial) → 90% confidence');
console.log('  4. First name only (if unique) → 80% confidence');
console.log('  5. Fuzzy match (Levenshtein ≤3) → 60-88% confidence\n');

console.log('Resources with confidence < 90% are flagged for review.\n');

console.log('═══════════════════════════════════════════════════');
console.log('EFFORT NORMALIZATION');
console.log('═══════════════════════════════════════════════════\n');

console.log('All effort values are normalized to hours:');
console.log('  - 80 hours → 80 hours');
console.log('  - 5 days → 40 hours (1 day = 8 hours)');
console.log('  - 60h → 60 hours');
console.log('  - 3d → 24 hours\n');

console.log('═══════════════════════════════════════════════════');
console.log('ERROR HANDLING');
console.log('═══════════════════════════════════════════════════\n');

const errorScenarios = [
  {
    scenario: 'Missing documentText',
    status: 400,
    error: 'documentText is required'
  },
  {
    scenario: 'No authentication',
    status: 401,
    error: 'Unauthorized'
  },
  {
    scenario: 'Not project member',
    status: 403,
    error: 'Access denied to this project'
  },
  {
    scenario: 'Server error',
    status: 500,
    error: 'Failed to parse resources'
  }
];

errorScenarios.forEach((scenario, index) => {
  console.log(`${index + 1}. ${scenario.scenario}`);
  console.log(`   Status: ${scenario.status}`);
  console.log(`   Error: "${scenario.error}"`);
  console.log();
});

console.log('═══════════════════════════════════════════════════');
console.log('USAGE EXAMPLES');
console.log('═══════════════════════════════════════════════════\n');

console.log('Example 1: Parse without auto-assignment (preview mode)');
console.log(`
curl -X POST http://localhost:5000/api/projects/1/resources/parse \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "documentText": "..."
  }'
`);

console.log('Example 2: Parse and auto-assign to issues');
console.log(`
curl -X POST http://localhost:5000/api/projects/1/resources/parse \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "documentText": "...",
    "autoAssign": true
  }'
`);

console.log('\n═══════════════════════════════════════════════════');
console.log('INTEGRATION WORKFLOW');
console.log('═══════════════════════════════════════════════════\n');

console.log('1. User uploads resource allocation document');
console.log('2. Frontend extracts text content');
console.log('3. POST /api/projects/:projectId/resources/parse');
console.log('4. Service parses using all strategies');
console.log('5. Service matches names to project users');
console.log('6. Returns resources + match confidence');
console.log('7. Frontend displays for user review');
console.log('8. User confirms or adjusts assignments');
console.log('9. If autoAssign=true, creates assignments immediately');
console.log('10. If autoAssign=false, frontend makes separate call to assign\n');

console.log('✅ API ENDPOINT DOCUMENTATION COMPLETE!\n');

process.exit(0);
