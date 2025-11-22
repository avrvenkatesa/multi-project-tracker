const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const rolePermissionService = require('./rolePermissionService');
const { v4: uuidv4 } = require('uuid');

/**
 * Role-Based Auto-Creation Workflow Engine (Story 5.4.2)
 * 
 * Determines whether extracted entities should be auto-created or sent for approval
 * based on user authority levels, AI confidence scores, and role permissions.
 */
class WorkflowEngineService {
  /**
   * Main workflow orchestrator
   * Processes extracted entities and determines auto-create vs proposal routing
   * 
   * @param {Array} entities - Extracted entities from LLM
   * @param {number} userId - User ID who triggered the extraction
   * @param {number} projectId - Project ID
   * @param {Object} source - Source information { type, platform, metadata }
   * @returns {Object} Processing results with summary
   */
  async processExtractedEntities({ entities, userId, projectId, source }) {
    console.log(`[Workflow Engine] Processing ${entities.length} entities for user ${userId} in project ${projectId}`);

    const results = [];
    let autoCreatedCount = 0;
    let proposalCount = 0;
    let skippedCount = 0;

    for (const entity of entities) {
      try {
        const result = await this.processEntity({
          entity,
          userId,
          projectId,
          source
        });

        results.push(result);

        if (result.action === 'auto_created') {
          autoCreatedCount++;
        } else if (result.action === 'proposal_created') {
          proposalCount++;
        } else if (result.action === 'skipped') {
          skippedCount++;
        }
      } catch (error) {
        console.error(`[Workflow Engine] Error processing entity:`, error);
        results.push({
          entity: { type: entity.entity_type, title: entity.title },
          action: 'error',
          error: error.message
        });
        skippedCount++;
      }
    }

    return {
      processed: entities.length,
      results,
      summary: {
        auto_created: autoCreatedCount,
        proposals: proposalCount,
        skipped: skippedCount
      }
    };
  }

  /**
   * Process a single entity through the workflow
   */
  async processEntity({ entity, userId, projectId, source }) {
    const userRole = await rolePermissionService.getUserRole(userId, projectId);
    if (!userRole) {
      return {
        entity: { type: entity.entity_type, title: entity.title },
        action: 'skipped',
        reason: 'User has no role in this project'
      };
    }

    const permission = await rolePermissionService.getPermission(
      userRole.role_id,
      entity.entity_type
    );

    const config = await this.getSidecarConfig(projectId);

    const decision = await this.determineAction(
      entity,
      userRole.authority_level,
      permission,
      config
    );

    if (decision.action === 'auto_create') {
      return await this.autoCreateEntity(entity, userId, projectId, source);
    } else if (decision.action === 'create_proposal') {
      return await this.createProposal(
        entity,
        userId,
        projectId,
        decision.approverRoleId,
        source
      );
    } else {
      return {
        entity: { type: entity.entity_type, title: entity.title },
        action: 'skipped',
        reason: decision.reason
      };
    }
  }

  /**
   * Determine whether to auto-create or create proposal
   * Implements the core decision logic rules
   * 
   * RULE 1: High Confidence + High Authority → Auto-Create
   * RULE 2: Permission-Based Auto-Create (Medium Confidence)
   * RULE 3: Critical Impact Always Requires Review
   * RULE 4: Low Confidence or Low Authority → Proposal
   */
  async determineAction(entity, userAuthority, permission, config) {
    const confidence = entity.confidence || 0;
    const impact = (entity.impact || entity.priority || 'Medium').toLowerCase();
    const autoCreateThreshold = config?.auto_create_threshold || 0.8;

    console.log(`[Workflow Engine] Decision for ${entity.entity_type}: confidence=${confidence}, authority=${userAuthority}, impact=${impact}`);

    // RULE 3: Critical Impact Always Requires Review (unless authority level 5)
    if ((impact === 'critical') && userAuthority < 5) {
      return {
        action: 'create_proposal',
        reason: 'Critical impact requires review by authority level 5',
        approverRoleId: permission.approval_from_role_id
      };
    }

    // RULE 4 Part 1: Low Authority → Proposal (check this BEFORE permission-based)
    if (userAuthority < 3) {
      return {
        action: 'create_proposal',
        reason: `Insufficient authority (${userAuthority}), requires level 3+`,
        approverRoleId: permission.approval_from_role_id
      };
    }

    // RULE 1: High Confidence + High Authority → Auto-Create
    if (confidence >= autoCreateThreshold && userAuthority >= 3) {
      return {
        action: 'auto_create',
        reason: `High confidence (${confidence}) and sufficient authority (${userAuthority})`
      };
    }

    // RULE 2: Permission-Based Auto-Create (Medium Confidence)
    if (
      confidence >= 0.7 &&
      permission.auto_create_enabled &&
      impact !== 'critical'
    ) {
      return {
        action: 'auto_create',
        reason: 'Permission-based auto-create enabled for medium confidence'
      };
    }

    // RULE 4 Part 2: Low Confidence → Proposal
    if (confidence < 0.7) {
      return {
        action: 'create_proposal',
        reason: `Low confidence (${confidence})`,
        approverRoleId: permission.approval_from_role_id
      };
    }

    // Default to proposal for safety
    return {
      action: 'create_proposal',
      reason: 'Default to proposal for safety',
      approverRoleId: permission.approval_from_role_id
    };
  }

