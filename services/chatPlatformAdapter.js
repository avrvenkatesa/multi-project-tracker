/**
 * Chat Platform Adapter
 * Abstract base class for chat platform integrations (Slack, Teams)
 */
class ChatPlatformAdapter {
  constructor(config) {
    this.config = config;
  }

  /**
   * Send message to channel
   * @param {Object} params - { channelId, text, blocks, threadId }
   */
  async sendMessage({ channelId, text, blocks, threadId }) {
    throw new Error('sendMessage() must be implemented by subclass');
  }

  /**
   * Send direct message to user
   * @param {Object} params - { userId, text }
   */
  async sendDirectMessage({ userId, text }) {
    throw new Error('sendDirectMessage() must be implemented by subclass');
  }

  /**
   * Get channel history
   * @param {Object} params - { channelId, since, limit }
   */
  async getChannelHistory({ channelId, since, limit = 100 }) {
    throw new Error('getChannelHistory() must be implemented by subclass');
  }

  /**
   * Get user info
   * @param {Object} params - { userId }
   */
  async getUserInfo({ userId }) {
    throw new Error('getUserInfo() must be implemented by subclass');
  }

  /**
   * Test connection
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by subclass');
  }

  /**
   * Format message for platform
   * Converts generic message format to platform-specific format
   */
  formatMessage(message) {
    return { text: message.text };
  }
}

/**
 * Chat Platform Factory
 * Creates appropriate adapter based on configuration
 */
class ChatPlatformFactory {
  static async create(projectId) {
    const pool = require('../config/database');

    const result = await pool.query(`
      SELECT * FROM sidecar_config WHERE project_id = $1
    `, [projectId]);

    if (result.rows.length === 0) {
      throw new Error('Sidecar not configured for this project');
    }

    const config = result.rows[0];

    if (!config.enabled) {
      throw new Error('Sidecar is disabled for this project');
    }

    const adapters = {};

    if (config.slack_enabled && config.active_chat_platform !== 'teams') {
      const SlackAdapter = require('./slackIntegration');
      adapters.slack = new SlackAdapter({
        botToken: config.slack_bot_token,
        workspaceId: config.slack_workspace_id,
        channels: config.slack_channels
      });
    }

    if (config.teams_enabled && config.active_chat_platform !== 'slack') {
      const TeamsAdapter = require('./teamsIntegration');
      adapters.teams = new TeamsAdapter({
        tenantId: config.teams_tenant_id,
        botAppId: config.teams_bot_app_id,
        botSecret: config.teams_bot_secret,
        teamIds: config.teams_team_ids,
        channelIds: config.teams_channel_ids
      });
    }

    if (config.active_chat_platform === 'both') {
      return adapters;
    } else if (config.active_chat_platform === 'slack' && adapters.slack) {
      return adapters.slack;
    } else if (config.active_chat_platform === 'teams' && adapters.teams) {
      return adapters.teams;
    }

    throw new Error('No active chat platform configured');
  }
}

module.exports = { ChatPlatformAdapter, ChatPlatformFactory };
