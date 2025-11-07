/**
 * Test Timeline Extraction
 * 
 * Verifies timeline extraction works with sample AD Migration document
 * Run with: node tests/test-timeline-extraction.js
 */

require('dotenv').config();
const { extractTimeline } = require('../services/timeline-extractor');

// Sample AD Migration document
const testDocument = `
AD Migration Project Timeline

Phase 0: Prerequisites (Week 1)
- Backup validation
- NTDS.DIT extraction
- Gate 1 approval

Phase 1: Discovery (Weeks 2-3)
- Infrastructure assessment
- Domain analysis
- Migration planning

Phase 2: Execution (Weeks 4-8)
- AWS DC deployment
- Replication setup
- Functional level upgrade

Milestones:
- Week 1: Gate 1 - Prerequisites Complete
- Week 3: Discovery Complete
- Week 8: Migration Complete
`;

async function runTest() {
  console.log('=== TIMELINE EXTRACTION TEST ===\n');
  console.log('Testing with AD Migration Project Timeline\n');

  try {
    // Set project start date
    const projectStartDate = '2025-01-06'; // Monday, January 6, 2025
    console.log(`Project Start Date: ${projectStartDate}\n`);

    // Extract timeline
    console.log('Extracting timeline from document...\n');
    const result = await extractTimeline(testDocument, {
      projectId: 1,
      userId: 1,
      projectStartDate,
      useAI: true
    });

    console.log('✅ Timeline Extraction Complete!\n');
    console.log('═══════════════════════════════════════════════════\n');

    // Display method used
    console.log(`Extraction Method: ${result.method.toUpperCase()}\n`);

    // Display AI cost information
    if (result.cost) {
      console.log('AI Cost Information:');
      console.log('─────────────────────');
      console.log(`  Tokens Used: ${result.cost.totalTokens}`);
      console.log(`  - Prompt Tokens: ${result.cost.promptTokens}`);
      console.log(`  - Completion Tokens: ${result.cost.completionTokens}`);
      console.log(`  Cost (USD): $${result.cost.costUsd.toFixed(6)}`);
      console.log();
    }

    // Display extracted phases
    console.log('Extracted Phases:');
    console.log('═════════════════');
    result.timeline.phases.forEach((phase, index) => {
      console.log(`\n${index + 1}. ${phase.name}`);
      console.log(`   Original Timeframe: ${phase.originalTimeframe || phase.timeframe}`);
      console.log(`   Calculated Dates: ${phase.startDate || 'N/A'} to ${phase.endDate || 'N/A'}`);
      
      if (phase.startDate && phase.endDate) {
        const start = new Date(phase.startDate);
        const end = new Date(phase.endDate);
        const durationDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        console.log(`   Duration: ${durationDays} days`);
      }
      
      if (phase.description) {
        console.log(`   Description: ${phase.description}`);
      }
      
      if (phase.deliverables && phase.deliverables.length > 0) {
        console.log(`   Deliverables: ${phase.deliverables.join(', ')}`);
      }
    });

    // Display extracted milestones
    console.log('\n\nExtracted Milestones:');
    console.log('═════════════════════');
    result.timeline.milestones.forEach((milestone, index) => {
      console.log(`\n${index + 1}. ${milestone.name}`);
      console.log(`   Original Timeframe: ${milestone.originalTimeframe || milestone.timeframe}`);
      console.log(`   Calculated Due Date: ${milestone.dueDate || 'TBD'}`);
      
      if (milestone.description) {
        console.log(`   Description: ${milestone.description}`);
      }
      
      if (milestone.dependencies && milestone.dependencies.length > 0) {
        console.log(`   Dependencies: ${milestone.dependencies.join(', ')}`);
      }
    });

    // Display extracted tasks (if any)
    if (result.timeline.tasks && result.timeline.tasks.length > 0) {
      console.log('\n\nExtracted Tasks:');
      console.log('════════════════');
      result.timeline.tasks.forEach((task, index) => {
        console.log(`\n${index + 1}. ${task.name}`);
        console.log(`   Phase: ${task.phase}`);
        if (task.duration) {
          console.log(`   Duration: ${task.duration} days`);
        }
        console.log(`   Timeframe: ${task.originalTimeframe || task.timeframe}`);
        if (task.startDate && task.endDate) {
          console.log(`   Calculated Dates: ${task.startDate} to ${task.endDate}`);
        }
      });
    }

    // Verification summary
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('Verification Summary:');
    console.log('═══════════════════════════════════════════════════');
    console.log(`✓ Phases extracted: ${result.timeline.phases.length}`);
    console.log(`✓ Milestones extracted: ${result.timeline.milestones.length}`);
    console.log(`✓ Tasks extracted: ${result.timeline.tasks?.length || 0}`);
    
    // Verify date calculations
    let datesCalculated = 0;
    result.timeline.phases.forEach(phase => {
      if (phase.startDate && phase.endDate) datesCalculated++;
    });
    console.log(`✓ Phases with calculated dates: ${datesCalculated}/${result.timeline.phases.length}`);
    
    let milestonesWithDates = result.timeline.milestones.filter(m => m.dueDate).length;
    console.log(`✓ Milestones with due dates: ${milestonesWithDates}/${result.timeline.milestones.length}`);

    console.log('\n✅ Test completed successfully!\n');
    
    // Return result for programmatic use
    return result;

  } catch (error) {
    console.error('\n❌ Test failed!');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  runTest()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = { runTest };
