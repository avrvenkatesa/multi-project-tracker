/**
 * Hallway Meetings Routes
 * 
 * API endpoints for hallway meeting management, transcription, and analysis
 */

const express = require('express');
const router = express.Router();

const hallwayMeetingService = require('../services/hallwayMeetingService');
const hallwayTranscriptionService = require('../services/hallwayTranscriptionService');
const hallwayAnalysisService = require('../services/hallwayAnalysisService');
const wakeWordSettings = require('../services/wakeWordSettings');
const wakeWordDetection = require('../services/wakeWordDetection');
const { authenticateToken } = require('../middleware/auth');

// ============================================
// MIDDLEWARE
// ============================================

async function validateMeetingAccess(req, res, next) {
  try {
    const meetingId = req.params.meetingId;
    const userId = req.user.id;

    const meeting = await hallwayMeetingService.getMeetingById(meetingId, userId);
    
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    req.meeting = meeting;
    next();
  } catch (error) {
    if (error.message.includes('Access denied')) {
      return res.status(403).json({ error: 'Access denied to this meeting' });
    }
    console.error('Meeting access validation error:', error);
    res.status(500).json({ error: 'Failed to validate meeting access' });
  }
}

// ============================================
// MEETING ENDPOINTS
// ============================================

/**
 * POST /api/hallway-meetings/start
 * Start a new hallway meeting
 */
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const {
      projectId,
      meetingTitle,
      locationDescription,
      meetingType,
      activationMode,
      wakeWordDetected,
      wakeWordConfidence,
      deviceInfo,
      metadata
    } = req.body;

    const meeting = await hallwayMeetingService.startMeeting(req.user.id, projectId, {
      meetingTitle,
      locationDescription,
      meetingType,
      activationMode: activationMode || 'manual',
      wakeWordDetected,
      wakeWordConfidence,
      deviceInfo,
      metadata
    });

    res.status(201).json({
      success: true,
      meeting,
      message: 'Meeting started successfully'
    });
  } catch (error) {
    console.error('Start meeting error:', error);
    res.status(error.message.includes('not found') ? 404 : 400).json({ 
      error: error.message || 'Failed to start meeting' 
    });
  }
});

/**
 * PUT /api/hallway-meetings/:meetingId/end
 * End an active meeting and trigger analysis
 */
router.put('/:meetingId/end', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;
    const userId = req.user.id;

    const result = await hallwayMeetingService.endMeeting(meetingId, userId);

    res.json({
      success: true,
      meeting: result,
      message: 'Meeting ended successfully. Analysis in progress.'
    });
  } catch (error) {
    console.error('End meeting error:', error);
    res.status(error.message.includes('Only the meeting organizer') ? 403 : 400).json({ 
      error: error.message || 'Failed to end meeting' 
    });
  }
});

/**
 * DELETE /api/hallway-meetings/:meetingId/cancel
 * Cancel a meeting
 */
router.delete('/:meetingId/cancel', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;
    const userId = req.user.id;
    const { reason } = req.body;

    const meeting = await hallwayMeetingService.cancelMeeting(meetingId, userId, reason);

    res.json({
      success: true,
      meeting,
      message: 'Meeting cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel meeting error:', error);
    res.status(error.message.includes('Only the meeting organizer') ? 403 : 400).json({ 
      error: error.message || 'Failed to cancel meeting' 
    });
  }
});

/**
 * PUT /api/hallway-meetings/:meetingId/pause
 * Pause a recording meeting
 */
router.put('/:meetingId/pause', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;
    const userId = req.user.id;

    const meeting = await hallwayMeetingService.pauseMeeting(meetingId, userId);

    res.json({
      success: true,
      meeting,
      message: 'Meeting paused successfully'
    });
  } catch (error) {
    console.error('Pause meeting error:', error);
    res.status(error.message.includes('Only the meeting organizer') ? 403 : 400).json({ 
      error: error.message || 'Failed to pause meeting' 
    });
  }
});

/**
 * PUT /api/hallway-meetings/:meetingId/resume
 * Resume a paused meeting
 */
