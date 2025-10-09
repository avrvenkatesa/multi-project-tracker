const { Pool } = require('@neondatabase/serverless');
const { sendEmail } = require('../config/email');
const { renderTemplate } = require('../utils/emailTemplates');
const crypto = require('crypto');

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

class NotificationService {
  
  async canSendNotification(userId, notificationType) {
    try {
      const result = await pool.query(
        'SELECT * FROM user_notification_preferences WHERE user_id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) return true;
      
      const columnName = `${notificationType}_enabled`;
      return result.rows[0][columnName] !== false;
    } catch (error) {
      console.error('Error checking notification preferences:', error);
      return true;
    }
  }
  
  async generateUnsubscribeToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      'INSERT INTO unsubscribe_tokens (user_id, token) VALUES ($1, $2)',
      [userId, token]
    );
    return token;
  }
  
  async getUserEmail(userId) {
    const result = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    return result.rows[0];
  }
  
  async sendMentionNotification({ mentionedUserId, mentionerName, itemTitle, itemType, itemId, projectId, commentPreview }) {
    try {
      if (!await this.canSendNotification(mentionedUserId, 'mentions')) {
        console.log(`📧 Mention notification skipped for user ${mentionedUserId} (disabled)`);
        return;
      }
      
      const user = await this.getUserEmail(mentionedUserId);
      if (!user) {
        console.error(`User ${mentionedUserId} not found`);
        return;
      }
      
      const unsubscribeToken = await this.generateUnsubscribeToken(mentionedUserId);
      const appUrl = getAppUrl();
      
      const { html, text } = renderTemplate('mention', {
        mentionerName,
        itemTitle,
        itemType,
        commentPreview: commentPreview.substring(0, 200) + (commentPreview.length > 200 ? '...' : ''),
        itemLink: `${appUrl}/index.html?project=${projectId}&itemId=${itemId}&itemType=${itemType}`,
        unsubscribeLink: `${appUrl}/api/notifications/unsubscribe/${unsubscribeToken}`
      });
      
      await sendEmail({
        to: user.email,
        subject: `${mentionerName} mentioned you in ${itemType}`,
        html,
        text
      });
    } catch (error) {
      console.error('Error sending mention notification:', error);
    }
  }
  
  async sendAssignmentNotification({ assignedUserId, assignerName, itemTitle, itemType, itemId, projectId, dueDate, priority }) {
    try {
      if (!await this.canSendNotification(assignedUserId, 'assignments')) {
        console.log(`📧 Assignment notification skipped for user ${assignedUserId} (disabled)`);
        return;
      }
      
      const user = await this.getUserEmail(assignedUserId);
      if (!user) {
        console.error(`User ${assignedUserId} not found`);
        return;
      }
      
      const unsubscribeToken = await this.generateUnsubscribeToken(assignedUserId);
      const appUrl = getAppUrl();
      
      const formattedDueDate = dueDate ? new Date(dueDate).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }) : 'No due date';
      
      const { html, text } = renderTemplate('assignment', {
        assignerName,
        itemTitle,
        itemType,
        dueDate: formattedDueDate,
        priority: priority || 'normal',
        itemLink: `${appUrl}/index.html?project=${projectId}&itemId=${itemId}&itemType=${itemType}`,
        unsubscribeLink: `${appUrl}/api/notifications/unsubscribe/${unsubscribeToken}`
      });
      
      await sendEmail({
        to: user.email,
        subject: `New ${itemType} assigned: ${itemTitle}`,
        html,
        text
      });
    } catch (error) {
      console.error('Error sending assignment notification:', error);
    }
  }
  
  async sendStatusChangeNotification({ assignedUserId, itemTitle, itemType, itemId, oldStatus, newStatus, changedByName, projectId }) {
    try {
      if (!await this.canSendNotification(assignedUserId, 'status_changes')) {
        console.log(`📧 Status change notification skipped for user ${assignedUserId} (disabled)`);
        return;
      }
      
      const user = await this.getUserEmail(assignedUserId);
      if (!user) {
        console.error(`User ${assignedUserId} not found`);
        return;
      }
      
      const unsubscribeToken = await this.generateUnsubscribeToken(assignedUserId);
      const appUrl = getAppUrl();
      
      const { html, text } = renderTemplate('status-change', {
        changedByName,
        itemTitle,
        itemType,
        oldStatus,
        newStatus,
        itemLink: `${appUrl}/index.html?project=${projectId}&itemId=${itemId}&itemType=${itemType}`,
        unsubscribeLink: `${appUrl}/api/notifications/unsubscribe/${unsubscribeToken}`
      });
      
      await sendEmail({
        to: user.email,
        subject: `Status changed: ${itemTitle}`,
        html,
        text
      });
    } catch (error) {
      console.error('Error sending status change notification:', error);
    }
  }
  
  async sendInvitationNotification({ inviteeEmail, inviterName, projectName, role, invitationToken, message }) {
    try {
      const appUrl = getAppUrl();
      
      // Build message section HTML if message exists
      const messageSection = message ? `
        <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 20px; margin: 20px 0; border-radius: 4px;">
          <p style="color: #1f2937; margin: 0; white-space: pre-wrap; font-size: 15px; line-height: 1.6;">${message}</p>
        </div>
      ` : '';
      
      const { html, text } = renderTemplate('invitation', {
        inviterName,
        projectName,
        role,
        acceptLink: `${appUrl}/api/invitations/${invitationToken}/accept`,
        declineLink: `${appUrl}/api/invitations/${invitationToken}/decline`,
        messageSection
      });
      
      await sendEmail({
        to: inviteeEmail,
        subject: `You've been invited to join ${projectName}`,
        html,
        text
      });
    } catch (error) {
      console.error('Error sending invitation notification:', error);
    }
  }
  
  async sendCompletionNotification({ creatorUserId, creatorEmail, creatorName, itemType, itemTitle, itemId, priority, completedByName, projectId }) {
    try {
      // Check notification preferences for status changes (completion is a type of status change)
      if (creatorUserId && !await this.canSendNotification(creatorUserId, 'status_changes')) {
        console.log(`📧 Completion notification skipped for user ${creatorUserId} (disabled)`);
        return;
      }
      
      if (!creatorEmail) {
        console.log('📧 No creator email available for completion notification');
        return;
      }
      
      const appUrl = getAppUrl();
      const itemLabel = itemType === 'issue' ? 'Issue' : 'Action Item';
      const itemIdDisplay = `#${itemId}`;
      
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10b981;">✅ Item Completed</h2>
          
          <p>Hello ${creatorName || 'there'},</p>
          
          <p>Good news! The ${itemLabel.toLowerCase()} you created has been marked as complete:</p>
          
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 8px 0;"><strong>${itemLabel}:</strong> ${itemIdDisplay}</p>
            <p style="margin: 8px 0;"><strong>Title:</strong> ${itemTitle}</p>
            <p style="margin: 8px 0;"><strong>Priority:</strong> ${priority || 'N/A'}</p>
            <p style="margin: 8px 0;"><strong>Completed:</strong> ${new Date().toLocaleString()}</p>
            <p style="margin: 8px 0;"><strong>Completed by:</strong> ${completedByName || 'Team member'}</p>
          </div>
          
          <p>
            <a href="${appUrl}/index.html?project=${projectId}&itemId=${itemId}&itemType=${itemType}" 
               style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              View Details
            </a>
          </p>
          
          <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e7eb;">
          
          <p style="color: #6b7280; font-size: 12px;">
            Multi-Project Tracker<br>
            This is an automated notification. Please do not reply to this email.
          </p>
        </div>
      `;
      
      const text = `
${itemLabel} Completed

Hello ${creatorName || 'there'},

The ${itemLabel.toLowerCase()} you created has been marked as complete:

${itemLabel}: ${itemIdDisplay}
Title: ${itemTitle}
Priority: ${priority || 'N/A'}
Completed: ${new Date().toLocaleString()}
Completed by: ${completedByName || 'Team member'}

View details in Multi-Project Tracker: ${appUrl}/index.html?project=${projectId}&itemId=${itemId}&itemType=${itemType}

---
Multi-Project Tracker
      `;
      
      await sendEmail({
        to: creatorEmail,
        subject: `✅ Your ${itemLabel.toLowerCase()} "${itemTitle}" has been completed`,
        html,
        text
      });
      
      console.log(`📧 Completion email sent to ${creatorEmail} for ${itemLabel} ${itemId}`);
    } catch (error) {
      console.error('Error sending completion notification:', error);
    }
  }
}

module.exports = new NotificationService();
