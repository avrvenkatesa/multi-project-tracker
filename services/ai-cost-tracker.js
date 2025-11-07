/**
 * AI Cost Tracking Service
 * 
 * Centralized service for tracking AI API usage, token consumption, and costs
 * across all AI-powered features in the Multi-Project Tracker.
 * 
 * Features tracked:
 * - Effort estimation
 * - Dependency suggestions
 * - Timeline extraction
 * - Meeting analysis
 * - Checklist generation
 * - Document classification
 * - Workstream detection
 */

const { pool } = require('../db');

/**
 * Track AI usage with comprehensive metrics
 * 
 * @param {Object} data - Usage tracking data
 * @param {number} data.userId - ID of user who triggered the AI operation
 * @param {number} data.projectId - ID of related project
 * @param {string} data.feature - Feature name (e.g., 'effort_estimation', 'timeline_extraction')
 * @param {string} [data.operationType='generate'] - Type of operation (e.g., 'generate', 'analyze', 'extract')
 * @param {number} [data.promptTokens=0] - Tokens used in prompt
 * @param {number} [data.completionTokens=0] - Tokens used in completion
 * @param {number} [data.totalTokens=0] - Total tokens (prompt + completion)
 * @param {number} [data.tokensUsed] - Legacy: total tokens (backward compatible)
 * @param {number} data.costUsd - Cost in USD
 * @param {string} [data.model='gpt-4o'] - AI model used
 * @param {Object} [data.metadata={}] - Additional metadata (stored as JSONB)
 * @returns {Promise<void>}
 */
async function trackAIUsage(data) {
  const {
    userId,
    projectId,
    feature,
    operationType = 'generate',
    promptTokens = 0,
    completionTokens = 0,
    totalTokens = 0,
    tokensUsed, // backward compatible
    costUsd,
    model = 'gpt-4o',
    metadata = {}
  } = data;

  // Calculate total tokens: use totalTokens if provided, otherwise sum components, fallback to tokensUsed
  const tokens = totalTokens || (promptTokens + completionTokens) || tokensUsed || 0;

  try {
    await pool.query(
      `INSERT INTO ai_usage_tracking
       (user_id, project_id, feature, operation_type, prompt_tokens, completion_tokens, 
        total_tokens, tokens_used, cost_usd, model, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        userId,
        projectId,
        feature,
        operationType,
        promptTokens,
        completionTokens,
        tokens,
        tokens, // Also populate legacy tokens_used field
        costUsd,
        model,
        JSON.stringify(metadata)
      ]
    );

    console.log(`💰 AI Cost tracked: ${feature} - $${costUsd.toFixed(6)} (${tokens} tokens, model: ${model})`);
  } catch (error) {
    console.error('Error tracking AI usage:', error);
    // Don't throw - tracking failure shouldn't break the main flow
  }
}

/**
 * Get AI usage statistics for a project
 * 
 * @param {number} projectId - Project ID
 * @param {Object} [options] - Query options
 * @param {Date} [options.startDate] - Start date for filtering
 * @param {Date} [options.endDate] - End date for filtering
 * @param {string} [options.feature] - Filter by specific feature
 * @returns {Promise<Object>} Usage statistics
 */
async function getProjectAIUsage(projectId, options = {}) {
  const { startDate, endDate, feature } = options;
  
  let query = `
    SELECT 
      feature,
      operation_type,
      COUNT(*) as operation_count,
      SUM(total_tokens) as total_tokens,
      SUM(cost_usd) as total_cost,
      AVG(cost_usd) as avg_cost,
      MAX(created_at) as last_used
    FROM ai_usage_tracking
    WHERE project_id = $1
  `;
  
  const params = [projectId];
  let paramIndex = 2;
  
  if (startDate) {
    query += ` AND created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }
  
  if (endDate) {
    query += ` AND created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }
  
  if (feature) {
    query += ` AND feature = $${paramIndex}`;
    params.push(feature);
    paramIndex++;
  }
  
  query += ` GROUP BY feature, operation_type ORDER BY total_cost DESC`;
  
  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error fetching AI usage stats:', error);
    throw error;
  }
}

/**
 * Get AI usage statistics for a user
 * 
 * @param {number} userId - User ID
 * @param {Object} [options] - Query options
 * @returns {Promise<Object>} Usage statistics
 */
async function getUserAIUsage(userId, options = {}) {
  const { startDate, endDate, feature } = options;
  
  let query = `
    SELECT 
      feature,
      COUNT(*) as operation_count,
      SUM(total_tokens) as total_tokens,
      SUM(cost_usd) as total_cost
    FROM ai_usage_tracking
    WHERE user_id = $1
  `;
  
  const params = [userId];
  let paramIndex = 2;
  
  if (startDate) {
    query += ` AND created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }
  
  if (endDate) {
    query += ` AND created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }
  
  if (feature) {
    query += ` AND feature = $${paramIndex}`;
    params.push(feature);
  }
  
  query += ` GROUP BY feature ORDER BY total_cost DESC`;
  
  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error fetching user AI usage stats:', error);
    throw error;
  }
}

module.exports = {
  trackAIUsage,
  getProjectAIUsage,
  getUserAIUsage
};
