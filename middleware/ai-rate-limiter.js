/**
 * AI Rate Limiting Middleware (Phase 1)
 * Prevents excessive AI API usage and cost overruns
 * 
 * Rate limits:
 * - Per user per hour: 10 AI estimate generations
 * - Per project per day: 100 AI estimate generations
 * - Global per month: Tracked for billing visibility
 */

const { Pool } = require('@neondatabase/serverless');

// Rate limit configuration
const RATE_LIMITS = {
  PER_USER_PER_HOUR: 10,
  PER_PROJECT_PER_DAY: 100,
  WARNING_THRESHOLD: 0.8 // Warn at 80% of limit
};

/**
 * Check if user has exceeded rate limits
 * @param {Object} pool - Database connection pool
 * @param {number} userId - User ID
 * @param {number} projectId - Project ID (optional)
 * @param {string} feature - Feature name (e.g., 'effort_estimation')
 * @returns {Object} Rate limit status
 */
async function checkRateLimit(pool, userId, projectId, feature = 'effort_estimation') {
  try {
    // Check user hourly limit
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const userHourlyResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM ai_usage_tracking 
       WHERE user_id = $1 
         AND feature = $2 
         AND operation_type = 'generate_estimate'
         AND created_at >= $3`,
      [userId, feature, oneHourAgo]
    );

    const userHourlyCount = parseInt(userHourlyResult.rows[0]?.count || 0);
    const userHourlyRemaining = RATE_LIMITS.PER_USER_PER_HOUR - userHourlyCount;

    // Check project daily limit (if project specified)
    let projectDailyCount = 0;
    let projectDailyRemaining = RATE_LIMITS.PER_PROJECT_PER_DAY;

    if (projectId) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const projectDailyResult = await pool.query(
        `SELECT COUNT(*) as count 
         FROM ai_usage_tracking 
         WHERE project_id = $1 
           AND feature = $2 
           AND operation_type = 'generate_estimate'
           AND created_at >= $3`,
        [projectId, feature, oneDayAgo]
      );

      projectDailyCount = parseInt(projectDailyResult.rows[0]?.count || 0);
      projectDailyRemaining = RATE_LIMITS.PER_PROJECT_PER_DAY - projectDailyCount;
    }

    // Determine if limits are exceeded
    const userLimitExceeded = userHourlyRemaining <= 0;
    const projectLimitExceeded = projectDailyRemaining <= 0;
    const limitExceeded = userLimitExceeded || projectLimitExceeded;

    // Determine if warnings should be shown
    const userWarning = userHourlyRemaining <= (RATE_LIMITS.PER_USER_PER_HOUR * (1 - RATE_LIMITS.WARNING_THRESHOLD));
    const projectWarning = projectDailyRemaining <= (RATE_LIMITS.PER_PROJECT_PER_DAY * (1 - RATE_LIMITS.WARNING_THRESHOLD));

    // Calculate reset times
    const userResetTime = new Date(Math.ceil(Date.now() / (60 * 60 * 1000)) * (60 * 60 * 1000));
    const projectResetTime = new Date();
    projectResetTime.setHours(24, 0, 0, 0);

    return {
      allowed: !limitExceeded,
      limits: {
        user: {
          current: userHourlyCount,
          limit: RATE_LIMITS.PER_USER_PER_HOUR,
          remaining: Math.max(0, userHourlyRemaining),
          exceeded: userLimitExceeded,
          warning: userWarning,
          resetAt: userResetTime
        },
        project: projectId ? {
          current: projectDailyCount,
          limit: RATE_LIMITS.PER_PROJECT_PER_DAY,
          remaining: Math.max(0, projectDailyRemaining),
          exceeded: projectLimitExceeded,
          warning: projectWarning,
          resetAt: projectResetTime
        } : null
      },
      message: limitExceeded 
        ? (userLimitExceeded 
            ? `You have reached your hourly limit of ${RATE_LIMITS.PER_USER_PER_HOUR} AI estimates. Resets at ${userResetTime.toLocaleTimeString()}.`
            : `This project has reached its daily limit of ${RATE_LIMITS.PER_PROJECT_PER_DAY} AI estimates. Resets at midnight.`)
        : null
    };
  } catch (error) {
    console.error('Error checking rate limit:', error);
    // Fail open - allow request if rate limit check fails
    return {
      allowed: true,
      error: 'Rate limit check failed',
      limits: null
    };
  }
}

/**
 * Express middleware for rate limiting AI estimation requests
 */
function rateLimitMiddleware(pool) {
  return async (req, res, next) => {
    const userId = req.user?.id;
    const projectId = req.body?.projectId || req.params?.projectId || req.query?.projectId;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      const rateLimitStatus = await checkRateLimit(pool, userId, projectId);

      // Add rate limit info to response headers
      res.set({
        'X-RateLimit-Limit-User': RATE_LIMITS.PER_USER_PER_HOUR,
        'X-RateLimit-Remaining-User': rateLimitStatus.limits?.user?.remaining || 0,
        'X-RateLimit-Reset-User': rateLimitStatus.limits?.user?.resetAt?.toISOString()
      });

      if (projectId && rateLimitStatus.limits?.project) {
        res.set({
          'X-RateLimit-Limit-Project': RATE_LIMITS.PER_PROJECT_PER_DAY,
          'X-RateLimit-Remaining-Project': rateLimitStatus.limits.project.remaining,
          'X-RateLimit-Reset-Project': rateLimitStatus.limits.project.resetAt.toISOString()
        });
      }

      // Attach rate limit info to request for use in handlers
      req.rateLimitStatus = rateLimitStatus;

      if (!rateLimitStatus.allowed) {
        return res.status(429).json({
          error: 'rate_limit_exceeded',
          message: rateLimitStatus.message,
          limits: rateLimitStatus.limits,
          retryAfter: rateLimitStatus.limits.user.exceeded 
            ? Math.ceil((rateLimitStatus.limits.user.resetAt - Date.now()) / 1000)
            : Math.ceil((rateLimitStatus.limits.project.resetAt - Date.now()) / 1000)
        });
      }

      next();
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      // Fail open - allow request
      next();
    }
  };
}

/**
 * Get usage statistics for a user or project
 * @param {Object} pool - Database pool
 * @param {Object} filters - Query filters
 * @returns {Object} Usage statistics
 */
async function getUsageStats(pool, filters = {}) {
  const { userId, projectId, feature = 'effort_estimation', timeRange = 'month' } = filters;

  try {
    // Determine time range
    let startDate;
    switch (timeRange) {
      case 'day':
        startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
    }

    // Build query
    let query = `
      SELECT 
        COUNT(*) as total_requests,
        SUM(tokens_used) as total_tokens,
        SUM(cost_usd) as total_cost,
        AVG(cost_usd) as avg_cost_per_request,
        DATE_TRUNC('day', created_at) as date
      FROM ai_usage_tracking 
      WHERE feature = $1 
        AND created_at >= $2
    `;

    const params = [feature, startDate];
    let paramIndex = 3;

    if (userId) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (projectId) {
      query += ` AND project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    query += ` GROUP BY DATE_TRUNC('day', created_at) ORDER BY date DESC`;

    const result = await pool.query(query, params);

    // Calculate totals
    const totals = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0
    };

    result.rows.forEach(row => {
      totals.totalRequests += parseInt(row.total_requests);
      totals.totalTokens += parseInt(row.total_tokens || 0);
      totals.totalCost += parseFloat(row.total_cost || 0);
    });

    return {
      timeRange,
      totals,
      avgCostPerRequest: totals.totalRequests > 0 
        ? (totals.totalCost / totals.totalRequests).toFixed(4)
        : 0,
      dailyBreakdown: result.rows.map(row => ({
        date: row.date,
        requests: parseInt(row.total_requests),
        tokens: parseInt(row.total_tokens || 0),
        cost: parseFloat(row.total_cost || 0).toFixed(4)
      }))
    };
  } catch (error) {
    console.error('Error getting usage stats:', error);
    throw error;
  }
}

module.exports = {
  checkRateLimit,
  rateLimitMiddleware,
  getUsageStats,
  RATE_LIMITS
};
