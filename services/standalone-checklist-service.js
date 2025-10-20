// services/standalone-checklist-service.js
// Phase 4 Mode 3: Standalone Document Processing

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Get all standalone checklists for a project
 * @param {number} projectId - Project ID
 * @returns {array} List of standalone checklists with metadata
 */
async function getStandaloneChecklists(projectId) {
  try {
    const result = await pool.query(
      `SELECT * FROM view_standalone_checklists
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [projectId]
    );
    
    return {
      success: true,
      checklists: result.rows,
      count: result.rows.length
    };
  } catch (error) {
    console.error('Error fetching standalone checklists:', error);
    throw error;
  }
}

/**
 * Create standalone checklist from document
 * @param {object} checklistData - Checklist data from AI generation
 * @param {number} projectId - Project ID
 * @param {number} userId - User creating the checklist
 * @param {string} sourceDocument - Source filename
 * @returns {object} Created checklist
 */
async function createStandaloneChecklist(checklistData, projectId, userId, sourceDocument) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create checklist
    const checklistResult = await client.query(
      `INSERT INTO checklists 
         (title, description, project_id, created_by, source_document, is_standalone)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING *`,
      [
        checklistData.title,
        checklistData.description || `Generated from ${sourceDocument}`,
        projectId,
        userId,
        sourceDocument
      ]
    );
    
    const checklist = checklistResult.rows[0];
    
    // Create items directly (no sections in this schema)
    if (checklistData.items && Array.isArray(checklistData.items)) {
      console.log(`Creating ${checklistData.items.length} items for checklist ${checklist.id}`);
      for (let i = 0; i < checklistData.items.length; i++) {
        const item = checklistData.items[i];
        const itemText = item.text || item.item_text || item.description || '';
        
        if (itemText) {
          await client.query(
            `INSERT INTO checklist_responses 
               (checklist_id, response_value, notes, is_completed)
             VALUES ($1, $2, $3, FALSE)`,
            [checklist.id, itemText, item.notes || null]
          );
        }
      }
      console.log(`✅ Created items for checklist ${checklist.id}`);
    } else {
      console.log(`⚠️ No items found in checklistData for ${checklist.id}`);
    }
    
    await client.query('COMMIT');
    
    return {
      success: true,
      checklist: checklist
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating standalone checklist:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Link standalone checklist to issue
 * @param {number} checklistId - Checklist ID
 * @param {number} issueId - Issue ID
 * @param {number} userId - User performing the link
 * @param {boolean} keepStandalone - Keep original as standalone
 * @returns {object} Result of linking operation
 */
async function linkChecklistToIssue(checklistId, issueId, userId, keepStandalone = false) {
  try {
    const result = await pool.query(
      `SELECT * FROM link_checklist_to_issue($1, $2, $3, $4)`,
      [checklistId, issueId, userId, keepStandalone]
    );
    
    const linkResult = result.rows[0];
    
    if (!linkResult.success) {
      throw new Error(linkResult.message);
    }
    
    return {
      success: true,
      message: linkResult.message,
      checklistId: linkResult.checklist_id
    };
    
  } catch (error) {
    console.error('Error linking checklist:', error);
    throw error;
  }
}

/**
 * Link standalone checklist to action item
 * @param {number} checklistId - Checklist ID
 * @param {number} actionId - Action item ID
 * @param {number} userId - User performing the link
 * @param {boolean} keepStandalone - Keep original as standalone
 * @returns {object} Result of linking operation
 */
async function linkChecklistToAction(checklistId, actionId, userId, keepStandalone = false) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verify checklist is standalone
    const checklistResult = await client.query(
      `SELECT project_id, is_standalone FROM checklists WHERE id = $1`,
      [checklistId]
    );
    
    if (checklistResult.rows.length === 0) {
      throw new Error('Checklist not found');
    }
    
    if (!checklistResult.rows[0].is_standalone) {
      throw new Error('Checklist is not standalone');
    }
    
    const projectId = checklistResult.rows[0].project_id;
    
    // Verify action is in same project
    const actionResult = await client.query(
      `SELECT project_id FROM action_items WHERE id = $1`,
      [actionId]
    );
    
    if (actionResult.rows.length === 0) {
      throw new Error('Action item not found');
    }
    
    if (actionResult.rows[0].project_id !== projectId) {
      throw new Error('Checklist and action must be in same project');
    }
    
    let linkedChecklistId = checklistId;
    
    if (keepStandalone) {
      // Create copy
      const copyResult = await client.query(
        `INSERT INTO checklists (
          title, description, project_id, related_action_id, 
          created_by, source_document, is_standalone
        )
        SELECT 
          title, description, project_id, $1,
          $2, source_document, FALSE
        FROM checklists WHERE id = $3
        RETURNING id`,
        [actionId, userId, checklistId]
      );
      
      linkedChecklistId = copyResult.rows[0].id;
      
      // Copy responses
      await client.query(
        `INSERT INTO checklist_responses (
          checklist_id, template_item_id, response_value, notes, is_completed, item_text
        )
        SELECT 
          $1, template_item_id, response_value, notes, is_completed, item_text
        FROM checklist_responses
        WHERE checklist_id = $2`,
        [linkedChecklistId, checklistId]
      );
      
    } else {
      // Move the checklist
      await client.query(
        `UPDATE checklists
         SET 
           related_action_id = $1,
           is_standalone = FALSE,
           linked_at = CURRENT_TIMESTAMP,
           linked_by = $2
         WHERE id = $3`,
        [actionId, userId, checklistId]
      );
    }
    
    await client.query('COMMIT');
    
    return {
      success: true,
      message: keepStandalone ? 'Checklist copied and linked to action' : 'Checklist linked to action',
      checklistId: linkedChecklistId
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error linking checklist to action:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete standalone checklist
 * @param {number} checklistId - Checklist ID
 * @returns {object} Result of deletion
 */
async function deleteStandaloneChecklist(checklistId) {
  try {
    // Verify it's standalone
    const checkResult = await pool.query(
      `SELECT is_standalone FROM checklists WHERE id = $1`,
      [checklistId]
    );
    
    if (checkResult.rows.length === 0) {
      throw new Error('Checklist not found');
    }
    
    if (!checkResult.rows[0].is_standalone) {
      throw new Error('Cannot delete linked checklist from standalone API');
    }
    
    // Delete checklist (cascade will handle responses)
    await pool.query(`DELETE FROM checklists WHERE id = $1`, [checklistId]);
    
    return {
      success: true,
      message: 'Standalone checklist deleted'
    };
    
  } catch (error) {
    console.error('Error deleting standalone checklist:', error);
    throw error;
  }
}

/**
 * Record document upload
 * @param {object} uploadData - Upload metadata
 * @returns {object} Created upload record
 */
async function recordDocumentUpload(uploadData) {
  try {
    const result = await pool.query(
      `INSERT INTO document_uploads 
         (project_id, filename, file_size, mime_type, uploaded_by, 
          extracted_text_length, generation_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        uploadData.projectId,
        uploadData.filename,
        uploadData.fileSize,
        uploadData.mimeType,
        uploadData.uploadedBy,
        uploadData.extractedTextLength,
        'processing'
      ]
    );
    
    return {
      success: true,
      upload: result.rows[0]
    };
    
  } catch (error) {
    console.error('Error recording document upload:', error);
    throw error;
  }
}

/**
 * Update document upload status
 * @param {number} uploadId - Upload ID
 * @param {object} updateData - Status and metadata
 * @returns {object} Updated upload record
 */
async function updateDocumentUploadStatus(uploadId, updateData) {
  try {
    const result = await pool.query(
      `UPDATE document_uploads
       SET 
         generation_status = $1,
         checklists_generated = $2,
         total_items_generated = $3,
         error_message = $4
       WHERE id = $5
       RETURNING *`,
      [
        updateData.status,
        updateData.checklistsGenerated || 0,
        updateData.itemsGenerated || 0,
        updateData.errorMessage || null,
        uploadId
      ]
    );
    
    return {
      success: true,
      upload: result.rows[0]
    };
    
  } catch (error) {
    console.error('Error updating upload status:', error);
    throw error;
  }
}

module.exports = {
  getStandaloneChecklists,
  createStandaloneChecklist,
  linkChecklistToIssue,
  linkChecklistToAction,
  deleteStandaloneChecklist,
  recordDocumentUpload,
  updateDocumentUploadStatus
};
