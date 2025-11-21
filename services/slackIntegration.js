const { ChatPlatformAdapter } = require('./chatPlatformAdapter');
const { WebClient } = require('@slack/web-api');

/**
 * Slack Integration
 * Implements ChatPlatformAdapter for Slack
 */
class SlackAdapter extends ChatPlatformAdapter {
  constructor(config) {
    super(config);
    this.client = new WebClient(config.botToken);
    this.workspaceId = config.workspaceId;
    this.channels = config.channels || [];
  }

  /**
   * Send message to Slack channel
   */
  async sendMessage({ channelId, text, blocks, threadId }) {
    try {
      const response = await this.client.chat.postMessage({
        channel: channelId,
        text: text,
        blocks: blocks,
        thread_ts: threadId
      });

      return {
        success: true,
        messageId: response.ts,
        channelId: response.channel
      };
    } catch (error) {
      console.error('Slack sendMessage error:', error.message || 'Unknown error');
      throw new Error('Failed to send Slack message');
    }
  }

  /**
   * Send direct message to Slack user
   */
  async sendDirectMessage({ userId, text }) {
    try {
      const dm = await this.client.conversations.open({
        users: userId
      });

      return await this.sendMessage({
        channelId: dm.channel.id,
        text: text
      });
    } catch (error) {
      console.error('Slack sendDirectMessage error:', error.message || 'Unknown error');
      throw new Error('Failed to send Slack DM');
    }
  }

  /**
   * Get Slack channel history
   */
  async getChannelHistory({ channelId, since, limit = 100 }) {
    try {
      const response = await this.client.conversations.history({
        channel: channelId,
        oldest: since ? Math.floor(since / 1000).toString() : undefined,
        limit: limit
      });

      return response.messages.map(msg => ({
        id: msg.ts,
        text: msg.text,
        userId: msg.user,
        timestamp: parseInt(msg.ts) * 1000,
        threadId: msg.thread_ts
      }));
    } catch (error) {
      console.error('Slack getChannelHistory error:', error.message || 'Unknown error');
      throw new Error('Failed to fetch Slack channel history');
    }
  }

  /**
   * Get Slack user info
   */
  async getUserInfo({ userId }) {
    try {
      const response = await this.client.users.info({
        user: userId
      });

      return {
        id: response.user.id,
        name: response.user.real_name || response.user.name,
        email: response.user.profile.email,
        avatar: response.user.profile.image_72
      };
    } catch (error) {
      console.error('Slack getUserInfo error:', error.message || 'Unknown error');
      throw new Error('Failed to fetch Slack user info');
    }
  }

  /**
   * Test Slack connection
   */
  async testConnection() {
    try {
      const response = await this.client.auth.test();
      return {
        success: true,
        teamName: response.team,
        botUserId: response.user_id
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Format message with Slack blocks
   */
  formatDetectionMessage(detection) {
    return {
      text: `🤖 Sidecar detected: ${detection.type}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🤖 Sidecar Bot Detection`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Type:*\n${detection.type}`
            },
            {
              type: 'mrkdwn',
              text: `*Confidence:*\n${Math.round(detection.confidence * 100)}%`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${detection.title}*\n${detection.description || ''}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Review'
              },
              url: detection.url,
              action_id: 'review_detection'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Dismiss'
              },
              action_id: 'dismiss_detection',
              value: detection.id
            }
          ]
        }
      ]
    };
  }
}

module.exports = SlackAdapter;
