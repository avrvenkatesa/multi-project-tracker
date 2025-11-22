/**
 * Meeting Summary Generator
 * Creates comprehensive AI-powered summaries after meetings end
 * Includes sentiment analysis, key highlights, participant insights, and distribution
 */

const { pool } = require('../db');
const llmClient = require('./llmClient');

class MeetingSummaryGenerator {
  constructor() {
    // Engagement thresholds
    this.ENGAGEMENT_THRESHOLDS = {
      HIGH: { speakingTime: 300, chunks: 10 },
      MEDIUM: { speakingTime: 120, chunks: 5 }
    };
    
    // Export formats
    this.FORMATS = ['markdown', 'json', 'html', 'pdf'];
  }

  /**
   * Main method: Generate comprehensive meeting summary
   * @param {string} meetingId - External meeting ID
   * @returns {Promise<Object>} Generated summary record
   */
  async generateSummary(meetingId) {
    try {
      console.log(`[Summary Generator] Generating summary for meeting ${meetingId}`);

      // Get meeting record
      const meetingResult = await pool.query(`
        SELECT
          mt.*,
          COUNT(DISTINCT mp.id) as participant_count,
          COUNT(DISTINCT tc.id) as chunk_count
        FROM meeting_transcriptions mt
        LEFT JOIN meeting_participants mp ON mt.id = mp.meeting_id
        LEFT JOIN transcript_chunks tc ON mt.id = tc.meeting_id
        WHERE mt.meeting_id = $1
        GROUP BY mt.id
      `, [meetingId]);

      if (meetingResult.rows.length === 0) {
        throw new Error(`Meeting not found: ${meetingId}`);
      }

      const meeting = meetingResult.rows[0];

      if (meeting.status !== 'ended') {
        throw new Error(`Cannot generate summary for active meeting: ${meetingId}`);
      }

      // Build full transcript
      const transcript = await this.buildFullTranscript(meeting.id);

      // Get promoted entities
      const entities = await this.getPromotedEntities(meeting.id);

      // Get participant statistics
      const participantStats = await this.getParticipantStats(meeting.id);

      // Generate AI summary
      const aiSummary = await this.generateAISummary({
        meeting,
        transcript,
        entities,
        participantStats
      });

      // Perform sentiment analysis
      const sentiment = await this.analyzeSentiment(transcript.raw);

      // Extract key topics
      const topics = await this.extractTopics(transcript.raw);

      // Store summary in database
      const summaryResult = await pool.query(`
        INSERT INTO meeting_summaries (
          meeting_id, summary_text, key_decisions, key_risks, action_items,
          participants_count, total_speaking_time, sentiment_score,
          ai_provider, generation_cost, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (meeting_id) 
        DO UPDATE SET
          summary_text = $2,
          key_decisions = $3,
          key_risks = $4,
          action_items = $5,
          participants_count = $6,
          total_speaking_time = $7,
          sentiment_score = $8,
          ai_provider = $9,
          generation_cost = $10,
          metadata = $11,
          generated_at = NOW()
        RETURNING *
      `, [
        meeting.id,
        aiSummary.summary,
        entities.decisions.length,
        entities.risks.length,
        entities.action_items.length + entities.tasks.length,
        participantStats.total_participants,
        participantStats.total_speaking_time,
        sentiment.score,
        aiSummary.provider,
        aiSummary.cost,
        JSON.stringify({
          topics,
          highlights: aiSummary.highlights,
          concerns: aiSummary.concerns,
          next_steps: aiSummary.next_steps,
          participant_insights: participantStats.insights,
          entity_breakdown: entities,
          sentiment_details: sentiment
        })
      ]);

      console.log(`[Summary Generator] Summary generated successfully (sentiment: ${sentiment.score}, cost: $${aiSummary.cost})`);

      return summaryResult.rows[0];

    } catch (error) {
      console.error('[Summary Generator] Error generating summary:', error);
      throw error;
    }
  }

