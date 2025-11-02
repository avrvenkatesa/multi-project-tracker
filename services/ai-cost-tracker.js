const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Pricing per 1M tokens (as of November 2024)
 * Update these if OpenAI changes pricing
 * Source: https://openai.com/api/pricing/
 */
const MODEL_PRICING = {
  'gpt-4o': {
    prompt: 2.50,      // $2.50 per 1M input tokens
    completion: 10.00  // $10.00 per 1M output tokens
  },
  'gpt-4o-mini': {
    prompt: 0.150,     // $0.15 per 1M input tokens
    completion: 0.600  // $0.60 per 1M output tokens
  },
  'gpt-3.5-turbo': {
    prompt: 0.50,      // $0.50 per 1M input tokens
    completion: 1.50   // $1.50 per 1M output tokens
  },
  'gpt-4-turbo': {
    prompt: 10.00,
    completion: 30.00
  }
};

/**
 * Calculate cost based on token usage
 * @param {string} model - Model name (e.g., 'gpt-4o')
 * @param {number} promptTokens - Input tokens
 * @param {number} completionTokens - Output tokens
 * @returns {number} Cost in USD
 */
function calculateCost(model, promptTokens, completionTokens) {
  const pricing = MODEL_PRICING[model];
  
  if (!pricing) {
    console.warn(`⚠️  Unknown model pricing: ${model}, using gpt-4o pricing`);
    return calculateCost('gpt-4o', promptTokens, completionTokens);
  }
  
  const promptCost = (promptTokens / 1_000_000) * pricing.prompt;
  const completionCost = (completionTokens / 1_000_000) * pricing.completion;
  
  return promptCost + completionCost;
}

/**
 * Track AI API usage in database
 * @param {Object} params - Usage parameters
 * @param {number} params.userId - User ID
 * @param {number} params.projectId - Project ID
 * @param {string} params.feature - Feature name (classification, checklist, etc.)
 * @param {string} params.model - Model name
 * @param {number} params.promptTokens - Input tokens
 * @param {number} params.completionTokens - Output tokens
 * @param {Object} params.metadata - Additional context (optional)
 * @returns {Promise<Object>} Tracking record with cost
 */
async function trackAIUsage({
  userId,
  projectId,
  feature,
  model,
  promptTokens,
  completionTokens,
  metadata = {}
}) {
  try {
    const totalTokens = promptTokens + completionTokens;
    const costUsd = calculateCost(model, promptTokens, completionTokens);
    
    console.log(`\n💰 AI Cost Tracking:`);
    console.log(`   Feature: ${feature}`);
    console.log(`   Model: ${model}`);
    console.log(`   Tokens: ${totalTokens.toLocaleString()} (${promptTokens.toLocaleString()} in + ${completionTokens.toLocaleString()} out)`);
    console.log(`   Cost: $${costUsd.toFixed(6)}`);
    
    const result = await pool.query(
      `INSERT INTO ai_usage_tracking 
       (user_id, project_id, feature, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, projectId, feature, model, promptTokens, completionTokens, totalTokens, costUsd, JSON.stringify(metadata)]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('❌ Error tracking AI usage:', error);
    // Don't throw - cost tracking failure shouldn't break features
    return null;
  }
}

/**
 * Get AI cost breakdown for a project
 * @param {number} projectId - Project ID
 * @returns {Promise<Object>} Cost breakdown
 */
async function getProjectCostBreakdown(projectId) {
  try {
    // Total cost for project
    const totalResult = await pool.query(
      `SELECT 
         COUNT(*) as total_operations,
         SUM(COALESCE(total_tokens, tokens_used, 0)) as total_tokens,
         SUM(cost_usd) as total_cost_usd
       FROM ai_usage_tracking
       WHERE project_id = $1`,
      [projectId]
    );
    
    // Cost by feature
    const byFeatureResult = await pool.query(
      `SELECT 
         feature,
         COALESCE(model, 'unknown') as model,
         COUNT(*) as operation_count,
         SUM(COALESCE(total_tokens, tokens_used, 0)) as total_tokens,
         SUM(cost_usd) as total_cost_usd,
         AVG(cost_usd) as avg_cost_usd
       FROM ai_usage_tracking
       WHERE project_id = $1
       GROUP BY feature, model
       ORDER BY total_cost_usd DESC`,
      [projectId]
    );
    
    // Recent operations
    const recentResult = await pool.query(
      `SELECT 
         id,
         feature,
         COALESCE(model, 'unknown') as model,
         COALESCE(total_tokens, tokens_used, 0) as total_tokens,
         cost_usd,
         metadata,
         created_at
       FROM ai_usage_tracking
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [projectId]
    );
    
    return {
      summary: totalResult.rows[0],
      byFeature: byFeatureResult.rows,
      recentOperations: recentResult.rows
    };
  } catch (error) {
    console.error('❌ Error getting cost breakdown:', error);
    throw error;
  }
}

/**
 * Get AI cost breakdown for a user across all projects
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Cost breakdown
 */
async function getUserCostBreakdown(userId) {
  try {
    const result = await pool.query(
      `SELECT 
         project_id,
         feature,
         COUNT(*) as operation_count,
         SUM(COALESCE(total_tokens, tokens_used, 0)) as total_tokens,
         SUM(cost_usd) as total_cost_usd
       FROM ai_usage_tracking
       WHERE user_id = $1
       GROUP BY project_id, feature
       ORDER BY total_cost_usd DESC`,
      [userId]
    );
    
    return result.rows;
  } catch (error) {
    console.error('❌ Error getting user cost breakdown:', error);
    throw error;
  }
}

module.exports = {
  trackAIUsage,
  calculateCost,
  getProjectCostBreakdown,
  getUserCostBreakdown,
  MODEL_PRICING
};
