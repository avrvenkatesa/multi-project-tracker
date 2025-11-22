/**
 * Sidecar Bot - Core AI Analysis Engine
 * Analyzes content from various platforms to detect and create project entities
 * Integrates with Multi-Provider AI Analysis Engine and Workflow Engine
 */

const pool = require('../db');
const contextAssembly = require('./contextAssembly');
const promptBuilder = require('./promptBuilder');
const llmClient = require('./llmClient');
const workflowEngine = require('./workflowEngine');

class SidecarBot {
  /**
   * Analyze content using complete AI pipeline
   * @param {Object} params - { projectId, content, source, userId }
   * @returns {Promise<Object>} Analysis results with workflow outcomes
   */
  async analyzeContent({ projectId, content, source, userId }) {
    try {
      console.log(`[Sidecar Bot] Starting AI analysis for project ${projectId}`);

      // Step 1: Assemble context from PKG and RAG
      const context = await contextAssembly.assembleContext({
        projectId,
        message: content,
        source,
        userId
      });

      console.log(`[Sidecar Bot] Context assembled: ${context.relatedEntities.decisions.length} decisions, ${context.relatedEntities.risks.length} risks`);

      // Step 2: Build provider-optimized prompt
      const { prompt, systemPrompt } = await promptBuilder.buildExtractionPrompt({
        message: content,
        context,
        source
      });

      console.log(`[Sidecar Bot] Prompt built for provider: ${process.env.PRIMARY_LLM_PROVIDER || 'claude'}`);

      // Step 3: Extract entities using LLM
      const llmResult = await llmClient.extractEntities({
        prompt,
        systemPrompt,
        context
      });

      console.log(`[Sidecar Bot] LLM extracted ${llmResult.entities.length} entities using ${llmResult.provider}`);

      // Filter out "None" entities
      const validEntities = llmResult.entities.filter(e => e.entity_type !== 'None');

      if (validEntities.length === 0) {
        return {
          success: true,
          entities: [],
          message: 'No actionable entities detected'
        };
      }

      // Step 4: Process through workflow engine
      const workflowResult = await workflowEngine.processExtractedEntities({
        entities: validEntities,
        userId,
        projectId,
        source: {
          type: source.type,
          platform: source.platform || source.type,
          id: source.messageId || source.ts || source.id,
          content: content,
          metadata: source
        }
      });

      console.log(`[Sidecar Bot] Workflow processed: ${workflowResult.summary.auto_created} auto-created, ${workflowResult.summary.proposals} proposals`);

      // Step 5: Return comprehensive result
      return {
        success: true,
        entities: validEntities,
        workflow: workflowResult,
        context: {
          assemblyTime: context.metadata.assemblyTime,
          contextQuality: contextAssembly.calculateContextQuality(context)
        },
        llm: {
          provider: llmResult.provider,
          usage: llmResult.usage,
          cost: llmResult.cost
        }
      };

    } catch (error) {
      console.error('[Sidecar Bot] AI analysis error:', error);
      
      // Fallback to basic analysis if AI pipeline fails
      try {
        const fallbackResult = await this.fallbackAnalysis(content, source, userId, projectId);
        return fallbackResult;
      } catch (fallbackError) {
        console.error('[Sidecar Bot] Fallback analysis error:', fallbackError);
        return {
          success: false,
          error: error.message,
          fallback: 'AI analysis failed, please try manual entry'
        };
      }
    }
  }


  /**
   * Fallback analysis if AI pipeline fails - keyword-based detection
   */
  async fallbackAnalysis(content, source, userId, projectId) {
    console.log('[Sidecar Bot] Using fallback keyword-based analysis');

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

    const entity = {
      entity_type,
      confidence,
      title: this.extractTitle(content),
      description: content.substring(0, 500),
      priority,
      complexity: 'medium',
      tags: [],
      requirements: [],
      mentioned_users: [],
      related_systems: [],
      ai_analysis: {
        reasoning: 'Fallback keyword-based analysis (AI unavailable)',
        citations: []
      }
    };

    // Process through workflow engine
    try {
      const workflowResult = await workflowEngine.processExtractedEntities({
        entities: [entity],
        userId,
        projectId,
        source: {
          type: source.type,
          platform: source.platform || source.type,
          id: source.messageId || source.ts || source.id,
          content: content,
          metadata: source
        }
      });

      return {
        success: true,
        entities: [entity],
        workflow: workflowResult,
        context: { fallback: true },
        llm: { provider: 'fallback', usage: {}, cost: 0 }
      };
    } catch (error) {
      console.error('[Sidecar Bot] Fallback workflow processing error:', error);
      throw error;
    }
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
   * Process message end-to-end: analyze and create/propose entity
   * This method is now a wrapper around the full AI pipeline
   */
  async processMessage(projectId, userId, content, source) {
    try {
      // Use the full AI pipeline (includes workflow processing)
      const result = await this.analyzeContent({ projectId, content, source, userId });
      return result;

    } catch (error) {
      console.error('[Sidecar Bot] Error processing message:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get analysis statistics for a project
   */
  async getAnalysisStats(projectId, dateRange) {
    try {
      const proposals = await workflowEngine.getProposalStats(projectId, dateRange);
      
      const entities = await pool.query(`
        SELECT type, COUNT(*) as count
        FROM pkg_nodes
        WHERE project_id = $1
          AND created_by_ai = true
          AND created_at >= $2
          AND created_at <= $3
        GROUP BY type
      `, [projectId, dateRange.start, dateRange.end]);

      return {
        proposals,
        autoCreated: entities.rows,
        totalProcessed: proposals.total_proposed + entities.rows.reduce((sum, e) => sum + parseInt(e.count), 0)
      };
    } catch (error) {
      console.error('[Sidecar Bot] Error getting analysis stats:', error);
      throw error;
    }
  }
}

module.exports = new SidecarBot();