  /**
   * Build full transcript from chunks
   * @param {number} dbMeetingId - Database meeting ID
   * @returns {Promise<Object>} Formatted transcript
   */
  async buildFullTranscript(dbMeetingId) {
    try {
      const chunksResult = await pool.query(`
        SELECT
          speaker_name,
          content,
          start_time_seconds,
          end_time_seconds
        FROM transcript_chunks
        WHERE meeting_id = $1 AND is_final = true
        ORDER BY chunk_sequence ASC
      `, [dbMeetingId]);

      // Group by speaker for better readability
      const transcript = [];
      let currentSpeaker = null;
      let currentBlock = { speaker: null, content: [], start_time: null };

      for (const chunk of chunksResult.rows) {
        if (chunk.speaker_name !== currentSpeaker) {
          if (currentBlock.content.length > 0) {
            transcript.push(currentBlock);
          }
          currentSpeaker = chunk.speaker_name;
          currentBlock = {
            speaker: currentSpeaker,
            content: [chunk.content],
            start_time: chunk.start_time_seconds
          };
        } else {
          currentBlock.content.push(chunk.content);
        }
      }

      if (currentBlock.content.length > 0) {
        transcript.push(currentBlock);
      }

      // Format as dialogue
      const formattedTranscript = transcript
        .map(block => `${block.speaker}: ${block.content.join(' ')}`)
        .join('\n\n');

      return {
        raw: formattedTranscript,
        blocks: transcript,
        total_chars: formattedTranscript.length,
        total_blocks: transcript.length
      };

    } catch (error) {
      console.error('[Summary Generator] Error building transcript:', error);
      throw error;
    }
  }

  /**
   * Get promoted entities from live detections
   * @param {number} dbMeetingId - Database meeting ID
   * @returns {Promise<Object>} Entities grouped by type
   */
  async getPromotedEntities(dbMeetingId) {
    try {
      const entitiesResult = await pool.query(`
        SELECT
          entity_type,
          title,
          description,
          confidence,
          impact_level,
          created_entity_id
        FROM live_entity_detections
        WHERE meeting_id = $1 AND was_auto_created = true
        ORDER BY confidence DESC
      `, [dbMeetingId]);

      const entities = {
        decisions: [],
        risks: [],
        action_items: [],
        tasks: [],
        blockers: [],
        discussions: []
      };

      for (const entity of entitiesResult.rows) {
        const type = entity.entity_type.toLowerCase();
        if (type === 'decision') {
          entities.decisions.push(entity);
        } else if (type === 'risk') {
          entities.risks.push(entity);
        } else if (type === 'action_item') {
          entities.action_items.push(entity);
        } else if (type === 'task') {
          entities.tasks.push(entity);
        } else if (type === 'blocker') {
          entities.blockers.push(entity);
        } else if (type === 'discussion') {
          entities.discussions.push(entity);
        }
      }

      return entities;

    } catch (error) {
      console.error('[Summary Generator] Error getting entities:', error);
      throw error;
    }
  }

  /**
   * Calculate participant statistics
   * @param {number} dbMeetingId - Database meeting ID
   * @returns {Promise<Object>} Participant statistics
   */
  async getParticipantStats(dbMeetingId) {
    try {
      const participantsResult = await pool.query(`
        SELECT
          mp.participant_name,
          mp.user_id,
          mp.is_organizer,
          mp.speaking_time_seconds,
          EXTRACT(EPOCH FROM (COALESCE(mp.left_at, NOW()) - mp.joined_at))::INTEGER as duration_seconds,
          COUNT(DISTINCT tc.id) as chunks_spoken
        FROM meeting_participants mp
        LEFT JOIN transcript_chunks tc ON tc.meeting_id = mp.meeting_id
          AND tc.speaker_name = mp.participant_name
        WHERE mp.meeting_id = $1
        GROUP BY mp.id
        ORDER BY mp.speaking_time_seconds DESC NULLS LAST
      `, [dbMeetingId]);

      const totalSpeakingTime = participantsResult.rows.reduce(
        (sum, p) => sum + (p.speaking_time_seconds || 0), 0
      );

      const insights = participantsResult.rows.map(p => ({
        name: p.participant_name,
        speaking_time: p.speaking_time_seconds || 0,
        percentage: totalSpeakingTime > 0
          ? ((p.speaking_time_seconds || 0) / totalSpeakingTime * 100).toFixed(1)
          : 0,
        chunks_spoken: parseInt(p.chunks_spoken) || 0,
        is_organizer: p.is_organizer,
        engagement: this.calculateEngagement(p)
      }));

      return {
        total_participants: participantsResult.rows.length,
        total_speaking_time: totalSpeakingTime,
        insights
      };

    } catch (error) {
      console.error('[Summary Generator] Error getting participant stats:', error);
      throw error;
    }
  }

