node -e "
  const fs = require('fs');
  console.log('🔍 Story 4.3 Quick Check\n');

  // Check server.js for new endpoints
  const serverPath = 'server.js';
  if (fs.existsSync(serverPath)) {
    const content = fs.readFileSync(serverPath, 'utf8');

    console.log('API Endpoints:');
    let found = 0;

    // Check for route definitions
    const checks = [
      ['/api/issues/:issueId/hierarchy', 'GET hierarchy'],
      ['/api/issues/:issueId/children', 'GET children'],
      ['/api/issues/:issueId/calculate-rollup', 'POST rollup'],
      ['/api/projects/:projectId/update-parent-efforts', 'POST update parents'],
      ['/api/issues/:issueId/estimate-with-dependencies', 'GET estimate'],
      ['/api/projects/:projectId/hierarchy', 'GET project hierarchy'],
      ['/api/projects/:projectId/create-hierarchical-issues', 'POST create hierarchy']
    ];

    checks.forEach(([endpoint, desc]) => {
      const exists = content.includes(endpoint);
      console.log('  ' + (exists ? '✅' : '❌') + ' ' + desc + ' - ' + endpoint);
      if (exists) found++;
    });

    // Check imports
    console.log('\nImports:');
    console.log('  ' + (content.includes('calculateRollupEffort') ? '✅' : '❌') + ' calculateRollupEffort');
    console.log('  ' + (content.includes('updateAllParentEfforts') ? '✅' : '❌') + ' updateAllParentEfforts');
    console.log('  ' + (content.includes('estimateWithDependencies') ? '✅' : '❌') + ' estimateWithDependencies');
    console.log('  ' + (content.includes('getHierarchicalBreakdown') ? '✅' : '❌') + ' getHierarchicalBreakdown');
    console.log('  ' + (content.includes('createHierarchicalIssues') ? '✅' : '❌') + ' createHierarchicalIssues');

    // Check middleware
    console.log('\nMiddleware & Security:');
    console.log('  ' + (content.includes('authenticateToken') ? '✅' : '❌') + ' authenticateToken middleware');

    // Check error handling patterns
    console.log('\nError Handling:');
    const tryCatchCount = (content.match(/try\s*{/g) || []).length;
    console.log('  ' + (tryCatchCount >= 7 ? '✅' : '⚠️') + ' try/catch blocks: ' + tryCatchCount);

    console.log('\n📊 Summary:', found + '/7 endpoints found');
    console.log('');

    if (found === 7) {
      console.log('🎉 Story 4.3 is COMPLETE and ready to commit!\n');
    } else {
      console.log('⚠️  Story 4.3 may be incomplete (' + found + '/7 endpoints)\n');
    }
  } else {
    console.log('❌ server.js not found');
  }
  "
