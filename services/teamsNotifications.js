const axios = require('axios');

/**
 * Get the application base URL
 * Priority: 1. Custom APP_URL, 2. Deployment domain, 3. Workspace URL (dev only)
 */
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

/**
 * Base function to send notification to Microsoft Teams
 */
async function sendTeamsNotification(webhookUrl, title, message, details = {}, color = '0078D4') {
  if (!webhookUrl) {
    console.log('Teams webhook URL not configured');
    return false;
  }

  const appUrl = getAppUrl();

  const card = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "summary": title,
    "themeColor": color,
    "title": title,
    "sections": [
      {
        "activityTitle": message,
        "activitySubtitle": details.subtitle || '',
        "facts": Object.entries(details.facts || {}).map(([key, value]) => ({
          name: key,
          value: String(value)
        })),
        "markdown": true
      }
    ],
    "potentialAction": details.actions || []
  };

  try {
    await axios.post(webhookUrl, card, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`✅ Teams notification sent: ${title}`);
    return true;
  } catch (error) {
    console.error(`❌ Teams notification failed: ${error.message}`);
    return false;
  }
}

/**
 * Notify when new issue created
 */
async function notifyNewIssue(webhookUrl, issue, creator, project) {
  const appUrl = getAppUrl();

  await sendTeamsNotification(
    webhookUrl,
    `🆕 New Issue Created: ${issue.issue_id || issue.id}`,
    issue.title,
    {
      subtitle: `Created by ${creator.name} in ${project.name}`,
      facts: {
        'Priority': issue.priority || 'Not set',
        'Status': issue.status,
        'Due Date': issue.due_date ? new Date(issue.due_date).toLocaleDateString() : 'Not set',
        'Project': project.name
      },
      actions: [
        {
          "@type": "OpenUri",
          "name": "View Issue",
          "targets": [{ "os": "default", "uri": `${appUrl}/?project=${project.id}&itemId=${issue.id}&itemType=issue` }]
        }
      ]
    },
    '0078D4'
  );
}

/**
 * Notify when issue updated
 */
async function notifyIssueUpdated(webhookUrl, issue, updater, project, changes) {
  const appUrl = getAppUrl();

  const changesList = Object.entries(changes)
    .map(([field, values]) => `${field}: ${values.old} → ${values.new}`)
    .join(', ');

  await sendTeamsNotification(
    webhookUrl,
    `✏️ Issue Updated: ${issue.issue_id || issue.id}`,
    issue.title,
    {
      subtitle: `Updated by ${updater.name} in ${project.name}`,
      facts: {
        'Changes': changesList,
        'Current Status': issue.status,
        'Priority': issue.priority || 'Not set'
      },
      actions: [
        {
          "@type": "OpenUri",
          "name": "View Issue",
          "targets": [{ "os": "default", "uri": `${appUrl}/?project=${project.id}&itemId=${issue.id}&itemType=issue` }]
        }
      ]
    },
    'FFA500'
  );
}

/**
 * Notify when issue completed
 */
async function notifyIssueCompleted(webhookUrl, issue, completer, project) {
  const appUrl = getAppUrl();

  await sendTeamsNotification(
    webhookUrl,
    `✅ Issue Completed: ${issue.issue_id || issue.id}`,
    issue.title,
    {
      subtitle: `Completed by ${completer.name} in ${project.name}`,
      facts: {
        'Priority': issue.priority || 'Not set',
        'Completed': new Date().toLocaleString(),
        'Project': project.name
      },
      actions: [
        {
          "@type": "OpenUri",
          "name": "View Issue",
          "targets": [{ "os": "default", "uri": `${appUrl}/?project=${project.id}&itemId=${issue.id}&itemType=issue` }]
        }
      ]
    },
    '28A745'
  );
}

/**
 * Notify when single issue/action item is overdue
 */
