const express = require('express');
const router = express.Router();
const meetingTranscriptionService = require('../services/meetingTranscription');
const { authenticateToken, checkProjectAccess } = require('../middleware/auth');

router.post('/projects/:projectId', authenticateToken, checkProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      meetingId,
      platform,
      meetingTitle,
      meetingUrl,
      startedAt,
      participants,
      organizerId,
      activationMode,
      consentGiven
    } = req.body;

    const meeting = await meetingTranscriptionService.createMeeting({
      projectId: parseInt(projectId),
      meetingId,
      platform,
      meetingTitle,
      meetingUrl,
      startedAt,
      participants,
      organizerId: organizerId ? parseInt(organizerId) : null,
      activationMode,
      initiatedBy: req.user.userId,
      consentGiven
    });

    res.status(201).json({ meeting });
  } catch (error) {
    console.error('Error creating meeting:', error);
    res.status(400).json({ error: error.message });
  }
});

router.get('/projects/:projectId', authenticateToken, checkProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { platform, status, startDate, endDate, limit } = req.query;

    const filters = {};
    if (platform) filters.platform = platform;
    if (status) filters.status = status;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (limit) filters.limit = parseInt(limit);

    const meetings = await meetingTranscriptionService.getMeetingsByProject(parseInt(projectId), filters);
    res.json({ meetings });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/projects/:projectId/stats', authenticateToken, checkProjectAccess, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { startDate, endDate } = req.query;

    const dateRange = {};
    if (startDate) dateRange.startDate = startDate;
    if (endDate) dateRange.endDate = endDate;

    const stats = await meetingTranscriptionService.getMeetingStats(parseInt(projectId), dateRange);
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching meeting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:meetingId', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await meetingTranscriptionService.getMeetingById(parseInt(meetingId));
    res.json({ meeting });
  } catch (error) {
    console.error('Error fetching meeting:', error);
    res.status(404).json({ error: error.message });
  }
});

router.put('/:meetingId/status', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { status, ...updates } = req.body;

    const meeting = await meetingTranscriptionService.updateMeetingStatus(
      parseInt(meetingId),
      status,
      updates
    );

    res.json({ meeting });
  } catch (error) {
    console.error('Error updating meeting status:', error);
    res.status(400).json({ error: error.message });
  }
});

router.put('/:meetingId/transcript', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { transcriptFull, audioUrl } = req.body;

    const meeting = await meetingTranscriptionService.updateTranscript(
      parseInt(meetingId),
      transcriptFull,
      audioUrl
    );

    res.json({ meeting });
  } catch (error) {
    console.error('Error updating transcript:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/:meetingId/process', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await meetingTranscriptionService.processTranscript(parseInt(meetingId), req.user.userId);
    res.json(result);
  } catch (error) {
    console.error('Error processing transcript:', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/:meetingId/cancel', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await meetingTranscriptionService.cancelMeeting(parseInt(meetingId));
    res.json({ meeting });
  } catch (error) {
    console.error('Error cancelling meeting:', error);
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:meetingId', authenticateToken, async (req, res) => {
  try {
    const { meetingId } = req.params;
    await meetingTranscriptionService.deleteMeeting(parseInt(meetingId));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting meeting:', error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
