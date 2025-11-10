const { sortItemsByDependencies } = require('./topological-sort-service');

/**
 * Schedule Calculation Service
 * Calculates start/end dates for tasks based on dependencies and constraints
 */

/**
 * Add business days to a date
 * @param {Date} date - Starting date
 * @param {number} days - Number of business days to add
 * @param {boolean} includeWeekends - Whether to count weekends
 * @returns {Date} - Resulting date
 */
function addBusinessDays(date, days, includeWeekends = false) {
  const result = new Date(date);
  let daysToAdd = Math.ceil(days);
  
  // Handle 0 or negative days
  if (daysToAdd <= 0) {
    return result;
  }
  
  if (includeWeekends) {
    // For 1 day duration, task ends on same day (start = end)
    // For 2+ days, add (days - 1) to get end date
    result.setDate(result.getDate() + (daysToAdd - 1));
    return result;
  }
  
  // Add business days (skip weekends)
  // First day counts, so subtract 1 from days to add
  let remainingDays = daysToAdd - 1;
  
  while (remainingDays > 0) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    // Skip Saturday (6) and Sunday (0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remainingDays--;
    }
  }
  
  return result;
}

/**
 * Skip to next business day if current day is weekend
 * @param {Date} date - Date to check
 * @returns {Date} - Next business day
 */
function skipWeekend(date) {
  const result = new Date(date);
  const dayOfWeek = result.getDay();
  
  // If Saturday, move to Monday
  if (dayOfWeek === 6) {
    result.setDate(result.getDate() + 2);
  }
  // If Sunday, move to Monday
  else if (dayOfWeek === 0) {
    result.setDate(result.getDate() + 1);
  }
  
  return result;
}

/**
 * Calculate duration in working days
 * @param {number} hours - Total hours
 * @param {number} hoursPerDay - Hours per working day
 * @returns {number} - Number of working days
 */
function calculateDurationDays(hours, hoursPerDay = 8) {
  if (!hours || hours === 0) return 0;
  return Math.ceil(hours / hoursPerDay);
}

/**
 * Count business days between two dates
 * @param {Date} startDate - Start date (inclusive)
 * @param {Date} endDate - End date (inclusive)
 * @param {boolean} includeWeekends - Whether to count weekends
 * @returns {number} - Number of working days
 */
function countBusinessDays(startDate, endDate, includeWeekends = false) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Handle invalid or negative ranges
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return 0;
  }
  
  if (includeWeekends) {
    // Count all days (inclusive)
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, days);
  }
  
  // Count business days (skip weekends)
  let count = 0;
  const current = new Date(start);
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    // Count Monday-Friday (1-5)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return Math.max(1, count);
}

/**
 * Detect risks for a task
 * @param {Object} task - Task object with schedule data
 * @param {Date} projectEndDate - Expected project end date
 * @returns {Object} - {hasRisk: boolean, riskReason: string}
 */
function detectTaskRisks(task, projectEndDate = null) {
  const risks = [];
  
  // Risk 1: No estimate
  if (!task.estimatedHours || task.estimatedHours === 0) {
    risks.push('No effort estimate');
  }
  
  // Risk 2: No assignee
  if (!task.assignee || task.assignee === 'Unassigned') {
    risks.push('No assignee');
  }
  
  // Risk 3: Due date before scheduled end
  if (task.dueDate && task.scheduledEnd) {
    const due = new Date(task.dueDate);
    const scheduled = new Date(task.scheduledEnd);
    if (scheduled > due) {
      const daysLate = Math.ceil((scheduled - due) / (1000 * 60 * 60 * 24));
      risks.push(`Will finish ${daysLate} day(s) after due date`);
    }
  }
  
  // Risk 4: High complexity (>40 hours)
  if (task.estimatedHours > 40) {
    risks.push('High complexity task (>40 hours)');
  }
  
  // Risk 5: Many dependencies
  if (task.dependencies && task.dependencies.length >= 3) {
    risks.push(`Depends on ${task.dependencies.length} other tasks`);
  }
  
  return {
    hasRisk: risks.length > 0,
    riskReason: risks.join('; ')
  };
}

/**
 * Calculate resource allocation timeline
 * @param {Array} scheduledTasks - Tasks with calculated dates
 * @returns {Object} - Resource allocation by person and week
 */
function calculateResourceAllocation(scheduledTasks) {
  const allocation = {};
  
  scheduledTasks.forEach(task => {
    if (!task.assignee || task.assignee === 'Unassigned') return;
    
    if (!allocation[task.assignee]) {
      allocation[task.assignee] = {};
    }
    
    // Get the week starting Monday for this task
    const taskStart = new Date(task.scheduledStart);
    const weekStart = new Date(taskStart);
    weekStart.setDate(taskStart.getDate() - taskStart.getDay() + 1);
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!allocation[task.assignee][weekKey]) {
      allocation[task.assignee][weekKey] = {
        tasks: [],
        totalHours: 0
      };
    }
    
    allocation[task.assignee][weekKey].tasks.push({
      type: task.itemType,
      id: task.itemId,
      title: task.title,
      hours: task.estimatedHours || 0
    });
    allocation[task.assignee][weekKey].totalHours += task.estimatedHours || 0;
  });
  
  return allocation;
}

