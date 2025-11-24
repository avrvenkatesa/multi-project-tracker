const { pool } = require('../db');
const hallwayMeetingService = require('./hallwayMeetingService');

async function analyzeHallwayMeeting(meetingId, userId = null) {
  if (!meetingId) {
    throw new Error('meetingId is required');
  }

  console.log(`[HallwayAnalysis] Starting analysis for meeting ${meetingId}`);

  try {
    const meeting = await hallwayMeetingService.getMeetingById(meetingId);
    
    if (!meeting) {
      throw new Error(`Meeting ${meetingId} not found`);
    }

    const transcript = await hallwayMeetingService.getFullTranscript(meetingId);
    
    if (!transcript.fullText || transcript.fullText.trim().length === 0) {
      console.warn(`[HallwayAnalysis] No transcript available for meeting ${meetingId}`);
      return {
        success: false,
        message: 'No transcript available for analysis'
      };
    }

    const participants = await hallwayMeetingService.getParticipants(meetingId);
    const durationMinutes = meeting.durationSeconds ? Math.round(meeting.durationSeconds / 60) : 0;

    await pool.query(`
      UPDATE hallway_meetings
      SET 
        analysis_status = 'in_progress',
        updated_at = NOW()
      WHERE id = $1
    `, [meetingId]);

    let analysisResult;
    try {
      analysisResult = await extractEntities(
        transcript.fullText,
        meeting.projectId,
        {
          meetingId,
          participants: participants.map(p => p.participantName || p.username).filter(Boolean),
          durationMinutes,
          projectName: meeting.projectName
        }
      );
    } catch (error) {
      console.error(`[HallwayAnalysis] Entity extraction failed for meeting ${meetingId}:`, error);
      
      analysisResult = {
        entities: [],
        summary: generateFallbackSummary(transcript.fullText, participants, durationMinutes),
        keyTopics: [],
        sentimentScore: 0
      };
    }

    const summary = analysisResult.summary || generateFallbackSummary(transcript.fullText, participants, durationMinutes);
    const keyTopics = analysisResult.keyTopics || [];
    const sentimentScore = analysisResult.sentimentScore || 0;

    let decisionsCount = 0;
    let risksCount = 0;
    let actionItemsCount = 0;

    if (analysisResult.entities && analysisResult.entities.length > 0) {
      for (const entity of analysisResult.entities) {
        await createEntityDetection(meetingId, entity, userId);
        
        if (entity.entityType === 'decision') decisionsCount++;
        if (entity.entityType === 'risk') risksCount++;
        if (entity.entityType === 'action_item' || entity.entityType === 'task') actionItemsCount++;
      }
    }

    await pool.query(`
      UPDATE hallway_meetings
      SET 
        full_transcript = $1,
        summary_text = $2,
        key_topics = $3,
        sentiment_score = $4,
        decisions_detected = $5,
        risks_detected = $6,
        action_items_detected = $7,
        analysis_status = 'completed',
        status = 'completed',
        updated_at = NOW()
      WHERE id = $8
    `, [
      transcript.fullText,
      summary,
      keyTopics,
      sentimentScore,
      decisionsCount,
      risksCount,
      actionItemsCount,
      meetingId
    ]);

    console.log(`[HallwayAnalysis] Completed analysis for meeting ${meetingId}: ${analysisResult.entities?.length || 0} entities detected`);

    return {
      success: true,
      meetingId,
      entitiesDetected: analysisResult.entities?.length || 0,
      summary,
      keyTopics,
      sentimentScore,
      decisionsCount,
      risksCount,
      actionItemsCount
    };
  } catch (error) {
    console.error(`[HallwayAnalysis] Analysis failed for meeting ${meetingId}:`, error);
    
    await pool.query(`
      UPDATE hallway_meetings
      SET 
        analysis_status = 'failed',
        updated_at = NOW()
      WHERE id = $1
    `, [meetingId]);

    throw error;
  }
}

async function extractEntities(transcript, projectId, context = {}) {
  if (!transcript || transcript.trim().length === 0) {
    throw new Error('Transcript is required');
  }

  console.log(`[HallwayAnalysis] Extracting entities from transcript (${transcript.length} chars)`);

  try {
    const sidecarBot = require('./sidecarBot');
    
    const analysisResult = await sidecarBot.analyzeContent(
      transcript,
      null,
      projectId,
      {
        detectionMode: 'post_meeting',
        meetingId: context.meetingId,
        source: 'hallway_meeting',
        context: {
          participants: context.participants,
          durationMinutes: context.durationMinutes,
          projectName: context.projectName
        }
      }
    );

    const entities = [];

    if (analysisResult.workflowResults) {
      analysisResult.workflowResults.forEach(result => {
        if (result.entity) {
          entities.push({
            entityType: result.entity.type,
            title: result.entity.title,
            description: result.entity.description,
            confidence: result.entity.confidence || 0.8,
            impactLevel: result.entity.impact || 'medium',
            priority: result.entity.priority || 'medium',
            quoteText: result.entity.evidence?.[0]?.quote || null,
            wasAutoCreated: result.action === 'created',
            createdEntityId: result.entityId || null,
            assignedTo: result.entity.assignedTo || null
          });
        }
      });
    }

    const summary = analysisResult.summary || generateFallbackSummary(transcript, context.participants, context.durationMinutes);
    const keyTopics = extractKeyTopicsFromText(transcript);
    const sentimentScore = calculateSentiment(transcript);

    return {
      entities,
      summary,
      keyTopics,
      sentimentScore
    };
  } catch (error) {
    if (error.message && error.message.includes('Sidecar Bot')) {
      console.log(`[HallwayAnalysis] Sidecar Bot unavailable, using fallback analysis`);
      return performFallbackAnalysis(transcript, context);
    }
    throw error;
  }
}