  /**
   * Calculate participant engagement level
   */
  calculateEngagement(participant) {
    const speakingTime = participant.speaking_time_seconds || 0;
    const chunks = parseInt(participant.chunks_spoken) || 0;

    if (speakingTime > this.ENGAGEMENT_THRESHOLDS.HIGH.speakingTime && 
        chunks > this.ENGAGEMENT_THRESHOLDS.HIGH.chunks) {
      return 'high';
    }
    if (speakingTime > this.ENGAGEMENT_THRESHOLDS.MEDIUM.speakingTime && 
        chunks > this.ENGAGEMENT_THRESHOLDS.MEDIUM.chunks) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Generate AI summary using LLM
   * @param {Object} params - Meeting data
   * @returns {Promise<Object>} AI-generated summary
   */
  async generateAISummary({ meeting, transcript, entities, participantStats }) {
    try {
      // Limit transcript to 15k chars for API
      const truncatedTranscript = transcript.raw.substring(0, 15000);

      // Build prompt
      const summaryPrompt = `You are analyzing a ${meeting.meeting_platform} meeting titled "${meeting.meeting_title}".

Meeting Duration: ${Math.round(meeting.duration_seconds / 60)} minutes
Participants: ${participantStats.total_participants}

FULL TRANSCRIPT:
${truncatedTranscript}

DETECTED ENTITIES:
Decisions (${entities.decisions.length}):
${entities.decisions.map(d => `- ${d.title}`).join('\n') || 'None'}

Risks (${entities.risks.length}):
${entities.risks.map(r => `- ${r.title} (${r.impact_level} impact)`).join('\n') || 'None'}

Action Items (${entities.action_items.length}):
${entities.action_items.map(a => `- ${a.title}`).join('\n') || 'None'}

TASK: Generate a comprehensive meeting summary with the following sections:

1. EXECUTIVE SUMMARY (3-5 sentences)
2. KEY HIGHLIGHTS (top 5 important points discussed)
3. DECISIONS MADE (list all decisions with brief context)
4. RISKS IDENTIFIED (list risks with mitigation suggestions)
5. ACTION ITEMS (list with suggested assignees if mentioned)
6. CONCERNS RAISED (any blockers or issues discussed)
7. NEXT STEPS (what should happen after this meeting)

Format as Markdown. Be concise and factual.`;

      const systemPrompt = `You are a meeting summary AI assistant. Generate clear, concise, and actionable meeting summaries. Focus on decisions, action items, and next steps. Extract key insights from discussions.`;

      // Call LLM client
      const result = await llmClient.callLLM({
        prompt: summaryPrompt,
        systemPrompt: systemPrompt,
        provider: process.env.PRIMARY_LLM_PROVIDER || 'claude',
        maxTokens: 2000
      });

      // Parse summary from response
      const summary = result.content || result.text || 'Summary generation failed';

      // Extract structured sections
      const sections = this.parseSummarySections(summary);

      return {
        summary: summary,
        highlights: sections.highlights,
        concerns: sections.concerns,
        next_steps: sections.next_steps,
        provider: result.provider || 'claude',
        cost: result.cost || 0
      };

    } catch (error) {
      console.error('[Summary Generator] AI summary failed:', error);

      // Fallback to template-based summary
      return this.generateTemplateSummary({ meeting, transcript, entities, participantStats });
    }
  }

  /**
   * Parse summary sections from AI response
   */
  parseSummarySections(summary) {
    const sections = {
      highlights: [],
      concerns: [],
      next_steps: []
    };

    // Extract KEY HIGHLIGHTS section
    const highlightsMatch = summary.match(/KEY HIGHLIGHTS[:\s]+([\s\S]*?)(?=\n##|\n\d+\.|$)/i);
    if (highlightsMatch) {
      sections.highlights = highlightsMatch[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().match(/^\d+\./))
        .map(line => line.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    // Extract CONCERNS section
    const concernsMatch = summary.match(/CONCERNS[:\s]+([\s\S]*?)(?=\n##|\n\d+\.|$)/i);
    if (concernsMatch) {
      sections.concerns = concernsMatch[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().match(/^\d+\./))
        .map(line => line.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    // Extract NEXT STEPS section
    const nextStepsMatch = summary.match(/NEXT STEPS[:\s]+([\s\S]*?)(?=\n##|\n\d+\.|$)/i);
    if (nextStepsMatch) {
      sections.next_steps = nextStepsMatch[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().match(/^\d+\./))
        .map(line => line.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '').trim())
        .filter(line => line.length > 0);
    }

    return sections;
  }

  /**
   * Generate template-based summary (fallback)
   */
  generateTemplateSummary({ meeting, transcript, entities, participantStats }) {
    const summary = `# Meeting Summary: ${meeting.meeting_title}

## Executive Summary
Meeting held on ${meeting.meeting_platform} with ${participantStats.total_participants} participants for ${Math.round(meeting.duration_seconds / 60)} minutes.

## Key Highlights
${entities.decisions.length > 0 ? `- ${entities.decisions.length} decisions made` : ''}
${entities.risks.length > 0 ? `- ${entities.risks.length} risks identified` : ''}
${entities.action_items.length > 0 ? `- ${entities.action_items.length} action items created` : ''}

## Decisions Made
${entities.decisions.map(d => `- **${d.title}**: ${d.description || 'No description'}`).join('\n') || 'No decisions recorded'}

## Risks Identified
${entities.risks.map(r => `- **${r.title}** (${r.impact_level} impact): ${r.description || 'No description'}`).join('\n') || 'No risks recorded'}

## Action Items
${entities.action_items.map(a => `- **${a.title}**: ${a.description || 'No description'}`).join('\n') || 'No action items recorded'}

## Next Steps
- Review and assign action items
- Address identified risks
- Schedule follow-up if needed
`;

    return {
      summary,
      highlights: [`${entities.decisions.length} decisions`, `${entities.risks.length} risks`, `${entities.action_items.length} action items`],
      concerns: entities.risks.map(r => r.title),
      next_steps: ['Review action items', 'Address risks', 'Schedule follow-up'],
      provider: 'template',
      cost: 0
    };
  }

  /**
   * Analyze sentiment of transcript
   */
  async analyzeSentiment(transcriptText) {
    // Simple sentiment analysis based on keywords
    // In production, this would use a sentiment analysis API

    const positiveWords = ['agree', 'good', 'great', 'excellent', 'success', 'progress', 'approve', 'yes', 'perfect', 'awesome'];
    const negativeWords = ['concern', 'risk', 'problem', 'issue', 'blocker', 'difficult', 'worry', 'no', 'disagree', 'fail'];
    const neutralWords = ['discuss', 'review', 'consider', 'maybe', 'perhaps', 'possible'];

    const lowerText = transcriptText.toLowerCase();
    
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;

    positiveWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      positiveCount += (lowerText.match(regex) || []).length;
    });

    negativeWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      negativeCount += (lowerText.match(regex) || []).length;
    });

    neutralWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      neutralCount += (lowerText.match(regex) || []).length;
    });

    const total = positiveCount + negativeCount + neutralCount || 1;
    const score = ((positiveCount - negativeCount) / total).toFixed(2);

    return {
      score: Math.max(-1, Math.min(1, parseFloat(score))), // Clamp to -1 to 1
      positive_count: positiveCount,
      negative_count: negativeCount,
      neutral_count: neutralCount,
      overall: score > 0.1 ? 'positive' : score < -0.1 ? 'negative' : 'neutral'
    };
  }

  /**
   * Extract key topics from transcript
   */
  async extractTopics(transcriptText) {
    // Simple keyword extraction
    // In production, use TF-IDF or NLP library

    const words = transcriptText.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 4); // Only words > 4 chars

    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    // Get top 10 most frequent words
    const topics = Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word, count]) => ({ word, count }));

    return topics;
  }

