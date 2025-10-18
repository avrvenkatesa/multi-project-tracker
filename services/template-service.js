const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Save existing checklist as a reusable template
 */
async function saveChecklistAsTemplate(checklistId, userId, templateData) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get the checklist details with sections
    const checklistResult = await client.query(
      `SELECT c.*, p.id as project_id, p.name as project_name
       FROM checklists c
       INNER JOIN projects p ON c.project_id = p.id
       WHERE c.id = $1`,
      [checklistId]
    );
    
    if (checklistResult.rows.length === 0) {
      throw new Error('Checklist not found');
    }
    
    const checklist = checklistResult.rows[0];
    
    // Check if user has access to this checklist
    const accessCheck = await client.query(
      `SELECT 1 FROM checklists c
       INNER JOIN projects p ON c.project_id = p.id
       INNER JOIN project_members pm ON p.id = pm.project_id
       WHERE c.id = $1 AND pm.user_id = $2`,
      [checklistId, userId]
    );
    
    if (accessCheck.rows.length === 0) {
      throw new Error('Access denied - you do not have permission to save this checklist as template');
    }
    
    // Check for duplicate template name
    const duplicateCheck = await client.query(
      'SELECT id FROM checklist_templates WHERE name = $1 AND created_by = $2',
      [templateData.name, userId]
    );
    
    if (duplicateCheck.rows.length > 0) {
      throw new Error('You already have a template with this name. Please choose a different name.');
    }
    
    // Get the template that this checklist was created from
    if (!checklist.template_id) {
      throw new Error('Cannot create template from checklist without a source template');
    }
    
    // Get sections from the source template for size validation
    const sectionsResult = await client.query(
      `SELECT * FROM checklist_template_sections 
       WHERE template_id = $1 
       ORDER BY display_order`,
      [checklist.template_id]
    );
    
    const sections = sectionsResult.rows;
    const sectionCount = sections.length;
    
    // Get all items to count total
    let totalItems = 0;
    for (const section of sections) {
      const itemsResult = await client.query(
        'SELECT COUNT(*) as count FROM checklist_template_items WHERE section_id = $1',
        [section.id]
      );
      totalItems += parseInt(itemsResult.rows[0].count);
    }
    
    // Validate size limits
    if (sectionCount > 50) {
      throw new Error('Template too large: maximum 50 sections allowed');
    }
    
    if (totalItems > 1000) {
      throw new Error('Template too large: maximum 1,000 items allowed');
    }
    
    // Create template
    const templateResult = await client.query(
      `INSERT INTO checklist_templates (
        name, 
        description, 
        category, 
        tags,
        created_by, 
        is_reusable,
        is_public,
        created_from_checklist_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        templateData.name,
        templateData.description || checklist.description,
        templateData.category || 'General',
        templateData.tags || [],
        userId,
        true,
        templateData.is_public || false,
        checklistId
      ]
    );
    
    const template = templateResult.rows[0];
    
    // Copy sections and items
    for (const section of sections) {
      const sectionResult = await client.query(
        `INSERT INTO checklist_template_sections (
          template_id, title, description, display_order
        ) VALUES ($1, $2, $3, $4)
        RETURNING id`,
        [template.id, section.title, section.description, section.display_order]
      );
      
      const templateSectionId = sectionResult.rows[0].id;
      
      // Get items for this section from the source template
      const itemsResult = await client.query(
        `SELECT * FROM checklist_template_items 
         WHERE section_id = $1 
         ORDER BY display_order`,
        [section.id]
      );
      
      // Copy items
      for (const item of itemsResult.rows) {
        await client.query(
          `INSERT INTO checklist_template_items (
            section_id, item_text, field_type, field_options, 
            is_required, help_text, display_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            templateSectionId,
            item.item_text,
            item.field_type || 'checkbox',
            item.field_options,
            item.is_required || false,
            item.help_text,
            item.display_order
          ]
        );
      }
    }
    
    await client.query('COMMIT');
    
    return template;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get template library with filters
 */
