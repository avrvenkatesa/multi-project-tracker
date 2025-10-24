const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================
// Completion Action Rule Management
// ============================================

/**
 * Get all completion action rules
 * @param {number|null} projectId - Filter by project (null = global rules)
 * @param {string|null} entityType - Filter by entity type ('issue' or 'action_item')
 */
async function getCompletionActions(projectId = null, entityType = null) {
  try {
    let query;
    let params;
    
    if (projectId && entityType) {
      query = `
        SELECT * FROM checklist_completion_actions
        WHERE (project_id = $1 OR project_id IS NULL)
          AND entity_type = $2
          AND is_active = TRUE
        ORDER BY project_id NULLS LAST, entity_type, source_status NULLS LAST
      `;
      params = [projectId, entityType];
    } else if (projectId) {
      query = `
        SELECT * FROM checklist_completion_actions
        WHERE (project_id = $1 OR project_id IS NULL)
          AND is_active = TRUE
        ORDER BY project_id NULLS LAST, entity_type, source_status NULLS LAST
      `;
      params = [projectId];
    } else if (entityType) {
      query = `
        SELECT * FROM checklist_completion_actions
        WHERE entity_type = $1
          AND is_active = TRUE
        ORDER BY project_id NULLS LAST, source_status NULLS LAST
      `;
      params = [entityType];
    } else {
      query = `
        SELECT * FROM checklist_completion_actions
        WHERE is_active = TRUE
        ORDER BY entity_type, project_id NULLS LAST, source_status NULLS LAST
      `;
      params = [];
    }
    
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error fetching completion actions:', error);
    throw error;
  }
}

/**
 * Create or update a completion action rule
 * @param {string} entityType - 'issue' or 'action_item'
 * @param {number|null} projectId - Project ID or null for global
 * @param {string|null} sourceStatus - Source status or null for any
 * @param {string} targetStatus - Target status to change to
 * @param {number} completionThreshold - Percentage required (0-100)
 * @param {boolean} notifyAssignee - Whether to notify assignee
 * @param {number} userId - User creating the rule
 */
