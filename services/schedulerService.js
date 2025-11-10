const cron = require('node-cron');
const { Pool } = require('@neondatabase/serverless');
const notificationService = require('./notificationService');
const { calculateProjectSchedule } = require('./schedule-calculation-service');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function getAppUrl() {
  // First priority: Custom APP_URL for production deployments
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  
  // Second priority: Replit deployment domain (autoscale/vm deployments)
  if (process.env.REPLIT_DEPLOYMENT === '1' && process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    if (domains.length > 0) {
      return `https://${domains[0].trim()}`;
    }
  }
  
  // Third priority: Development workspace URL
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
  // Fallback: localhost
  return 'http://localhost:5000';
}

class SchedulerService {
  constructor() {
    this.jobs = [];
  }

  async sendDailyOverdueAlerts() {
    try {
      console.log('📅 Running daily overdue alerts...');
      
      // Get all projects with Teams notifications enabled
      const projectsResult = await pool.query(`
        SELECT id, name, teams_webhook_url, teams_notifications_enabled 
        FROM projects 
        WHERE teams_notifications_enabled = true 
        AND teams_webhook_url IS NOT NULL
        AND archived = false
      `);
      
      for (const project of projectsResult.rows) {
        // Get overdue issues and action items
        const overdueResult = await pool.query(`
          SELECT 
            'issue' as type, 
            id, 
            title, 
            priority, 
            assignee, 
            due_date,
            status
          FROM issues 
          WHERE project_id = $1 
          AND due_date < NOW() 
          AND status NOT IN ('Done', 'Completed', 'Closed')
          UNION ALL
          SELECT 
            'action-item' as type, 
            id, 
            title, 
            priority, 
            assignee, 
            due_date,
            status
          FROM action_items 
          WHERE project_id = $1 
          AND due_date < NOW() 
          AND status NOT IN ('Done', 'Completed')
          ORDER BY due_date ASC
        `, [project.id]);
        
        if (overdueResult.rows.length > 0) {
          const appUrl = getAppUrl();
          const overdueItems = overdueResult.rows;
          
          // Group by type for summary
          const issues = overdueItems.filter(i => i.type === 'issue');
          const actionItems = overdueItems.filter(i => i.type === 'action-item');
          
          const message = `⚠️ You have ${overdueResult.rows.length} overdue item(s):
${issues.length} issue(s) and ${actionItems.length} action item(s)`;
          
          const facts = [
            { title: 'Total Overdue', value: `${overdueResult.rows.length}` },
            { title: 'Overdue Issues', value: `${issues.length}` },
            { title: 'Overdue Action Items', value: `${actionItems.length}` },
            { title: 'Project', value: project.name }
          ];
          
          // Add top 3 most overdue items
          const topOverdue = overdueItems.slice(0, 3);
          topOverdue.forEach((item, index) => {
            const daysOverdue = Math.floor((new Date() - new Date(item.due_date)) / (1000 * 60 * 60 * 24));
            facts.push({
              title: `${index + 1}. ${item.type === 'issue' ? 'Issue' : 'Action'} ${item.id}`,
              value: `${item.title.substring(0, 40)}... (${daysOverdue} days overdue)`
            });
          });
          
          await notificationService.sendTeamsNotification({
            projectId: project.id,
            webhookUrl: project.teams_webhook_url,
            title: '⏰ Daily Overdue Alert',
            message,
            facts,
            actionUrl: `${appUrl}/index.html?project=${project.id}`,
            actionText: 'View Project'
          });
          
          console.log(`📢 Sent overdue alert for project ${project.id} (${overdueResult.rows.length} items)`);
        }
      }
      
      console.log('✅ Daily overdue alerts completed');
    } catch (error) {
      console.error('Error sending daily overdue alerts:', error);
    }
  }