async function getTemplateLibrary(filters = {}) {
  const {
    category,
    tags,
    search,
    is_public = true,
    sort_by = 'usage',
    limit = 50,
    offset = 0,
    created_by
  } = filters;
  
  let whereClauses = ['t.is_reusable = true', 't.is_active = true'];
  let params = [];
  let paramCount = 1;
  
  // Public templates only (unless specified)
  if (is_public) {
    whereClauses.push('t.is_public = true');
  }
  
  // Category filter
  if (category) {
    whereClauses.push(`t.category = $${paramCount}`);
    params.push(category);
    paramCount++;
  }
  
  // Tags filter (contains any of the tags)
  if (tags && tags.length > 0) {
    whereClauses.push(`t.tags && $${paramCount}`);
    params.push(tags);
    paramCount++;
  }
  
  // Search filter (name or description)
  if (search) {
    whereClauses.push(`(t.name ILIKE $${paramCount} OR t.description ILIKE $${paramCount})`);
    params.push(`%${search}%`);
    paramCount++;
  }
  
  // Created by filter (for "My Templates")
  if (created_by) {
    whereClauses.push(`t.created_by = $${paramCount}`);
    params.push(created_by);
    paramCount++;
  }
  
  // Sort order
  let orderBy = 'ORDER BY ';
  switch (sort_by) {
    case 'rating':
      orderBy += '(t.rating_sum::float / NULLIF(t.rating_count, 0)) DESC NULLS LAST';
      break;
    case 'recent':
      orderBy += 't.created_at DESC';
      break;
    case 'name':
      orderBy += 't.name ASC';
      break;
    case 'usage':
    default:
      orderBy += 't.usage_count DESC';
      break;
  }
  
  const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  
  const query = `
    SELECT 
      t.*,
      u.username as creator_name,
      (t.rating_sum::float / NULLIF(t.rating_count, 0)) as avg_rating,
      (SELECT COUNT(*) FROM checklist_template_sections WHERE template_id = t.id) as section_count,
      (SELECT COUNT(*) FROM checklist_template_items i 
       INNER JOIN checklist_template_sections s ON i.section_id = s.id 
       WHERE s.template_id = t.id) as item_count
    FROM checklist_templates t
    INNER JOIN users u ON t.created_by = u.id
    ${whereClause}
    ${orderBy}
    LIMIT $${paramCount} OFFSET $${paramCount + 1}
  `;
  
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  
  // Get total count for pagination
  const countQuery = `
    SELECT COUNT(*) as total
    FROM checklist_templates t
    ${whereClause}
  `;
  
  const countResult = await pool.query(countQuery, params.slice(0, -2));
  const total = parseInt(countResult.rows[0].total);
  
  return {
    templates: result.rows,
    total,
    limit,
    offset
  };
}

/**
 * Get template details including structure
 */
async function getTemplateDetails(templateId, userId = null) {
  const template = await pool.query(
    `SELECT 
      t.*,
      u.username as creator_name,
      (t.rating_sum::float / NULLIF(t.rating_count, 0)) as avg_rating,
      (SELECT rating FROM template_ratings WHERE template_id = t.id AND user_id = $2::integer) as user_rating
    FROM checklist_templates t
    INNER JOIN users u ON t.created_by = u.id
    WHERE t.id = $1`,
    [templateId, userId]
  );
  
  if (template.rows.length === 0) {
    throw new Error('Template not found');
  }
  
  const templateData = template.rows[0];
  
  // Get sections and items
  const sections = await pool.query(
    `SELECT 
      s.*,
      json_agg(
        json_build_object(
          'id', i.id,
          'item_text', i.item_text,
          'field_type', i.field_type,
          'field_options', i.field_options,
          'is_required', i.is_required,
          'help_text', i.help_text,
          'display_order', i.display_order
        ) ORDER BY i.display_order
      ) as items
    FROM checklist_template_sections s
    LEFT JOIN checklist_template_items i ON s.id = i.section_id
    WHERE s.template_id = $1
    GROUP BY s.id
    ORDER BY s.display_order`,
    [templateId]
  );
  
  templateData.sections = sections.rows;
  
  return templateData;
}

/**
 * Update template metadata (not structure)
 */
async function updateTemplateMetadata(templateId, userId, updates) {
  const { name, description, category, tags, is_public } = updates;
  
  // Check ownership
  const ownership = await pool.query(
    'SELECT created_by FROM checklist_templates WHERE id = $1',
    [templateId]
  );
  
  if (ownership.rows.length === 0) {
    throw new Error('Template not found');
  }
  
  if (ownership.rows[0].created_by !== userId) {
    throw new Error('Only the template creator can update it');
  }
  
  // Update only metadata fields
  const result = await pool.query(
    `UPDATE checklist_templates 
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         category = COALESCE($3, category),
         tags = COALESCE($4, tags),
         is_public = COALESCE($5, is_public)
     WHERE id = $6
     RETURNING *`,
    [name, description, category, tags, is_public, templateId]
  );
  
  return result.rows[0];
}