router.put('/:meetingId/resume', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;
    const userId = req.user.id;

    const meeting = await hallwayMeetingService.resumeMeeting(meetingId, userId);

    res.json({
      success: true,
      meeting,
      message: 'Meeting resumed successfully'
    });
  } catch (error) {
    console.error('Resume meeting error:', error);
    res.status(error.message.includes('Only the meeting organizer') ? 403 : 400).json({ 
      error: error.message || 'Failed to resume meeting' 
    });
  }
});

/**
 * GET /api/hallway-meetings/active
 * Get all active meetings (optionally filtered by project)
 */
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.query;

    const meetings = await hallwayMeetingService.getActiveMeetings(
      projectId ? parseInt(projectId) : null
    );

    res.json({ meetings });
  } catch (error) {
    console.error('Get active meetings error:', error);
    res.status(500).json({ error: 'Failed to retrieve active meetings' });
  }
});

/**
 * GET /api/hallway-meetings/project/:projectId
 * Get all meetings for a project
 */
router.get('/project/:projectId', authenticateToken, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { status, userId, limit = 50, offset = 0 } = req.query;

    const meetings = await hallwayMeetingService.getProjectMeetings(projectId, {
      status,
      userId: userId ? parseInt(userId) : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      meetings,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: meetings.length
      }
    });
  } catch (error) {
    console.error('Get project meetings error:', error);
    res.status(500).json({ error: 'Failed to retrieve meetings' });
  }
});

/**
 * GET /api/hallway-meetings/user/:userId
 * Get all meetings for a user
 */
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (req.user.id !== userId && req.user.role !== 'System Administrator') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { status, projectId, limit = 50, offset = 0 } = req.query;

    const meetings = await hallwayMeetingService.getUserMeetings(userId, {
      status,
      projectId: projectId ? parseInt(projectId) : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      meetings,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: meetings.length
      }
    });
  } catch (error) {
    console.error('Get user meetings error:', error);
    res.status(500).json({ error: 'Failed to retrieve meetings' });
  }
});

/**
 * GET /api/hallway-meetings/:meetingId
 * Get full meeting details with participants, transcript, and entities
 */
router.get('/:meetingId', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;
    const includeTranscript = req.query.includeTranscript !== 'false';
    const includeEntities = req.query.includeEntities !== 'false';
    const includeParticipants = req.query.includeParticipants !== 'false';

    const meeting = req.meeting;

    const response = { meeting };

    if (includeParticipants) {
      response.participants = await hallwayMeetingService.getParticipants(meetingId);
    }

    if (includeTranscript && meeting.transcriptionStatus === 'completed') {
      response.transcript = await hallwayMeetingService.getFullTranscript(meetingId);
    }

    if (includeEntities && meeting.analysisStatus === 'completed') {
      response.entities = await hallwayAnalysisService.getEntityDetections(meetingId);
      response.stats = await hallwayAnalysisService.getMeetingStats(meetingId);
    }

    res.json(response);
  } catch (error) {
    console.error('Get meeting error:', error);
    res.status(500).json({ error: 'Failed to retrieve meeting' });
  }
});

// ============================================
// PARTICIPANT ENDPOINTS
// ============================================

/**
 * POST /api/hallway-meetings/:meetingId/participants
 * Add a participant to a meeting
 */
router.post('/:meetingId/participants', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;
    const {
      userId,
      participantName,
      participantEmail,
      participantRole,
      speakerLabel,
      isOrganizer
    } = req.body;

    const participant = await hallwayMeetingService.addParticipant(meetingId, {
      userId: userId ? parseInt(userId) : null,
      participantName,
      participantEmail,
      participantRole,
      speakerLabel,
      isOrganizer: isOrganizer || false
    });

    res.status(201).json({
      success: true,
      participant
    });
  } catch (error) {
    console.error('Add participant error:', error);
    res.status(400).json({ error: error.message || 'Failed to add participant' });
  }
});

/**
 * GET /api/hallway-meetings/:meetingId/participants
 * Get all participants for a meeting
 */
router.get('/:meetingId/participants', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;

    const participants = await hallwayMeetingService.getParticipants(meetingId);

    res.json({ participants });
  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({ error: 'Failed to retrieve participants' });
  }
});

