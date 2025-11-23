/**
 * Meeting Webhook Routes & API
 * Comprehensive API routes and webhook handlers for Meeting Transcription system
 * Includes Zoom webhooks, Teams Graph API webhooks, and REST endpoints
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const transcriptionService = require('../services/transcriptionService');
const meetingManager = require('../services/meetingManager');
const liveEntityDetector = require('../services/liveEntityDetector');
const meetingSummaryGenerator = require('../services/meetingSummaryGenerator');
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../db');

// ============================================
// ZOOM WEBHOOK ENDPOINTS
// ============================================

/**
 * Zoom webhook handler
 * Handles meeting lifecycle events from Zoom
 */
router.post('/webhooks/zoom', async (req, res) => {
  const { event, payload } = req.body;

  // Zoom verification challenge (required by Zoom on subscription)
  if (event === 'endpoint.url_validation') {
    const hashForValidate = crypto
      .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET || 'default_secret')
      .update(payload.plainToken)
      .digest('hex');

    return res.json({
      plainToken: payload.plainToken,
      encryptedToken: hashForValidate
    });
  }

  // Handle meeting events
  try {
    console.log(`[Zoom Webhook] Received event: ${event}`);

    switch (event) {
      case 'meeting.started':
        await handleZoomMeetingStarted(payload);
        break;
      case 'meeting.ended':
        await handleZoomMeetingEnded(payload);
        break;
      case 'meeting.participant_joined':
        await handleZoomParticipantJoined(payload);
        break;
      case 'meeting.participant_left':
        await handleZoomParticipantLeft(payload);
        break;
      default:
        console.log(`[Zoom Webhook] Unhandled event: ${event}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[Zoom Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle Zoom meeting started
 */
async function handleZoomMeetingStarted(payload) {
  const { object } = payload;
  const meetingId = object.id.toString();
  const topic = object.topic;
  const hostId = object.host_id;
  const participantCount = object.participant_count || 1;

  console.log(`[Zoom Webhook] Meeting started: ${topic} (${meetingId})`);

  // Get project and user mapping
  const mapping = await getProjectAndUserForZoomHost(hostId);
  
  if (!mapping) {
    console.log(`[Zoom Webhook] No mapping found for Zoom host ${hostId}, skipping auto-start`);
    return;
  }

  const { projectId, userId } = mapping;

  // Check if should auto-start transcription
  const shouldStart = await meetingManager.shouldStartTranscription({
    meetingId,
    platform: 'zoom',
    title: topic,
    participantCount,
    organizerId: userId,
    projectId
  });

  if (shouldStart) {
    await meetingManager.startMeeting({
      meetingId,
      platform: 'zoom',
      title: topic,
      projectId,
      userId,
      activationMode: 'smart'
    });

    console.log(`[Zoom Webhook] Auto-started transcription for meeting ${meetingId}`);
  }
}

/**
 * Handle Zoom meeting ended
 */
async function handleZoomMeetingEnded(payload) {
  const meetingId = payload.object.id.toString();

  console.log(`[Zoom Webhook] Meeting ended: ${meetingId}`);

  try {
    // End meeting
    await meetingManager.endMeeting(meetingId);

    // Bulk promote high-confidence detections
    await liveEntityDetector.bulkPromoteDetections(meetingId, 0.8);

    // Generate summary (async, don't wait)
    meetingSummaryGenerator.generateSummary(meetingId)
      .then(() => console.log(`[Zoom Webhook] Summary generated for ${meetingId}`))
      .catch(err => console.error(`[Zoom Webhook] Summary failed:`, err));

  } catch (error) {
    console.error(`[Zoom Webhook] Error handling meeting end:`, error);
  }
}

/**
 * Handle Zoom participant joined
 */
async function handleZoomParticipantJoined(payload) {
  const meetingId = payload.object.id.toString();
  const participant = payload.object.participant;

  console.log(`[Zoom Webhook] Participant joined: ${participant.user_name} in ${meetingId}`);

  try {
    await meetingManager.addParticipant({
      meetingId,
      name: participant.user_name,
      email: participant.email || null,
      externalId: participant.id || participant.user_id,
      isOrganizer: false
    });
  } catch (error) {
    console.error(`[Zoom Webhook] Error adding participant:`, error);
  }
}

/**
 * Handle Zoom participant left
 */
async function handleZoomParticipantLeft(payload) {
  const meetingId = payload.object.id.toString();
  const participant = payload.object.participant;

  console.log(`[Zoom Webhook] Participant left: ${participant.user_name} from ${meetingId}`);

  try {
    await meetingManager.removeParticipant({
      meetingId,
      participantId: participant.id || participant.user_id
    });
  } catch (error) {
    console.error(`[Zoom Webhook] Error removing participant:`, error);
  }
}

/**
 * Get project and user mapping for Zoom host
 * Helper function to map Zoom user to system user/project
 */
async function getProjectAndUserForZoomHost(zoomHostId) {
  try {
    // Check if user has Zoom ID stored in metadata
    const result = await pool.query(`
      SELECT id, preferences->>'default_project_id' as project_id
      FROM users
      WHERE preferences->>'zoom_user_id' = $1
      LIMIT 1
    `, [zoomHostId]);

    if (result.rows.length > 0) {
      return {
        userId: result.rows[0].id,
        projectId: parseInt(result.rows[0].project_id) || null
      };
    }

    // Fallback: get first project for first user (development mode)
    const fallback = await pool.query(`
      SELECT u.id as user_id, p.id as project_id
      FROM users u
      CROSS JOIN projects p
      LIMIT 1
    `);

    if (fallback.rows.length > 0) {
      return {
        userId: fallback.rows[0].user_id,
        projectId: fallback.rows[0].project_id
      };
    }

    return null;
  } catch (error) {
    console.error('[Zoom Webhook] Error getting user mapping:', error);
    return null;
  }
}

// ============================================
// MICROSOFT TEAMS WEBHOOK ENDPOINTS
// ============================================

/**
 * Microsoft Teams webhook handler
 * Handles Graph API subscription notifications
 */
router.post('/webhooks/teams', async (req, res) => {
  // Teams sends validation token on subscription creation
  if (req.query.validationToken) {
    console.log('[Teams Webhook] Validation token received');
    return res.send(req.query.validationToken);
  }

  const { value } = req.body;

  try {
    for (const notification of value || []) {
      const { resourceData, changeType, resource } = notification;

      console.log(`[Teams Webhook] Received ${changeType} notification`);

      switch (changeType) {
        case 'created':
          if (resourceData && resourceData['@odata.type'] === '#microsoft.graph.callRecord') {
            await handleTeamsMeetingStarted(resourceData);
          }
          break;
        case 'updated':
          if (resourceData && resourceData['@odata.type'] === '#microsoft.graph.callTranscript') {
            await handleTeamsTranscriptUpdate(resourceData);
          }
          break;
        default:
          console.log(`[Teams Webhook] Unhandled change type: ${changeType}`);
      }
    }

    res.status(202).json({ success: true });
  } catch (error) {
    console.error('[Teams Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle Teams meeting started
 */
async function handleTeamsMeetingStarted(resourceData) {
  const meetingId = resourceData.id;
  const organizer = resourceData.organizer;

  console.log(`[Teams Webhook] Meeting started: ${meetingId}`);

  // TODO: Implement Teams-specific logic
  // Similar to Zoom handling but with Teams data structure
}

/**
 * Handle Teams transcript update
 */
async function handleTeamsTranscriptUpdate(resourceData) {
  const transcriptId = resourceData.id;
  const meetingId = resourceData.meetingId;

  console.log(`[Teams Webhook] Transcript update for meeting: ${meetingId}`);

  // TODO: Fetch transcript content from Graph API and process
}

// ============================================
// MEETING MANAGEMENT ENDPOINTS
// ============================================

/**
 * Start meeting transcription (manual trigger)
 */
router.post('/meetings/start', authenticateToken, async (req, res) => {
  try {
    const { meetingId, platform, title, projectId, activationMode } = req.body;

    // Validate required fields
    if (!meetingId || !platform || !title || !projectId) {
      return res.status(400).json({ 
        error: 'Missing required fields: meetingId, platform, title, projectId' 
      });
    }

    const meeting = await meetingManager.startMeeting({
      meetingId,
      platform,
      title,
      projectId: parseInt(projectId),
      userId: req.user.id,
      activationMode: activationMode || 'manual'
    });

    res.json({ success: true, meeting });
  } catch (error) {
    console.error('[API] Start meeting error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * End meeting transcription
 */
router.post('/meetings/:meetingId/end', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const stats = await meetingManager.endMeeting(meetingId);

    // Trigger summary generation (async)
    meetingSummaryGenerator.generateSummary(meetingId)
      .catch(err => console.error('Summary generation failed:', err));

    res.json({ success: true, stats });
  } catch (error) {
    console.error('[API] End meeting error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get active meetings for a project
 */
router.get('/meetings/active', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const meetings = await meetingManager.getActiveMeetings(parseInt(projectId));

    res.json({ success: true, meetings });
  } catch (error) {
    console.error('[API] Get active meetings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get meeting details
 */
router.get('/meetings/:meetingId', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const details = await meetingManager.getMeetingDetails(meetingId);

    if (!details) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({ success: true, meeting: details });
  } catch (error) {
    console.error('[API] Get meeting details error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get user's meeting history
 */
router.get('/meetings/history/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const history = await meetingManager.getUserMeetingHistory(parseInt(userId), limit);

    res.json({ success: true, meetings: history });
  } catch (error) {
    console.error('[API] Get meeting history error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get meeting status (real-time)
 */
router.get('/meetings/:meetingId/status', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const status = await transcriptionService.getMeetingStatus(meetingId);

    res.json({ success: true, status });
  } catch (error) {
    console.error('[API] Get meeting status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Set project activation mode
 */
router.put('/meetings/projects/:projectId/activation-mode', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { mode } = req.body;

    if (!mode || !['auto', 'manual', 'smart'].includes(mode)) {
      return res.status(400).json({ 
        error: 'Invalid mode. Must be one of: auto, manual, smart' 
      });
    }

    await meetingManager.setProjectActivationMode(parseInt(projectId), mode);

    res.json({ success: true, mode });
  } catch (error) {
    console.error('[API] Set activation mode error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get project activation mode
 */
router.get('/meetings/projects/:projectId/activation-mode', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    const mode = await meetingManager.getProjectActivationMode(parseInt(projectId));

    res.json({ success: true, mode });
  } catch (error) {
    console.error('[API] Get activation mode error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TRANSCRIPT ENDPOINTS
// ============================================

/**
 * Get live transcript
 */
router.get('/meetings/:meetingId/transcript', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const since = req.query.since ? new Date(req.query.since) : null;

    const transcript = await transcriptionService.getLiveTranscript(meetingId, since);

    res.json({ success: true, transcript });
  } catch (error) {
    console.error('[API] Get transcript error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Process audio chunk (for client-side streaming)
 */
router.post('/meetings/:meetingId/audio', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { audioData, timestamp } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: 'audioData is required' });
    }

    await transcriptionService.processAudioChunk({
      meetingId,
      audioData: Buffer.from(audioData, 'base64'),
      timestamp: timestamp || Date.now()
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Process audio error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Process Teams transcript (for Teams Graph API)
 */
router.post('/meetings/:meetingId/teams-transcript', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { transcript, speaker, timestamp, confidence } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'transcript is required' });
    }

    await transcriptionService.processTeamsTranscript({
      meetingId,
      transcript,
      speaker: speaker || 'Unknown Speaker',
      timestamp: timestamp || Date.now(),
      confidence: confidence || 1.0
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Process Teams transcript error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manually trigger live entity detection analysis
 * Useful for testing and manual triggering of AI analysis
 */
router.post('/meetings/:meetingId/analyze', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const chunksResult = await pool.query(`
      SELECT tc.content, tc.speaker_name, tc.start_time_seconds
      FROM transcript_chunks tc
      JOIN meeting_transcriptions mt ON tc.meeting_id = mt.id
      WHERE mt.meeting_id = $1 AND tc.is_final = true
      ORDER BY tc.chunk_sequence DESC
      LIMIT 10
    `, [meetingId]);

    if (chunksResult.rows.length === 0) {
      return res.json({ 
        success: true, 
        message: 'No transcript chunks available for analysis',
        detections: [] 
      });
    }

    const combinedText = chunksResult.rows
      .reverse()
      .map(c => `${c.speaker_name}: ${c.content}`)
      .join('\n');

    const result = await liveEntityDetector.detectFromTranscript({
      meetingId,
      transcript: combinedText,
      chunks: chunksResult.rows
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[API] Manual analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LIVE ENTITY DETECTION ENDPOINTS
// ============================================

/**
 * Get live detections
 */
router.get('/meetings/:meetingId/detections', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { entityType } = req.query;

    const detections = await liveEntityDetector.getLiveDetections(meetingId, entityType);

    res.json({ success: true, detections });
  } catch (error) {
    console.error('[API] Get detections error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all detections (including dismissed)
 */
router.get('/meetings/:meetingId/detections/all', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const detections = await liveEntityDetector.getAllDetections(meetingId);

    res.json({ success: true, detections });
  } catch (error) {
    console.error('[API] Get all detections error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get detection statistics
 */
router.get('/meetings/:meetingId/detections/stats', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const stats = await liveEntityDetector.getDetectionStats(meetingId);

    res.json({ success: true, stats });
  } catch (error) {
    console.error('[API] Get detection stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Promote detection to entity
 */
router.post('/meetings/detections/:detectionId/promote', authenticateToken, async (req, res) => {
  try {
    const { detectionId } = req.params;

    const entity = await liveEntityDetector.promoteToEntity({
      detectionId: parseInt(detectionId),
      userId: req.user.id
    });

    res.json({ success: true, entity });
  } catch (error) {
    console.error('[API] Promote detection error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Dismiss detection
 */
router.post('/meetings/detections/:detectionId/dismiss', authenticateToken, async (req, res) => {
  try {
    const { detectionId } = req.params;
    const { reason } = req.body;

    const result = await liveEntityDetector.dismissDetection({
      detectionId: parseInt(detectionId),
      userId: req.user.id,
      reason: reason || 'Dismissed by user'
    });

    res.json({ success: true, detection: result });
  } catch (error) {
    console.error('[API] Dismiss detection error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Bulk promote high-confidence detections
 */
router.post('/meetings/:meetingId/detections/bulk-promote', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { minConfidence } = req.body;

    const result = await liveEntityDetector.bulkPromoteDetections(
      meetingId, 
      minConfidence || 0.8
    );

    res.json({ success: true, result });
  } catch (error) {
    console.error('[API] Bulk promote error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SUMMARY ENDPOINTS
// ============================================

/**
 * Get meeting summary
 */
router.get('/meetings/:meetingId/summary', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const summary = await meetingSummaryGenerator.getSummary(meetingId);

    if (!summary) {
      return res.status(404).json({ error: 'Summary not found. Meeting may still be active.' });
    }

    res.json({ success: true, summary });
  } catch (error) {
    console.error('[API] Get summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get executive summary (short version)
 */
router.get('/meetings/:meetingId/summary/executive', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;

    const summary = await meetingSummaryGenerator.generateExecutiveSummary(meetingId);

    res.json({ success: true, summary });
  } catch (error) {
    console.error('[API] Get executive summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate or regenerate summary
 */
router.post('/meetings/:meetingId/summary/generate', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { regenerate } = req.body;

    let summary;
    if (regenerate) {
      summary = await meetingSummaryGenerator.regenerateSummary(meetingId, req.user.id);
    } else {
      summary = await meetingSummaryGenerator.generateSummary(meetingId);
    }

    res.json({ success: true, summary });
  } catch (error) {
    console.error('[API] Generate summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Export summary in different formats
 */
router.get('/meetings/:meetingId/summary/export', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { format } = req.query;

    const exported = await meetingSummaryGenerator.exportSummary(
      meetingId, 
      format || 'markdown'
    );

    // Set appropriate content type
    const contentTypes = {
      markdown: 'text/markdown',
      json: 'application/json',
      html: 'text/html',
      pdf: 'application/pdf'
    };

    res.setHeader('Content-Type', contentTypes[exported.format] || 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    res.send(exported.content);
  } catch (error) {
    console.error('[API] Export summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Compare meetings (trends)
 */
router.post('/meetings/compare', authenticateToken, async (req, res) => {
  try {
    const { meetingIds } = req.body;

    if (!Array.isArray(meetingIds) || meetingIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 meeting IDs required' });
    }

    const comparison = await meetingSummaryGenerator.compareMeetings(meetingIds);

    res.json({ success: true, comparison });
  } catch (error) {
    console.error('[API] Compare meetings error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get project meeting statistics
 */
router.get('/meetings/projects/:projectId/stats', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    const stats = await meetingManager.getProjectMeetingStats(parseInt(projectId));

    res.json({ success: true, stats });
  } catch (error) {
    console.error('[API] Get project stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Search meetings
 */
router.get('/meetings/projects/:projectId/search', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { query, limit } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'query parameter is required' });
    }

    const results = await meetingManager.searchMeetings(
      parseInt(projectId), 
      query, 
      parseInt(limit) || 20
    );

    res.json({ success: true, meetings: results });
  } catch (error) {
    console.error('[API] Search meetings error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PARTICIPANT MANAGEMENT ENDPOINTS
// ============================================

/**
 * Add participant to meeting
 */
router.post('/meetings/:meetingId/participants', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { userId, name, email, externalId, isOrganizer } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Participant name is required' });
    }

    const participant = await meetingManager.addParticipant({
      meetingId,
      userId: userId || null,
      name,
      email: email || null,
      externalId: externalId || null,
      isOrganizer: isOrganizer || false
    });

    res.json({ success: true, participant });
  } catch (error) {
    console.error('[API] Add participant error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Remove participant from meeting
 */
router.delete('/meetings/:meetingId/participants/:participantId', authenticateToken, async (req, res) => {
  try {
    const { meetingId, participantId } = req.params;

    const result = await meetingManager.removeParticipant({
      meetingId,
      participantId
    });

    res.json({ success: true, participant: result });
  } catch (error) {
    console.error('[API] Remove participant error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
