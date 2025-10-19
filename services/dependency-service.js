// services/dependency-service.js
// Phase 3b Feature 5: Checklist Item Dependencies

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================
// Dependency Management
// ============================================

/**
 * Add a dependency between checklist items
 * @param {number} itemId - The item that depends on another
 * @param {number} dependsOnItemId - The item that must be completed first
 * @param {number} userId - User creating the dependency
 */
async function addDependency(itemId, dependsOnItemId, userId) {
  try {
    console.log(`➕ Adding dependency: Item ${itemId} depends on Item ${dependsOnItemId}`);
    
    // Validation
    if (itemId === dependsOnItemId) {
      throw new Error('An item cannot depend on itself');
    }
    
    // Verify both items exist and are in the same checklist
    const itemsCheck = await pool.query(
      `SELECT cr1.id as item1_id, cr1.checklist_id as checklist1_id, cr1.template_item_id as template1_id,
              cr2.id as item2_id, cr2.checklist_id as checklist2_id, cr2.template_item_id as template2_id
       FROM checklist_responses cr1
       LEFT JOIN checklist_responses cr2 ON cr2.id = $2
       WHERE cr1.id = $1`,
      [itemId, dependsOnItemId]
    );
    
    console.log(`🔍 Query result:`, JSON.stringify(itemsCheck.rows, null, 2));
    
    if (itemsCheck.rows.length === 0) {
      throw new Error(`Item with ID ${itemId} not found in checklist_responses table. Note: Use the response ID, not template_item_id.`);
    }
    
    const row = itemsCheck.rows[0];
    
    if (!row.item2_id) {
      throw new Error(`Item with ID ${dependsOnItemId} not found in checklist_responses table. Note: Use the response ID, not template_item_id.`);
    }
    
    console.log(`✓ Item 1: Response ID ${row.item1_id} (Template ${row.template1_id}) in Checklist ${row.checklist1_id}`);
    console.log(`✓ Item 2: Response ID ${row.item2_id} (Template ${row.template2_id}) in Checklist ${row.checklist2_id}`);
    
    if (row.checklist1_id !== row.checklist2_id) {
      throw new Error('Dependencies can only be created between items in the same checklist');
    }
    
    // Insert dependency (circular check happens in DB trigger)
    const result = await pool.query(
      `INSERT INTO checklist_item_dependencies 
         (item_id, depends_on_item_id, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (item_id, depends_on_item_id) DO NOTHING
       RETURNING *`,
      [itemId, dependsOnItemId, userId]
    );
    
    if (result.rows.length === 0) {
      console.log('⚠️ Dependency already exists');
      return null;
    }
    
    console.log(`✅ Dependency created: ${result.rows[0].id}`);
    return result.rows[0];
    
  } catch (error) {
    if (error.message.includes('Circular dependency detected')) {
      console.error('❌ Circular dependency prevented:', error.message);
      throw new Error('Cannot add this dependency: it would create a circular dependency chain');
    }
    console.error('Error adding dependency:', error);
    throw error;
  }
}

/**
 * Remove a dependency
 * @param {number} dependencyId - Dependency ID to remove
 */
async function removeDependency(dependencyId) {
  try {
    const result = await pool.query(
      `DELETE FROM checklist_item_dependencies 
       WHERE id = $1 
       RETURNING *`,
      [dependencyId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Dependency not found');
    }
    
    console.log(`🗑️ Dependency removed: ${dependencyId}`);
    return result.rows[0];
    
  } catch (error) {
    console.error('Error removing dependency:', error);
    throw error;
  }
}

/**
 * Get all dependencies for a checklist item
 * @param {number} itemId - Checklist item ID
 */
async function getItemDependencies(itemId) {
  try {
    const result = await pool.query(
      `SELECT 
         cid.id as dependency_id,
         cid.item_id,
         cid.depends_on_item_id,
         cr.template_item_id,
         cti.item_text as depends_on_title,
         cr.is_completed as depends_on_completed,
         cid.created_at
       FROM checklist_item_dependencies cid
       JOIN checklist_responses cr ON cid.depends_on_item_id = cr.id
       LEFT JOIN checklist_template_items cti ON cr.template_item_id = cti.id
       WHERE cid.item_id = $1
       ORDER BY cid.created_at`,
      [itemId]
    );
    
    return result.rows;
    
  } catch (error) {
    console.error('Error getting item dependencies:', error);
    throw error;
  }
}

/**
 * Check if an item is blocked by incomplete dependencies
 * @param {number} itemId - Checklist item ID
 * @returns {object} { isBlocked, blockedBy, totalDependencies, completedDependencies }
 */
async function checkIfItemBlocked(itemId) {
  try {
    const result = await pool.query(
      `SELECT * FROM checklist_item_dependency_status 
       WHERE item_id = $1`,
      [itemId]
    );
    
    if (result.rows.length === 0) {
      // Item has no dependencies, not blocked
      return {
        isBlocked: false,
        blockedBy: [],
        totalDependencies: 0,
        completedDependencies: 0
      };
    }
    
    const status = result.rows[0];
    
    // Get details of blocking items if blocked
    let blockedBy = [];
    if (status.is_blocked) {
      const blockingItems = await pool.query(
        `SELECT 
           cr.id,
           cti.item_text as title,
           cr.is_completed
         FROM checklist_item_dependencies cid
         JOIN checklist_responses cr ON cid.depends_on_item_id = cr.id
         LEFT JOIN checklist_template_items cti ON cr.template_item_id = cti.id
         WHERE cid.item_id = $1 AND cr.is_completed = FALSE`,
        [itemId]
      );
      
      blockedBy = blockingItems.rows;
    }
    
    return {
      isBlocked: status.is_blocked,
      blockedBy: blockedBy,
      totalDependencies: parseInt(status.total_dependencies) || 0,
      completedDependencies: parseInt(status.completed_dependencies) || 0
    };
    
  } catch (error) {
    console.error('Error checking if item blocked:', error);
    throw error;
  }
}

/**
 * Get all items that depend on a specific item
 * (What would be unblocked if this item is completed?)
 * @param {number} itemId - Checklist item ID
 */
async function getItemsDependingOn(itemId) {
  try {
    const result = await pool.query(
      `SELECT 
         cid.id as dependency_id,
         cid.item_id,
         cr.template_item_id,
         cti.item_text as item_title,
         cr.is_completed as item_completed
       FROM checklist_item_dependencies cid
       JOIN checklist_responses cr ON cid.item_id = cr.id
       LEFT JOIN checklist_template_items cti ON cr.template_item_id = cti.id
       WHERE cid.depends_on_item_id = $1
       ORDER BY cti.item_text`,
      [itemId]
    );
    
    return result.rows;
    
  } catch (error) {
    console.error('Error getting items depending on this item:', error);
    throw error;
  }
}

// ============================================
// Exports
// ============================================

module.exports = {
  addDependency,
  removeDependency,
  getItemDependencies,
  checkIfItemBlocked,
  getItemsDependingOn
};
