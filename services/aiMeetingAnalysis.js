const { Pool } = require('@neondatabase/serverless');
const OpenAI = require('openai');
const { logAICost } = require('./ai-cost-tracker');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class AIMeetingAnalysisService {
  async analyzeMeetingTranscript(transcript, meetingTitle, projectId) {
    if (!process.env.OPENAI_API_KEY) {
      return {
        detectedEntities: [],
        summary: 'AI analysis unavailable',
        keyPoints: [],
        actionItems: [],
        analysisSkipped: true,
        reason: 'configuration_missing'
      };
    }

    if (!transcript || transcript.trim().length === 0) {
      throw new Error('Transcript is empty');
    }

    const maxLength = 12000;
    if (transcript.length > maxLength) {
      transcript = transcript.substring(0, maxLength) + '...';
    }

    const startTime = Date.now();

    const systemPrompt = `You are an AI assistant analyzing meeting transcripts for project management.
Your task is to:
1. Summarize the meeting in 2-3 sentences
2. Extract key discussion points
3. Identify detected entities: decisions made, risks mentioned, action items assigned
4. Classify confidence for each detected entity

Respond in JSON format:
{
  "summary": "brief 2-3 sentence summary",
  "keyPoints": ["point 1", "point 2", ...],
  "detectedEntities": [
    {
      "type": "decision|risk|action_item",
      "title": "brief title",
      "description": "detailed description",
      "confidence": 0.0-1.0,
      "assignedTo": "person name or null",
      "dueDate": "date string or null"
    }
  ],
  "actionItems": ["action 1", "action 2", ...]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Meeting: ${meetingTitle}\n\nTranscript:\n${transcript}` }
        ],
        temperature: 0.3,
        max_tokens: 1500
      });

      const duration = Date.now() - startTime;

      await logAICost({
        provider: 'openai',
        model: 'gpt-4o',
        operation: 'meeting_analysis',
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        totalCost: this._calculateOpenAICost('gpt-4o', response.usage),
        duration,
        projectId,
        metadata: { meetingTitle }
      });

      const content = response.choices[0]?.message?.content?.trim() || '{}';
      
      let analysis;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          analysis = JSON.parse(content);
        }
      } catch (parseError) {
        console.error('[AIMeetingAnalysis] Failed to parse AI response:', parseError.message);
        return {
          detectedEntities: [],
          summary: 'Meeting analysis completed but response format was invalid',
          keyPoints: [],
          actionItems: [],
          analysisSkipped: false,
          parseError: true
        };
      }

      return {
        detectedEntities: analysis.detectedEntities || [],
        summary: analysis.summary || '',
        keyPoints: analysis.keyPoints || [],
        actionItems: analysis.actionItems || []
      };
    } catch (error) {
      console.error('[AIMeetingAnalysis] OpenAI API error:', error.message);
      
      return {
        detectedEntities: [],
        summary: 'AI analysis encountered an error and could not complete',
        keyPoints: [],
        actionItems: [],
        analysisSkipped: true,
        reason: 'api_error',
        errorType: error.code || error.status || 'unknown'
      };
    }
  }

  _calculateOpenAICost(model, usage) {
    if (!usage) return 0;

    const prices = {
      'gpt-4o': { input: 0.0025 / 1000, output: 0.01 / 1000 },
      'gpt-3.5-turbo': { input: 0.0005 / 1000, output: 0.0015 / 1000 }
    };

    const modelPrices = prices[model] || prices['gpt-3.5-turbo'];
    const inputCost = (usage.prompt_tokens || 0) * modelPrices.input;
    const outputCost = (usage.completion_tokens || 0) * modelPrices.output;

    return inputCost + outputCost;
  }
}

module.exports = new AIMeetingAnalysisService();