/**
 * Soft delete template (mark as inactive)
 */
async function deactivateTemplate(templateId, userId, userRole) {
  // Check ownership or admin
  const template = await pool.query(
    'SELECT created_by FROM checklist_templates WHERE id = $1',
    [templateId]
  );
  
  if (template.rows.length === 0) {
    throw new Error('Template not found');
  }
  
  if (template.rows[0].created_by !== userId && userRole !== 'admin') {
    throw new Error('Permission denied');
  }
  
  // Soft delete
  await pool.query(
    `UPDATE checklist_templates 
     SET is_active = false, is_public = false, is_featured = false
     WHERE id = $1`,
    [templateId]
  );
  
  return { 
    success: true, 
    message: 'Template deactivated. Existing checklists created from this template are unaffected.' 
  };
}

/**
 * Rate a template
 */
async function rateTemplate(templateId, userId, rating, review = null) {
  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5');
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if template exists
    const templateCheck = await client.query(
      'SELECT id FROM checklist_templates WHERE id = $1',
      [templateId]
    );
    
    if (templateCheck.rows.length === 0) {
      throw new Error('Template not found');
    }
    
    // Upsert rating
    const existingRating = await client.query(
      'SELECT rating FROM template_ratings WHERE template_id = $1 AND user_id = $2',
      [templateId, userId]
    );
    
    let oldRating = 0;
    
    if (existingRating.rows.length > 0) {
      oldRating = existingRating.rows[0].rating;
      
      // Update existing rating
      await client.query(
        `UPDATE template_ratings 
         SET rating = $1, review = $2, updated_at = CURRENT_TIMESTAMP
         WHERE template_id = $3 AND user_id = $4`,
        [rating, review, templateId, userId]
      );
    } else {
      // Insert new rating
      await client.query(
        `INSERT INTO template_ratings (template_id, user_id, rating, review)
         VALUES ($1, $2, $3, $4)`,
        [templateId, userId, rating, review]
      );
    }
    
    // Update template rating aggregates
    if (existingRating.rows.length > 0) {
      // Update: adjust sum, count stays same
      await client.query(
        `UPDATE checklist_templates 
         SET rating_sum = rating_sum - $1 + $2
         WHERE id = $3`,
        [oldRating, rating, templateId]
      );
    } else {
      // New rating: increment both
      await client.query(
        `UPDATE checklist_templates 
         SET rating_sum = rating_sum + $1,
             rating_count = rating_count + 1
         WHERE id = $2`,
        [rating, templateId]
      );
    }
    
    await client.query('COMMIT');
    
    return { success: true };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Feature/unfeature template (admin only)
 */
async function toggleFeatured(templateId, isFeatured) {
  await pool.query(
    'UPDATE checklist_templates SET is_featured = $1 WHERE id = $2',
    [isFeatured, templateId]
  );
  
  return { success: true };
}

/**
 * Apply template to create new checklist
 */
async function applyTemplate(templateId, userId, projectId, checklistData = {}) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get template details
    const template = await getTemplateDetails(templateId);
    
    // Check project access
    const projectAccess = await client.query(
      `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId]
    );
    
    if (projectAccess.rows.length === 0) {
      throw new Error('You do not have access to this project');
    }
    
    // Create checklist from template
    const checklistResult = await client.query(
      `INSERT INTO checklists (
        template_id, project_id, title, description, status, assigned_to
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        templateId,
        projectId,
        checklistData.title || template.name,
        checklistData.description || template.description,
        'not_started',
        checklistData.assigned_to || userId
      ]
    );
    
    const checklist = checklistResult.rows[0];
    
    // Create responses for all template items
    // The checklist references the template, so responses link to template items directly
    for (const section of template.sections) {
      for (const item of section.items) {
        await client.query(
          `INSERT INTO checklist_responses (
            checklist_id, template_item_id, is_completed
          ) VALUES ($1, $2, $3)`,
          [
            checklist.id,
            item.id,
            false
          ]
        );
      }
    }
    
    // Track template usage
    await client.query(
      `INSERT INTO template_usage (template_id, user_id, checklist_id, project_id)
       VALUES ($1, $2, $3, $4)`,
      [templateId, userId, checklist.id, projectId]
    );
    
    // Increment usage count
    await client.query(
      'UPDATE checklist_templates SET usage_count = usage_count + 1 WHERE id = $1',
      [templateId]
    );
    
    await client.query('COMMIT');
    
    return checklist;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get template categories
 */
async function getTemplateCategories() {
  const result = await pool.query(
    `SELECT * FROM template_categories 
     WHERE is_active = true 
     ORDER BY display_order`
  );
  
  return result.rows;
}

// ============================================
// Phase 3b Feature 1: Auto-Create Checklists
// ============================================

/**
 * Get all active action item categories
 */
async function getActionItemCategories() {
  try {
    const result = await pool.query(
      `SELECT * FROM action_item_categories
       WHERE is_active = TRUE
       ORDER BY display_order, name`
    );
    return result.rows;
  } catch (error) {
    console.error('Error fetching action item categories:', error);
    throw error;
  }
}

/**
 * Get template mappings for issue types
 * @param {number|null} projectId - Filter by project (null = global mappings)
 */
async function getIssueTypeTemplateMappings(projectId = null) {
  try {
    let result;
    
    if (projectId === null) {
      // Get all mappings when no project specified
      result = await pool.query(
        `SELECT 
          itt.*,
          ct.name as template_name,
          ct.description as template_description,
          ct.usage_count as template_usage_count
        FROM issue_type_templates itt
        LEFT JOIN checklist_templates ct ON itt.template_id = ct.id
        WHERE itt.is_active = TRUE
        ORDER BY itt.project_id NULLS LAST, itt.issue_type`
      );
    } else {
      // Get mappings for specific project (including global ones)
      result = await pool.query(
        `SELECT 
          itt.*,
          ct.name as template_name,
          ct.description as template_description,
          ct.usage_count as template_usage_count
        FROM issue_type_templates itt
        LEFT JOIN checklist_templates ct ON itt.template_id = ct.id
        WHERE (itt.project_id = $1 OR itt.project_id IS NULL)
          AND itt.is_active = TRUE
        ORDER BY itt.project_id NULLS LAST, itt.issue_type`,
        [projectId]
      );
    }
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching issue type mappings:', error);
    throw error;
  }
}

/**
 * Get template mappings for action item categories
 * @param {number|null} projectId - Filter by project (null = global mappings)
 */
async function getActionCategoryTemplateMappings(projectId = null) {
  try {
    let result;
    
    if (projectId === null) {
      // Get all mappings when no project specified
      result = await pool.query(
        `SELECT 
          actt.*,
          ac.name as category_name,
          ac.description as category_description,
          ac.icon as category_icon,
          ct.name as template_name,
          ct.description as template_description,
          ct.usage_count as template_usage_count
        FROM action_item_category_templates actt
        LEFT JOIN action_item_categories ac ON actt.category_id = ac.id
        LEFT JOIN checklist_templates ct ON actt.template_id = ct.id
        WHERE actt.is_active = TRUE
        ORDER BY actt.project_id NULLS LAST, ac.display_order, ac.name`
      );
    } else {
      // Get mappings for specific project (including global ones)
      result = await pool.query(
        `SELECT 
          actt.*,
          ac.name as category_name,
          ac.description as category_description,
          ac.icon as category_icon,
          ct.name as template_name,
          ct.description as template_description,
          ct.usage_count as template_usage_count
        FROM action_item_category_templates actt
        LEFT JOIN action_item_categories ac ON actt.category_id = ac.id
        LEFT JOIN checklist_templates ct ON actt.template_id = ct.id
        WHERE (actt.project_id = $1 OR actt.project_id IS NULL)
          AND actt.is_active = TRUE
        ORDER BY actt.project_id NULLS LAST, ac.display_order, ac.name`,
        [projectId]
      );
    }
    
    return result.rows;
  } catch (error) {
    console.error('Error fetching action category mappings:', error);
    throw error;
  }
}

/**
 * Save or update issue type template mapping
 * @param {string} issueType - Issue type (Bug, Feature, etc.)
 * @param {number} templateId - Template ID to map
 * @param {number|null} projectId - Project ID (null = global)
 * @param {number} userId - User creating the mapping
 */
async function saveIssueTypeTemplateMapping(issueType, templateId, projectId, userId) {
  try {
    const result = await pool.query(
      `INSERT INTO issue_type_templates (issue_type, template_id, project_id, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (issue_type, project_id) 
       DO UPDATE SET 
         template_id = $2,
         updated_at = NOW(),
         is_active = TRUE
       RETURNING *`,
      [issueType, templateId, projectId, userId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error saving issue type mapping:', error);
    throw error;
  }
}

/**
 * Save or update action category template mapping
 * @param {number} categoryId - Action item category ID
 * @param {number} templateId - Template ID to map
 * @param {number|null} projectId - Project ID (null = global)
 * @param {number} userId - User creating the mapping
 */
async function saveActionCategoryTemplateMapping(categoryId, templateId, projectId, userId) {
  try {
    const result = await pool.query(
      `INSERT INTO action_item_category_templates (category_id, template_id, project_id, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (category_id, project_id)
       DO UPDATE SET
         template_id = $2,
         updated_at = NOW(),
         is_active = TRUE
       RETURNING *`,
      [categoryId, templateId, projectId, userId]
    );
    return result.rows[0];
  } catch (error) {
    console.error('Error saving action category mapping:', error);
    throw error;
  }
}

/**
 * Auto-create checklist when issue is created
 * Called from issue creation endpoint
 * @param {number} issueId - ID of newly created issue
 * @param {string} issueType - Type of issue
 * @param {number} projectId - Project ID
 * @param {number} userId - User creating the issue
 */
async function autoCreateChecklistForIssue(issueId, issueType, projectId, userId) {
  try {
    // Find template mapping (project-specific first, then global, then most recent)
    const mapping = await pool.query(
      `SELECT template_id
       FROM issue_type_templates
       WHERE issue_type = $1
         AND (project_id = $2 OR project_id IS NULL)
         AND is_active = TRUE
         AND auto_create = TRUE
       ORDER BY project_id NULLS LAST, updated_at DESC
       LIMIT 1`,
      [issueType, projectId]
    );

    if (mapping.rows.length === 0) {
      console.log(`No template mapping found for issue type: ${issueType}`);
      return null;
    }

    const templateId = mapping.rows[0].template_id;
    console.log(`Auto-creating checklist from template ${templateId} for issue ${issueId}`);

    // Apply template to create checklist (reuse existing function)
    const checklist = await applyTemplate(templateId, projectId, userId, issueId, null);
    
    return checklist;
  } catch (error) {
    console.error('Error auto-creating checklist for issue:', error);
    // Don't throw - let issue creation succeed even if checklist fails
    return null;
  }
}

/**
 * Auto-create checklist when action item is created
 * Called from action item creation endpoint
 * @param {number} actionItemId - ID of newly created action item
 * @param {number|null} categoryId - Category ID (may be null)
 * @param {number} projectId - Project ID
 * @param {number} userId - User creating the action item
 */
async function autoCreateChecklistForActionItem(actionItemId, categoryId, projectId, userId) {
  try {
    if (!categoryId) {
      console.log('No category specified for action item, skipping auto-checklist');
      return null;
    }

    // Find template mapping (project-specific first, then global, then most recent)
    const mapping = await pool.query(
      `SELECT template_id
       FROM action_item_category_templates
       WHERE category_id = $1
         AND (project_id = $2 OR project_id IS NULL)
         AND is_active = TRUE
         AND auto_create = TRUE
       ORDER BY project_id NULLS LAST, updated_at DESC
       LIMIT 1`,
      [categoryId, projectId]
    );

    if (mapping.rows.length === 0) {
      console.log(`No template mapping found for category ID: ${categoryId}`);
      return null;
    }

    const templateId = mapping.rows[0].template_id;
    console.log(`Auto-creating checklist from template ${templateId} for action item ${actionItemId}`);

    // Apply template to create checklist (reuse existing function)
    const checklist = await applyTemplate(templateId, projectId, userId, null, actionItemId);
    
    return checklist;
  } catch (error) {
    console.error('Error auto-creating checklist for action item:', error);
    // Don't throw - let action item creation succeed even if checklist fails
    return null;
  }
}

module.exports = {
  saveChecklistAsTemplate,
  getTemplateLibrary,
  getTemplateDetails,
  updateTemplateMetadata,
  deactivateTemplate,
  rateTemplate,
  toggleFeatured,
  applyTemplate,
  getTemplateCategories,
  // Phase 3b Feature 1 exports
  getActionItemCategories,
  getIssueTypeTemplateMappings,
  getActionCategoryTemplateMappings,
  saveIssueTypeTemplateMapping,
  saveActionCategoryTemplateMapping,
  autoCreateChecklistForIssue,
  autoCreateChecklistForActionItem
};