  async sendDailyHealthSummary() {
    try {
      console.log('📊 Running daily project health summary...');
      
      // Get all projects with Teams notifications enabled
      const projectsResult = await pool.query(`
        SELECT id, name, teams_webhook_url, teams_notifications_enabled 
        FROM projects 
        WHERE teams_notifications_enabled = true 
        AND teams_webhook_url IS NOT NULL
        AND archived = false
      `);
      
      for (const project of projectsResult.rows) {
        // Get project health metrics
        const statsResult = await pool.query(`
          SELECT
            (SELECT COUNT(*) FROM issues WHERE project_id = $1) as total_issues,
            (SELECT COUNT(*) FROM issues WHERE project_id = $1 AND status = 'Done') as completed_issues,
            (SELECT COUNT(*) FROM issues WHERE project_id = $1 AND status IN ('Open', 'To Do', 'In Progress')) as active_issues,
            (SELECT COUNT(*) FROM issues WHERE project_id = $1 AND due_date < NOW() AND status NOT IN ('Done', 'Completed')) as overdue_issues,
            (SELECT COUNT(*) FROM action_items WHERE project_id = $1) as total_actions,
            (SELECT COUNT(*) FROM action_items WHERE project_id = $1 AND status = 'Done') as completed_actions,
            (SELECT COUNT(*) FROM action_items WHERE project_id = $1 AND status IN ('To Do', 'In Progress')) as active_actions,
            (SELECT COUNT(*) FROM action_items WHERE project_id = $1 AND due_date < NOW() AND status NOT IN ('Done', 'Completed')) as overdue_actions,
            (SELECT COUNT(*) FROM issues WHERE project_id = $1 AND priority = 'critical') as critical_issues,
            (SELECT COUNT(*) FROM issues WHERE project_id = $1 AND created_at >= NOW() - INTERVAL '24 hours') as new_issues_today,
            (SELECT COUNT(*) FROM action_items WHERE project_id = $1 AND created_at >= NOW() - INTERVAL '24 hours') as new_actions_today
        `, [project.id]);
        
        const stats = statsResult.rows[0];
        const appUrl = getAppUrl();
        
        // Calculate completion rate
        const totalItems = parseInt(stats.total_issues) + parseInt(stats.total_actions);
        const completedItems = parseInt(stats.completed_issues) + parseInt(stats.completed_actions);
        const completionRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
        
        // Calculate health score (simple algorithm)
        let healthScore = 100;
        const overdueCount = parseInt(stats.overdue_issues) + parseInt(stats.overdue_actions);
        const criticalCount = parseInt(stats.critical_issues);
        
        healthScore -= (overdueCount * 5); // -5 points per overdue item
        healthScore -= (criticalCount * 3); // -3 points per critical issue
        healthScore = Math.max(0, Math.min(100, healthScore)); // Clamp between 0-100
        
        const healthEmoji = healthScore >= 80 ? '🟢' : healthScore >= 60 ? '🟡' : '🔴';
        
        const message = `${healthEmoji} Project Health Score: ${healthScore}/100`;
        
        const facts = [
          { title: 'Health Score', value: `${healthScore}/100 ${healthEmoji}` },
          { title: 'Completion Rate', value: `${completionRate}%` },
          { title: 'Active Issues', value: `${stats.active_issues}` },
          { title: 'Active Action Items', value: `${stats.active_actions}` },
          { title: 'Overdue Items', value: `${overdueCount}` },
          { title: 'Critical Issues', value: `${criticalCount}` },
          { title: 'New Today', value: `${parseInt(stats.new_issues_today) + parseInt(stats.new_actions_today)}` },
          { title: 'Project', value: project.name }
        ];
        
        await notificationService.sendTeamsNotification({
          projectId: project.id,
          webhookUrl: project.teams_webhook_url,
          title: '📊 Daily Project Health Summary',
          message,
          facts,
          actionUrl: `${appUrl}/dashboard.html?projectId=${project.id}`,
          actionText: 'View Dashboard'
        });
        
        console.log(`📢 Sent health summary for project ${project.id} (Health: ${healthScore}/100)`);
      }
      
      console.log('✅ Daily health summaries completed');
    } catch (error) {
      console.error('Error sending daily health summary:', error);
    }
  }

  start() {
    console.log('⏰ Starting scheduler service...');
    
    // Schedule daily overdue alerts at 9:00 AM every day
    const overdueJob = cron.schedule('0 9 * * *', () => {
      this.sendDailyOverdueAlerts();
    }, {
      timezone: 'America/New_York' // Adjust timezone as needed
    });
    
    // Schedule daily health summary at 9:00 AM every day
    const healthJob = cron.schedule('0 9 * * *', () => {
      this.sendDailyHealthSummary();
    }, {
      timezone: 'America/New_York' // Adjust timezone as needed
    });
    
    this.jobs.push(overdueJob, healthJob);
    
    console.log('✅ Scheduler service started');
    console.log('📅 Daily overdue alerts scheduled for 9:00 AM');
    console.log('📊 Daily health summaries scheduled for 9:00 AM');
    
    // Optional: Run immediately on startup for testing (comment out in production)
    // setTimeout(() => {
    //   this.sendDailyOverdueAlerts();
    //   this.sendDailyHealthSummary();
    // }, 5000);
  }

  stop() {
    this.jobs.forEach(job => job.stop());
    console.log('⏰ Scheduler service stopped');
  }