/**
 * Main function: Calculate complete project schedule
 * @param {Object} config - Schedule configuration
 * @param {Array} config.items - Items to schedule with estimates
 * @param {Date|string} config.startDate - Project start date
 * @param {number} config.hoursPerDay - Working hours per day (default 8)
 * @param {boolean} config.includeWeekends - Whether to include weekends (default false)
 * @param {Date|string} config.projectDeadline - Optional project deadline for overrun detection
 * @returns {Object} - Complete schedule with calculated dates
 */
async function calculateProjectSchedule(config) {
  const {
    items,
    startDate,
    hoursPerDay = 8,
    includeWeekends = false,
    projectDeadline = null
  } = config;

  if (!items || items.length === 0) {
    throw new Error('No items provided for scheduling');
  }

  if (!startDate) {
    throw new Error('Start date is required');
  }

  // Convert start date to Date object
  const projectStart = new Date(startDate);
  if (isNaN(projectStart.getTime())) {
    throw new Error('Invalid start date');
  }

  // Sort items by dependencies
  const { sorted, hasCycle, unreachable, cycleInfo, criticalPath, criticalPathHours } = 
    await sortItemsByDependencies(items);

  if (hasCycle) {
    // Build a lookup map from task keys to titles
    const titleMap = new Map();
    items.forEach(item => {
      const key = `${item.type}:${item.id}`;
      titleMap.set(key, item.title || 'Untitled');
    });
    
    // Build detailed error message with actionable information
    let errorMessage = 'Circular dependency detected:\n\n';
    
    if (cycleInfo && cycleInfo.cycle) {
      // Show the cycle path with titles
      errorMessage += 'Dependency cycle:\n';
      const cyclePath = cycleInfo.cycle.map(key => {
        const [type, id] = key.split(':');
        const title = titleMap.get(key) || 'Unknown';
        return `${type}#${id}: ${title}`;
      }).join('\n → ');
      errorMessage += cyclePath + '\n\n';
      
      // List the specific dependencies that form the cycle
      errorMessage += 'To fix this, remove one of these dependencies:\n';
      cycleInfo.dependencies.forEach((dep, index) => {
        const [fromType, fromId] = dep.from.split(':');
        const [toType, toId] = dep.to.split(':');
        const fromTitle = titleMap.get(dep.from) || 'Unknown';
        const toTitle = titleMap.get(dep.to) || 'Unknown';
        errorMessage += `${index + 1}. ${fromType}#${fromId} (${fromTitle}) depends on ${toType}#${toId} (${toTitle})\n`;
      });
    } else {
      // Fallback to basic error message
      errorMessage += `Tasks involved: ${unreachable.map(u => `${u.type}#${u.id}`).join(', ')}`;
    }
    
    throw new Error(errorMessage);
  }

  // Track when each task finishes (for dependency calculation)
  const taskEndDates = new Map();
  const scheduledTasks = [];
  let projectEndDate = projectStart;

  // Calculate schedule for each task in topological order
  for (const task of sorted) {
    const taskKey = `${task.type}:${task.id}`;
    const estimatedHours = task.estimate || 0;
    const durationDays = calculateDurationDays(estimatedHours, hoursPerDay);

    // Calculate earliest start date based on dependencies
    let earliestStart = new Date(projectStart);
    
    if (task.dependencies && task.dependencies.length > 0) {
      // Wait for all dependencies to finish
      task.dependencies.forEach(depKey => {
        const depEndDate = taskEndDates.get(depKey);
        if (depEndDate && depEndDate > earliestStart) {
          earliestStart = new Date(depEndDate);
          // Start the day after dependency ends
          earliestStart.setDate(earliestStart.getDate() + 1);
        }
      });
    }

    // Skip weekend if not including weekends and start falls on weekend
    if (!includeWeekends) {
      earliestStart = skipWeekend(earliestStart);
    }

    // Calculate end date
    const scheduledStart = earliestStart;
    const scheduledEnd = addBusinessDays(scheduledStart, durationDays, includeWeekends);
    
    // Track this task's end date for dependent tasks
    taskEndDates.set(taskKey, scheduledEnd);

    // Update project end date
    if (scheduledEnd > projectEndDate) {
      projectEndDate = new Date(scheduledEnd);
    }

    // Detect risks
    const { hasRisk, riskReason } = detectTaskRisks({
      ...task,
      estimatedHours,
      scheduledEnd,
      dueDate: task.dueDate
    });

    // Calculate days late (if applicable)
    let daysLate = null;
    if (task.dueDate) {
      const due = new Date(task.dueDate);
      if (scheduledEnd > due) {
        daysLate = Math.ceil((scheduledEnd - due) / (1000 * 60 * 60 * 24));
      }
    }

    scheduledTasks.push({
      itemType: task.type,
      itemId: task.id,
      title: task.title || `${task.type} #${task.id}`,
      assignee: task.assignee || 'Unassigned',
      estimatedHours,
      estimateSource: task.estimateSource || 'unknown',
      scheduledStart: scheduledStart.toISOString().split('T')[0],
      scheduledEnd: scheduledEnd.toISOString().split('T')[0],
      durationDays,
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : null,
      isCriticalPath: task.isCriticalPath || false,
      hasRisk,
      riskReason: hasRisk ? riskReason : null,
      daysLate,
      dependencies: task.dependencies || []
    });
  }

  // Calculate summary statistics
  const totalTasks = scheduledTasks.length;
  const totalHours = scheduledTasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
  const criticalPathTasks = scheduledTasks.filter(t => t.isCriticalPath).length;
  const risksCount = scheduledTasks.filter(t => t.hasRisk).length;

  // Calculate resource allocation
  const resourceAllocation = calculateResourceAllocation(scheduledTasks);

  // Detect deadline overrun
  let deadlineWarning = null;
  if (projectDeadline) {
    const deadline = new Date(projectDeadline);
    if (!isNaN(deadline.getTime()) && projectEndDate > deadline) {
      // Calculate delay
      const delayMs = projectEndDate - deadline;
      const delayDays = Math.ceil(delayMs / (1000 * 60 * 60 * 24));
      const delayWeeks = Math.floor(delayDays / 7);
      const remainingDays = delayDays % 7;
      
      // Format delay message
      let delayText = '';
      if (delayWeeks > 0) {
        delayText = delayWeeks === 1 ? '1 week' : `${delayWeeks} weeks`;
        if (remainingDays > 0) {
          delayText += ` and ${remainingDays} day${remainingDays > 1 ? 's' : ''}`;
        }
      } else {
        delayText = `${delayDays} day${delayDays > 1 ? 's' : ''}`;
      }
      
      // Generate suggestions
      const suggestions = [];
      
      // Suggestion 1: Increase working hours
      // Count actual working days from project start to deadline
      const workingDaysToDeadline = countBusinessDays(projectStart, deadline, includeWeekends);
      
      // Calculate required hours per day to meet deadline
      if (workingDaysToDeadline > 0) {
        const requiredHoursPerDay = Math.ceil(totalHours / workingDaysToDeadline);
        if (requiredHoursPerDay > hoursPerDay && requiredHoursPerDay <= 12) {
          suggestions.push(`Increase working hours to ${requiredHoursPerDay} hours/day`);
        }
      }
      
      // Suggestion 2: Add weekend work
      if (!includeWeekends) {
        suggestions.push('Include weekends in the schedule');
      }
      
      // Suggestion 3: Add more resources
      const uniqueAssignees = new Set(scheduledTasks.map(t => t.assignee).filter(a => a && a !== 'Unassigned'));
      if (uniqueAssignees.size > 0) {
        suggestions.push(`Add ${Math.ceil(delayDays / 7)} more team member${delayDays / 7 > 1 ? 's' : ''} to distribute workload`);
      }
      
      // Suggestion 4: Reduce scope
      suggestions.push('Review and prioritize critical tasks only');
      
      deadlineWarning = {
        hasOverrun: true,
        projectDeadline: deadline.toISOString().split('T')[0],
        calculatedEnd: projectEndDate.toISOString().split('T')[0],
        delayDays,
        delayText,
        message: `⚠️ Schedule extends ${delayText} beyond project deadline!`,
        suggestions
      };
    } else {
      // No overrun - schedule fits within deadline
      deadlineWarning = {
        hasOverrun: false,
        projectDeadline: deadline.toISOString().split('T')[0],
        calculatedEnd: projectEndDate.toISOString().split('T')[0],
        message: '✅ Schedule fits within project deadline'
      };
    }
  }

  return {
    summary: {
      startDate: projectStart.toISOString().split('T')[0],
      endDate: projectEndDate.toISOString().split('T')[0],
      totalTasks,
      totalHours,
      criticalPathTasks,
      criticalPathHours,
      risksCount,
      hoursPerDay,
      includeWeekends,
      deadlineWarning
    },
    tasks: scheduledTasks,
    resourceAllocation,
    criticalPath: criticalPath.map(key => {
      const [type, id] = key.split(':');
      return { type, id: parseInt(id) };
    })
  };
}

module.exports = {
  calculateProjectSchedule,
  addBusinessDays,
  skipWeekend,
  calculateDurationDays,
  countBusinessDays,
  detectTaskRisks,
  calculateResourceAllocation
};