/**
 * PUT /api/hallway-meetings/:meetingId/participants/:participantId/map-speaker
 * Map a speaker label to a participant
 */
router.put('/:meetingId/participants/:participantId/map-speaker', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;
    const participantId = parseInt(req.params.participantId);
    const { speakerLabel, mappingMethod = 'manual' } = req.body;

    if (!speakerLabel) {
      return res.status(400).json({ error: 'speakerLabel is required' });
    }

    const mapping = await hallwayMeetingService.mapSpeakerToParticipant(
      meetingId,
      speakerLabel,
      participantId,
      mappingMethod,
      req.user.id
    );

    res.json({
      success: true,
      mapping
    });
  } catch (error) {
    console.error('Map speaker error:', error);
    res.status(400).json({ error: error.message || 'Failed to map speaker' });
  }
});

/**
 * DELETE /api/hallway-meetings/:meetingId/participants/:participantId
 * Remove a participant from a meeting
 */
router.delete('/:meetingId/participants/:participantId', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;
    const participantId = parseInt(req.params.participantId);

    const participant = await hallwayMeetingService.removeParticipant(meetingId, participantId);

    res.json({
      success: true,
      participant,
      message: 'Participant removed successfully'
    });
  } catch (error) {
    console.error('Remove participant error:', error);
    res.status(400).json({ error: error.message || 'Failed to remove participant' });
  }
});

// ============================================
// TRANSCRIPT ENDPOINTS
// ============================================

/**
 * POST /api/hallway-meetings/:meetingId/transcript
 * Add transcript chunks (called by transcription service)
 */
router.post('/:meetingId/transcript', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;
    const { chunks } = req.body;

    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return res.status(400).json({ error: 'chunks array is required' });
    }

    const addedChunks = [];
    for (const chunk of chunks) {
      const added = await hallwayMeetingService.addTranscriptChunk(meetingId, chunk);
      addedChunks.push(added);
    }

    res.status(201).json({
      success: true,
      chunksAdded: addedChunks.length,
      chunks: addedChunks
    });
  } catch (error) {
    console.error('Add transcript chunks error:', error);
    res.status(400).json({ error: error.message || 'Failed to add transcript chunks' });
  }
});

/**
 * GET /api/hallway-meetings/:meetingId/transcript
 * Get full transcript for a meeting
 */
router.get('/:meetingId/transcript', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;
    const format = req.query.format || 'json';

    const transcript = await hallwayMeetingService.getFullTranscript(meetingId);

    if (format === 'text') {
      res.set('Content-Type', 'text/plain');
      res.send(transcript.fullText);
    } else {
      res.json(transcript);
    }
  } catch (error) {
    console.error('Get transcript error:', error);
    res.status(500).json({ error: 'Failed to retrieve transcript' });
  }
});

/**
 * GET /api/hallway-meetings/:meetingId/transcription-status
 * Get real-time transcription status
 */
router.get('/:meetingId/transcription-status', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;

    const status = await hallwayTranscriptionService.getTranscriptionStatus(meetingId);

    res.json(status);
  } catch (error) {
    console.error('Get transcription status error:', error);
    res.status(500).json({ error: 'Failed to retrieve transcription status' });
  }
});

// ============================================
// ENTITY ENDPOINTS
// ============================================

/**
 * GET /api/hallway-meetings/:meetingId/entities
 * Get detected entities for a meeting
 */
router.get('/:meetingId/entities', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;
    const { entityType, wasDismissed } = req.query;

    const entities = await hallwayAnalysisService.getEntityDetections(meetingId, {
      entityType,
      wasDismissed: wasDismissed === 'true'
    });

    res.json({ entities });
  } catch (error) {
    console.error('Get entities error:', error);
    res.status(500).json({ error: 'Failed to retrieve entities' });
  }
});

/**
 * POST /api/hallway-meetings/:meetingId/entities/:entityId/dismiss
 * Dismiss a detected entity (false positive)
 */
