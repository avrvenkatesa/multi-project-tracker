const { neon, Pool } = require('@neondatabase/serverless');

// Database connection
const sql = neon(process.env.DATABASE_URL);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Time Tracking Service
 * Handles time logging, completion percentage calculation, and status change validation
 */

/**
 * Status transitions that require time logging
 */
const TIME_REQUIRED_TRANSITIONS = {
  // Starting work
  'To Do_In Progress': { requiresHours: true, allowExceeding: false, setCompletion: 'calculate' },
  'Open_In Progress': { requiresHours: true, allowExceeding: false, setCompletion: 'calculate' },
  'todo_in progress': { requiresHours: true, allowExceeding: false, setCompletion: 'calculate' },
  
  // Completing work
  'To Do_Done': { requiresHours: true, allowExceeding: true, setCompletion: 100 },
  'In Progress_Done': { requiresHours: true, allowExceeding: true, setCompletion: 100 },
  'Open_Done': { requiresHours: true, allowExceeding: true, setCompletion: 100 },
  'todo_done': { requiresHours: true, allowExceeding: true, setCompletion: 100 },
  'in progress_done': { requiresHours: true, allowExceeding: true, setCompletion: 100 },
  
  // Reopening work (keep existing hours)
  'In Progress_To Do': { requiresHours: false, allowExceeding: true, setCompletion: 'calculate' },
  'Done_To Do': { requiresHours: false, allowExceeding: true, setCompletion: 'calculate' },
  'Done_In Progress': { requiresHours: false, allowExceeding: true, setCompletion: 'calculate' },
  'in progress_todo': { requiresHours: false, allowExceeding: true, setCompletion: 'calculate' },
  'done_todo': { requiresHours: false, allowExceeding: true, setCompletion: 'calculate' },
  'done_in progress': { requiresHours: false, allowExceeding: true, setCompletion: 'calculate' }
};

/**
 * Get item data (issues or action items)
 */
async function getItem(itemType, itemId) {
  const table = itemType === 'issue' ? 'issues' : 'action_items';
  const result = await pool.query(
    `SELECT * FROM ${table} WHERE id = $1`,
    [itemId]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`${itemType} with id ${itemId} not found`);
  }
  
  return result.rows[0];
}

/**
 * Calculate completion percentage from hours
 */
function calculateCompletionPercent(actualHours, planningEstimate) {
  if (!planningEstimate || planningEstimate <= 0) {
    return null; // Can't calculate without estimate
  }
  
  return Math.min(100, Math.round((actualHours / planningEstimate) * 100));
}

/**
 * Calculate hours from completion percentage
 */
function calculateHoursFromPercent(completionPercent, planningEstimate) {
  if (!planningEstimate || planningEstimate <= 0) {
    return null;
  }
  
  return (completionPercent / 100) * planningEstimate;
}

/**
 * Validate status change and calculate time tracking updates
 */
async function validateStatusChange(itemType, itemId, fromStatus, toStatus, hoursAdded, completionPercent) {
  // CRITICAL: Coerce inputs to numbers to prevent string concatenation
  const hoursAddedNum = hoursAdded ? parseFloat(hoursAdded) : 0;
  const completionPercentNum = completionPercent !== undefined && completionPercent !== null 
    ? parseFloat(completionPercent) 
    : null;
  
  // Validate numeric conversion
  if (hoursAdded && isNaN(hoursAddedNum)) {
    return {
      valid: false,
      error: 'Invalid hours',
      message: 'Hours must be a valid number'
    };
  }
  
  if (completionPercentNum !== null && isNaN(completionPercentNum)) {
    return {
      valid: false,
      error: 'Invalid completion percentage',
      message: 'Completion percentage must be a valid number'
    };
  }
  
  // Normalize status values for comparison (case insensitive)
  const transitionKey = `${fromStatus}_${toStatus}`;
  const normalizedKey = transitionKey.toLowerCase();
  
  // Check all possible key formats
  const rule = TIME_REQUIRED_TRANSITIONS[transitionKey] || 
               TIME_REQUIRED_TRANSITIONS[normalizedKey];
  
  // If no rule exists, no special time tracking required
  if (!rule) {
    return { 
      valid: true, 
      requiresHours: false,
      skipTimeTracking: true 
    };
  }
  
  // Validate hours requirement
  if (rule.requiresHours && hoursAddedNum === 0) {
    return {
      valid: false,
      requiresHours: true,
      error: 'Hours required',
      message: `Please enter actual hours spent when changing status to "${toStatus}"`
    };
  }
  
  // Get current item data
  const item = await getItem(itemType, itemId);
  const planningEstimate = parseFloat(item.estimated_effort_hours) || 0;
  const currentActualHours = parseFloat(item.actual_effort_hours) || 0;
  
  // Calculate new totals - using properly coerced numbers
  const newActualHours = currentActualHours + hoursAddedNum;
  
  // Calculate completion percentage
  let newCompletionPercent;
  
  if (rule.setCompletion === 100) {
    // Marking as done - always 100%
    newCompletionPercent = 100;
  } else if (rule.setCompletion === 'calculate') {
    if (completionPercentNum !== null) {
      // User provided percentage directly
      newCompletionPercent = Math.max(0, Math.min(100, completionPercentNum));
    } else if (planningEstimate > 0 && hoursAddedNum > 0) {
      // Calculate from hours
      newCompletionPercent = calculateCompletionPercent(newActualHours, planningEstimate);
    } else {
      // Keep existing or set to 0
      newCompletionPercent = item.completion_percentage || 0;
    }
  }
  
  // Check if exceeding estimate
  const isExceeding = planningEstimate > 0 && newActualHours > planningEstimate;
  const variance = newActualHours - planningEstimate;
  const variancePercent = planningEstimate > 0 ? Math.round((variance / planningEstimate) * 100) : 0;
  
  return {
    valid: true,
    requiresHours: rule.requiresHours,
    newActualHours,
    newCompletionPercent,
    isExceeding,
    variance,
    variancePercent,
    warning: isExceeding && !rule.allowExceeding 
      ? `This will exceed the planning estimate by ${variance.toFixed(1)} hours (${variancePercent}% over)`
      : null
  };
}

