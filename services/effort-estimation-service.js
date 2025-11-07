const { OpenAI } = require('openai');
const aiCostTracker = require('./ai-cost-tracker');

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

module.exports = {
  generateEffortEstimate,
  generateEstimateFromItem,
  getEstimateBreakdown,
  getEstimateHistory,
  calculateCost
};