router.post('/:meetingId/entities/:entityId/dismiss', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const entityId = parseInt(req.params.entityId);
    const { reason } = req.body;

    const entity = await hallwayAnalysisService.dismissEntityDetection(
      entityId,
      req.user.id,
      reason
    );

    res.json({
      success: true,
      entity,
      message: 'Entity dismissed successfully'
    });
  } catch (error) {
    console.error('Dismiss entity error:', error);
    res.status(400).json({ error: error.message || 'Failed to dismiss entity' });
  }
});

/**
 * GET /api/hallway-meetings/:meetingId/stats
 * Get meeting statistics
 */
router.get('/:meetingId/stats', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;

    const stats = await hallwayAnalysisService.getMeetingStats(meetingId);

    res.json(stats);
  } catch (error) {
    console.error('Get meeting stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve meeting stats' });
  }
});

/**
 * POST /api/hallway-meetings/:meetingId/analyze
 * Manually trigger meeting analysis
 */
router.post('/:meetingId/analyze', authenticateToken, validateMeetingAccess, async (req, res) => {
  try {
    const meetingId = req.params.meetingId;

    const result = await hallwayAnalysisService.analyzeHallwayMeeting(meetingId, req.user.id);

    res.json(result);
  } catch (error) {
    console.error('Analyze meeting error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze meeting' });
  }
});

// ============================================
// WAKE-WORD SETTINGS ENDPOINTS
// ============================================

/**
 * GET /api/wake-word-settings
 * Get user's wake-word settings
 */
router.get('/settings/wake-word', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.query;

    const settings = await wakeWordSettings.getUserWakeWordSettings(
      req.user.id,
      projectId ? parseInt(projectId) : null
    );

    if (!settings) {
      return res.json({
        userId: req.user.id,
        projectId: projectId ? parseInt(projectId) : null,
        activationMode: 'disabled',
        message: 'No settings found, using defaults'
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Get wake-word settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

/**
 * PUT /api/wake-word-settings
 * Update user's wake-word settings
 */
router.put('/settings/wake-word', authenticateToken, async (req, res) => {
  try {
    const {
      projectId,
      activationMode,
      wakeWords,
      sensitivity,
      detectionMethod,
      autoStartRecording,
      allowedLocations,
      scheduledTimes
    } = req.body;

    const settings = await wakeWordSettings.updateWakeWordSettings(
      req.user.id,
      projectId ? parseInt(projectId) : null,
      {
        activationMode,
        customWakeWords: wakeWords,
        wakeWordSensitivity: sensitivity,
        wakeWordEnabled: wakeWords && wakeWords.length > 0,
        scheduledConfig: scheduledTimes
      }
    );

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Update wake-word settings error:', error);
    res.status(400).json({ error: error.message || 'Failed to update settings' });
  }
});

/**
 * POST /api/wake-word-settings/detect
 * Log a wake-word detection event
 */
router.post('/settings/wake-word/detect', authenticateToken, async (req, res) => {
  try {
    const {
      wakeWord,
      confidence,
      detectionMethod,
      projectId,
      metadata
    } = req.body;

    if (!wakeWord || confidence === undefined) {
      return res.status(400).json({ error: 'wakeWord and confidence are required' });
    }

    const detection = await wakeWordDetection.logWakeWordDetection(
      req.user.id,
      projectId ? parseInt(projectId) : null,
      wakeWord,
      parseFloat(confidence),
      detectionMethod || 'unknown',
      metadata || {}
    );

    res.status(201).json({
      success: true,
      detection
    });
  } catch (error) {
    console.error('Log wake-word detection error:', error);
    res.status(400).json({ error: error.message || 'Failed to log detection' });
  }
});

/**
 * GET /api/wake-word-settings/detections
 * Get wake-word detection history
 */
router.get('/settings/wake-word/detections', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0, startDate, endDate } = req.query;

    const { projectId } = req.query;

    const detections = await wakeWordDetection.getDetections(
      req.user.id,
      projectId ? parseInt(projectId) : null,
      {
        limit: parseInt(limit),
        offset: parseInt(offset),
        startDate,
        endDate
      }
    );

    res.json({
      detections,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        count: detections.length
      }
    });
  } catch (error) {
    console.error('Get wake-word detections error:', error);
    res.status(500).json({ error: 'Failed to retrieve detections' });
  }
});

module.exports = router;