  /**
   * Auto-create entity in PKG (Project Knowledge Graph)
   */
  async autoCreateEntity(entity, userId, projectId, source) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const pkgNodeId = uuidv4();
      const entityType = this.normalizeEntityType(entity.entity_type);

      const attrs = {
        title: entity.title,
        description: entity.description,
        priority: entity.priority,
        impact: entity.impact,
        tags: entity.tags || [],
        mentioned_users: entity.mentioned_users || [],
        related_entity_ids: entity.related_entity_ids || [],
        deadline: entity.deadline,
        owner: entity.owner,
        status: 'open',
        ai_extracted: true,
        ai_confidence: entity.confidence,
        ai_reasoning: entity.reasoning
      };

      await client.query(`
        INSERT INTO pkg_nodes (
          id, project_id, type, source_table, source_id,
          attrs, created_by_ai, ai_confidence, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        pkgNodeId,
        projectId,
        entityType,
        null,
        null,
        JSON.stringify(attrs),
        true,
        entity.confidence,
        userId
      ]);

      const evidenceId = await this.createEvidence(
        pkgNodeId,
        entityType,
        source,
        entity.citations || [],
        userId,
        client
      );

      await client.query('COMMIT');

      console.log(`[Workflow Engine] Auto-created ${entityType} node ${pkgNodeId}`);

      await this.notifyStakeholders(entity, 'auto_created', null, projectId);

      return {
        entity: { type: entity.entity_type, title: entity.title },
        action: 'auto_created',
        entity_id: pkgNodeId,
        evidence_id: evidenceId
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create proposal for approval
   */
  async createProposal(entity, userId, projectId, approverRoleId, source) {
    const aiAnalysis = {
      confidence: entity.confidence,
      reasoning: entity.reasoning,
      citations: entity.citations || [],
      mentioned_users: entity.mentioned_users || [],
      related_entity_ids: entity.related_entity_ids || []
    };

    const proposedData = {
      title: entity.title,
      description: entity.description,
      priority: entity.priority,
      impact: entity.impact,
      tags: entity.tags || [],
      deadline: entity.deadline,
      owner: entity.owner
    };

    const result = await pool.query(`
      INSERT INTO entity_proposals (
        project_id,
        proposed_by,
        entity_type,
        proposed_data,
        ai_analysis,
        confidence,
        source_type,
        source_metadata,
        status,
        requires_approval_from
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      projectId,
      userId,
      entity.entity_type,
      JSON.stringify(proposedData),
      JSON.stringify(aiAnalysis),
      entity.confidence,
      source?.type || 'unknown',
      JSON.stringify(source?.metadata || {}),
      'pending',
      approverRoleId
    ]);

    const proposalId = result.rows[0].id;

    console.log(`[Workflow Engine] Created proposal ${proposalId} for ${entity.entity_type}`);

    const approverRole = approverRoleId
      ? await rolePermissionService.getApproverRole(approverRoleId)
      : null;

    await this.notifyStakeholders(
      entity,
      'proposal_created',
      approverRole,
      projectId
    );

