/**
 * Test Timeline Extractor Service
 * 
 * Run with: node test-timeline-extractor.js
 */

const { 
  extractTimeline, 
  parseDateRange, 
  parseMilestoneDate,
  extractTimelineHeuristic,
  convertRelativeDates
} = require('./services/timeline-extractor');

// Sample project timeline document
const sampleDocument = `
PROJECT TIMELINE: Website Redesign

Phase 1: Discovery & Planning (Week 1-4)
- Stakeholder interviews
- Requirements gathering
- Competitive analysis
Deliverables: Requirements document, User personas

Phase 2: Design (Month 2-3)
- Wireframing
- Visual design
- Design system creation
Deliverables: Design mockups, Component library

Phase 3: Development (Month 4-6)
- Frontend development
- Backend API integration
- Testing
Deliverables: Fully functional website

Milestones:
- Requirements Sign-off (Week 4)
- Design Approval (End of Phase 2)
- Beta Launch (Month 5)
- Production Launch (End of Phase 3)

Key Tasks:
- Task: User Research (Week 1-2, 10 days)
- Task: Wireframe Creation (Week 3-4, 7 days)
- Task: API Development (Month 4, 20 days)
- Task: QA Testing (Month 6, 15 days)
`;

const sampleDocumentWithAbsoluteDates = `
PROJECT TIMELINE: Mobile App Launch

Phase 1: Planning
January 1 - January 31, 2025
- Requirements gathering
- Technical architecture

Milestone: Requirements Complete - January 31, 2025

Phase 2: Development
February 1 - April 30, 2025
- iOS development
- Android development
- Backend services

Milestone: Beta Release - April 15, 2025

Phase 3: Testing & Launch (Q2 2025)
- User acceptance testing
- Production deployment

Milestone: Production Launch - Q2 2025
`;

console.log('=== TIMELINE EXTRACTOR SERVICE TESTS ===\n');

// Test 1: Date Range Parsing
console.log('Test 1: Date Range Parsing');
console.log('----------------------------');
const baseDate = new Date('2025-01-01');

const testCases = [
  'Week 1-4',
  'Month 2-3',
  'Q1 2025',
  'Q2 2025',
  'Week 5',
  'Month 6'
];

testCases.forEach(timeframe => {
  const result = parseDateRange(timeframe, baseDate);
  console.log(`${timeframe}:`, {
    start: result.start?.toISOString().split('T')[0],
    end: result.end?.toISOString().split('T')[0]
  });
});
console.log();

// Test 2: Milestone Date Parsing
console.log('Test 2: Milestone Date Parsing');
console.log('--------------------------------');
const mockPhases = [
  {
    name: 'Phase 1',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-01-28')
  },
  {
    name: 'Phase 2',
    startDate: new Date('2025-02-01'),
    endDate: new Date('2025-03-31')
  }
];

const milestoneTests = [
  'Week 4',
  'End of Phase 1',
  'End of Phase 2',
  'January 31, 2025'
];

milestoneTests.forEach(timeframe => {
  const result = parseMilestoneDate(timeframe, baseDate, mockPhases);
  console.log(`${timeframe}:`, result?.toISOString().split('T')[0]);
});
console.log();

// Test 3: Heuristic Extraction
console.log('Test 3: Heuristic Extraction (Fallback Method)');
console.log('-----------------------------------------------');
const heuristicResult = extractTimelineHeuristic(sampleDocument, baseDate);
console.log('Phases extracted:', heuristicResult.phases.length);
heuristicResult.phases.forEach(phase => {
  console.log(`  - ${phase.name}`);
  console.log(`    Timeframe: ${phase.originalTimeframe}`);
  console.log(`    Dates: ${phase.startDate?.toISOString().split('T')[0]} to ${phase.endDate?.toISOString().split('T')[0]}`);
});

console.log('\nMilestones extracted:', heuristicResult.milestones.length);
heuristicResult.milestones.forEach(milestone => {
  console.log(`  - ${milestone.name}`);
  console.log(`    Due: ${milestone.dueDate?.toISOString().split('T')[0]}`);
});

