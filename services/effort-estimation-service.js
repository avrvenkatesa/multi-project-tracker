const { OpenAI } = require('openai');
const aiCostTracker = require('./ai-cost-tracker');
const { pool } = require('../db');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * AI Effort Estimation Service (Phase 1)
 * Two-phase estimation approach:
 * 1. Decompose work into constituent tasks
 * 2. Estimate each task individually
 * 
 * Returns structured breakdown with confidence scoring
 */

// Pricing constants (as of 2024)
const PRICING = {
  'gpt-4o': {
    input: 0.0025 / 1000,  // $2.50 per 1M tokens
    output: 0.010 / 1000   // $10 per 1M tokens
  },
  'gpt-3.5-turbo': {
    input: 0.0005 / 1000,  // $0.50 per 1M tokens
    output: 0.0015 / 1000  // $1.50 per 1M tokens
  }
};

/**
 * Calculate cost of an OpenAI API call
 */
function calculateCost(usage, model = 'gpt-4o') {
  if (!usage || !PRICING[model]) return 0;
  
  const inputCost = (usage.prompt_tokens || 0) * PRICING[model].input;
  const outputCost = (usage.completion_tokens || 0) * PRICING[model].output;
  
  return inputCost + outputCost;
}

/**
 * Phase 1: Decompose work into tasks
 * @param {string} title - Item title
 * @param {string} description - Item description
 * @param {string} itemType - 'issue' or 'action-item'
 * @param {string} model - AI model to use
 * @returns {Object} Decomposed tasks with metadata
 */
async function decomposeIntoTasks(title, description, itemType, model = 'gpt-4o') {
  const systemPrompt = `You are an expert software project estimator. Your task is to break down work into specific, measurable tasks.

Rules:
1. Decompose into 3-8 concrete tasks (fewer for simple work, more for complex)
2. Each task should be specific and actionable
3. Include common software development phases (design, implementation, testing, etc.)
4. Consider the item type: ${itemType === 'issue' ? 'features/bugs typically involve multiple components' : 'action items are usually more focused tasks'}
5. Be realistic about what each task involves

Return tasks as a JSON array with this structure:
{
  "tasks": [
    {
      "name": "Task description",
      "complexity": "low" | "medium" | "high",
      "category": "design" | "backend" | "frontend" | "testing" | "devops" | "documentation"
    }
  ],
  "assumptions": ["assumption 1", "assumption 2"],
  "risks": ["risk 1", "risk 2"]
}`;

  const userPrompt = `Title: ${title}
Description: ${description || 'No detailed description provided'}

Decompose this ${itemType} into specific tasks.`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent decomposition
      max_tokens: 1000
    });

    const result = JSON.parse(response.choices[0].message.content);
    const cost = calculateCost(response.usage, model);

    return {
      tasks: result.tasks || [],
      assumptions: result.assumptions || [],
      risks: result.risks || [],
      metadata: {
        model,
        tokens: response.usage,
        cost
      }
    };
  } catch (error) {
    console.error('Error decomposing tasks:', error);
    throw new Error('Failed to decompose work into tasks');
  }
}

/**
 * Phase 2: Estimate individual tasks
 * @param {Array} tasks - Tasks from decomposition phase
 * @param {string} model - AI model to use
 * @returns {Object} Estimated tasks with total
 */
async function estimateTasks(tasks, model = 'gpt-4o') {
  const systemPrompt = `You are an expert software estimator. Estimate hours for each task based on:
- Complexity level (low: 1-4h, medium: 4-12h, high: 12-40h)
- Category/type of work
- Typical development velocity
- Include buffer for unknowns

Return estimates as JSON:
{
  "estimates": [
    {
      "task": "original task name",
      "hours": 8.5,
      "reasoning": "brief justification"
    }
  ],
  "confidence": "low" | "medium" | "high",
  "confidence_reasoning": "why this confidence level"
}

Confidence levels:
- high: Clear requirements, standard technology, minimal unknowns
- medium: Some ambiguity, familiar tech, moderate complexity
- low: Vague requirements, new technology, high complexity`;

  const userPrompt = `Estimate hours for these tasks:
${JSON.stringify(tasks, null, 2)}

Consider:
- Developer with moderate experience in the tech stack
- Standard working environment
- Includes code review and basic testing`;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2, // Very low for consistent estimation
      max_tokens: 1000
    });

    const result = JSON.parse(response.choices[0].message.content);
    const cost = calculateCost(response.usage, model);

    // Calculate total hours
    const totalHours = result.estimates.reduce((sum, est) => sum + (est.hours || 0), 0);

    return {
      estimates: result.estimates || [],
      totalHours: Math.round(totalHours * 10) / 10, // Round to 1 decimal
      confidence: result.confidence || 'medium',
      confidenceReasoning: result.confidence_reasoning || 'No reasoning provided',
      metadata: {
        model,
        tokens: response.usage,
        cost
      }
    };
  } catch (error) {
    console.error('Error estimating tasks:', error);
    throw new Error('Failed to estimate task hours');
  }
}

