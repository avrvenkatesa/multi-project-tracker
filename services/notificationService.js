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
        itemLink: `${appUrl}/project.html?id=${projectId}`,
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
  
  async sendStatusChangeNotification({ assignedUserId, itemTitle, itemType, oldStatus, newStatus, changedByName, projectId }) {
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
        itemLink: `${appUrl}/project.html?id=${projectId}`,
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
  
  async sendInvitationNotification({ inviteeEmail, inviterName, projectName, role, invitationToken }) {
    try {
      const appUrl = getAppUrl();
      
      const { html, text } = renderTemplate('invitation', {
        inviterName,
        projectName,
        role,
        acceptLink: `${appUrl}/api/invitations/${invitationToken}/accept`,
        declineLink: `${appUrl}/api/invitations/${invitationToken}/decline`
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
}

module.exports = new NotificationService();