    return {
      entity: { type: entity.entity_type, title: entity.title },
      action: 'proposal_created',
      proposal_id: proposalId,
      requires_approval_from: approverRole?.role_name || 'Project Lead'
    };
  }

  /**
   * Create evidence record linking entity to source
   * Note: evidence table uses integer entity_id, but pkg_nodes uses UUID.
   * For PKG entities, we use 0 as a placeholder and store the UUID in quote_text.
   */
  async createEvidence(entityId, entityType, source, citations, userId, client = null) {
    const db = client || pool;

    const result = await db.query(`
      INSERT INTO evidence (
        entity_type,
        entity_id,
        evidence_type,
        source_type,
        source_id,
        quote_text,
        context,
        confidence,
        extraction_method,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
      entityType,
      0, // Placeholder for PKG entities (which use UUID, not integer)
      'ai_extraction',
      source?.type || 'unknown',
      source?.id || null,
      `PKG_NODE:${entityId} | ${citations.join(' | ')}`,
      JSON.stringify(source?.metadata || {}),
      'High',
      'llm_analysis',
      userId
    ]);

    return result.rows[0].id;
  }

  /**
   * Notify relevant stakeholders about entity action
   */
  async notifyStakeholders(entity, action, approverRole, projectId) {
    console.log(`[Workflow Engine] Notification: ${action} for ${entity.entity_type} - "${entity.title}"`);

    if (action === 'auto_created') {
      console.log(`[Workflow Engine] Would notify project members about auto-created ${entity.entity_type}`);
    } else if (action === 'proposal_created') {
      console.log(`[Workflow Engine] Would notify ${approverRole?.role_name || 'approver'} about new proposal`);
    }
  }

  /**
   * Get sidecar configuration for project
   */
  async getSidecarConfig(projectId) {
    const result = await pool.query(`
      SELECT auto_create_threshold, detection_types, notify_chat_platform, notify_email
      FROM sidecar_config
      WHERE project_id = $1
    `, [projectId]);

    if (result.rows.length === 0) {
      return {
        auto_create_threshold: 0.8,
        detection_types: ['Decision', 'Risk', 'Action Item', 'Task'],
        notify_chat_platform: true,
        notify_email: false
      };
    }

    return result.rows[0];
  }

  /**
   * Normalize entity type for PKG storage
   */
  normalizeEntityType(entityType) {
    const typeMap = {
      'Decision': 'decision',
      'Risk': 'risk',
      'Action Item': 'action_item',
      'Task': 'task',
      'Issue': 'issue',
      'Feature': 'feature',
      'Bug': 'bug'
    };

    return typeMap[entityType] || entityType.toLowerCase().replace(/ /g, '_');
  }

  /**
   * Approve a proposal and create the entity
   */
  async approveProposal(proposalId, reviewerId, notes = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const proposal = await client.query(`
        SELECT * FROM entity_proposals WHERE id = $1
      `, [proposalId]);

      if (proposal.rows.length === 0) {
        throw new Error('Proposal not found');
      }

      const proposalData = proposal.rows[0];

      if (proposalData.status !== 'pending') {
        throw new Error(`Proposal is already ${proposalData.status}`);
      }

      await client.query(`
        UPDATE entity_proposals
        SET status = 'approved',
            reviewed_by = $1,
            reviewed_at = NOW(),
            review_notes = $2,
            updated_at = NOW()
        WHERE id = $3
      `, [reviewerId, notes, proposalId]);

      const pkgNodeId = uuidv4();
      const entityType = this.normalizeEntityType(proposalData.entity_type);
      const proposedData = proposalData.proposed_data;

      const attrs = {
        ...proposedData,
        status: 'open',
        ai_extracted: true,
        ai_confidence: proposalData.confidence,
        ai_reasoning: proposalData.ai_analysis?.reasoning,
        approved_by: reviewerId,
        approved_at: new Date().toISOString()
      };

      await client.query(`
        INSERT INTO pkg_nodes (
          id, project_id, type, source_table, source_id,
          attrs, created_by_ai, ai_confidence, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        pkgNodeId,
        proposalData.project_id,
        entityType,
        null,
        null,
        JSON.stringify(attrs),
        true,
        proposalData.confidence,
        reviewerId
      ]);

      const evidenceId = await this.createEvidence(
        pkgNodeId,
        entityType,
        {
          type: proposalData.source_type,
          metadata: proposalData.source_metadata
        },
        proposalData.ai_analysis?.citations || [],
        reviewerId,
        client
      );

      await client.query('COMMIT');

      console.log(`[Workflow Engine] Approved proposal ${proposalId}, created entity ${pkgNodeId}`);

      return {
        proposal_id: proposalId,
        entity_id: pkgNodeId,
        evidence_id: evidenceId,
        status: 'approved'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reject a proposal
   */
  async rejectProposal(proposalId, reviewerId, notes) {
    await pool.query(`
      UPDATE entity_proposals
      SET status = 'rejected',
          reviewed_by = $1,
          reviewed_at = NOW(),
          review_notes = $2,
          updated_at = NOW()
      WHERE id = $3 AND status = 'pending'
    `, [reviewerId, notes, proposalId]);

    console.log(`[Workflow Engine] Rejected proposal ${proposalId}`);

    return {
      proposal_id: proposalId,
      status: 'rejected'
    };
  }

  /**
   * Get pending proposals for a project
   */
  async getPendingProposals(projectId, roleId = null) {
    const query = roleId
      ? `SELECT * FROM entity_proposals 
         WHERE project_id = $1 AND status = 'pending' 
         AND (requires_approval_from = $2 OR requires_approval_from IS NULL)
         ORDER BY created_at DESC`
      : `SELECT * FROM entity_proposals 
         WHERE project_id = $1 AND status = 'pending'
         ORDER BY created_at DESC`;

    const params = roleId ? [projectId, roleId] : [projectId];
    const result = await pool.query(query, params);

    return result.rows;
  }

  /**
   * Get proposal statistics for a project
   */
  async getProposalStats(projectId) {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) as total,
        AVG(confidence) as avg_confidence
      FROM entity_proposals
      WHERE project_id = $1
    `, [projectId]);

    return result.rows[0];
  }
}

module.exports = new WorkflowEngineService();
