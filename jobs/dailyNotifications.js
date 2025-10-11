const cron = require('node-cron');
const { neon } = require('@neondatabase/serverless');
const teamsNotifications = require('../services/teamsNotifications');

const sql = neon(process.env.DATABASE_URL);

/**
 * Check for overdue items and send individual alerts
 */
async function checkOverdueItems() {
  console.log('🔍 Checking for overdue items...');
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all projects with Teams enabled
    const projects = await sql`
      SELECT id, name, teams_webhook_url 
      FROM projects 
      WHERE teams_notifications_enabled = true 
      AND teams_webhook_url IS NOT NULL
    `;
    
    for (const project of projects) {
      // Get overdue issues
      const overdueIssues = await sql`
        SELECT i.*, u.name as assignee_name, u.id as assignee_id
        FROM issues i
        LEFT JOIN users u ON i.assignee = u.email
        WHERE i.project_id = ${project.id}
        AND i.status != 'Done'
        AND i.due_date < ${today.toISOString()}
      `;
      
      // Send alert for each overdue issue
      for (const issue of overdueIssues) {
        await teamsNotifications.notifyItemOverdue(
          project.teams_webhook_url,
          issue,
          'issue',
          { name: issue.assignee_name },
          project
        );
      }
      
      // Get overdue actions
      const overdueActions = await sql`
        SELECT a.*, u.name as assignee_name, u.id as assignee_id
        FROM action_items a
        LEFT JOIN users u ON a.assignee = u.email
        WHERE a.project_id = ${project.id}
        AND a.status != 'Done'
        AND a.due_date < ${today.toISOString()}
      `;
      
      // Send alert for each overdue action
      for (const action of overdueActions) {
        await teamsNotifications.notifyItemOverdue(
          project.teams_webhook_url,
          action,
          'action-item',
          { name: action.assignee_name },
          project
        );
      }
      
      console.log(`✅ Checked overdue items for project: ${project.name}`);
    }
  } catch (error) {
    console.error('❌ Error checking overdue items:', error);
  }
}

/**
 * Send daily summary for each project
 */
async function sendDailySummaries() {
  console.log('📊 Sending daily summaries...');
  
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all projects with Teams enabled
    const projects = await sql`
      SELECT id, name, teams_webhook_url 
      FROM projects 
      WHERE teams_notifications_enabled = true 
      AND teams_webhook_url IS NOT NULL
    `;
    
    for (const project of projects) {
      // Get overdue issues
      const overdueIssues = await sql`
        SELECT * FROM issues 
        WHERE project_id = ${project.id}
        AND status != 'Done'
        AND due_date < ${today.toISOString()}
      `;
      
      // Get overdue actions
      const overdueActions = await sql`
        SELECT * FROM action_items 
        WHERE project_id = ${project.id}
        AND status != 'Done'
        AND due_date < ${today.toISOString()}
      `;
      
      // Send summary
      await teamsNotifications.sendDailySummary(
        project.teams_webhook_url,
        project,
        overdueIssues,
        overdueActions
      );
      
      console.log(`✅ Sent daily summary for project: ${project.name}`);
    }
  } catch (error) {
    console.error('❌ Error sending daily summaries:', error);
  }
}

/**
 * Initialize scheduled jobs
 */
function initializeDailyJobs() {
  // Run overdue checks every day at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('⏰ Running scheduled overdue check...');
    await checkOverdueItems();
  });

  // Send daily summaries every day at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('⏰ Running scheduled daily summary...');
    await sendDailySummaries();
  });

  console.log('✅ Daily notification jobs initialized');
  console.log('   - Overdue alerts: Daily at 9:00 AM');
  console.log('   - Daily summaries: Daily at 8:00 AM');
}

module.exports = {
  initializeDailyJobs,
  checkOverdueItems,
  sendDailySummaries
};
