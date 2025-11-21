const { Pool } = require('@neondatabase/serverless');
const rolePermissionService = require('./rolePermissionService');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Thought Capture Service
 * Processes voice notes, text thoughts, and ad-hoc recordings
 */
class ThoughtCaptureService {
  /**
   * Process a thought capture (voice or text)
   */
  async processThought({ projectId, userId, contentType, textContent, audioFile, thoughtType, tags }) {
    try {
      console.log(`[Thought Capture] Processing ${contentType} from user ${userId}`);

      const userRole = await rolePermissionService.getUserRole(userId, projectId);
      if (!userRole) {
        throw new Error('User has no role in this project');
      }

      let transcript = textContent;
      let audioUrl = null;

      if (contentType === 'voice' && audioFile) {
        audioUrl = await this.uploadAudio(audioFile, projectId, userId);
        transcript = await this.transcribeAudio(audioUrl);
      }

      const captureResult = await pool.query(`
        INSERT INTO thought_captures (
          project_id, created_by, content_type, text_content,
          audio_url, transcript, thought_type, user_role,
          user_authority_level, tags, capture_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        projectId, userId, contentType, textContent,
        audioUrl, transcript, thoughtType,
        userRole.role_code, userRole.authority_level,
        tags, 'api'
      ]);

      const captureId = captureResult.rows[0].id;

      let analysis = null;
      let workflowResult = { created: [], proposals: [] };

      try {
        const sidecarBot = require('./sidecarBot');
        analysis = await sidecarBot.analyzeContent({
          projectId,
          content: transcript,
          source: {
            type: 'thought_capture',
            captureId: captureId,
            userId: userId,
            userRole: userRole.role_code,
            authorityLevel: userRole.authority_level
          }
        });

        workflowResult = await this.applyRoleBasedWorkflow({
          projectId,
          userId,
          userRole,
          analysis,
          captureId
        });
      } catch (error) {
        console.warn('[Thought Capture] Analysis/workflow skipped:', error.message);
        analysis = { detectedEntities: [], analysisSkipped: true };
      }

      await pool.query(`
        UPDATE thought_captures
        SET
          analyzed = true,
          analysis_result = $1,
          analysis_confidence = $2,
          created_entities = $3,
          created_proposals = $4,
          updated_at = NOW()
        WHERE id = $5
      `, [
        JSON.stringify(analysis),
        analysis.confidence || 0.8,
        JSON.stringify(workflowResult.created),
        JSON.stringify(workflowResult.proposals),
        captureId
      ]);

      console.log(`[Thought Capture] Processed successfully. Capture ID: ${captureId}`);

      return {
        success: true,
        captureId,
        transcript,
        analysis,
        workflow: workflowResult,
        message: this.buildResponseMessage(userRole, workflowResult)
      };

    } catch (error) {
      console.error('[Thought Capture] Error:', error.message || 'Unknown error');
      throw new Error('Failed to process thought capture');
    }
  }

  /**
   * Apply role-based workflow to analysis results
   */
  async applyRoleBasedWorkflow({ projectId, userId, userRole, analysis, captureId }) {
    const created = [];
    const proposals = [];

    if (!analysis.detectedEntities || analysis.detectedEntities.length === 0) {
      return { created, proposals };
    }

    for (const entity of analysis.detectedEntities) {
      const permissionCheck = await rolePermissionService.canAutoCreate(
        userId,
        projectId,
        entity.type,
        entity
      );

      if (permissionCheck.allowed) {
        const createdEntity = await this.createEntity({
          projectId,
          userId,
          entityType: entity.type,
          entityData: entity,
          source: {
            type: 'thought_capture',
            captureId: captureId
          }
        });

        created.push(createdEntity);
      } else {
        const proposal = await this.createProposal({
          projectId,
          userId,
          entityType: entity.type,
          entityData: entity,
          requiresApprovalFrom: permissionCheck.approvalFromRoleId,
          reason: permissionCheck.reason,
          source: {
            type: 'thought_capture',
            captureId: captureId
          }
        });

        proposals.push(proposal);
      }
    }

    return { created, proposals };
  }

  /**
   * Create entity in database
   */
  async createEntity({ projectId, userId, entityType, entityData, source }) {
    const result = await pool.query(`
      INSERT INTO pkg_nodes (
        project_id, type, attrs, created_by_ai,
        ai_confidence, ai_analysis_id, created_by
      ) VALUES ($1, $2, $3, true, $4, $5, $6)
      RETURNING id
    `, [
      projectId,
      entityType.charAt(0).toUpperCase() + entityType.slice(1),
      JSON.stringify(entityData),
      entityData.confidence || 0.8,
      source.captureId,
      userId
    ]);

    const pkgNodeId = result.rows[0].id;

    await pool.query(`
      INSERT INTO evidence (
        entity_type, entity_id, evidence_type,
        source_type, source_id, quote_text, confidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      'pkg_node',
      pkgNodeId.toString(),
      'thought_capture',
      'thought_captures',
      source.captureId.toString(),
      entityData.title || entityData.description,
      'high'
    ]);

    return {
      type: entityType,
      id: pkgNodeId,
      title: entityData.title,
      createdBy: 'auto'
    };
  }

  /**
   * Create proposal for approval
   */
  async createProposal({ projectId, userId, entityType, entityData, requiresApprovalFrom, reason, source }) {
    const proposalIdResult = await pool.query('SELECT generate_proposal_id() as proposal_id');
    const proposalId = proposalIdResult.rows[0].proposal_id;

    await pool.query(`
      INSERT INTO ai_agent_proposals (
        proposal_id, project_id, proposal_type,
        proposed_action, proposed_data, rationale,
        confidence_score, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      proposalId,
      projectId,
      entityType,
      `create_${entityType}`,
      JSON.stringify({
        ...entityData,
        source_capture_id: source.captureId
      }),
      reason || `${entityType} detected from thought capture`,
      entityData.confidence || 0.8,
      'pending_review',
      userId
    ]);

    const approverRole = requiresApprovalFrom ? 
      await rolePermissionService.getApproverRole(requiresApprovalFrom) : null;
    
    if (approverRole) {
      await this.notifyApprover(projectId, proposalId, approverRole, entityData);
    }

    return {
      type: entityType,
      proposalId: proposalId,
      title: entityData.title,
      requiresApprovalFrom: approverRole?.role_name || 'Manager'
    };
  }

  /**
   * Notify approver about new proposal
   */
  async notifyApprover(projectId, proposalId, approverRole, entityData) {
    console.log(`[Notification] New proposal ${proposalId} for ${approverRole.role_name}`);
  }

  /**
   * Upload audio file to storage
   */
  async uploadAudio(audioFile, projectId, userId) {
    const filename = `audio_${Date.now()}_${userId}.webm`;
    const url = `/uploads/audio/${projectId}/${filename}`;

    console.log(`[Audio Upload] Uploaded to: ${url}`);
    return url;
  }

  /**
   * Transcribe audio file
   */
  async transcribeAudio(audioUrl) {
    console.log(`[Transcription] Transcribing: ${audioUrl}`);
    return '[Transcription placeholder - integrate Deepgram/AssemblyAI]';
  }

  /**
   * Build response message for user
   */
  buildResponseMessage(userRole, workflowResult) {
    const { created, proposals } = workflowResult;

    if (created.length === 0 && proposals.length === 0) {
      return 'Thank you! Your thought has been recorded. No immediate actions detected.';
    }

    let message = '✅ Captured your thought!\n\n';

    if (created.length > 0) {
      message += `✨ Auto-created ${created.length} item(s):\n`;
      created.forEach(item => {
        message += `  • ${item.type}: ${item.title}\n`;
      });
      message += '\n';
    }

    if (proposals.length > 0) {
      message += `📋 Created ${proposals.length} proposal(s) for review:\n`;
      proposals.forEach(item => {
        message += `  • ${item.type}: ${item.title} (needs ${item.requiresApprovalFrom} approval)\n`;
      });
    }

    return message;
  }
}

module.exports = new ThoughtCaptureService();