/**
 * Quick log time without status change
 * This is the key enhancement for incremental time tracking
 */
async function quickLogTime(itemType, itemId, hoursAdded, userId, notes = null, completionPercent = null, workDate = null) {
  // CRITICAL: Coerce inputs to numbers to prevent string concatenation
  const hoursAddedNum = parseFloat(hoursAdded);
  const completionPercentNum = completionPercent !== undefined && completionPercent !== null 
    ? parseFloat(completionPercent) 
    : null;
  
  // Validate numeric conversion
  if (isNaN(hoursAddedNum) || hoursAddedNum <= 0) {
    throw new Error('Hours added must be a valid number greater than 0');
  }
  
  if (completionPercentNum !== null && (isNaN(completionPercentNum) || completionPercentNum < 0 || completionPercentNum > 100)) {
    throw new Error('Completion percentage must be a valid number between 0 and 100');
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get current item
    const item = await getItem(itemType, itemId);
    const planningEstimate = parseFloat(item.estimated_effort_hours) || 0;
    const currentActualHours = parseFloat(item.actual_effort_hours) || 0;
    const currentTimeLogCount = item.time_log_count || 0;
    const projectId = item.project_id;
    const currentStatus = item.status;
    const itemCreatedAt = item.created_at;
    
    // Validate and set work_date
    let validatedWorkDate = workDate;
    if (workDate) {
      const workDateObj = new Date(workDate);
      const itemCreatedDate = new Date(itemCreatedAt);
      const today = new Date();
      
      // Reset time components for date-only comparison
      workDateObj.setHours(0, 0, 0, 0);
      itemCreatedDate.setHours(0, 0, 0, 0);
      today.setHours(23, 59, 59, 999);
      
      if (workDateObj < itemCreatedDate) {
        throw new Error(`Work date cannot be before item creation date (${itemCreatedDate.toISOString().split('T')[0]})`);
      }
      
      if (workDateObj > today) {
        throw new Error('Work date cannot be in the future');
      }
      
      validatedWorkDate = workDate;
    } else {
      // Default to today if not provided
      validatedWorkDate = new Date().toISOString().split('T')[0];
    }
    
    // Auto-move to "In Progress" on first time log if currently in "To Do"
    const isFirstTimeLog = currentTimeLogCount === 0;
    let newStatus = currentStatus;
    if (isFirstTimeLog && currentStatus.toLowerCase() === 'to do') {
      newStatus = 'In Progress';
    }
    
    // Calculate new values - using properly coerced numbers
    const newActualHours = currentActualHours + hoursAddedNum;
    
    let newCompletionPercent;
    if (completionPercentNum !== null) {
      // User manually set completion percentage
      newCompletionPercent = Math.max(0, Math.min(100, completionPercentNum));
    } else if (planningEstimate > 0) {
      // Calculate from hours
      newCompletionPercent = calculateCompletionPercent(newActualHours, planningEstimate);
    } else {
      // Keep existing percentage
      newCompletionPercent = item.completion_percentage || 0;
    }
    
    // Update item (including status change if needed)
    const table = itemType === 'issue' ? 'issues' : 'action_items';
    await client.query(
      `UPDATE ${table} 
       SET actual_effort_hours = $1,
           completion_percentage = $2,
           last_time_logged_at = NOW(),
           time_log_count = $3,
           status = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [newActualHours, newCompletionPercent, currentTimeLogCount + 1, newStatus, itemId]
    );
    
    // Insert into time_entries table (for timesheet display)
    await client.query(
      `INSERT INTO time_entries 
       (item_type, item_id, project_id, hours_logged, logged_by, notes, logged_at, created_at, work_date)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)`,
      [
        itemType,
        itemId,
        projectId,
        hoursAddedNum,
        userId,
        notes,
        validatedWorkDate
      ]
    );
    
    // Log to history (for audit trail)
    await client.query(
      `INSERT INTO time_tracking_history 
       (item_type, item_id, hours_added, total_hours_after, completion_percentage_after, 
        is_quick_log, notes, logged_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        itemType,
        itemId,
        hoursAddedNum,
        newActualHours,
        newCompletionPercent,
        true, // is_quick_log
        notes,
        userId
      ]
    );
    
    await client.query('COMMIT');
    
    // Calculate metrics
    const isExceeding = planningEstimate > 0 && newActualHours > planningEstimate;
    const variance = newActualHours - planningEstimate;
    const variancePercent = planningEstimate > 0 ? Math.round((variance / planningEstimate) * 100) : 0;
    
    return {
      success: true,
      actualHours: newActualHours,
      completionPercent: newCompletionPercent,
      timeLogCount: currentTimeLogCount + 1,
      isExceeding,
      variance,
      variancePercent,
      warning: isExceeding ? `Task has exceeded estimate by ${variance.toFixed(1)} hours (${variancePercent}% over)` : null,
      statusChanged: newStatus !== currentStatus,
      newStatus: newStatus,
      oldStatus: currentStatus
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in quickLogTime:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Log time during status change
 */
async function logTimeWithStatusChange(itemType, itemId, fromStatus, toStatus, hoursAdded, completionPercent, userId, notes = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Validate the change
    const validation = await validateStatusChange(itemType, itemId, fromStatus, toStatus, hoursAdded, completionPercent);
    
    if (!validation.valid) {
      await client.query('ROLLBACK');
      return validation; // Return validation error
    }
    
    // If no time tracking needed for this transition
    if (validation.skipTimeTracking) {
      await client.query('ROLLBACK');
      return { ...validation, skipTimeTracking: true };
    }
    
    const item = await getItem(itemType, itemId);
    const currentTimeLogCount = item.time_log_count || 0;
    
    // Update item
    const table = itemType === 'issue' ? 'issues' : 'action_items';
    await client.query(
      `UPDATE ${table} 
       SET actual_effort_hours = $1,
           completion_percentage = $2,
           last_time_logged_at = NOW(),
           time_log_count = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [validation.newActualHours, validation.newCompletionPercent, currentTimeLogCount + 1, itemId]
    );
    
    // CRITICAL: Also log to time_entries table for timesheet display
    // This ensures status change time logs appear in the timesheet modal
    if (hoursAdded && hoursAdded > 0) {
      await client.query(
        `INSERT INTO time_entries 
         (item_type, item_id, project_id, hours_logged, logged_by, notes, logged_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [
          itemType,
          itemId,
          item.project_id,
          hoursAdded,
          userId,
          notes ? `Status change: ${fromStatus} → ${toStatus}. ${notes}` : `Status change: ${fromStatus} → ${toStatus}`
        ]
      );
    }
    
    // Log to history (legacy table)
    await client.query(
      `INSERT INTO time_tracking_history 
       (item_type, item_id, hours_added, total_hours_after, completion_percentage_after,
        status_from, status_to, is_quick_log, notes, logged_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        itemType,
        itemId,
        hoursAdded || 0,
        validation.newActualHours,
        validation.newCompletionPercent,
        fromStatus,
        toStatus,
        false, // is_quick_log
        notes,
        userId
      ]
    );
    
    await client.query('COMMIT');
    
    return {
      ...validation,
      success: true,
      timeLogCount: currentTimeLogCount + 1
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in logTimeWithStatusChange:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get time tracking history for an item
 */
async function getTimeTrackingHistory(itemType, itemId, limit = 50) {
  const result = await pool.query(
    `SELECT h.*, u.username as logged_by_name
     FROM time_tracking_history h
     LEFT JOIN users u ON h.logged_by = u.id
     WHERE h.item_type = $1 AND h.item_id = $2
     ORDER BY h.logged_at DESC
     LIMIT $3`,
    [itemType, itemId, limit]
  );
  
  return result.rows;
}

/**
 * Get time tracking summary for an item
 */
async function getTimeTrackingSummary(itemType, itemId) {
  const item = await getItem(itemType, itemId);
  const history = await getTimeTrackingHistory(itemType, itemId, 100);
  
  const quickLogs = history.filter(h => h.is_quick_log);
  const statusChangeLogs = history.filter(h => !h.is_quick_log);
  
  const planningEstimate = item.estimated_effort_hours || 0;
  const actualHours = item.actual_effort_hours || 0;
  const completionPercent = item.completion_percentage || 0;
  const variance = actualHours - planningEstimate;
  const variancePercent = planningEstimate > 0 ? Math.round((variance / planningEstimate) * 100) : 0;
  
  return {
    planningEstimate,
    actualHours,
    completionPercent,
    variance,
    variancePercent,
    isExceeding: variance > 0,
    timeLogCount: item.time_log_count || 0,
    lastLoggedAt: item.last_time_logged_at,
    quickLogCount: quickLogs.length,
    statusChangeLogCount: statusChangeLogs.length,
    history: history
  };
}

module.exports = {
  validateStatusChange,
  quickLogTime,
  logTimeWithStatusChange,
  getTimeTrackingHistory,
  getTimeTrackingSummary,
  calculateCompletionPercent,
  calculateHoursFromPercent
};