async function saveCompletionAction(
  entityType,
  projectId,
  sourceStatus,
  targetStatus,
  completionThreshold,
  notifyAssignee,
  userId
) {
  try {
    // Validation
    if (!['issue', 'action_item'].includes(entityType)) {
      throw new Error('Invalid entity_type. Must be "issue" or "action_item"');
    }
    
    if (completionThreshold < 0 || completionThreshold > 100) {
      throw new Error('Completion threshold must be between 0 and 100');
    }
    
    const result = await pool.query(
      `INSERT INTO checklist_completion_actions 
        (entity_type, project_id, source_status, target_status, 
         completion_threshold, notify_assignee, created_by)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (entity_type, project_id, source_status)
      DO UPDATE SET
        target_status = $4,
        completion_threshold = $5,
        notify_assignee = $6,
        is_active = TRUE,
        updated_at = NOW()
      RETURNING *`,
      [entityType, projectId, sourceStatus, targetStatus, completionThreshold, notifyAssignee, userId]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error saving completion action:', error);
    throw error;
  }
}

/**
 * Delete (deactivate) a completion action rule
 * @param {number} actionId - Completion action ID
 */
async function deleteCompletionAction(actionId) {
  try {
    const result = await pool.query(
      `UPDATE checklist_completion_actions
       SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [actionId]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error deleting completion action:', error);
    throw error;
  }
}

// ============================================
// Checklist Completion Detection & Status Update
// ============================================

/**
 * Calculate checklist completion percentage
 * @param {number} checklistId - Checklist ID
 * @returns {object} { total, completed, percentage }
 */
async function calculateChecklistCompletion(checklistId) {
  try {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_items,
        COUNT(*) FILTER (WHERE is_completed = true) as completed_items
      FROM checklist_responses
      WHERE checklist_id = $1`,
      [checklistId]
    );
    
    const row = result.rows[0];
    const total = parseInt(row.total_items);
    const completed = parseInt(row.completed_items);
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { total, completed, percentage };
  } catch (error) {
    console.error('Error calculating checklist completion:', error);
    throw error;
  }
}

/**
 * Check if checklist completion should trigger status update
 * Called whenever a checklist item status changes
 * @param {number} checklistId - Checklist ID that was updated
 */
async function checkAndApplyCompletionAction(checklistId) {
  try {
    console.log(`🔍 Checking completion actions for checklist ${checklistId}`);
    
    // 1. Get checklist details
    const checklistResult = await pool.query(
      `SELECT 
        id,
        project_id,
        related_issue_id,
        related_action_id
      FROM checklists
      WHERE id = $1`,
      [checklistId]
    );
    
    if (checklistResult.rows.length === 0) {
      console.log(`⚠️  Checklist ${checklistId} not found`);
      return null;
    }
    
    const checklist = checklistResult.rows[0];
    
    // Determine entity type and ID
    let entityType, entityId;
    if (checklist.related_issue_id) {
      entityType = 'issue';
      entityId = checklist.related_issue_id;
    } else if (checklist.related_action_id) {
      entityType = 'action_item';
      entityId = checklist.related_action_id;
    } else {
      console.log(`ℹ️  Checklist ${checklistId} is not linked to any issue or action item`);
      return null;
    }
    
    console.log(`📋 Checklist linked to ${entityType} ${entityId}`);
    
    // 2. Get current entity status
    const table = entityType === 'issue' ? 'issues' : 'action_items';
    const entityResult = await pool.query(
      `SELECT id, status, assignee, project_id
       FROM ${table}
       WHERE id = $1`,
      [entityId]
    );
    
    if (entityResult.rows.length === 0) {
      console.log(`⚠️  ${entityType} ${entityId} not found`);
      return null;
    }
    
    const entity = entityResult.rows[0];
    const currentStatus = entity.status;
    console.log(`📊 Current ${entityType} status: ${currentStatus}`);
    
    // 3. Calculate AGGREGATE completion across ALL checklists for this entity
    // This is critical - we must check ALL checklists, not just the one that was updated
    const completionQuery = entityType === 'issue' 
      ? `SELECT 
          COALESCE(SUM(total_items), 0) as total_items,
          COALESCE(SUM(completed_items), 0) as completed_items
         FROM checklists 
         WHERE related_issue_id = $1 
           AND (is_standalone = false OR is_standalone IS NULL)`
      : `SELECT 
          COALESCE(SUM(total_items), 0) as total_items,
          COALESCE(SUM(completed_items), 0) as completed_items
         FROM checklists 
         WHERE related_action_id = $1 
           AND (is_standalone = false OR is_standalone IS NULL)`;
    
    const aggregateResult = await pool.query(completionQuery, [entityId]);
    const aggregateRow = aggregateResult.rows[0];
    const total = parseInt(aggregateRow.total_items);
    const completed = parseInt(aggregateRow.completed_items);
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const completion = { total, completed, percentage };
    console.log(`✓ AGGREGATE checklist completion across ALL checklists: ${completion.percentage}% (${completion.completed}/${completion.total})`);
    
    // 4. Find applicable completion action rule
    const actionsResult = await pool.query(
      `SELECT *
       FROM checklist_completion_actions
       WHERE entity_type = $1
         AND (project_id = $2 OR project_id IS NULL)
         AND (source_status = $3 OR source_status IS NULL)
         AND is_active = TRUE
         AND $4 >= completion_threshold
       ORDER BY 
         project_id NULLS LAST,
         source_status NULLS LAST
       LIMIT 1`,
      [entityType, checklist.project_id, currentStatus, completion.percentage]
    );
    
    if (actionsResult.rows.length === 0) {
      console.log(`ℹ️  No completion action rule found for ${entityType} with status "${currentStatus}"`);
      return null;
    }
    
    const action = actionsResult.rows[0];
    console.log(`🎯 Found completion action: ${currentStatus} → ${action.target_status} (threshold: ${action.completion_threshold}%)`);
    
    // 5. Check if status would actually change
    if (currentStatus === action.target_status) {
      console.log(`ℹ️  ${entityType} already has target status "${action.target_status}", no change needed`);
      return null;
    }
    
    // 6. Update entity status
    const updateResult = await pool.query(
      `UPDATE ${table}
       SET 
         status = $1,
         updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [action.target_status, entityId]
    );
    
    const updatedEntity = updateResult.rows[0];
    console.log(`✅ Updated ${entityType} ${entityId} status: ${currentStatus} → ${action.target_status}`);
    
    // 7. Log status change to status_history
    await pool.query(
      `INSERT INTO status_history 
        (item_type, item_id, project_id, from_status, to_status, changed_by)
       VALUES ($1, $2, $3, $4, $5, NULL)`,
      [entityType, entityId, entity.project_id, currentStatus, action.target_status]
    );
    
    // 8. TODO: Send notification if notify_assignee is true
    if (action.notify_assignee && entity.assignee) {
      console.log(`📧 Would notify assignee: ${entity.assignee}`);
      // Notification logic can be added here later
    }
    
    return {
      entityType,
      entityId,
      oldStatus: currentStatus,
      newStatus: action.target_status,
      completion,
      action
    };
    
  } catch (error) {
    console.error('❌ Error checking/applying completion action:', error);
    // Don't throw - let checklist item update succeed even if this fails
    return null;
  }
}

// ============================================
// Exports
// ============================================

module.exports = {
  // Rule management
  getCompletionActions,
  saveCompletionAction,
  deleteCompletionAction,
  
  // Completion detection
  calculateChecklistCompletion,
  checkAndApplyCompletionAction
};