/**
 * Generate complete effort estimate (combines Phase 1 & 2)
 * @param {Object} params - Estimation parameters
 * @returns {Object} Complete estimate with breakdown
 */
async function generateEffortEstimate(params) {
  const {
    title,
    description,
    itemType = 'issue',
    model = 'gpt-4o',
    userId,
    projectId
  } = params;

  // Validate inputs
  if (!title || title.trim().length < 5) {
    throw new Error('Title must be at least 5 characters for estimation');
  }

  if (!description || description.trim().length < 20) {
    return {
      success: false,
      error: 'insufficient_description',
      message: 'Description must be at least 20 characters for AI estimation. Please provide more details.',
      confidence: 'low'
    };
  }

  const startTime = Date.now();
  let totalCost = 0;

  try {
    // Phase 1: Decompose into tasks
    const decomposition = await decomposeIntoTasks(title, description, itemType, model);
    totalCost += decomposition.metadata.cost;

    // Phase 2: Estimate each task
    const estimation = await estimateTasks(decomposition.tasks, model);
    totalCost += estimation.metadata.cost;

    // Build complete breakdown
    const breakdown = estimation.estimates.map((est, index) => {
      const task = decomposition.tasks[index] || {};
      return {
        task: est.task,
        hours: est.hours,
        complexity: task.complexity || 'medium',
        category: task.category || 'development',
        reasoning: est.reasoning
      };
    });

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      totalHours: estimation.totalHours,
      confidence: estimation.confidence,
      confidenceReasoning: estimation.confidenceReasoning,
      breakdown,
      assumptions: decomposition.assumptions,
      risks: decomposition.risks,
      metadata: {
        model,
        totalTokens: {
          prompt: decomposition.metadata.tokens.prompt_tokens + estimation.metadata.tokens.prompt_tokens,
          completion: decomposition.metadata.tokens.completion_tokens + estimation.metadata.tokens.completion_tokens,
          total: decomposition.metadata.tokens.total_tokens + estimation.metadata.tokens.total_tokens
        },
        totalCost,
        executionTime,
        userId,
        projectId
      }
    };
  } catch (error) {
    console.error('Error generating effort estimate:', error);
    return {
      success: false,
      error: 'estimation_failed',
      message: error.message || 'Failed to generate estimate',
      confidence: 'low'
    };
  }
}

/**
 * Generate effort estimate from existing item in database
 * @param {Object} pool - Database pool
 * @param {string} itemType - 'issue' or 'action-item'
 * @param {number} itemId - Item ID
 * @param {Object} options - Estimation options
 * @returns {Object} Complete estimate
 */
