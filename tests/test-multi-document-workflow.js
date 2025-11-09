const multiDocumentAnalyzer = require('../services/multi-document-analyzer');
const { pool } = require('../db');

async function runWorkflowTest() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  MULTI-DOCUMENT WORKFLOW - INTEGRATION TEST          ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  let projectId, userId;

  try {
    console.log('Setup: Creating test project...');

    const userResult = await pool.query(
      `INSERT INTO users (username, email, password)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET username = $1
       RETURNING id`,
      ['test_user', 'test@example.com', 'hash']
    );
    userId = userResult.rows[0].id;

    const projectResult = await pool.query(
      `INSERT INTO projects (name, description, created_by)
       VALUES ($1, $2, $3) RETURNING id`,
      ['Multi-Doc Test Project', 'Testing complete workflow', userId]
    );
    projectId = projectResult.rows[0].id;

    console.log(`✓ Created project ${projectId}\n`);

    const documents = [
      {
        filename: 'Project_Plan.txt',
        classification: 'ProjectPlan',
        text: `
AD Migration Project Plan

Phase 0: Prerequisites (Week 1)
- Backup validation and verification
- NTDS.DIT extraction
- Gate 1 approval checkpoint

Phase 1: Discovery (Weeks 2-3)
- Infrastructure assessment
- Domain analysis and mapping
- Migration planning

Phase 2: Execution (Weeks 4-8)
- AWS DC deployment
- Replication setup
- Functional level upgrade

Milestones:
- Week 1: Gate 1 - Prerequisites Complete
- Week 3: Discovery Complete
- Week 8: Migration Complete

Dependencies:
Phase 1 (Discovery) must complete before Phase 2 (Execution)
        `
      },
      {
        filename: 'Effort_Estimates.txt',
        classification: 'Effort',
        text: `
Resource Allocation:

| Task Component | Resource | Role | Effort |
|----------------|----------|------|--------|
| Backup Validation | Sultan | Infrastructure Lead | 5.2 hours |
| NTDS Extraction | Srihari S | Systems Engineer | 2.3 hours |
| AWS Deployment | Moshik V | Cloud Architect | 40 hours |
| Replication Setup | Sultan | Infrastructure Lead | 12 hours |

Total project effort: 120 hours across 3 weeks
        `
      },
      {
        filename: 'Appendices.txt',
        classification: 'Appendices',
        text: `
Appendix C: Technical Checklists

C.1 Backup Validation Checklist
- Verify backup completion
- Test restore capability
- Document validation results

C.2 Gate 1 Approval Criteria
- All backups validated
- NTDS.DIT successfully extracted
- Risk assessment complete
        `
      }
    ];

    console.log('Running multi-document analyzer...\n');

    const result = await multiDocumentAnalyzer.analyzeMultipleDocuments(
      documents,
      {
        projectId,
        userId,
        projectStartDate: '2025-01-06'
      }
    );

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  TEST RESULTS                                        ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    console.log('Overall Success:', result.success ? '✅ PASS' : '❌ FAIL');
    console.log('');

    console.log('Documents Processed:', result.documents.processed);
    console.log('  Expected: 3');
    console.log('  Status:', result.documents.processed === 3 ? '✅' : '❌');
    console.log('');

    console.log('Workstreams Created:', result.workstreams.length);
    console.log('  Expected: 3 (Phase 0, 1, 2)');
    console.log('  Status:', result.workstreams.length >= 3 ? '✅' : '❌');
    console.log('');

    console.log('Issues Created:', result.issues.created);
    console.log('  Expected: 3+');
    console.log('  Status:', result.issues.created >= 3 ? '✅' : '❌');
    console.log('');

    console.log('Timeline Extracted:');
    console.log('  Phases:', result.timeline.phases?.length || 0, '(expected: 3)');
    console.log('  Milestones:', result.timeline.milestones?.length || 0, '(expected: 3)');
    console.log('  Status:',
      (result.timeline.phases?.length >= 3 && result.timeline.milestones?.length >= 3) ? '✅' : '⚠️ '
    );
    console.log('');

    console.log('Dependencies Created:', result.dependencies.created);
    console.log('  Expected: 1+ (Phase 1 → Phase 2)');
    console.log('  Status:', result.dependencies.created >= 1 ? '✅' : '⚠️ ');
    console.log('');

    console.log('Resource Assignments:', result.resourceAssignments.assigned);
    console.log('  Expected: 2+ (Sultan, Srihari)');
    console.log('  Status:', result.resourceAssignments.assigned >= 2 ? '✅' : '⚠️ ');
    console.log('');

    console.log('Checklists:', result.checklists.created);
    console.log('  Items:', result.checklists.items);
    console.log('  Status:', result.checklists.created > 0 ? '✅' : '⚠️ ');
    console.log('');

    // Safely handle totalCost (convert to number if needed)
    const totalCost = typeof result.totalCost === 'number' ? result.totalCost : parseFloat(result.totalCost) || 0;
    console.log('AI Cost: $' + totalCost.toFixed(4));
    console.log('  Expected: < $0.50');
    console.log('  Status:', totalCost < 0.50 ? '✅' : '⚠️ ');
    console.log('');

    console.log('Errors:', result.errors.length);
    console.log('  Expected: 0');
    console.log('  Status:', result.errors.length === 0 ? '✅' : '❌');
    if (result.errors.length > 0) {
      result.errors.forEach(err => console.log('    ❌', err));
    }
    console.log('');

    console.log('Warnings:', result.warnings.length);
    if (result.warnings.length > 0) {
      result.warnings.forEach(warn => console.log('    ⚠️ ', warn));
    }
    console.log('');

    const allPassed =
      result.success &&
      result.documents.processed === 3 &&
      result.workstreams.length >= 3 &&
      result.issues.created >= 3 &&
      result.errors.length === 0;

    if (allPassed) {
      console.log('╔══════════════════════════════════════════════════════╗');
      console.log('║  ✅ ALL TESTS PASSED!                                ║');
      console.log('║  Multi-document workflow is working correctly!       ║');
      console.log('╚══════════════════════════════════════════════════════╝');
    } else {
      console.log('╔══════════════════════════════════════════════════════╗');
      console.log('║  ⚠️  SOME TESTS FAILED                               ║');
      console.log('║  Review the results above                            ║');
      console.log('╚══════════════════════════════════════════════════════╝');
    }

  } catch (error) {
    console.error('\n❌ Workflow test failed:', error);
    console.error(error.stack);
    throw error;
  } finally {
    if (projectId) {
      console.log('\nCleaning up test data...');
      await pool.query('DELETE FROM project_imports WHERE project_id = $1', [projectId]);
      await pool.query('DELETE FROM issue_relationships WHERE source_type = $1', ['issue']);
      await pool.query('DELETE FROM issues WHERE project_id = $1', [projectId]);
      await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      console.log('✓ Cleanup complete');
    }
  }
}

runWorkflowTest()
  .then(() => {
    console.log('\n🎉 Workflow test completed!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n💥 Workflow test failed!');
    console.error(error);
    process.exit(1);
  });
