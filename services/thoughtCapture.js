const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const OpenAI = require('openai');
const customRoles = require('./customRoles');
const aiDecisionMaker = require('./aiDecisionMaker');
const aiRiskDetector = require('./aiRiskDetector');
const { logAICost } = require('./ai-cost-tracker');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Thought Capture Service
 * Handles quick thought capture from users with AI analysis and auto-entity creation
 */
class ThoughtCaptureService {
  /**
   * Create a new thought capture
   */
  async createThought({ 
    projectId, 
    userId, 
    contentType, 
    textContent, 
    audioUrl, 
    fileUrl, 
    transcript,
    thoughtType = 'auto',
    tags = [],
    captureSource,
    deviceInfo
  }) {
    const client = await pool.connect();
    try {
      const userRoles = await customRoles.getUserRoles(userId, projectId);
      const primaryRole = userRoles.find(r => r.is_primary) || userRoles[0];

      const tagsArray = Array.isArray(tags) ? tags : (tags ? [tags] : []);

      const result = await client.query(`
        INSERT INTO thought_captures (
          project_id, created_by, content_type, text_content, audio_url, file_url,
          transcript, thought_type, user_role, user_authority_level, tags,
          capture_source, device_info
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        projectId, userId, contentType, textContent, audioUrl, fileUrl,
        transcript, thoughtType, 
        primaryRole ? primaryRole.role_name : null,
        primaryRole ? primaryRole.authority_level : 0,
        tagsArray, captureSource, deviceInfo
      ]);

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Analyze a thought capture using AI
   */
  async analyzeThought(thoughtId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const thoughtResult = await client.query(`
        SELECT * FROM thought_captures WHERE id = $1
      `, [thoughtId]);

      if (thoughtResult.rows.length === 0) {
        throw new Error('Thought not found');
      }

      const thought = thoughtResult.rows[0];
      const content = thought.text_content || thought.transcript;

      if (!content || content.trim().length === 0) {
        throw new Error('No text content to analyze');
      }

      const userRoles = await customRoles.getUserRoles(userId, thought.project_id);
      const primaryRole = userRoles.find(r => r.is_primary) || userRoles[0];

      const analysis = await this._performAIAnalysis(content, thought.thought_type, primaryRole);

      await client.query(`
        UPDATE thought_captures
        SET 
          analyzed = true,
          analysis_result = $1,
          analysis_confidence = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [JSON.stringify(analysis), analysis.confidence, thoughtId]);

      const createdEntities = [];
      const createdProposals = [];

      if (analysis.confidence >= 0.7) {
        const workflowResults = await this._processWorkflow(
          client, 
          thought, 
          analysis, 
          userId, 
          primaryRole
        );
        createdEntities.push(...workflowResults.entities);
        createdProposals.push(...workflowResults.proposals);
      }

      if (createdEntities.length > 0 || createdProposals.length > 0) {
        await client.query(`
          UPDATE thought_captures
          SET 
            created_entities = $1,
            created_proposals = $2,
            updated_at = NOW()
          WHERE id = $3
        `, [
          JSON.stringify(createdEntities),
          JSON.stringify(createdProposals),
          thoughtId
        ]);
      }

      await client.query('COMMIT');

      return {
        analysis,
        createdEntities,
        createdProposals
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get thought captures for a project
   */
  async getThoughtsByProject(projectId, filters = {}) {
    const conditions = ['project_id = $1'];
    const values = [projectId];
    let paramCount = 2;

    if (filters.userId) {
      conditions.push(`created_by = $${paramCount++}`);
      values.push(filters.userId);
    }

    if (filters.thoughtType && filters.thoughtType !== 'all') {
      conditions.push(`thought_type = $${paramCount++}`);
      values.push(filters.thoughtType);
    }

    if (filters.analyzed !== undefined) {
      conditions.push(`analyzed = $${paramCount++}`);
      values.push(filters.analyzed);
    }

    const result = await pool.query(`
      SELECT 
        tc.*,
        u.full_name as creator_name,
        u.email as creator_email
      FROM thought_captures tc
      JOIN users u ON tc.created_by = u.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY tc.created_at DESC
      LIMIT ${filters.limit || 50}
    `, values);

    return result.rows;
  }

  /**
   * Get thought by ID
   */
  async getThoughtById(thoughtId) {
    const result = await pool.query(`
      SELECT 
        tc.*,
        u.full_name as creator_name,
        u.email as creator_email
      FROM thought_captures tc
      JOIN users u ON tc.created_by = u.id
      WHERE tc.id = $1
    `, [thoughtId]);

    if (result.rows.length === 0) {
      throw new Error('Thought not found');
    }

    return result.rows[0];
  }

  /**
   * Delete a thought capture
   */
  async deleteThought(thoughtId, userId) {
    const thought = await this.getThoughtById(thoughtId);
    
    if (thought.created_by !== userId) {
      throw new Error('Unauthorized: Can only delete your own thoughts');
    }

    await pool.query(`
      DELETE FROM thought_captures WHERE id = $1
    `, [thoughtId]);

    return { success: true };
  }

  /**
   * Perform AI analysis of thought content
   */
  async _performAIAnalysis(content, hintType, userRole) {
    if (!process.env.OPENAI_API_KEY) {
      console.error('[ThoughtCapture] OpenAI API key not configured');
      return {
        thoughtType: hintType === 'auto' ? 'idea' : hintType,
        confidence: 0.3,
        summary: content.substring(0, 100),
        suggestedEntityType: null,
        reasoning: 'OpenAI API key not configured, using fallback classification'
      };
    }

    if (content.length > 4000) {
      content = content.substring(0, 4000) + '...';
    }

    const startTime = Date.now();

    const systemPrompt = `You are an AI assistant analyzing quick thoughts captured by project team members.
Your task is to:
1. Classify the thought type: decision, risk, idea, blocker, question
2. Extract key information
3. Determine if it should create an entity (risk, decision, action item)
4. Provide confidence score

User's role: ${userRole ? userRole.role_name : 'Unknown'} (Authority Level: ${userRole ? userRole.authority_level : 0})
Hint from user: ${hintType === 'auto' ? 'None provided' : hintType}

Respond in JSON format:
{
  "thoughtType": "decision|risk|idea|blocker|question",
  "confidence": 0.0-1.0,
  "summary": "brief summary",
  "suggestedEntityType": "decision|risk|action_item|null",
  "suggestedTitle": "title for entity if created",
  "suggestedDescription": "description for entity",
  "reasoning": "why this classification"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: content }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      const duration = Date.now() - startTime;
      
      await logAICost({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        operation: 'thought_analysis',
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        cost: this._calculateOpenAICost('gpt-3.5-turbo', response.usage),
        latencyMs: duration
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      return analysis;
    } catch (error) {
      console.error('AI analysis error:', error);
      return {
        thoughtType: hintType === 'auto' ? 'idea' : hintType,
        confidence: 0.3,
        summary: content.substring(0, 100),
        suggestedEntityType: null,
        reasoning: 'AI analysis failed, using fallback classification'
      };
    }
  }

  /**
   * Process workflow based on analysis and user permissions
   */
  async _processWorkflow(client, thought, analysis, userId, userRole) {
    const entities = [];
    const proposals = [];

    if (!analysis.suggestedEntityType) {
      return { entities, proposals };
    }

    const permCheck = await customRoles.checkPermission(
      userId,
      thought.project_id,
      analysis.suggestedEntityType,
      'create'
    );

    if (!permCheck.allowed) {
      return { entities, proposals };
    }

    const entityData = {
      title: analysis.suggestedTitle,
      description: analysis.suggestedDescription,
      metadata: {
        source: 'thought_capture',
        thoughtId: thought.id,
        originalContent: thought.text_content || thought.transcript
      }
    };

    if (analysis.suggestedEntityType === 'decision') {
      if (permCheck.requiresApproval) {
        const proposal = await aiDecisionMaker.createProposal({
          projectId: thought.project_id,
          proposedBy: userId,
          title: entityData.title,
          description: entityData.description,
          alternatives: [],
          confidence: analysis.confidence,
          rationale: analysis.reasoning
        });
        proposals.push({ type: 'decision', id: proposal.id, proposal_id: proposal.proposal_id });
      } else {
        const decision = await this._createDecision(client, thought.project_id, userId, entityData);
        entities.push({ type: 'decision', id: decision.id, decision_id: decision.decision_id });
      }
    } else if (analysis.suggestedEntityType === 'risk') {
      if (permCheck.requiresApproval) {
        const proposal = await aiDecisionMaker.createProposal({
          projectId: thought.project_id,
          proposedBy: userId,
          entityType: 'risk',
          title: entityData.title,
          description: entityData.description,
          confidence: analysis.confidence,
          rationale: analysis.reasoning
        });
        proposals.push({ type: 'risk', id: proposal.id, proposal_id: proposal.proposal_id });
      } else {
        const risk = await this._createRisk(client, thought.project_id, userId, entityData, analysis.confidence);
        entities.push({ type: 'risk', id: risk.id, risk_id: risk.risk_id });
      }
    } else if (analysis.suggestedEntityType === 'action_item') {
      const actionItem = await this._createActionItem(client, thought.project_id, userId, entityData);
      entities.push({ type: 'action_item', id: actionItem.id });
    }

    return { entities, proposals };
  }

  /**
   * Create decision from thought
   */
  async _createDecision(client, projectId, userId, data) {
    const decisionIdResult = await client.query(`
      SELECT COALESCE(MAX(CAST(SUBSTRING(decision_id FROM 'DEC-(.*)') AS INTEGER)), 0) + 1 as next_num
      FROM decisions WHERE project_id = $1
    `, [projectId]);
    const nextNum = decisionIdResult.rows[0].next_num;
    const decisionId = `DEC-${String(nextNum).padStart(3, '0')}`;

    const result = await client.query(`
      INSERT INTO decisions (
        project_id, decision_id, title, description, status, made_by, metadata
      ) VALUES ($1, $2, $3, $4, 'proposed', $5, $6)
      RETURNING *
    `, [projectId, decisionId, data.title, data.description, userId, data.metadata]);

    return result.rows[0];
  }

  /**
   * Create risk from thought
   */
  async _createRisk(client, projectId, userId, data, confidence) {
    const riskIdResult = await client.query(`SELECT generate_risk_id($1) as risk_id`, [projectId]);
    const riskId = riskIdResult.rows[0].risk_id;

    const result = await client.query(`
      INSERT INTO risks (
        project_id, risk_id, title, description, status, probability, impact,
        identified_by, ai_detected, ai_confidence, metadata
      ) VALUES ($1, $2, $3, $4, 'identified', 0.5, 0.5, $5, true, $6, $7)
      RETURNING *
    `, [projectId, riskId, data.title, data.description, userId, confidence, data.metadata]);

    return result.rows[0];
  }

  /**
   * Create action item from thought
   */
  async _createActionItem(client, projectId, userId, data) {
    const result = await client.query(`
      INSERT INTO action_items (
        project_id, title, description, status, assigned_to, metadata
      ) VALUES ($1, $2, $3, 'open', $4, $5)
      RETURNING *
    `, [projectId, data.title, data.description, userId, data.metadata]);

    return result.rows[0];
  }

  /**
   * Calculate OpenAI cost
   */
  _calculateOpenAICost(model, usage) {
    const pricing = {
      'gpt-3.5-turbo': { input: 0.0015 / 1000, output: 0.002 / 1000 },
      'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 }
    };

    const rates = pricing[model] || pricing['gpt-3.5-turbo'];
    return (usage.prompt_tokens * rates.input) + (usage.completion_tokens * rates.output);
  }
}

module.exports = new ThoughtCaptureService();