async function notifyItemOverdue(webhookUrl, item, itemType, assignee, project) {
  const appUrl = getAppUrl();

  const daysOverdue = Math.floor(
    (new Date() - new Date(item.due_date)) / (1000 * 60 * 60 * 24)
  );

  const isIssue = itemType === 'issue';
  const itemId = item.issue_id || item.action_id || item.id;

  await sendTeamsNotification(
    webhookUrl,
    `⚠️ Overdue ${isIssue ? 'Issue' : 'Action Item'}: ${itemId}`,
    item.title,
    {
      subtitle: `Assigned to ${assignee?.name || 'Unassigned'} in ${project.name}`,
      facts: {
        'Days Overdue': daysOverdue,
        'Due Date': new Date(item.due_date).toLocaleDateString(),
        'Priority': item.priority || 'Not set',
        'Status': item.status,
        'Project': project.name
      },
      actions: [
        {
          "@type": "OpenUri",
          "name": `View ${isIssue ? 'Issue' : 'Action'}`,
          "targets": [{ "os": "default", "uri": `${appUrl}/?project=${project.id}&itemId=${item.id}&itemType=${itemType}` }]
        }
      ]
    },
    'DC3545'
  );
}

/**
 * Notify for new action item
 */
async function notifyNewAction(webhookUrl, action, creator, project) {
  const appUrl = getAppUrl();

  await sendTeamsNotification(
    webhookUrl,
    `📋 New Action Item: ${action.action_id || action.id}`,
    action.title,
    {
      subtitle: `Created by ${creator.name} in ${project.name}`,
      facts: {
        'Priority': action.priority || 'Not set',
        'Status': action.status,
        'Due Date': action.due_date ? new Date(action.due_date).toLocaleDateString() : 'Not set',
        'Project': project.name
      },
      actions: [
        {
          "@type": "OpenUri",
          "name": "View Action",
          "targets": [{ "os": "default", "uri": `${appUrl}/?project=${project.id}&itemId=${action.id}&itemType=action-item` }]
        }
      ]
    },
    '6F42C1'
  );
}

/**
 * Notify for action item updated
 */
async function notifyActionUpdated(webhookUrl, action, updater, project, changes) {
  const appUrl = getAppUrl();

  const changesList = Object.entries(changes)
    .map(([field, values]) => `${field}: ${values.old} → ${values.new}`)
    .join(', ');

  await sendTeamsNotification(
    webhookUrl,
    `✏️ Action Item Updated: ${action.action_id || action.id}`,
    action.title,
    {
      subtitle: `Updated by ${updater.name} in ${project.name}`,
      facts: {
        'Changes': changesList,
        'Current Status': action.status,
        'Priority': action.priority || 'Not set'
      },
      actions: [
        {
          "@type": "OpenUri",
          "name": "View Action",
          "targets": [{ "os": "default", "uri": `${appUrl}/?project=${project.id}&itemId=${action.id}&itemType=action-item` }]
        }
      ]
    },
    'FFA500'
  );
}

/**
 * Notify for action completed
 */
async function notifyActionCompleted(webhookUrl, action, completer, project) {
  const appUrl = getAppUrl();

  await sendTeamsNotification(
    webhookUrl,
    `✅ Action Completed: ${action.action_id || action.id}`,
    action.title,
    {
      subtitle: `Completed by ${completer.name} in ${project.name}`,
      facts: {
        'Priority': action.priority || 'Not set',
        'Completed': new Date().toLocaleString(),
        'Project': project.name
      },
      actions: [
        {
          "@type": "OpenUri",
          "name": "View Action",
          "targets": [{ "os": "default", "uri": `${appUrl}/?project=${project.id}&itemId=${action.id}&itemType=action-item` }]
        }
      ]
    },
    '28A745'
  );
}

/**
 * Send daily summary for a project
 */
async function sendDailySummary(webhookUrl, project, overdueIssues, overdueActions) {
  const appUrl = getAppUrl();

  const totalOverdue = overdueIssues.length + overdueActions.length;

  if (totalOverdue === 0) {
    return;
  }

  await sendTeamsNotification(
    webhookUrl,
    `📊 Daily Summary: ${project.name}`,
    `You have ${totalOverdue} overdue item(s)`,
    {
      subtitle: new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      facts: {
        'Overdue Issues': overdueIssues.length,
        'Overdue Actions': overdueActions.length,
        'Total Overdue': totalOverdue
      },
      actions: [
        {
          "@type": "OpenUri",
          "name": "View Project",
          "targets": [{ "os": "default", "uri": `${appUrl}/?project=${project.id}` }]
        }
      ]
    },
    'FFC107'
  );
}

module.exports = {
  sendTeamsNotification,
  notifyNewIssue,
  notifyIssueUpdated,
  notifyIssueCompleted,
  notifyItemOverdue,
  notifyNewAction,
  notifyActionUpdated,
  notifyActionCompleted,
  sendDailySummary
};
