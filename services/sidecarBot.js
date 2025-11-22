/**
 * Sidecar Bot - Core AI Analysis Engine
 * Analyzes content from various platforms to detect and create project entities
 */

const pool = require('../db');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class SidecarBot {
  /**
   * Analyze content and determine entity type, priority, and details
   * @param {Object} params - { projectId, content, source }
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeContent({ projectId, content, source }) {
    try {
      console.log(`[Sidecar Bot] Analyzing content from ${source.type}`);

      // Get project context
      const projectContext = await this.getProjectContext(projectId);

      // Prepare AI prompt
      const prompt = this.buildAnalysisPrompt(content, source, projectContext);

      // Call OpenAI for analysis
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant that analyzes project communications to identify tasks, bugs, features, and other work items.
            You extract structured information and provide actionable insights.
            Always respond with valid JSON matching the specified schema.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const analysis = JSON.parse(completion.choices[0].message.content);

      // Validate and enhance analysis
      const processedAnalysis = this.processAnalysis(analysis, content, source);

      console.log(`[Sidecar Bot] Analysis complete: ${processedAnalysis.entity_type} detected`);

      return processedAnalysis;

    } catch (error) {
      console.error('[Sidecar Bot] Analysis error:', error);

      // Fallback to basic analysis if AI fails
      return this.fallbackAnalysis(content, source);
    }
  }

  /**
   * Build analysis prompt for OpenAI
   */
  buildAnalysisPrompt(content, source, projectContext) {
    return `Analyze the following ${source.type} message and extract project entity information.

PROJECT CONTEXT:
- Project Name: ${projectContext.name}
- Project Type: ${projectContext.type || 'software development'}
- Active Sprint: ${projectContext.current_sprint || 'N/A'}

MESSAGE CONTENT:
${content}

SOURCE INFORMATION:
- Platform: ${source.type}
- From: ${source.from || 'unknown'}
${source.subject ? `- Subject: ${source.subject}` : ''}

ANALYSIS REQUIREMENTS:
Determine if this message describes a work item and provide:

1. entity_type: One of ["task", "bug", "feature", "issue", "question", "discussion", "none"]
2. confidence: Float 0.0-1.0 indicating confidence in the detection
3. title: Concise title (max 100 chars)
4. description: Detailed description extracted from content
5. priority: One of ["critical", "high", "medium", "low"]
6. estimated_complexity: One of ["trivial", "low", "medium", "high", "very_high"]
7. suggested_tags: Array of relevant tags
8. extracted_requirements: Array of specific requirements mentioned
9. mentioned_users: Array of user names/emails mentioned
10. related_systems: Array of systems/components mentioned

Respond with valid JSON matching this schema:
{
  "entity_type": "task|bug|feature|issue|question|discussion|none",
  "confidence": 0.85,
  "title": "Brief title",
  "description": "Detailed description",
  "priority": "medium",
  "estimated_complexity": "medium",
  "suggested_tags": ["tag1", "tag2"],
  "extracted_requirements": ["requirement 1", "requirement 2"],
  "mentioned_users": ["user@example.com"],
  "related_systems": ["authentication", "database"],
  "reasoning": "Brief explanation of why this was classified this way"
}`;
  }

  /**
   * Get project context for better analysis
   */
  async getProjectContext(projectId) {
    try {
      const result = await pool.query(
        'SELECT id, name, description FROM projects WHERE id = $1',
        [projectId]
      );

      if (result.rows.length === 0) {
        return { name: 'Unknown Project', type: 'software' };
      }

      return result.rows[0];
    } catch (error) {
      console.error('[Sidecar Bot] Error getting project context:', error);
      return { name: 'Unknown Project', type: 'software' };
    }
  }

  /**
   * Process and validate AI analysis
   */
  processAnalysis(analysis, content, source) {
    // Ensure all required fields exist
    const processed = {
      entity_type: analysis.entity_type || 'discussion',
      confidence: Math.min(Math.max(analysis.confidence || 0.5, 0), 1),
      title: (analysis.title || this.extractTitle(content)).substring(0, 100),
      description: analysis.description || content.substring(0, 500),
      priority: analysis.priority || 'medium',
      estimated_complexity: analysis.estimated_complexity || 'medium',
      suggested_tags: Array.isArray(analysis.suggested_tags) ? analysis.suggested_tags : [],
      extracted_requirements: Array.isArray(analysis.extracted_requirements) ? analysis.extracted_requirements : [],
      mentioned_users: Array.isArray(analysis.mentioned_users) ? analysis.mentioned_users : [],
      related_systems: Array.isArray(analysis.related_systems) ? analysis.related_systems : [],
      reasoning: analysis.reasoning || '',
      source_type: source.type,
      source_metadata: {
        from: source.from,
        subject: source.subject,
        timestamp: source.timestamp || new Date().toISOString()
      }
    };

    // Adjust confidence based on entity type certainty
    if (processed.entity_type === 'none' || processed.entity_type === 'discussion') {
      processed.confidence = Math.min(processed.confidence, 0.5);
    }

    return processed;
  }

  /**
   * Fallback analysis if AI is unavailable
   */
  fallbackAnalysis(content, source) {
    console.log('[Sidecar Bot] Using fallback analysis');

    // Simple keyword-based detection
    const lowerContent = content.toLowerCase();

    let entity_type = 'discussion';
    let confidence = 0.3;

    if (lowerContent.includes('bug') || lowerContent.includes('error') || lowerContent.includes('crash')) {
      entity_type = 'bug';
      confidence = 0.6;
    } else if (lowerContent.includes('feature') || lowerContent.includes('add') || lowerContent.includes('implement')) {
      entity_type = 'feature';
      confidence = 0.5;
    } else if (lowerContent.includes('task') || lowerContent.includes('todo') || lowerContent.includes('need to')) {
      entity_type = 'task';
      confidence = 0.5;
    }

    // Priority detection
    let priority = 'medium';
    if (lowerContent.includes('urgent') || lowerContent.includes('critical') || lowerContent.includes('asap')) {
      priority = 'high';
    } else if (lowerContent.includes('low priority') || lowerContent.includes('whenever')) {
      priority = 'low';
    }

    return {
      entity_type,
      confidence,
      title: this.extractTitle(content),
      description: content.substring(0, 500),
      priority,
      estimated_complexity: 'medium',
      suggested_tags: [],
      extracted_requirements: [],
      mentioned_users: [],
      related_systems: [],
      reasoning: 'Fallback keyword-based analysis',
      source_type: source.type,
      source_metadata: {
        from: source.from,
        subject: source.subject,
        timestamp: source.timestamp || new Date().toISOString()
      }
    };
  }

  /**
   * Extract title from content
   */
  extractTitle(content) {
    // Get first sentence or first 100 chars
    const firstSentence = content.split(/[.!?]/)[0];
    return firstSentence.substring(0, 100).trim();
  }

  /**
   * Determine if entity should be auto-created based on confidence and user authority
   */
  async shouldAutoCreate(projectId, userId, analysis) {
    try {
      // Get user's role and authority level for the project
      const userRoleResult = await pool.query(`
        SELECT cr.authority_level, cr.role_name
        FROM user_role_assignments ura
        JOIN custom_roles cr ON ura.role_id = cr.id
        WHERE ura.user_id = $1 AND ura.project_id = $2
        LIMIT 1
      `, [userId, projectId]);

      // Default to no authority if no role found
      if (userRoleResult.rows.length === 0) {
        return false;
      }

      const authorityLevel = userRoleResult.rows[0].authority_level;

      // Check if role has auto-create permission for this entity type
      const permissionResult = await pool.query(`
        SELECT auto_create_enabled
        FROM role_permissions
        WHERE role_id = (
          SELECT role_id FROM user_role_assignments
          WHERE user_id = $1 AND project_id = $2
          LIMIT 1
        )
        AND entity_type = $3
        LIMIT 1
      `, [userId, projectId, analysis.entity_type]);

      const autoCreateEnabled = permissionResult.rows.length > 0 
        ? permissionResult.rows[0].auto_create_enabled 
        : (authorityLevel >= 3); // Default: Team Lead and above can auto-create

      const confidenceThreshold = 0.7; // Minimum confidence for auto-creation

      // Auto-create if:
      // 1. User has authority to auto-create
      // 2. AI confidence is high enough
      // 3. Entity type is actionable (not 'discussion' or 'none')
      const shouldCreate =
        autoCreateEnabled &&
        analysis.confidence >= confidenceThreshold &&
        ['task', 'bug', 'feature', 'issue'].includes(analysis.entity_type);

      return shouldCreate;
    } catch (error) {
      console.error('[Sidecar Bot] Error determining auto-create:', error);
      return false;
    }
  }

  /**
   * Create entity from analysis
   */
  async createEntity(projectId, userId, analysis) {
    try {
      // Map entity_type to database entity table
      const entityTypeMap = {
        'task': 'action_items',
        'bug': 'issues',
        'feature': 'issues',
        'issue': 'issues'
      };

      const tableName = entityTypeMap[analysis.entity_type];
      if (!tableName) {
        throw new Error(`Cannot create entity of type: ${analysis.entity_type}`);
      }

      // Create the entity
      if (tableName === 'issues') {
        const result = await pool.query(`
          INSERT INTO issues (
            project_id,
            title,
            description,
            priority,
            status,
            created_by,
            tags
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `, [
          projectId,
          analysis.title,
          analysis.description,
          analysis.priority,
          'open',
          userId,
          analysis.suggested_tags
        ]);

        return {
          entity_id: result.rows[0].id,
          entity_type: analysis.entity_type,
          action: 'created',
          table: 'issues'
        };
      } else if (tableName === 'action_items') {
        const result = await pool.query(`
          INSERT INTO action_items (
            project_id,
            description,
            assigned_to,
            status,
            priority,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [
          projectId,
          `${analysis.title}\n\n${analysis.description}`,
          userId,
          'pending',
          analysis.priority,
          userId
        ]);

        return {
          entity_id: result.rows[0].id,
          entity_type: analysis.entity_type,
          action: 'created',
          table: 'action_items'
        };
      }

    } catch (error) {
      console.error('[Sidecar Bot] Error creating entity:', error);
      throw error;
    }
  }

  /**
   * Create proposal for entity (when auto-create not allowed)
   */
  async createProposal(projectId, userId, analysis) {
    try {
      // Store in thought_captures as a proposal
      const result = await pool.query(`
        INSERT INTO thought_captures (
          user_id,
          project_id,
          capture_type,
          raw_content,
          ai_analysis,
          created_entities,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING id
      `, [
        userId,
        projectId,
        'proposal',
        JSON.stringify({
          title: analysis.title,
          description: analysis.description,
          priority: analysis.priority,
          tags: analysis.suggested_tags
        }),
        JSON.stringify(analysis),
        JSON.stringify({ status: 'pending_review' })
      ]);

      return {
        proposal_id: result.rows[0].id,
        entity_type: analysis.entity_type,
        action: 'proposal_created'
      };

    } catch (error) {
      console.error('[Sidecar Bot] Error creating proposal:', error);
      throw error;
    }
  }

  /**
   * Process message end-to-end: analyze and create/propose entity
   */
  async processMessage(projectId, userId, content, source) {
    try {
      // Step 1: Analyze content
      const analysis = await this.analyzeContent({ projectId, content, source });

      // Step 2: Determine action
      const shouldAutoCreate = await this.shouldAutoCreate(projectId, userId, analysis);

      let result;
      if (shouldAutoCreate) {
        // Auto-create entity
        result = await this.createEntity(projectId, userId, analysis);
      } else if (analysis.entity_type !== 'none' && analysis.entity_type !== 'discussion') {
        // Create proposal for review
        result = await this.createProposal(projectId, userId, analysis);
      } else {
        // Just log the analysis
        result = {
          action: 'analyzed_only',
          entity_type: analysis.entity_type
        };
      }

      return {
        success: true,
        analysis,
        ...result
      };

    } catch (error) {
      console.error('[Sidecar Bot] Error processing message:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new SidecarBot();
