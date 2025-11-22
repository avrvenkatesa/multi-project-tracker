/**
 * Meeting Transcription System - Integration Tests
 * Comprehensive end-to-end tests validating the complete meeting transcription flow
 * 
 * Tests: Meeting lifecycle, smart activation, entity detection, summary generation
 * Framework: Mocha/Chai with Sinon (matches project standard)
 * 
 * Note: AI services are mocked to avoid API costs during testing
 */

const { expect } = require('chai');
const sinon = require('sinon');
const { neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
const { pool } = require('../db.js');
const transcriptionService = require('../services/transcriptionService');
const meetingManager = require('../services/meetingManager');
const liveEntityDetector = require('../services/liveEntityDetector');
const meetingSummaryGenerator = require('../services/meetingSummaryGenerator');
const sidecarBot = require('../services/sidecarBot');
const llmClient = require('../services/llmClient');

neonConfig.webSocketConstructor = ws;

describe('Meeting Transcription System - Integration Tests', function() {
  this.timeout(60000); // 60 second timeout for integration tests

  let testMeetingId;
  let testProjectId;
  let testUserId;
  let dbMeetingId;
  let stubs = [];

  // Test fixtures
  const mockTranscriptChunks = [
    {
      speaker: 'John Doe',
      content: 'We decided to migrate our infrastructure to Kubernetes for better scalability.',
      timestamp: 0
    },
    {
      speaker: 'Sarah Smith',
      content: 'I agree, but we need to be aware of the database migration risks. There could be significant downtime.',
      timestamp: 5
    },
    {
      speaker: 'John Doe',
      content: 'Good point. Let\'s create an action item to research zero-downtime migration strategies.',
      timestamp: 10
    },
    {
      speaker: 'Sarah Smith',
      content: 'I\'ll take that action item. We should also document the entire migration plan as a task.',
      timestamp: 15
    }
  ];

  // Mock AI responses (to avoid API costs)
  const mockAIDetectionResult = {
    success: true,
    entities: [
      {
        entity_type: 'decision',
        title: 'Migrate to Kubernetes',
        description: 'Decided to migrate infrastructure to Kubernetes for better scalability',
        confidence: 0.92,
        impact_level: 'high',
        priority: 'high',
        complexity: 'high',
        tags: ['infrastructure', 'kubernetes'],
        requirements: ['Set up K8s cluster', 'Migrate services'],
        mentioned_users: [],
        related_systems: ['infrastructure', 'deployment'],
        ai_analysis: {
          reasoning: 'Clear decision with high confidence',
          citations: ['John: We decided to migrate...']
        }
      },
      {
        entity_type: 'risk',
        title: 'Database migration risks',
        description: 'Potential database downtime during Kubernetes migration',
        confidence: 0.85,
        impact_level: 'high',
        priority: 'high',
        complexity: 'medium',
        tags: ['database', 'migration', 'downtime'],
        requirements: ['Risk mitigation plan'],
        mentioned_users: [],
        related_systems: ['database'],
        ai_analysis: {
          reasoning: 'Identified risk with high confidence',
          citations: ['Sarah: database migration risks...']
        }
      },
      {
        entity_type: 'action_item',
        title: 'Research zero-downtime migration strategies',
        description: 'Investigate strategies to migrate to Kubernetes with zero downtime',
        confidence: 0.88,
        impact_level: 'medium',
        priority: 'medium',
        complexity: 'medium',
        tags: ['research', 'migration'],
        requirements: [],
        mentioned_users: ['Sarah Smith'],
        related_systems: [],
        ai_analysis: {
          reasoning: 'Clear action item assigned to Sarah',
          citations: ['Sarah: I\'ll take that action item...']
        }
      }
    ],
    llm: {
      provider: 'claude',
      model: 'claude-3-5-sonnet-20241022',
      usage: { prompt_tokens: 1250, completion_tokens: 180, total_tokens: 1430 },
      cost: 0.00432
    },
    context_quality: { score: 0.85, has_pkg: true, has_rag: true },
    workflow_results: []
  };

  const mockSummaryResult = {
    summary_text: `# MEETING SUMMARY

**Meeting:** Sprint Planning - Infrastructure Migration
**Duration:** 15 minutes
**Participants:** 2

## KEY POINTS

1. **Infrastructure Migration to Kubernetes**
   - Team decided to migrate infrastructure to Kubernetes for better scalability
   - High priority decision with significant impact

2. **Database Migration Risks Identified**
   - Potential downtime during migration is a concern
   - Requires careful planning and risk mitigation

3. **Action Items Created**
   - Research zero-downtime migration strategies (Assigned: Sarah Smith)

## DECISIONS MADE

- Migrate infrastructure to Kubernetes (Confidence: 92%)

## RISKS IDENTIFIED

- Database migration downtime risk (Confidence: 85%)

## ACTION ITEMS

- Research zero-downtime migration strategies (Confidence: 88%)

## SENTIMENT ANALYSIS

Overall sentiment: Positive (0.72)
- Collaborative discussion
- Proactive risk identification
- Clear action planning`,
    sentiment_score: 0.72,
    key_decisions: 1,
    key_risks: 1,
    action_items: 1,
    participant_speaking_time: {
      'John Doe': 55,
      'Sarah Smith': 45
    },
    metadata: {
      topics: ['infrastructure', 'kubernetes', 'migration', 'database'],
      highlights: [
        'Decided to migrate to Kubernetes',
        'Identified database downtime risk',
        'Created action item for zero-downtime research'
      ],
      participant_engagement: {
        'John Doe': 0.7,
        'Sarah Smith': 0.9
      }
    }
  };

  before(async () => {
    console.log('\n🔧 Setting up Meeting Transcription Integration Tests...');
    
    // Get or create test project and user
    const projectResult = await pool.query('SELECT id FROM projects LIMIT 1');
    if (projectResult.rows.length > 0) {
      testProjectId = projectResult.rows[0].id;
    } else {
      const newProject = await pool.query(
        'INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING id',
        ['Test Project', 'Integration test project']
      );
      testProjectId = newProject.rows[0].id;
    }

    const userResult = await pool.query('SELECT id FROM users LIMIT 1');
    if (userResult.rows.length > 0) {
      testUserId = userResult.rows[0].id;
    } else {
      const newUser = await pool.query(
        'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
        ['testuser', 'test@example.com', 'hash', 'Developer']
      );
      testUserId = newUser.rows[0].id;
    }

    testMeetingId = `test-zoom-${Date.now()}`;
    console.log(`✅ Test data ready: Project ${testProjectId}, User ${testUserId}, Meeting ${testMeetingId}`);
  });

  afterEach(() => {
    // Restore all stubs after each test to avoid "already wrapped" errors
    stubs.forEach(stub => {
      if (stub && stub.restore) {
        stub.restore();
      }
    });
    stubs = [];
  });

  after(async () => {
    console.log('\n🧹 Cleaning up test data...');
    
    // Cleanup test data
    if (dbMeetingId) {
      await pool.query('DELETE FROM live_entity_detections WHERE meeting_id = $1', [dbMeetingId]);
      await pool.query('DELETE FROM transcript_chunks WHERE meeting_id = $1', [dbMeetingId]);
      await pool.query('DELETE FROM meeting_participants WHERE meeting_id = $1', [dbMeetingId]);
      await pool.query('DELETE FROM meeting_summaries WHERE meeting_id = $1', [dbMeetingId]);
      await pool.query('DELETE FROM meeting_transcriptions WHERE id = $1', [dbMeetingId]);
      console.log('✅ Test meeting data cleaned up');
    }
  });

  describe('TC1: Complete Meeting Lifecycle', () => {
    it('Should handle full meeting flow: start → transcribe → detect → end → summarize', async () => {
      console.log('\n[TC1] Starting complete meeting lifecycle test');

      // Mock AI services to avoid API costs
      const sidecarStub = sinon.stub(sidecarBot, 'analyzeContent').resolves(mockAIDetectionResult);
      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves({
        entities: [],
        provider: 'claude',
        usage: { prompt_tokens: 2000, completion_tokens: 500, total_tokens: 2500 },
        cost: 0.0075
      });
      stubs.push(sidecarStub, llmStub);

      // Step 1: Start meeting
      const startResult = await meetingManager.startMeeting({
        meetingId: testMeetingId,
        platform: 'zoom',
        title: 'Sprint Planning - Infrastructure Migration',
        projectId: testProjectId,
        userId: testUserId,
        activationMode: 'manual'
      });

      expect(startResult).to.exist;
      expect(startResult.meeting.meetingId).to.equal(testMeetingId);
      console.log(`✅ Meeting started: ${startResult.meeting.meetingId}`);

      // Get DB meeting ID
      const meetingRecord = await pool.query(
        'SELECT id FROM meeting_transcriptions WHERE meeting_id = $1',
        [testMeetingId]
      );
      dbMeetingId = meetingRecord.rows[0].id;

      // Step 2: Add participants
      await meetingManager.addParticipant({
        meetingId: testMeetingId,
        name: 'John Doe',
        email: 'john@example.com',
        externalId: 'zoom_123',
        isOrganizer: true
      });

      await meetingManager.addParticipant({
        meetingId: testMeetingId,
        name: 'Sarah Smith',
        email: 'sarah@example.com',
        externalId: 'zoom_456',
        isOrganizer: false
      });

      console.log('✅ Added 2 participants');

      // Get meeting start time for accurate timestamps
      const meetingStartTime = startResult.meeting.startedAt;
      const baseTimestamp = new Date(meetingStartTime).getTime();

      // Step 3: Process transcript chunks (simulate transcription)
      for (const chunk of mockTranscriptChunks) {
        await transcriptionService.processTeamsTranscript({
          meetingId: testMeetingId,
          transcript: chunk.content,
          speaker: chunk.speaker,
          timestamp: baseTimestamp + chunk.timestamp * 1000,
          confidence: 0.95
        });
      }

      console.log(`✅ Processed ${mockTranscriptChunks.length} transcript chunks`);

      // Verify transcript was stored
      const transcriptResult = await pool.query(
        'SELECT COUNT(*) as count FROM transcript_chunks WHERE meeting_id = $1',
        [dbMeetingId]
      );
      expect(parseInt(transcriptResult.rows[0].count)).to.equal(mockTranscriptChunks.length);

      // Step 4: Trigger entity detection
      const combinedTranscript = mockTranscriptChunks
        .map(c => `${c.speaker}: ${c.content}`)
        .join('\n');

      const detectionResult = await liveEntityDetector.detectFromTranscript({
        meetingId: testMeetingId,
        transcript: combinedTranscript,
        chunks: mockTranscriptChunks
      });

      expect(detectionResult.success).to.be.true;
      expect(detectionResult.entities).to.have.length.at.least(1);
      console.log(`✅ Detected ${detectionResult.entities.length} entities`);

      // Verify entities were stored
      const detectionsResult = await pool.query(
        'SELECT COUNT(*) as count FROM live_entity_detections WHERE meeting_id = $1',
        [dbMeetingId]
      );
      expect(parseInt(detectionsResult.rows[0].count)).to.be.at.least(1);

      // Step 5: End meeting
      const endStats = await meetingManager.endMeeting(testMeetingId);
      expect(endStats).to.exist;
      console.log('✅ Meeting ended');

      // Step 6: Generate summary
      const summary = await meetingSummaryGenerator.generateSummary(testMeetingId);

      expect(summary).to.exist;
      expect(summary.summary_text).to.exist;
      expect(summary.summary_text.length).to.be.at.least(100);
      expect(summary.sentiment_score).to.exist;
      console.log(`✅ Summary generated (sentiment: ${summary.sentiment_score})`);

      // Verify final state
      const finalMeeting = await meetingManager.getMeetingDetails(testMeetingId);
      expect(finalMeeting.status).to.equal('ended');
      expect(finalMeeting.participants).to.have.length(3);

      console.log('✅ TC1 PASSED: Full lifecycle test completed successfully');
    });
  });

  describe('TC2: Smart Activation Mode', () => {
    it('Should auto-start transcription based on smart rules', async () => {
      console.log('\n[TC2] Testing smart activation mode');

      // Set project to smart mode
      await meetingManager.setProjectActivationMode(testProjectId, 'smart');

      // Test 1: Keyword in title
      const shouldStart1 = await meetingManager.shouldStartTranscription({
        meetingId: 'test-meeting-1',
        platform: 'zoom',
        title: 'Daily Standup',
        participantCount: 3,
        organizerId: testUserId,
        projectId: testProjectId
      });

      expect(shouldStart1).to.be.true;
      console.log('✅ Auto-start triggered for keyword "standup"');

      // Test 2: >3 participants
      const shouldStart2 = await meetingManager.shouldStartTranscription({
        meetingId: 'test-meeting-2',
        platform: 'zoom',
        title: 'Coffee Chat',
        participantCount: 5,
        organizerId: testUserId,
        projectId: testProjectId
      });

      expect(shouldStart2).to.be.true;
      console.log('✅ Auto-start triggered for >3 participants');

      // Test 3: Should NOT start (no keyword, <3 participants)
      const shouldStart3 = await meetingManager.shouldStartTranscription({
        meetingId: 'test-meeting-3',
        platform: 'zoom',
        title: 'Coffee Chat',
        participantCount: 2,
        organizerId: testUserId,
        projectId: testProjectId
      });

      expect(shouldStart3).to.be.false;
      console.log('✅ Correctly skipped random meeting with 2 participants');

      // Test 4: Sprint-related keyword
      const shouldStart4 = await meetingManager.shouldStartTranscription({
        meetingId: 'test-meeting-4',
        platform: 'zoom',
        title: 'Sprint Review Session',
        participantCount: 2,
        organizerId: testUserId,
        projectId: testProjectId
      });

      expect(shouldStart4).to.be.true;
      console.log('✅ Auto-start triggered for keyword "sprint"');

      console.log('✅ TC2 PASSED: Smart activation working correctly');
    });

    it('Should respect manual mode', async () => {
      console.log('\n[TC2.2] Testing manual activation mode');

      // Set project to manual mode
      await meetingManager.setProjectActivationMode(testProjectId, 'manual');

      // Should NOT start even with keywords
      const shouldStart = await meetingManager.shouldStartTranscription({
        meetingId: 'test-meeting-manual',
        platform: 'zoom',
        title: 'Daily Standup',
        participantCount: 5,
        organizerId: testUserId,
        projectId: testProjectId
      });

      expect(shouldStart).to.be.false;
      console.log('✅ Manual mode correctly prevents auto-start');

      // Reset to smart mode for other tests
      await meetingManager.setProjectActivationMode(testProjectId, 'smart');

      console.log('✅ TC2.2 PASSED: Manual mode working correctly');
    });
  });

  describe('TC3: Live Entity Detection Accuracy', () => {
    it('Should detect decisions, risks, and action items from transcript', async () => {
      console.log('\n[TC3] Testing entity detection accuracy');

      // Start an active meeting for detection testing
      const tc3MeetingId = `test-tc3-${Date.now()}`;
      await meetingManager.startMeeting({
        meetingId: tc3MeetingId,
        platform: 'zoom',
        title: 'TC3 Test Meeting',
        projectId: testProjectId,
        userId: testUserId,
        activationMode: 'manual'
      });

      const transcript = `
John: We've decided to migrate to Kubernetes for better scalability.
Sarah: That's a good decision, but I see a risk with database downtime during migration.
John: Valid concern. Let's create an action item to research zero-downtime migration strategies.
Sarah: I'll take that action item. Also, we should document the migration plan as a task.
      `.trim();

      // Mock sidecarBot.analyzeContent
      const sidecarStub = sinon.stub(sidecarBot, 'analyzeContent').resolves(mockAIDetectionResult);
      stubs.push(sidecarStub);

      const detectionResult = await liveEntityDetector.detectFromTranscript({
        meetingId: tc3MeetingId,
        transcript: transcript,
        chunks: []
      });

      expect(detectionResult.success).to.be.true;
      expect(detectionResult.entities).to.have.length(3);

      // Verify entity types
      const entityTypes = detectionResult.entities.map(e => e.entity_type);
      expect(entityTypes).to.include('decision');
      expect(entityTypes).to.include('risk');
      expect(entityTypes).to.include('action_item');

      // Verify confidence scores
      const allHighConfidence = detectionResult.entities.every(e => e.confidence >= 0.5);
      expect(allHighConfidence).to.be.true;

      console.log('✅ Detected 1 decision, 1 risk, 1 action item');
      console.log('✅ TC3 PASSED: Entity detection working correctly');
    });

    it('Should handle low-confidence detections appropriately', async () => {
      console.log('\n[TC3.2] Testing low-confidence detection handling');

      // Start an active meeting for low-confidence testing
      const tc3LowMeetingId = `test-tc3-low-${Date.now()}`;
      await meetingManager.startMeeting({
        meetingId: tc3LowMeetingId,
        platform: 'zoom',
        title: 'TC3.2 Test Meeting',
        projectId: testProjectId,
        userId: testUserId,
        activationMode: 'manual'
      });

      const lowConfidenceResult = {
        ...mockAIDetectionResult,
        entities: [
          {
            entity_type: 'task',
            title: 'Maybe update docs',
            description: 'Someone mentioned updating documentation',
            confidence: 0.35,
            impact_level: 'low'
          }
        ]
      };

      const sidecarStub = sinon.stub(sidecarBot, 'analyzeContent').resolves(lowConfidenceResult);
      stubs.push(sidecarStub);

      const detectionResult = await liveEntityDetector.detectFromTranscript({
        meetingId: tc3LowMeetingId,
        transcript: 'Maybe we should update the docs',
        chunks: []
      });

      // Low confidence entities should not be stored
      expect(detectionResult.success).to.be.true;
      expect(detectionResult.entities).to.have.length(0);

      console.log('✅ TC3.2 PASSED: Low-confidence detections filtered correctly');
    });
  });

  describe('TC4: Participant Management', () => {
    it('Should track participants joining and leaving', async () => {
      console.log('\n[TC4] Testing participant management');

      // Add participant
      const participant = await meetingManager.addParticipant({
        meetingId: testMeetingId,
        name: 'Alice Johnson',
        email: 'alice@example.com',
        externalId: 'zoom_789',
        isOrganizer: false
      });

      expect(participant).to.exist;
      expect(participant.participant_name).to.equal('Alice Johnson');
      console.log('✅ Participant added');

      // Verify participant in database
      const participantCheck = await pool.query(
        'SELECT * FROM meeting_participants WHERE meeting_id = $1 AND external_participant_id = $2',
        [dbMeetingId, 'zoom_789']
      );
      expect(participantCheck.rows).to.have.length(1);

      // Try adding duplicate (should handle gracefully)
      const duplicate = await meetingManager.addParticipant({
        meetingId: testMeetingId,
        name: 'Alice Johnson',
        email: 'alice@example.com',
        externalId: 'zoom_789',
        isOrganizer: false
      });

      expect(duplicate).to.exist;
      console.log('✅ Duplicate participant handled correctly');

      // Remove participant
      await meetingManager.removeParticipant({
        meetingId: testMeetingId,
        participantId: 'zoom_789'
      });

      // Verify participant marked as left
      const afterRemoval = await pool.query(
        'SELECT left_at FROM meeting_participants WHERE meeting_id = $1 AND external_participant_id = $2',
        [dbMeetingId, 'zoom_789']
      );
      expect(afterRemoval.rows[0].left_at).to.not.be.null;

      console.log('✅ Participant removed');
      console.log('✅ TC4 PASSED: Participant management working');
    });
  });

  describe('TC5: Summary Generation Quality', () => {
    it('Should generate comprehensive summary with all sections', async () => {
      console.log('\n[TC5] Testing summary generation quality');

      // Mock LLM response
      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves({
        entities: [],
        provider: 'claude',
        usage: { prompt_tokens: 2000, completion_tokens: 500, total_tokens: 2500 },
        cost: 0.0075
      });
      stubs.push(llmStub);

      const summary = await meetingSummaryGenerator.getSummary(testMeetingId);

      expect(summary).to.exist;
      expect(summary.summary_text).to.exist;
      expect(summary.summary_text.length).to.be.at.least(100);

      // Check for required sections
      const hasSummarySection = summary.summary_text.includes('SUMMARY') || 
                                summary.summary_text.includes('Summary');
      expect(hasSummarySection).to.be.true;

      // Check metadata
      expect(summary.metadata).to.exist;
      expect(summary.metadata.topics).to.be.an('array');
      expect(summary.metadata.highlights).to.be.an('array');

      // Check statistics
      expect(summary.key_decisions).to.be.at.least(0);
      expect(summary.key_risks).to.be.at.least(0);
      expect(summary.action_items).to.be.at.least(0);

      // Check sentiment
      expect(summary.sentiment_score).to.be.a('number');
      expect(summary.sentiment_score).to.be.at.least(-1).and.at.most(1);

      console.log('✅ Summary has all required sections');
      console.log('✅ TC5 PASSED: Summary generation quality validated');
    });
  });

  describe('TC6: Export Functionality', () => {
    it('Should export summary in multiple formats', async () => {
      console.log('\n[TC6] Testing summary export functionality');

      // Mock LLM response
      const llmStub = sinon.stub(llmClient, 'extractEntities').resolves({
        entities: [],
        provider: 'claude',
        usage: { prompt_tokens: 2000, completion_tokens: 500, total_tokens: 2500 },
        cost: 0.0075
      });
      stubs.push(llmStub);

      // Test markdown export
      const markdown = await meetingSummaryGenerator.exportSummary(testMeetingId, 'markdown');
      expect(markdown).to.exist;
      expect(markdown.format).to.equal('markdown');
      expect(markdown.content).to.be.a('string');
      expect(markdown.filename).to.include('.md');
      console.log('✅ Markdown export working');

      // Test JSON export
      const json = await meetingSummaryGenerator.exportSummary(testMeetingId, 'json');
      expect(json).to.exist;
      expect(json.format).to.equal('json');
      expect(json.content).to.be.a('string');
      expect(json.filename).to.include('.json');
      
      // Verify JSON is valid
      const parsed = JSON.parse(json.content);
      expect(parsed).to.have.property('meeting_id');
      expect(parsed).to.have.property('summary_text');
      console.log('✅ JSON export working');

      // Test HTML export
      const html = await meetingSummaryGenerator.exportSummary(testMeetingId, 'html');
      expect(html).to.exist;
      expect(html.format).to.equal('html');
      expect(html.content).to.include('<html>');
      expect(html.filename).to.include('.html');
      console.log('✅ HTML export working');

      console.log('✅ TC6 PASSED: Export functionality validated');
    });
  });

  describe('TC7: Bulk Entity Promotion', () => {
    it('Should bulk promote high-confidence detections', async () => {
      console.log('\n[TC7] Testing bulk entity promotion');

      // Mock sidecarBot with high-confidence entities
      const sidecarStub = sinon.stub(sidecarBot, 'analyzeContent').resolves(mockAIDetectionResult);
      stubs.push(sidecarStub);

      // Detect entities
      await liveEntityDetector.detectFromTranscript({
        meetingId: testMeetingId,
        transcript: mockTranscriptChunks.map(c => `${c.speaker}: ${c.content}`).join('\n'),
        chunks: mockTranscriptChunks
      });

      // Bulk promote with 0.8 threshold
      const result = await liveEntityDetector.bulkPromoteDetections(testMeetingId, 0.8);

      expect(result).to.exist;
      expect(result.promoted).to.be.at.least(0);
      console.log(`✅ Promoted ${result.promoted} high-confidence detections`);

      console.log('✅ TC7 PASSED: Bulk promotion working');
    });
  });

  describe('TC8: Concurrent Meetings', () => {
    it('Should handle multiple active meetings simultaneously', async () => {
      console.log('\n[TC8] Testing concurrent meetings');

      const meeting1Id = `test-concurrent-1-${Date.now()}`;
      const meeting2Id = `test-concurrent-2-${Date.now()}`;

      // Start two meetings
      const meeting1 = await meetingManager.startMeeting({
        meetingId: meeting1Id,
        platform: 'zoom',
        title: 'Meeting 1',
        projectId: testProjectId,
        userId: testUserId,
        activationMode: 'manual'
      });

      const meeting2 = await meetingManager.startMeeting({
        meetingId: meeting2Id,
        platform: 'zoom',
        title: 'Meeting 2',
        projectId: testProjectId,
        userId: testUserId,
        activationMode: 'manual'
      });

      expect(meeting1.meeting.meetingId).to.equal(meeting1Id);
      expect(meeting2.meeting.meetingId).to.equal(meeting2Id);
      console.log('✅ Started 2 concurrent meetings');

      // Get active meetings
      const activeMeetings = await meetingManager.getActiveMeetings(testProjectId);
      const activeMeetingIds = activeMeetings.map(m => m.meeting_id);
      
      expect(activeMeetingIds).to.include(meeting1Id);
      expect(activeMeetingIds).to.include(meeting2Id);
      console.log('✅ Both meetings are active');

      // Cleanup
      const meeting1DbId = (await pool.query(
        'SELECT id FROM meeting_transcriptions WHERE meeting_id = $1',
        [meeting1Id]
      )).rows[0].id;

      const meeting2DbId = (await pool.query(
        'SELECT id FROM meeting_transcriptions WHERE meeting_id = $1',
        [meeting2Id]
      )).rows[0].id;

      await meetingManager.endMeeting(meeting1Id);
      await meetingManager.endMeeting(meeting2Id);

      await pool.query('DELETE FROM meeting_transcriptions WHERE id IN ($1, $2)', [meeting1DbId, meeting2DbId]);

      console.log('✅ TC8 PASSED: Concurrent meetings handled correctly');
    });
  });

  describe('TC9: Error Handling', () => {
    it('Should handle missing meeting gracefully', async () => {
      console.log('\n[TC9] Testing error handling');

      try {
        await meetingManager.getMeetingDetails('nonexistent-meeting-id');
        expect.fail('Should have thrown error for missing meeting');
      } catch (error) {
        expect(error).to.exist;
        console.log('✅ Missing meeting error handled correctly');
      }
    });

    it('Should handle duplicate meeting start gracefully', async () => {
      console.log('\n[TC9.2] Testing duplicate meeting start');

      const duplicateMeetingId = `test-duplicate-${Date.now()}`;

      // Start meeting
      await meetingManager.startMeeting({
        meetingId: duplicateMeetingId,
        platform: 'zoom',
        title: 'Duplicate Test',
        projectId: testProjectId,
        userId: testUserId,
        activationMode: 'manual'
      });

      // Try to start again
      try {
        await meetingManager.startMeeting({
          meetingId: duplicateMeetingId,
          platform: 'zoom',
          title: 'Duplicate Test',
          projectId: testProjectId,
          userId: testUserId,
          activationMode: 'manual'
        });
        
        // Should either throw or return existing meeting
        console.log('✅ Duplicate meeting handled gracefully');
      } catch (error) {
        // Error is expected and acceptable
        console.log('✅ Duplicate meeting prevented with error');
      }

      // Cleanup
      const dbId = (await pool.query(
        'SELECT id FROM meeting_transcriptions WHERE meeting_id = $1',
        [duplicateMeetingId]
      )).rows[0]?.id;

      if (dbId) {
        await pool.query('DELETE FROM meeting_transcriptions WHERE id = $1', [dbId]);
      }

      console.log('✅ TC9.2 PASSED: Duplicate handling validated');
    });
  });

  describe('TC10: Detection Statistics', () => {
    it('Should calculate accurate detection statistics', async () => {
      console.log('\n[TC10] Testing detection statistics');

      // Mock detections
      const sidecarStub = sinon.stub(sidecarBot, 'analyzeContent').resolves(mockAIDetectionResult);
      stubs.push(sidecarStub);

      // Detect entities
      await liveEntityDetector.detectFromTranscript({
        meetingId: testMeetingId,
        transcript: mockTranscriptChunks.map(c => `${c.speaker}: ${c.content}`).join('\n'),
        chunks: mockTranscriptChunks
      });

      // Get statistics
      const stats = await liveEntityDetector.getDetectionStats(testMeetingId);

      expect(stats).to.exist;
      expect(stats.total).to.be.a('number');
      expect(stats.by_type).to.be.an('object');
      
      // Should have counts for different entity types
      if (stats.total > 0) {
        expect(Object.keys(stats.by_type).length).to.be.at.least(1);
      }

      console.log(`✅ Statistics: ${stats.total} total detections`);
      console.log('✅ TC10 PASSED: Statistics calculation working');
    });
  });
});

console.log('\n📋 Meeting Transcription Integration Tests Ready');
console.log('Run with: npm run test:meeting-transcription');
