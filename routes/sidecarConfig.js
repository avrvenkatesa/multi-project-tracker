const express = require('express');
const router = express.Router();
const { Pool } = require('@neondatabase/serverless');
const { authenticateToken } = require('../middleware/auth');
const emailProcessor = require('../services/emailProcessor');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/projects/:projectId/sidecar/config', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    const result = await pool.query(
      'SELECT * FROM sidecar_config WHERE project_id = $1',
      [projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Sidecar config not found for this project' });
    }

    const config = result.rows[0];
    delete config.slack_bot_token;
    delete config.teams_bot_secret;
    delete config.github_webhook_secret;
    delete config.email_imap_password;
    delete config.transcription_api_key;

    res.json({
      success: true,
      config: config
    });
  } catch (error) {
    console.error('Get Sidecar config error:', error);
    res.status(500).json({ error: 'Failed to fetch config', details: error.message });
  }
});

router.put('/projects/:projectId/sidecar/config', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const config = req.body;

    const userRole = await pool.query(`
      SELECT r.authority_level
      FROM user_role_assignments ur
      JOIN custom_roles r ON ur.role_id = r.id
      WHERE ur.user_id = $1 AND ur.project_id = $2
      ORDER BY r.authority_level DESC
      LIMIT 1
    `, [req.user.id, projectId]);

    if (userRole.rows.length === 0 || userRole.rows[0].authority_level < 4) {
      return res.status(403).json({ error: 'Only managers and admins can configure Sidecar' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = [
      'enabled', 'active_chat_platform',
      'slack_enabled', 'slack_workspace_id', 'slack_bot_token', 'slack_channels', 'slack_webhook_url', 'slack_auto_reply',
      'teams_enabled', 'teams_tenant_id', 'teams_bot_app_id', 'teams_bot_secret', 'teams_team_ids', 'teams_channel_ids',
      'github_enabled', 'github_repos', 'github_webhook_secret',
      'email_integration_mode', 'email_dedicated_address', 'email_forwarding_enabled',
      'email_imap_enabled', 'email_imap_host', 'email_imap_port', 'email_imap_username', 'email_imap_password', 'email_imap_folder',
      'email_filter_rules', 'email_process_internal', 'email_process_external', 'email_ignore_domains',
      'meeting_activation_mode', 'meeting_auto_start_teams', 'meeting_auto_start_zoom', 'meeting_require_confirmation',
      'meeting_announce_presence', 'meeting_smart_filters',
      'transcription_provider', 'transcription_api_key',
      'auto_create_threshold', 'detection_types',
      'notify_chat_platform', 'notify_email', 'email_digest_frequency', 'notification_channel_id',
      'data_retention_days', 'auto_redact_pii', 'require_meeting_consent'
    ];

    for (const field of allowedFields) {
      if (config[field] !== undefined) {
        updates.push(`${field} = $${paramCount}`);
        values.push(config[field]);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(projectId);

    const query = `
      UPDATE sidecar_config
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE project_id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    if (config.email_imap_enabled) {
      await emailProcessor.startIMAPPoller(parseInt(projectId));
    } else {
      emailProcessor.stopIMAPPoller(parseInt(projectId));
    }

    const updatedConfig = result.rows[0];
    delete updatedConfig.slack_bot_token;
    delete updatedConfig.teams_bot_secret;
    delete updatedConfig.github_webhook_secret;
    delete updatedConfig.email_imap_password;
    delete updatedConfig.transcription_api_key;

    res.json({
      success: true,
      config: updatedConfig
    });
  } catch (error) {
    console.error('Update Sidecar config error:', error);
    res.status(500).json({ error: 'Failed to update config', details: error.message });
  }
});

router.post('/projects/:projectId/sidecar/test-connection', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { platform } = req.body;

    if (!platform) {
      return res.status(400).json({ error: 'Platform is required' });
    }

    const { ChatPlatformFactory } = require('../services/chatPlatformAdapter');

    if (platform === 'slack' || platform === 'teams') {
      const adapter = await ChatPlatformFactory.create(parseInt(projectId));

      let testResult;
      if (platform === 'slack' && adapter.slack) {
        testResult = await adapter.slack.testConnection();
      } else if (platform === 'teams' && adapter.teams) {
        testResult = await adapter.teams.testConnection();
      } else if (adapter.testConnection) {
        testResult = await adapter.testConnection();
      }

      res.json({
        success: testResult.success,
        ...testResult
      });
    } else if (platform === 'email') {
      res.json({
        success: true,
        message: 'Email test not yet implemented'
      });
    } else {
      res.status(400).json({ error: 'Invalid platform' });
    }
  } catch (error) {
    console.error('Test connection error:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

router.post('/projects/:projectId/sidecar/enable', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    await pool.query(
      'UPDATE sidecar_config SET enabled = true, updated_at = NOW() WHERE project_id = $1',
      [projectId]
    );

    res.json({
      success: true,
      message: 'Sidecar enabled successfully'
    });
  } catch (error) {
    console.error('Enable Sidecar error:', error);
    res.status(500).json({ error: 'Failed to enable Sidecar', details: error.message });
  }
});

router.post('/projects/:projectId/sidecar/disable', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    await pool.query(
      'UPDATE sidecar_config SET enabled = false, updated_at = NOW() WHERE project_id = $1',
      [projectId]
    );

    emailProcessor.stopIMAPPoller(parseInt(projectId));

    res.json({
      success: true,
      message: 'Sidecar disabled successfully'
    });
  } catch (error) {
    console.error('Disable Sidecar error:', error);
    res.status(500).json({ error: 'Failed to disable Sidecar', details: error.message });
  }
});

module.exports = router;