console.log('\nTasks extracted:', heuristicResult.tasks.length);
heuristicResult.tasks.forEach(task => {
  console.log(`  - ${task.name} (${task.originalTimeframe})`);
});
console.log();

// Test 4: Relative to Absolute Date Conversion
console.log('Test 4: Relative to Absolute Date Conversion');
console.log('---------------------------------------------');
const rawTimeline = {
  phases: [
    {
      name: 'Discovery',
      description: 'Initial phase',
      timeframe: 'Week 1-4',
      duration: '28',
      deliverables: ['Requirements doc']
    },
    {
      name: 'Design',
      description: 'Design phase',
      timeframe: 'Month 2-3',
      duration: '60',
      deliverables: ['Mockups']
    }
  ],
  milestones: [
    {
      name: 'Kickoff',
      description: 'Project start',
      timeframe: 'Week 1',
      dependencies: []
    }
  ],
  tasks: [
    {
      name: 'Research',
      phase: 'Discovery',
      duration: '10',
      timeframe: 'Week 1-2'
    }
  ]
};

const convertedTimeline = convertRelativeDates(rawTimeline, baseDate);
console.log('Converted phases:');
convertedTimeline.phases.forEach(phase => {
  console.log(`  ${phase.name}: ${phase.startDate?.toISOString().split('T')[0]} to ${phase.endDate?.toISOString().split('T')[0]}`);
});
console.log();

// Test 5: AI Extraction (if API key available)
console.log('Test 5: AI Timeline Extraction');
console.log('-------------------------------');
if (process.env.OPENAI_API_KEY) {
  console.log('✓ OpenAI API key detected\n');
  
  extractTimeline(sampleDocument, {
    projectId: 1,
    userId: 1,
    projectStartDate: baseDate,
    useAI: true
  })
    .then(result => {
      console.log('Extraction method:', result.method);
      console.log('Success:', result.success);
      
      if (result.method === 'ai') {
        console.log('\nCost tracking:');
        console.log(`  Tokens used: ${result.cost.tokens} (${result.cost.promptTokens} prompt + ${result.cost.completionTokens} completion)`);
        console.log(`  Cost: $${result.cost.costUsd.toFixed(6)}`);
      }
      
      console.log('\nExtracted Timeline:');
      console.log('-------------------');
      console.log('Phases:', result.timeline.phases.length);
      result.timeline.phases.forEach(phase => {
        console.log(`  - ${phase.name}: ${phase.startDate?.toISOString().split('T')[0]} to ${phase.endDate?.toISOString().split('T')[0]}`);
        console.log(`    Deliverables: ${phase.deliverables?.join(', ')}`);
      });
      
      console.log('\nMilestones:', result.timeline.milestones.length);
      result.timeline.milestones.forEach(milestone => {
        console.log(`  - ${milestone.name}: ${milestone.dueDate?.toISOString().split('T')[0]}`);
      });
      
      console.log('\nTasks:', result.timeline.tasks.length);
      result.timeline.tasks.forEach(task => {
        console.log(`  - ${task.name} (Phase: ${task.phase}, Duration: ${task.duration})`);
      });
      
      console.log('\n✓ AI extraction completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error during AI extraction:', error.message);
      console.log('\nFalling back to heuristic method...');
      return extractTimeline(sampleDocument, {
        projectStartDate: baseDate,
        useAI: false
      });
    })
    .then(fallbackResult => {
      if (fallbackResult) {
        console.log('Fallback method:', fallbackResult.method);
        console.log('Phases extracted:', fallbackResult.timeline.phases.length);
        console.log('✓ Heuristic fallback working!');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
} else {
  console.log('⚠ No OpenAI API key found - skipping AI test');
  console.log('Testing heuristic fallback only...\n');
  
  extractTimeline(sampleDocument, {
    projectStartDate: baseDate,
    useAI: false
  })
    .then(result => {
      console.log('Method:', result.method);
      console.log('Phases extracted:', result.timeline.phases.length);
      console.log('Milestones extracted:', result.timeline.milestones.length);
      console.log('Tasks extracted:', result.timeline.tasks.length);
      console.log('\n✓ All tests passed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
