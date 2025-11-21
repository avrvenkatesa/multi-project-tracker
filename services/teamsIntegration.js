const { ChatPlatformAdapter } = require('./chatPlatformAdapter');
const { BotFrameworkAdapter, CardFactory } = require('botbuilder');

/**
 * Microsoft Teams Integration
 * Implements ChatPlatformAdapter for Teams
 */
class TeamsAdapter extends ChatPlatformAdapter {
  constructor(config) {
    super(config);
    this.adapter = new BotFrameworkAdapter({
      appId: config.botAppId,
      appPassword: config.botSecret
    });
    this.tenantId = config.tenantId;
    this.teamIds = config.teamIds || [];
    this.channelIds = config.channelIds || [];
  }

  /**
   * Send message to Teams channel
   */
  async sendMessage({ channelId, text, blocks, threadId }) {
    try {
      await this.adapter.continueConversation({
        channelId: 'msteams',
        serviceUrl: 'https://smba.trafficmanager.net/teams/',
        conversation: { id: channelId }
      }, async (context) => {
        const adaptiveCard = blocks ? this.convertBlocksToAdaptiveCard(blocks) : null;

        await context.sendActivity({
          type: 'message',
          text: text,
          attachments: adaptiveCard ? [CardFactory.adaptiveCard(adaptiveCard)] : undefined,
          replyToId: threadId
        });
      });

      return {
        success: true,
        channelId: channelId
      };
    } catch (error) {
      console.error('Teams sendMessage error:', error);
      throw error;
    }
  }

  /**
   * Send direct message (Teams)
   */
  async sendDirectMessage({ userId, text }) {
    try {
      await this.adapter.createConversation({
        bot: { id: this.adapter.settings.appId },
        members: [{ id: userId }],
        channelData: { tenant: { id: this.tenantId } }
      }, async (context) => {
        await context.sendActivity(text);
      });

      return { success: true };
    } catch (error) {
      console.error('Teams sendDirectMessage error:', error);
      throw error;
    }
  }

  /**
   * Get Teams channel history
   * Note: Requires Microsoft Graph API
   */
  async getChannelHistory({ channelId, since, limit = 100 }) {
    console.warn('Teams getChannelHistory not fully implemented - requires Graph API');
    return [];
  }

  /**
   * Get Teams user info
   * Note: Requires Microsoft Graph API
   */
  async getUserInfo({ userId }) {
    console.warn('Teams getUserInfo not fully implemented - requires Graph API');
    return {
      id: userId,
      name: 'Unknown',
      email: null
    };
  }

  /**
   * Test Teams connection
   */
  async testConnection() {
    try {
      return {
        success: true,
        botAppId: this.adapter.settings.appId
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Convert Slack blocks to Adaptive Cards
   */
  convertBlocksToAdaptiveCard(blocks) {
    const card = {
      type: 'AdaptiveCard',
      version: '1.4',
      body: []
    };

    blocks.forEach(block => {
      if (block.type === 'header') {
        card.body.push({
          type: 'TextBlock',
          text: block.text.text,
          size: 'large',
          weight: 'bolder'
        });
      } else if (block.type === 'section') {
        if (block.text) {
          card.body.push({
            type: 'TextBlock',
            text: block.text.text,
            wrap: true
          });
        }
        if (block.fields) {
          block.fields.forEach(field => {
            card.body.push({
              type: 'TextBlock',
              text: field.text,
              wrap: true
            });
          });
        }
      }
    });

    return card;
  }

  /**
   * Format detection message for Teams
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
              text: `**Type:** ${detection.type}`
            },
            {
              type: 'mrkdwn',
              text: `**Confidence:** ${Math.round(detection.confidence * 100)}%`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `**${detection.title}**\n${detection.description || ''}`
          }
        }
      ]
    };
  }
}

module.exports = TeamsAdapter;
