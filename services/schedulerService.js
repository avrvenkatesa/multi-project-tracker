const cron = require('node-cron');
const { Pool } = require('@neondatabase/serverless');
const notificationService = require('./notificationService');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function getAppUrl() {
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }
  
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
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
}

module.exports = new SchedulerService();