async function generateEstimateFromItem(pool, itemType, itemId, options = {}) {
  const { userId, model = 'gpt-4o' } = options;

  try {
    // Fetch item from database
    const tableName = itemType === 'issue' ? 'issues' : 'action_items';
    const result = await pool.query(
      `SELECT id, title, description, project_id, ai_estimate_version 
       FROM ${tableName} 
       WHERE id = $1`,
      [itemId]
    );

    if (result.rows.length === 0) {
      throw new Error(`${itemType} not found`);
    }

    const item = result.rows[0];

    // Generate estimate
    const estimate = await generateEffortEstimate({
      title: item.title,
      description: item.description,
      itemType,
      model,
      userId,
      projectId: item.project_id
    });

    if (!estimate.success) {
      return estimate;
    }

    // Increment version
    const newVersion = (item.ai_estimate_version || 0) + 1;

    // Use transaction to ensure atomicity between version update and history insert
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update item with estimate
      await client.query(
        `UPDATE ${tableName} 
         SET ai_effort_estimate_hours = $1,
             ai_estimate_confidence = $2,
             ai_estimate_version = $3,
             ai_estimate_last_updated = NOW()
         WHERE id = $4`,
        [estimate.totalHours, estimate.confidence, newVersion, itemId]
      );

      // Save to history
      await client.query(
        `INSERT INTO effort_estimate_history 
         (item_type, item_id, estimate_hours, version, confidence, breakdown, reasoning, source, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          itemType,
          itemId,
          estimate.totalHours,
          newVersion,
          estimate.confidence,
          JSON.stringify({
            tasks: estimate.breakdown,
            assumptions: estimate.assumptions,
            risks: estimate.risks
          }),
          estimate.confidenceReasoning,
          options.source || 'manual_regenerate',
          userId
        ]
      );

      // Track AI usage with centralized service
      await aiCostTracker.trackAIUsage({
        userId,
        projectId: item.project_id,
        feature: 'effort_estimation',
        operationType: 'generate_estimate',
        promptTokens: estimate.metadata.totalTokens.prompt,
        completionTokens: estimate.metadata.totalTokens.completion,
        totalTokens: estimate.metadata.totalTokens.total,
        costUsd: estimate.metadata.totalCost,
        model: 'gpt-4o',
        metadata: {
          itemType,
          itemId,
          version: newVersion,
          confidence: estimate.confidence
        }
      });

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return {
      ...estimate,
      version: newVersion,
      itemId,
      itemType
    };
  } catch (error) {
    console.error('Error generating estimate from item:', error);
    throw error;
  }
}

/**
 * Get estimation breakdown for an item
 * @param {Object} pool - Database pool
 * @param {string} itemType - 'issue' or 'action-item'
 * @param {number} itemId - Item ID
 * @param {number} version - Version number (optional, defaults to latest)
 * @returns {Object} Breakdown data
 */
async function getEstimateBreakdown(pool, itemType, itemId, version = null) {
  try {
    let query, params;

    if (version) {
      query = `SELECT * FROM effort_estimate_history 
               WHERE item_type = $1 AND item_id = $2 AND version = $3`;
      params = [itemType, itemId, version];
    } else {
      query = `SELECT * FROM effort_estimate_history 
               WHERE item_type = $1 AND item_id = $2 
               ORDER BY version DESC LIMIT 1`;
      params = [itemType, itemId];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    const history = result.rows[0];
    return {
      version: history.version,
      estimateHours: parseFloat(history.estimate_hours),
      confidence: history.confidence,
      breakdown: history.breakdown,
      reasoning: history.reasoning,
      source: history.source,
      createdAt: history.created_at,
      createdBy: history.created_by
    };
  } catch (error) {
    console.error('Error getting estimate breakdown:', error);
    throw error;
  }
}

/**
 * Get all versions of estimates for an item
 * @param {Object} pool - Database pool
 * @param {string} itemType - 'issue' or 'action-item'
 * @param {number} itemId - Item ID
 * @returns {Array} All estimate versions
 */
async function getEstimateHistory(pool, itemType, itemId) {
  try {
    const result = await pool.query(
      `SELECT version, estimate_hours, confidence, reasoning, source, created_at, created_by
       FROM effort_estimate_history 
       WHERE item_type = $1 AND item_id = $2 
       ORDER BY version DESC`,
      [itemType, itemId]
    );

    return result.rows.map(row => ({
      version: row.version,
      estimateHours: parseFloat(row.estimate_hours),
      confidence: row.confidence,
      reasoning: row.reasoning,
      source: row.source,
      createdAt: row.created_at,
      createdBy: row.created_by
    }));
  } catch (error) {
    console.error('Error getting estimate history:', error);
    throw error;
  }
}

/**
 * Calculate rolled-up effort for a parent issue from all children
 * @param {number} parentIssueId - Parent issue ID
 * @param {Object} options - Options object
 * @param {boolean} options.updateParent - Whether to update parent issue effort_hours (default: true)
 * @returns {Object} Rollup calculation results
 */
async function calculateRollupEffort(parentIssueId, options = {}) {
  const { updateParent = true } = options;
  
  console.log(`[Rollup] Calculating effort for parent issue ${parentIssueId}`);
  
  try {
    // Get all children using database function
    const childrenResult = await pool.query(
      'SELECT * FROM get_issue_children($1)',
      [parentIssueId]
    );
    
    const children = childrenResult.rows;
    console.log(`[Rollup] Found ${children.length} descendant(s) for issue ${parentIssueId}`);
    
    if (children.length === 0) {
      console.log(`[Rollup] No children found - issue ${parentIssueId} is a leaf node`);
      return {
        parentIssueId,
        totalHours: 0,
        childCount: 0,
        children: [],
        breakdown: [],
        byAssignee: {},
        metadata: {
          isLeafNode: true,
          calculatedAt: new Date().toISOString()
        }
      };
    }
    
    // Sum effort hours from all children
    let totalHours = 0;
    const breakdown = [];
    const byAssignee = {};
    
    children.forEach(child => {
      const effort = parseFloat(child.estimated_effort_hours) || 0;
      totalHours += effort;
      
      // Build breakdown
      breakdown.push({
        id: child.id,
        title: child.title,
        depth: child.depth,
        effort: Math.round(effort * 10) / 10,
        assignee: child.assignee,
        status: child.status,
        isLeaf: child.is_leaf
      });
      
      // Group by assignee
      const assignee = child.assignee || 'Unassigned';
      if (!byAssignee[assignee]) {
        byAssignee[assignee] = {
          assignee,
          totalHours: 0,
          taskCount: 0,
          tasks: []
        };
      }
      byAssignee[assignee].totalHours += effort;
      byAssignee[assignee].taskCount += 1;
      byAssignee[assignee].tasks.push({
        id: child.id,
        title: child.title,
        hours: Math.round(effort * 10) / 10
      });
    });
    
    // Round total hours
    totalHours = Math.round(totalHours * 10) / 10;
    
    // Round assignee totals
    Object.values(byAssignee).forEach(assigneeData => {
      assigneeData.totalHours = Math.round(assigneeData.totalHours * 10) / 10;
    });
    
    console.log(`[Rollup] Total effort for issue ${parentIssueId}: ${totalHours} hours from ${children.length} children`);
    
    // Update parent issue if requested
    if (updateParent && totalHours > 0) {
      await pool.query(
        'UPDATE issues SET effort_hours = $1, updated_at = NOW() WHERE id = $2',
        [totalHours, parentIssueId]
      );
      console.log(`[Rollup] Updated parent issue ${parentIssueId} with rolled-up effort: ${totalHours} hours`);
    }
    
    return {
      parentIssueId,
      totalHours,
      childCount: children.length,
      children: breakdown,
      breakdown,
      byAssignee,
      metadata: {
        isLeafNode: false,
        updatedParent: updateParent,
        calculatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error(`[Rollup] Error calculating rollup effort for issue ${parentIssueId}:`, error);
    throw new Error(`Failed to calculate rollup effort: ${error.message}`);
  }
}

/**
 * Update all parent efforts in a project hierarchy (bottom-up)
 * @param {number} projectId - Project ID
 * @returns {Object} Summary of updates
 */
async function updateAllParentEfforts(projectId) {
  console.log(`[Rollup] Updating all parent efforts for project ${projectId}`);
  
  try {
    // Find all distinct parent_issue_id values for the project (bottom-up order)
    const parentsResult = await pool.query(
      `SELECT DISTINCT parent_issue_id
       FROM issues
       WHERE project_id = $1 
       AND parent_issue_id IS NOT NULL
       ORDER BY parent_issue_id`,
      [projectId]
    );
    
    const parentIds = parentsResult.rows.map(row => row.parent_issue_id);
    console.log(`[Rollup] Found ${parentIds.length} parent issue(s) to update in project ${projectId}`);
    
    if (parentIds.length === 0) {
      return {
        success: true,
        projectId,
        updatedCount: 0,
        totalHours: 0,
        parents: [],
        message: 'No parent issues found in project'
      };
    }
    
    // Calculate rollup for each parent (bottom-up to handle nested hierarchies)
    const results = [];
    let totalHoursAcrossAll = 0;
    
    for (const parentId of parentIds) {
      try {
        const rollup = await calculateRollupEffort(parentId, { updateParent: true });
        results.push({
          parentId,
          totalHours: rollup.totalHours,
          childCount: rollup.childCount
        });
        totalHoursAcrossAll += rollup.totalHours;
      } catch (error) {
        console.error(`[Rollup] Error updating parent ${parentId}:`, error);
        results.push({
          parentId,
          error: error.message,
          totalHours: 0,
          childCount: 0
        });
      }
    }
    
    const updatedCount = results.filter(r => !r.error).length;
    
    console.log(`[Rollup] Updated ${updatedCount}/${parentIds.length} parent issue(s) in project ${projectId}`);
    
    return {
      success: true,
      projectId,
      updatedCount,
      totalHours: Math.round(totalHoursAcrossAll * 10) / 10,
      parents: results,
      message: `Updated ${updatedCount} parent issue(s)`
    };
  } catch (error) {
    console.error(`[Rollup] Error updating all parent efforts for project ${projectId}:`, error);
    throw new Error(`Failed to update parent efforts: ${error.message}`);
  }
}

/**
 * Get base effort estimate with dependency buffer adjustment
 * @param {number} issueId - Issue ID
 * @param {Object} options - Options object
 * @param {string} options.itemType - 'issue' or 'action-item' (default: 'issue')
 * @returns {Object} Adjusted estimate with dependency buffer
 */
async function estimateWithDependencies(issueId, options = {}) {
  const { itemType = 'issue' } = options;
  const tableName = itemType === 'issue' ? 'issues' : 'action_items';
  
  console.log(`[Dependency Estimate] Calculating estimate with dependencies for ${itemType} ${issueId}`);
  
  try {
    // Get base effort from table
    const itemResult = await pool.query(
      `SELECT id, title, estimated_effort_hours, effort_hours, status
       FROM ${tableName}
       WHERE id = $1`,
      [issueId]
    );
    
    if (itemResult.rows.length === 0) {
      throw new Error(`${itemType} with ID ${issueId} not found`);
    }
    
    const item = itemResult.rows[0];
    const baseEffort = parseFloat(item.estimated_effort_hours || item.effort_hours || 0);
    
    console.log(`[Dependency Estimate] Base effort for ${itemType} ${issueId}: ${baseEffort} hours`);
    
    // Query dependencies
    const depsResult = await pool.query(
      `SELECT 
        d.id,
        d.source_item_id,
        d.dependent_item_id,
        d.dependency_type,
        i.title as prerequisite_title,
        i.status as prerequisite_status,
        i.estimated_effort_hours as prerequisite_effort
       FROM issue_dependencies d
       LEFT JOIN ${tableName} i ON d.source_item_id = i.id
       WHERE d.dependent_item_id = $1 AND d.item_type = $2`,
      [issueId, itemType]
    );
    
    const dependencies = depsResult.rows;
    console.log(`[Dependency Estimate] Found ${dependencies.length} prerequisite(s) for ${itemType} ${issueId}`);
    
    if (dependencies.length === 0) {
      return {
        issueId,
        itemType,
        baseEffort: Math.round(baseEffort * 10) / 10,
        adjustedEffort: Math.round(baseEffort * 10) / 10,
        bufferHours: 0,
        bufferPercentage: 0,
        dependencies: [],
        breakdown: {
          baseEffort: Math.round(baseEffort * 10) / 10,
          dependencyBuffer: 0,
          total: Math.round(baseEffort * 10) / 10
        }
      };
    }
    
    // Calculate dependency buffer (10% per incomplete dependency)
    const incompleteDeps = dependencies.filter(d => 
      d.prerequisite_status && !['Done', 'Closed', 'Completed'].includes(d.prerequisite_status)
    );
    
    const bufferPercentage = incompleteDeps.length * 10; // 10% per incomplete dependency
    const bufferHours = baseEffort * (bufferPercentage / 100);
    const adjustedEffort = baseEffort + bufferHours;
    
    console.log(`[Dependency Estimate] Buffer: ${incompleteDeps.length} incomplete deps = ${bufferPercentage}% (+${Math.round(bufferHours * 10) / 10}h)`);
    
    return {
      issueId,
      itemType,
      baseEffort: Math.round(baseEffort * 10) / 10,
      adjustedEffort: Math.round(adjustedEffort * 10) / 10,
      bufferHours: Math.round(bufferHours * 10) / 10,
      bufferPercentage,
      dependencies: dependencies.map(d => ({
        id: d.id,
        prerequisiteId: d.source_item_id,
        prerequisiteTitle: d.prerequisite_title,
        prerequisiteStatus: d.prerequisite_status,
        prerequisiteEffort: parseFloat(d.prerequisite_effort) || 0,
        type: d.dependency_type,
        isComplete: ['Done', 'Closed', 'Completed'].includes(d.prerequisite_status)
      })),
      breakdown: {
        baseEffort: Math.round(baseEffort * 10) / 10,
        dependencyBuffer: Math.round(bufferHours * 10) / 10,
        total: Math.round(adjustedEffort * 10) / 10
      }
    };
  } catch (error) {
    console.error(`[Dependency Estimate] Error calculating estimate with dependencies:`, error);
    throw new Error(`Failed to estimate with dependencies: ${error.message}`);
  }
}

/**
 * Get hierarchical breakdown with tree structure
 * @param {number} issueId - Root issue ID
 * @returns {Object} Tree structure and flat list with paths
 */
async function getHierarchicalBreakdown(issueId) {
  console.log(`[Hierarchical Breakdown] Building tree for issue ${issueId}`);
  
  try {
    // Use issue_hierarchy view to get full tree
    const hierarchyResult = await pool.query(
      `SELECT 
        id, title, parent_issue_id, hierarchy_level, depth, path, full_path,
        estimated_effort_hours, effort_hours, status, assignee, is_epic
       FROM issue_hierarchy
       WHERE id = $1 OR $1 = ANY(ancestor_ids) OR id IN (
         SELECT unnest(ancestor_ids) FROM issue_hierarchy WHERE id = $1
       )
       ORDER BY path`,
      [issueId]
    );
    
    const flatList = hierarchyResult.rows;
    console.log(`[Hierarchical Breakdown] Found ${flatList.length} issue(s) in hierarchy`);
    
    if (flatList.length === 0) {
      // Issue might be a leaf node with no hierarchy
      const issueResult = await pool.query(
        'SELECT id, title, estimated_effort_hours, effort_hours, status, assignee FROM issues WHERE id = $1',
        [issueId]
      );
      
      if (issueResult.rows.length === 0) {
        throw new Error(`Issue with ID ${issueId} not found`);
      }
      
      const issue = issueResult.rows[0];
      const effort = parseFloat(issue.estimated_effort_hours || issue.effort_hours || 0);
      
      return {
        issueId,
        tree: {
          id: issue.id,
          title: issue.title,
          effort: Math.round(effort * 10) / 10,
          status: issue.status,
          assignee: issue.assignee,
          children: []
        },
        flatList: [{
          id: issue.id,
          title: issue.title,
          path: issue.id.toString(),
          depth: 1,
          effort: Math.round(effort * 10) / 10,
          status: issue.status,
          assignee: issue.assignee
        }],
        totalEffort: Math.round(effort * 10) / 10
      };
    }
    
    // Build nested tree structure
    const buildTree = (parentId = null, items = flatList) => {
      const children = items.filter(item => item.parent_issue_id === parentId);
      
      return children.map(item => {
        const effort = parseFloat(item.estimated_effort_hours || item.effort_hours || 0);
        const node = {
          id: item.id,
          title: item.title,
          effort: Math.round(effort * 10) / 10,
          status: item.status,
          assignee: item.assignee,
          isEpic: item.is_epic,
          depth: item.depth,
          path: item.path,
          children: buildTree(item.id, items)
        };
        
        // Calculate total including descendants
        if (node.children.length > 0) {
          node.totalEffort = node.children.reduce((sum, child) => 
            sum + (child.totalEffort || child.effort), 0
          );
          node.totalEffort = Math.round(node.totalEffort * 10) / 10;
        }
        
        return node;
      });
    };
    
    // Find root of this hierarchy
    const root = flatList.find(item => item.id === issueId);
    const rootParent = root ? root.parent_issue_id : null;
    const tree = buildTree(rootParent, flatList);
    
    // Calculate total effort across all items
    const totalEffort = flatList.reduce((sum, item) => {
      const effort = parseFloat(item.estimated_effort_hours || item.effort_hours || 0);
      return sum + effort;
    }, 0);
    
    console.log(`[Hierarchical Breakdown] Built tree with ${flatList.length} nodes, total effort: ${Math.round(totalEffort * 10) / 10}h`);
    
    return {
      issueId,
      tree: tree.length === 1 ? tree[0] : { children: tree },
      flatList: flatList.map(item => ({
        id: item.id,
        title: item.title,
        path: item.path,
        fullPath: item.full_path,
        depth: item.depth,
        hierarchyLevel: item.hierarchy_level,
        effort: Math.round(parseFloat(item.estimated_effort_hours || item.effort_hours || 0) * 10) / 10,
        status: item.status,
        assignee: item.assignee,
        isEpic: item.is_epic,
        parentId: item.parent_issue_id
      })),
      totalEffort: Math.round(totalEffort * 10) / 10
    };
  } catch (error) {
    console.error(`[Hierarchical Breakdown] Error building tree for issue ${issueId}:`, error);
    throw new Error(`Failed to get hierarchical breakdown: ${error.message}`);
  }
}

module.exports = {
  generateEffortEstimate,
  generateEstimateFromItem,
  getEstimateBreakdown,
  getEstimateHistory,
  calculateCost,
  calculateRollupEffort,
  updateAllParentEfforts,
  estimateWithDependencies,
  getHierarchicalBreakdown
};
