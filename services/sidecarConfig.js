const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Sidecar Configuration Service
 * Manages project-level sidecar configuration for platform integrations
 */
class SidecarConfigService {
  /**
   * Get sidecar configuration for a project
   */
  async getConfig(projectId) {
    const result = await pool.query(`
      SELECT * FROM sidecar_config
      WHERE project_id = $1
    `, [projectId]);

    if (result.rows.length === 0) {
      return await this.createDefaultConfig(projectId);
    }

    return result.rows[0];
  }

  /**
   * Create default sidecar configuration
   */
  async createDefaultConfig(projectId) {
    const result = await pool.query(`
      INSERT INTO sidecar_config (project_id, enabled)
      VALUES ($1, false)
      ON CONFLICT (project_id) DO NOTHING
      RETURNING *
    `, [projectId]);

    if (result.rows.length === 0) {
      return await this.getConfig(projectId);
    }

    return result.rows[0];
  }

  /**
   * Update sidecar configuration
   */
  async updateConfig(projectId, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramCount++}`);
      values.push(updates.enabled);
    }

    if (updates.activeChatPlatform !== undefined) {
      fields.push(`active_chat_platform = $${paramCount++}`);
      values.push(updates.activeChatPlatform);
    }

    if (updates.slackEnabled !== undefined) {
      fields.push(`slack_enabled = $${paramCount++}`);
      values.push(updates.slackEnabled);
    }

    if (updates.slackWorkspaceId !== undefined) {
      fields.push(`slack_workspace_id = $${paramCount++}`);
      values.push(updates.slackWorkspaceId);
    }

    if (updates.slackBotToken !== undefined) {
      fields.push(`slack_bot_token = $${paramCount++}`);
      values.push(updates.slackBotToken);
    }

    if (updates.slackChannels !== undefined) {
      fields.push(`slack_channels = $${paramCount++}`);
      values.push(updates.slackChannels);
    }

    if (updates.slackWebhookUrl !== undefined) {
      fields.push(`slack_webhook_url = $${paramCount++}`);
      values.push(updates.slackWebhookUrl);
    }

    if (updates.slackAutoReply !== undefined) {
      fields.push(`slack_auto_reply = $${paramCount++}`);
      values.push(updates.slackAutoReply);
    }

    if (updates.teamsEnabled !== undefined) {
      fields.push(`teams_enabled = $${paramCount++}`);
      values.push(updates.teamsEnabled);
    }

    if (updates.teamsTenantId !== undefined) {
      fields.push(`teams_tenant_id = $${paramCount++}`);
      values.push(updates.teamsTenantId);
    }

    if (updates.teamsBotAppId !== undefined) {
      fields.push(`teams_bot_app_id = $${paramCount++}`);
      values.push(updates.teamsBotAppId);
    }

    if (updates.teamsBotSecret !== undefined) {
      fields.push(`teams_bot_secret = $${paramCount++}`);
      values.push(updates.teamsBotSecret);
    }

    if (updates.teamsTeamIds !== undefined) {
      fields.push(`teams_team_ids = $${paramCount++}`);
      values.push(updates.teamsTeamIds);
    }

    if (updates.teamsChannelIds !== undefined) {
      fields.push(`teams_channel_ids = $${paramCount++}`);
      values.push(updates.teamsChannelIds);
    }

    if (updates.githubEnabled !== undefined) {
      fields.push(`github_enabled = $${paramCount++}`);
      values.push(updates.githubEnabled);
    }

    if (updates.githubRepos !== undefined) {
      fields.push(`github_repos = $${paramCount++}`);
      values.push(updates.githubRepos);
    }

    if (updates.githubWebhookSecret !== undefined) {
      fields.push(`github_webhook_secret = $${paramCount++}`);
      values.push(updates.githubWebhookSecret);
    }

    if (updates.emailIntegrationMode !== undefined) {
      fields.push(`email_integration_mode = $${paramCount++}`);
      values.push(updates.emailIntegrationMode);
    }

    if (updates.emailDedicatedAddress !== undefined) {
      fields.push(`email_dedicated_address = $${paramCount++}`);
      values.push(updates.emailDedicatedAddress);
    }

    if (updates.emailForwardingEnabled !== undefined) {
      fields.push(`email_forwarding_enabled = $${paramCount++}`);
      values.push(updates.emailForwardingEnabled);
    }

    if (updates.emailImapEnabled !== undefined) {
      fields.push(`email_imap_enabled = $${paramCount++}`);
      values.push(updates.emailImapEnabled);
    }

    if (updates.emailImapHost !== undefined) {
      fields.push(`email_imap_host = $${paramCount++}`);
      values.push(updates.emailImapHost);
    }

    if (updates.emailImapPort !== undefined) {
      fields.push(`email_imap_port = $${paramCount++}`);
      values.push(updates.emailImapPort);
    }

    if (updates.emailImapUsername !== undefined) {
      fields.push(`email_imap_username = $${paramCount++}`);
      values.push(updates.emailImapUsername);
    }

    if (updates.emailImapPassword !== undefined) {
      fields.push(`email_imap_password = $${paramCount++}`);
      values.push(updates.emailImapPassword);
    }

    if (updates.emailImapFolder !== undefined) {
      fields.push(`email_imap_folder = $${paramCount++}`);
      values.push(updates.emailImapFolder);
    }

    if (updates.emailImapUseTls !== undefined) {
      fields.push(`email_imap_use_tls = $${paramCount++}`);
      values.push(updates.emailImapUseTls);
    }

    if (updates.emailFilterRules !== undefined) {
      fields.push(`email_filter_rules = $${paramCount++}`);
      values.push(updates.emailFilterRules);
    }

    if (updates.emailProcessInternal !== undefined) {
      fields.push(`email_process_internal = $${paramCount++}`);
      values.push(updates.emailProcessInternal);
    }

    if (updates.emailProcessExternal !== undefined) {
      fields.push(`email_process_external = $${paramCount++}`);
      values.push(updates.emailProcessExternal);
    }

    if (updates.emailIgnoreDomains !== undefined) {
      fields.push(`email_ignore_domains = $${paramCount++}`);
      values.push(updates.emailIgnoreDomains);
    }

    if (updates.meetingActivationMode !== undefined) {
      fields.push(`meeting_activation_mode = $${paramCount++}`);
      values.push(updates.meetingActivationMode);
    }

    if (updates.meetingAutoStartTeams !== undefined) {
      fields.push(`meeting_auto_start_teams = $${paramCount++}`);
      values.push(updates.meetingAutoStartTeams);
    }

    if (updates.meetingAutoStartZoom !== undefined) {
      fields.push(`meeting_auto_start_zoom = $${paramCount++}`);
      values.push(updates.meetingAutoStartZoom);
    }

    if (updates.meetingRequireConfirmation !== undefined) {
      fields.push(`meeting_require_confirmation = $${paramCount++}`);
      values.push(updates.meetingRequireConfirmation);
    }

    if (updates.meetingAnnouncePresence !== undefined) {
      fields.push(`meeting_announce_presence = $${paramCount++}`);
      values.push(updates.meetingAnnouncePresence);
    }

    if (updates.meetingSmartFilters !== undefined) {
      fields.push(`meeting_smart_filters = $${paramCount++}`);
      values.push(updates.meetingSmartFilters);
    }

    if (updates.transcriptionProvider !== undefined) {
      fields.push(`transcription_provider = $${paramCount++}`);
      values.push(updates.transcriptionProvider);
    }

    if (updates.transcriptionApiKey !== undefined) {
      fields.push(`transcription_api_key = $${paramCount++}`);
      values.push(updates.transcriptionApiKey);
    }

    if (updates.autoCreateThreshold !== undefined) {
      fields.push(`auto_create_threshold = $${paramCount++}`);
      values.push(updates.autoCreateThreshold);
    }

    if (updates.detectionTypes !== undefined) {
      fields.push(`detection_types = $${paramCount++}`);
      values.push(updates.detectionTypes);
    }

    if (updates.notifyChatPlatform !== undefined) {
      fields.push(`notify_chat_platform = $${paramCount++}`);
      values.push(updates.notifyChatPlatform);
    }

    if (updates.notifyEmail !== undefined) {
      fields.push(`notify_email = $${paramCount++}`);
      values.push(updates.notifyEmail);
    }

    if (updates.emailDigestFrequency !== undefined) {
      fields.push(`email_digest_frequency = $${paramCount++}`);
      values.push(updates.emailDigestFrequency);
    }

    if (updates.notificationChannelId !== undefined) {
      fields.push(`notification_channel_id = $${paramCount++}`);
      values.push(updates.notificationChannelId);
    }

    if (updates.dataRetentionDays !== undefined) {
      fields.push(`data_retention_days = $${paramCount++}`);
      values.push(updates.dataRetentionDays);
    }

    if (updates.autoRedactPii !== undefined) {
      fields.push(`auto_redact_pii = $${paramCount++}`);
      values.push(updates.autoRedactPii);
    }

    if (updates.requireMeetingConsent !== undefined) {
      fields.push(`require_meeting_consent = $${paramCount++}`);
      values.push(updates.requireMeetingConsent);
    }

    if (fields.length === 0) {
      return await this.getConfig(projectId);
    }

    fields.push(`updated_at = NOW()`);
    values.push(projectId);

    const result = await pool.query(`
      UPDATE sidecar_config
      SET ${fields.join(', ')}
      WHERE project_id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      throw new Error('Configuration not found');
    }

    return result.rows[0];
  }

  /**
   * Validate configuration before saving
   */
  validateConfig(updates) {
    const errors = [];

    if (updates.emailImapPort && (updates.emailImapPort < 1 || updates.emailImapPort > 65535)) {
      errors.push('IMAP port must be between 1 and 65535');
    }

    if (updates.autoCreateThreshold && (updates.autoCreateThreshold < 0 || updates.autoCreateThreshold > 1)) {
      errors.push('Auto-create threshold must be between 0 and 1');
    }

    if (updates.dataRetentionDays && updates.dataRetentionDays < 1) {
      errors.push('Data retention days must be at least 1');
    }

    const validChatPlatforms = ['slack', 'teams', 'both', 'none'];
    if (updates.activeChatPlatform && !validChatPlatforms.includes(updates.activeChatPlatform)) {
      errors.push(`Active chat platform must be one of: ${validChatPlatforms.join(', ')}`);
    }

    const validEmailModes = ['dedicated_address', 'forwarding_rules', 'imap_polling', 'all', 'none'];
    if (updates.emailIntegrationMode && !validEmailModes.includes(updates.emailIntegrationMode)) {
      errors.push(`Email integration mode must be one of: ${validEmailModes.join(', ')}`);
    }

    const validMeetingModes = ['always_on', 'manual', 'smart'];
    if (updates.meetingActivationMode && !validMeetingModes.includes(updates.meetingActivationMode)) {
      errors.push(`Meeting activation mode must be one of: ${validMeetingModes.join(', ')}`);
    }

    const validProviders = ['deepgram', 'assemblyai', 'azure_speech', 'aws_transcribe'];
    if (updates.transcriptionProvider && !validProviders.includes(updates.transcriptionProvider)) {
      errors.push(`Transcription provider must be one of: ${validProviders.join(', ')}`);
    }

    const validDigestFreq = ['realtime', 'daily', 'weekly', 'never'];
    if (updates.emailDigestFrequency && !validDigestFreq.includes(updates.emailDigestFrequency)) {
      errors.push(`Email digest frequency must be one of: ${validDigestFreq.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Test configuration (e.g., test Slack connection, IMAP connection)
   */
  async testConnection(projectId, connectionType) {
    const config = await this.getConfig(projectId);

    switch (connectionType) {
      case 'slack':
        return await this._testSlackConnection(config);
      case 'teams':
        return await this._testTeamsConnection(config);
      case 'imap':
        return await this._testImapConnection(config);
      default:
        throw new Error(`Unknown connection type: ${connectionType}`);
    }
  }

  async _testSlackConnection(config) {
    return {
      success: !!config.slack_bot_token,
      message: config.slack_bot_token ? 'Slack token configured' : 'Slack token not configured'
    };
  }

  async _testTeamsConnection(config) {
    return {
      success: !!(config.teams_bot_app_id && config.teams_bot_secret),
      message: (config.teams_bot_app_id && config.teams_bot_secret) ? 
        'Teams credentials configured' : 
        'Teams credentials not configured'
    };
  }

  async _testImapConnection(config) {
    return {
      success: !!(config.email_imap_host && config.email_imap_username && config.email_imap_password),
      message: (config.email_imap_host && config.email_imap_username && config.email_imap_password) ?
        'IMAP credentials configured' :
        'IMAP credentials incomplete'
    };
  }
}

module.exports = new SidecarConfigService();