async function performFallbackAnalysis(transcript, context) {
  console.log(`[HallwayAnalysis] Performing fallback analysis (keyword-based)`);

  const entities = extractEntitiesWithKeywords(transcript);
  const summary = generateFallbackSummary(transcript, context.participants, context.durationMinutes);
  const keyTopics = extractKeyTopicsFromText(transcript);
  const sentimentScore = calculateSentiment(transcript);

  return {
    entities,
    summary,
    keyTopics,
    sentimentScore
  };
}

function extractEntitiesWithKeywords(transcript) {
  const entities = [];
  const lines = transcript.split('\n');

  const decisionKeywords = ['decided', 'decision', 'we will', 'let\'s go with', 'agreed to'];
  const riskKeywords = ['risk', 'concern', 'worried about', 'problem', 'issue', 'blocker'];
  const actionKeywords = ['action item', 'todo', 'need to', 'should', 'must', 'task'];

  lines.forEach((line, index) => {
    const lowerLine = line.toLowerCase();

    decisionKeywords.forEach(keyword => {
      if (lowerLine.includes(keyword)) {
        entities.push({
          entityType: 'decision',
          title: line.substring(0, 100),
          description: line,
          confidence: 0.6,
          impactLevel: 'medium',
          quoteText: line,
          wasAutoCreated: false
        });
      }
    });

    riskKeywords.forEach(keyword => {
      if (lowerLine.includes(keyword)) {
        entities.push({
          entityType: 'risk',
          title: line.substring(0, 100),
          description: line,
          confidence: 0.6,
          impactLevel: 'medium',
          quoteText: line,
          wasAutoCreated: false
        });
      }
    });

    actionKeywords.forEach(keyword => {
      if (lowerLine.includes(keyword)) {
        entities.push({
          entityType: 'action_item',
          title: line.substring(0, 100),
          description: line,
          confidence: 0.6,
          priority: 'medium',
          quoteText: line,
          wasAutoCreated: false
        });
      }
    });
  });

  return entities.slice(0, 20);
}

function generateFallbackSummary(transcript, participants, durationMinutes) {
  const words = transcript.split(/\s+/);
  const wordCount = words.length;
  const participantList = participants && participants.length > 0 
    ? participants.join(', ') 
    : 'team members';

  const preview = transcript.substring(0, 200).trim();
  
  return `Meeting with ${participantList} lasted ${durationMinutes} minutes. ` +
         `Discussed: ${preview}... ` +
         `(${wordCount} words total)`;
}

function extractKeyTopicsFromText(transcript) {
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how']);

  const words = transcript.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !commonWords.has(word));

  const wordFreq = {};
  words.forEach(word => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });

  const sortedWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  return sortedWords;
}

function calculateSentiment(transcript) {
  const positiveWords = ['good', 'great', 'excellent', 'happy', 'success', 'achieved', 'progress', 'awesome', 'fantastic', 'love', 'like', 'agree'];
  const negativeWords = ['bad', 'terrible', 'issue', 'problem', 'concern', 'worried', 'fail', 'failed', 'stuck', 'blocker', 'risk', 'hate', 'disagree'];

  const lowerTranscript = transcript.toLowerCase();
  
  let positiveCount = 0;
  let negativeCount = 0;

  positiveWords.forEach(word => {
    const matches = lowerTranscript.match(new RegExp(`\\b${word}\\b`, 'g'));
    if (matches) positiveCount += matches.length;
  });

  negativeWords.forEach(word => {
    const matches = lowerTranscript.match(new RegExp(`\\b${word}\\b`, 'g'));
    if (matches) negativeCount += matches.length;
  });

  const total = positiveCount + negativeCount;
  if (total === 0) return 0;

  const score = (positiveCount - negativeCount) / total;
  return Math.max(-1, Math.min(1, score));
}