  /**
   * Generate executive summary (short version)
   */
  async generateExecutiveSummary(meetingId) {
    try {
      const fullSummary = await this.getSummary(meetingId);

      if (!fullSummary) {
        throw new Error(`No summary found for meeting: ${meetingId}`);
      }

      const metadata = fullSummary.metadata || {};
      const highlights = metadata.highlights || [];
      const entities = metadata.entity_breakdown || {};

      const executiveSummary = {
        meeting_id: meetingId,
        overview: `Meeting with ${fullSummary.participants_count} participants (${Math.round(fullSummary.total_speaking_time / 60)} min)`,
        top_decisions: entities.decisions?.slice(0, 3).map(d => d.title) || [],
        top_risks: entities.risks?.slice(0, 3).map(r => r.title) || [],
        top_action_items: entities.action_items?.slice(0, 3).map(a => a.title) || [],
        sentiment: metadata.sentiment_details?.overall || 'neutral',
        key_highlights: highlights.slice(0, 5)
      };

      return executiveSummary;

    } catch (error) {
      console.error('[Summary Generator] Error generating executive summary:', error);
      throw error;
    }
  }

  /**
   * Get summary for a meeting
   */
  async getSummary(meetingId) {
    try {
      const result = await pool.query(`
        SELECT
          ms.*,
          mt.meeting_id as external_meeting_id,
          mt.meeting_title,
          mt.platform as meeting_platform,
          mt.started_at,
          mt.ended_at
        FROM meeting_summaries ms
        JOIN meeting_transcriptions mt ON ms.meeting_id = mt.id
        WHERE mt.meeting_id = $1
        ORDER BY ms.generated_at DESC
        LIMIT 1
      `, [meetingId]);

      return result.rows[0] || null;

    } catch (error) {
      console.error('[Summary Generator] Error getting summary:', error);
      throw error;
    }
  }