  /**
   * Create a project schedule from issues with dependencies
   * @param {Object} params - Parameters
   * @param {number} params.projectId - Project ID
   * @param {string} params.name - Schedule name
   * @param {Array} params.items - Array of items with {type, id, title, assignee, estimate, estimateSource, dueDate, dependencies}
   * @param {string} params.startDate - Schedule start date (ISO format)
   * @param {number} params.hoursPerDay - Working hours per day (default 8)
   * @param {boolean} params.includeWeekends - Include weekends in schedule (default false)
   * @param {number} params.userId - User creating the schedule
   * @param {string} params.notes - Optional notes
   * @returns {Promise<Object>} Schedule object with id and summary
   */
  async createScheduleFromIssues({
    projectId,
    name,
    items,
    startDate,
    hoursPerDay = 8,
    includeWeekends = false,
    userId,
    notes = null
  }) {
    console.log(`📅 Auto-creating schedule "${name}" for project ${projectId} with ${items.length} items...`);

    // Validation
    if (!projectId || !name || !items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Invalid schedule parameters: projectId, name, and items array required');
    }

    if (!startDate) {
      throw new Error('Start date is required for schedule creation');
    }

    // Fetch project details to get deadline
    const projectResult = await pool.query(
      'SELECT end_date FROM projects WHERE id = $1',
      [projectId]
    );
    
    const projectDeadline = projectResult.rows[0]?.end_date || null;
    console.log(`📅 Project deadline: ${projectDeadline || 'Not set'}`);

    // Calculate schedule
    const scheduleResult = await calculateProjectSchedule({
      items,
      startDate,
      hoursPerDay,
      includeWeekends,
      projectDeadline
    });

    console.log('✓ Schedule calculated:', {
      totalTasks: scheduleResult.summary.totalTasks,
      hasCycle: scheduleResult.hasCycle,
      endDate: scheduleResult.summary.endDate
    });

    // Start transaction to persist schedule
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Debug: Log all parameter values
      const params = [
        projectId,
        name,
        scheduleResult.summary.startDate,
        scheduleResult.summary.endDate,
        hoursPerDay,
        includeWeekends,
        scheduleResult.summary.totalTasks,
        scheduleResult.summary.totalHours,
        scheduleResult.summary.criticalPathTasks,
        scheduleResult.summary.criticalPathHours,
        scheduleResult.summary.risksCount,
        userId,
        notes
      ];
      console.log('[SCHEDULE INSERT DEBUG] Parameters:');
      params.forEach((val, idx) => {
        console.log(`  $${idx + 1}: ${val} (type: ${typeof val}, isArray: ${Array.isArray(val)})`);
      });

      // Insert schedule
      const scheduleInsert = await client.query(
        `INSERT INTO project_schedules 
         (project_id, name, version, start_date, end_date, hours_per_day, include_weekends,
          total_tasks, total_hours, critical_path_tasks, critical_path_hours, risks_count,
          is_active, is_published, created_by, notes)
         VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, FALSE, $12, $13)
         RETURNING id`,
        params
      );

      const scheduleId = scheduleInsert.rows[0].id;
      console.log(`[SCHEDULE] Created schedule #${scheduleId}, totalHours=${scheduleResult.summary.totalHours} (type: ${typeof scheduleResult.summary.totalHours})`);

      // Insert schedule items
      for (const item of items) {
        await client.query(
          `INSERT INTO schedule_items (schedule_id, item_type, item_id)
           VALUES ($1, $2, $3)`,
          [scheduleId, item.type, item.id]
        );
      }

      // Insert task schedules
      for (const task of scheduleResult.tasks) {
        const estimatedHoursValue = parseFloat(task.estimatedHours) || 0;
        console.log(`[SCHEDULE INSERT] Task ${task.itemId}: estimatedHours raw="${task.estimatedHours}" type=${typeof task.estimatedHours}, parsed=${estimatedHoursValue}`);
        
        await client.query(
          `INSERT INTO task_schedules 
           (schedule_id, item_type, item_id, assignee, estimated_hours, estimate_source,
            scheduled_start, scheduled_end, duration_days, due_date,
            is_critical_path, has_risk, risk_reason, days_late, dependencies)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            scheduleId,
            task.itemType,
            task.itemId,
            task.assignee || null,
            estimatedHoursValue,
            task.estimateSource || 'unknown',
            task.scheduledStart,
            task.scheduledEnd,
            parseInt(task.durationDays) || 0,
            task.dueDate || null,
            task.isCriticalPath || false,
            task.hasRisk || false,
            task.riskReason || null,
            parseInt(task.daysLate) || 0,
            JSON.stringify(task.dependencies || [])
          ]
        );
      }

      await client.query('COMMIT');

      console.log(`✅ Schedule #${scheduleId} created successfully`);

      return {
        scheduleId,
        version: 1,
        ...scheduleResult.summary
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new SchedulerService();