async function createEntityDetection(meetingId, entity, userId = null) {
  const {
    entityType,
    title,
    description,
    confidence = 0.8,
    impactLevel = 'medium',
    priority = 'medium',
    quoteText = null,
    timestampSeconds = null,
    wasAutoCreated = false,
    createdEntityId = null,
    assignedTo = null
  } = entity;

  try {
    const result = await pool.query(`
      INSERT INTO hallway_entity_detections (
        meeting_id,
        entity_type,
        title,
        description,
        confidence,
        impact_level,
        priority,
        detection_mode,
        was_auto_created,
        created_entity_id,
        quote_text,
        timestamp_seconds,
        assigned_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      meetingId,
      entityType,
      title,
      description,
      confidence,
      impactLevel,
      priority,
      'post_meeting',
      wasAutoCreated,
      createdEntityId,
      quoteText,
      timestampSeconds,
      assignedTo
    ]);

    console.log(`[HallwayAnalysis] Created entity detection: ${entityType} - "${title}"`);

    return result.rows[0];
  } catch (error) {
    console.error('[HallwayAnalysis] Error creating entity detection:', error);
    throw error;
  }
}

async function getEntityDetections(meetingId, filters = {}) {
  if (!meetingId) {
    throw new Error('meetingId is required');
  }

  try {
    const { entityType, wasDismissed = false } = filters;
    
    let query = `
      SELECT 
        hed.*,
        u.username AS assigned_to_username
      FROM hallway_entity_detections hed
      LEFT JOIN users u ON hed.assigned_to = u.id
      WHERE hed.meeting_id = $1
    `;
    const params = [meetingId];
    let paramIndex = 2;

    if (entityType) {
      query += ` AND hed.entity_type = $${paramIndex++}`;
      params.push(entityType);
    }

    if (wasDismissed) {
      query += ` AND hed.dismissed_at IS NOT NULL`;
    } else {
      query += ` AND hed.dismissed_at IS NULL`;
    }

    query += ' ORDER BY hed.confidence DESC, hed.created_at DESC';

    const result = await pool.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      meetingId: row.meeting_id,
      entityType: row.entity_type,
      title: row.title,
      description: row.description,
      confidence: parseFloat(row.confidence),
      impactLevel: row.impact_level,
      priority: row.priority,
      detectionMode: row.detection_mode,
      wasAutoCreated: row.was_auto_created,
      createdEntityId: row.created_entity_id,
      dismissedBy: row.dismissed_by,
      dismissedAt: row.dismissed_at,
      dismissalReason: row.dismissal_reason,
      quoteText: row.quote_text,
      timestampSeconds: row.timestamp_seconds ? parseFloat(row.timestamp_seconds) : null,
      assignedTo: row.assigned_to,
      assignedToUsername: row.assigned_to_username,
      metadata: row.metadata,
      createdAt: row.created_at
    }));
  } catch (error) {
    console.error('[HallwayAnalysis] Error getting entity detections:', error);
    throw error;
  }
}

async function dismissEntityDetection(detectionId, userId, reason = null) {
  if (!detectionId || !userId) {
    throw new Error('detectionId and userId are required');
  }

  try {
    const result = await pool.query(`
      UPDATE hallway_entity_detections
      SET 
        dismissed_by = $1,
        dismissed_at = NOW(),
        dismissal_reason = $2
      WHERE id = $3
      RETURNING *
    `, [userId, reason, detectionId]);

    if (result.rows.length === 0) {
      throw new Error(`Entity detection ${detectionId} not found`);
    }

    console.log(`[HallwayAnalysis] Dismissed entity detection ${detectionId}`);

    return result.rows[0];
  } catch (error) {
    console.error('[HallwayAnalysis] Error dismissing entity detection:', error);
    throw error;
  }
}

async function getMeetingStats(meetingId) {
  if (!meetingId) {
    throw new Error('meetingId is required');
  }

  try {
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) AS total_entities,
        COUNT(CASE WHEN entity_type = 'decision' THEN 1 END) AS decisions,
        COUNT(CASE WHEN entity_type = 'risk' THEN 1 END) AS risks,
        COUNT(CASE WHEN entity_type = 'action_item' THEN 1 END) AS action_items,
        COUNT(CASE WHEN entity_type = 'task' THEN 1 END) AS tasks,
        COUNT(CASE WHEN entity_type = 'blocker' THEN 1 END) AS blockers,
        COUNT(CASE WHEN was_auto_created = true THEN 1 END) AS auto_created,
        COUNT(CASE WHEN dismissed_at IS NOT NULL THEN 1 END) AS dismissed,
        AVG(confidence) AS avg_confidence
      FROM hallway_entity_detections
      WHERE meeting_id = $1
    `, [meetingId]);

    const stats = statsResult.rows[0];

    return {
      meetingId,
      totalEntities: parseInt(stats.total_entities, 10),
      decisions: parseInt(stats.decisions, 10),
      risks: parseInt(stats.risks, 10),
      actionItems: parseInt(stats.action_items, 10),
      tasks: parseInt(stats.tasks, 10),
      blockers: parseInt(stats.blockers, 10),
      autoCreated: parseInt(stats.auto_created, 10),
      dismissed: parseInt(stats.dismissed, 10),
      avgConfidence: stats.avg_confidence ? parseFloat(stats.avg_confidence) : 0
    };
  } catch (error) {
    console.error('[HallwayAnalysis] Error getting meeting stats:', error);
    throw error;
  }
}

module.exports = {
  analyzeHallwayMeeting,
  extractEntities,
  generateFallbackSummary,
  extractKeyTopicsFromText,
  calculateSentiment,
  createEntityDetection,
  getEntityDetections,
  dismissEntityDetection,
  getMeetingStats
};