  /**
   * Regenerate summary
   */
  async regenerateSummary(meetingId, userId) {
    try {
      console.log(`[Summary Generator] Regenerating summary for meeting ${meetingId} by user ${userId}`);

      // Delete old summary
      await pool.query(`
        DELETE FROM meeting_summaries
        WHERE meeting_id = (
          SELECT id FROM meeting_transcriptions WHERE meeting_id = $1
        )
      `, [meetingId]);

      // Generate new summary
      const summary = await this.generateSummary(meetingId);

      return summary;

    } catch (error) {
      console.error('[Summary Generator] Error regenerating summary:', error);
      throw error;
    }
  }

  /**
   * Export summary in different formats
   */
  async exportSummary(meetingId, format = 'markdown') {
    try {
      if (!this.FORMATS.includes(format)) {
        throw new Error(`Invalid format: ${format}. Must be one of: ${this.FORMATS.join(', ')}`);
      }

      const summary = await this.getSummary(meetingId);

      if (!summary) {
        throw new Error(`No summary found for meeting: ${meetingId}`);
      }

      switch (format) {
        case 'markdown':
          return this.exportAsMarkdown(summary);
        case 'json':
          return this.exportAsJSON(summary);
        case 'html':
          return this.exportAsHTML(summary);
        case 'pdf':
          return this.exportAsPDF(summary);
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

    } catch (error) {
      console.error('[Summary Generator] Error exporting summary:', error);
      throw error;
    }
  }

  /**
   * Export as Markdown
   */
  exportAsMarkdown(summary) {
    return {
      format: 'markdown',
      content: summary.summary_text,
      filename: `meeting-summary-${summary.external_meeting_id}.md`
    };
  }

  /**
   * Export as JSON
   */
  exportAsJSON(summary) {
    return {
      format: 'json',
      content: JSON.stringify(summary, null, 2),
      filename: `meeting-summary-${summary.external_meeting_id}.json`
    };
  }

  /**
   * Export as HTML
   */
  exportAsHTML(summary) {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Meeting Summary: ${summary.meeting_title}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
    h1 { color: #333; }
    h2 { color: #666; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .metadata { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .stat { display: inline-block; margin-right: 20px; }
  </style>
</head>
<body>
  <h1>Meeting Summary: ${summary.meeting_title}</h1>
  <div class="metadata">
    <div class="stat"><strong>Platform:</strong> ${summary.meeting_platform}</div>
    <div class="stat"><strong>Date:</strong> ${new Date(summary.started_at).toLocaleString()}</div>
    <div class="stat"><strong>Participants:</strong> ${summary.participants_count}</div>
    <div class="stat"><strong>Decisions:</strong> ${summary.key_decisions}</div>
    <div class="stat"><strong>Risks:</strong> ${summary.key_risks}</div>
    <div class="stat"><strong>Action Items:</strong> ${summary.action_items}</div>
  </div>
  ${this.markdownToHTML(summary.summary_text)}
</body>
</html>`;

    return {
      format: 'html',
      content: html,
      filename: `meeting-summary-${summary.external_meeting_id}.html`
    };
  }

  /**
   * Simple markdown to HTML converter
   */
  markdownToHTML(markdown) {
    return markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^\* (.*$)/gim, '<li>$1</li>')
      .replace(/^\- (.*$)/gim, '<li>$1</li>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>')
      .replace(/<\/ul><ul>/g, '');
  }

  /**
   * Export as PDF (placeholder - would use pdfkit)
   */
  exportAsPDF(summary) {
    // In production, use pdfkit to generate PDF
    // For now, return HTML that can be printed to PDF
    return this.exportAsHTML(summary);
  }

  /**
   * Distribute summary to participants (placeholder)
   */
  async distributeSummary(meetingId, channels = ['email']) {
    try {
      console.log(`[Summary Generator] Distributing summary for meeting ${meetingId} via ${channels.join(', ')}`);

      // TODO: Integrate with email/Slack/Teams services
      // For now, just log the distribution

      const summary = await this.getSummary(meetingId);

      if (!summary) {
        throw new Error(`No summary found for meeting: ${meetingId}`);
      }

      const distribution = {
        meeting_id: meetingId,
        channels,
        distributed_at: new Date(),
        status: 'pending',
        recipients: []
      };

      return distribution;

    } catch (error) {
      console.error('[Summary Generator] Error distributing summary:', error);
      throw error;
    }
  }

  /**
   * Compare meetings (trends)
   */
  async compareMeetings(meetingIds) {
    try {
      if (!Array.isArray(meetingIds) || meetingIds.length < 2) {
        throw new Error('At least 2 meeting IDs required for comparison');
      }

      const summaries = await Promise.all(
        meetingIds.map(id => this.getSummary(id))
      );

      const comparison = {
        meetings: summaries.filter(s => s !== null),
        trends: {
          avg_participants: summaries.reduce((sum, s) => sum + (s?.participants_count || 0), 0) / summaries.length,
          avg_decisions: summaries.reduce((sum, s) => sum + (s?.key_decisions || 0), 0) / summaries.length,
          avg_risks: summaries.reduce((sum, s) => sum + (s?.key_risks || 0), 0) / summaries.length,
          avg_action_items: summaries.reduce((sum, s) => sum + (s?.action_items || 0), 0) / summaries.length,
          avg_sentiment: summaries.reduce((sum, s) => sum + (s?.sentiment_score || 0), 0) / summaries.length
        }
      };

      return comparison;

    } catch (error) {
      console.error('[Summary Generator] Error comparing meetings:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new MeetingSummaryGenerator();
