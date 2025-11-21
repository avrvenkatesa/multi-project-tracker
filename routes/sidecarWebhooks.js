const express = require('express');
const router = express.Router();
const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.post('/slack', async (req, res) => {
  try {
    const { type, challenge, event } = req.body;

    if (type === 'url_verification') {
      return res.json({ challenge });
    }

    if (type === 'event_callback' && event) {
      res.status(200).send('OK');

      setImmediate(async () => {
        try {
          if (event.type === 'message' && !event.bot_id) {
            await handleSlackMessage(event);
          }
        } catch (error) {
          console.error('[Slack Webhook] Processing error:', error);
        }
      });
    } else {
      res.status(200).send('OK');
    }
  } catch (error) {
    console.error('[Slack Webhook] Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handleSlackMessage(event) {
  const { channel, text, user, thread_ts } = event;

  console.log(`[Slack] Message in channel ${channel}: ${text}`);

  const projectResult = await pool.query(`
    SELECT project_id FROM sidecar_config
    WHERE slack_enabled = true
      AND enabled = true
      AND $1 = ANY(slack_channels)
  `, [channel]);

  if (projectResult.rows.length === 0) {
    console.log('[Slack] No project found for this channel');
    return;
  }

  const projectId = projectResult.rows[0].project_id;

  try {
    const sidecarBot = require('../services/sidecarBot');
    const analysis = await sidecarBot.analyzeContent({
      projectId,
      content: text,
      source: {
        type: 'slack_message',
        channelId: channel,
        userId: user,
        threadId: thread_ts
      }
    });

    if (analysis.detectedEntities && analysis.detectedEntities.length > 0) {
      const SlackAdapter = require('../services/slackIntegration');
      const config = await pool.query(
        'SELECT * FROM sidecar_config WHERE project_id = $1',
        [projectId]
      );

      if (config.rows[0].slack_auto_reply) {
        const slackClient = new SlackAdapter({
          botToken: config.rows[0].slack_bot_token
        });

        for (const entity of analysis.detectedEntities) {
          const message = slackClient.formatDetectionMessage({
            ...entity,
            url: `${process.env.BASE_URL}/projects/${projectId}`
          });

          await slackClient.sendMessage({
            channelId: channel,
            ...message,
            threadId: thread_ts
          });
        }
      }
    }
  } catch (error) {
    console.warn('[Slack] Analysis skipped:', error.message);
  }
}

router.post('/teams', async (req, res) => {
  try {
    const { type, channelId, from, text, conversation } = req.body;

    res.status(200).send('OK');

    if (type === 'message' && text && !from.isBot) {
      setImmediate(async () => {
        try {
          await handleTeamsMessage({
            channelId: conversation.id,
            text,
            userId: from.id
          });
        } catch (error) {
          console.error('[Teams Webhook] Processing error:', error);
        }
      });
    }
  } catch (error) {
    console.error('[Teams Webhook] Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handleTeamsMessage(event) {
  const { channelId, text, userId } = event;

  console.log(`[Teams] Message in channel ${channelId}: ${text}`);

  const projectResult = await pool.query(`
    SELECT project_id FROM sidecar_config
    WHERE teams_enabled = true
      AND enabled = true
      AND $1 = ANY(teams_channel_ids)
  `, [channelId]);

  if (projectResult.rows.length === 0) {
    console.log('[Teams] No project found for this channel');
    return;
  }

  const projectId = projectResult.rows[0].project_id;

  try {
    const sidecarBot = require('../services/sidecarBot');
    await sidecarBot.analyzeContent({
      projectId,
      content: text,
      source: {
        type: 'teams_message',
        channelId,
        userId
      }
    });
  } catch (error) {
    console.warn('[Teams] Analysis skipped:', error.message);
  }
}

router.post('/github', async (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    const { action, comment, issue, pull_request, repository } = req.body;

    res.status(200).send('OK');

    if ((event === 'issue_comment' || event === 'pull_request_review_comment') && action === 'created') {
      setImmediate(async () => {
        try {
          await handleGitHubComment({
            repo: repository.full_name,
            commentBody: comment.body,
            commentAuthor: comment.user.login,
            issueNumber: issue?.number || pull_request?.number,
            type: event
          });
        } catch (error) {
          console.error('[GitHub Webhook] Processing error:', error);
        }
      });
    }
  } catch (error) {
    console.error('[GitHub Webhook] Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handleGitHubComment(event) {
  const { repo, commentBody, commentAuthor, issueNumber, type } = event;

  console.log(`[GitHub] Comment on ${repo}#${issueNumber}: ${commentBody}`);

  const projectResult = await pool.query(`
    SELECT project_id FROM sidecar_config
    WHERE github_enabled = true
      AND enabled = true
      AND $1 = ANY(github_repos)
  `, [repo]);

  if (projectResult.rows.length === 0) {
    console.log('[GitHub] No project found for this repo');
    return;
  }

  const projectId = projectResult.rows[0].project_id;

  try {
    const sidecarBot = require('../services/sidecarBot');
    await sidecarBot.analyzeContent({
      projectId,
      content: commentBody,
      source: {
        type: 'github_comment',
        repo,
        issueNumber,
        author: commentAuthor
      }
    });
  } catch (error) {
    console.warn('[GitHub] Analysis skipped:', error.message);
  }
}

router.post('/email/sendgrid', async (req, res) => {
  try {
    const { from, to, subject, text, html } = req.body;

    res.status(200).send('OK');

    setImmediate(async () => {
      try {
        const emailProcessor = require('../services/emailProcessor');
        await emailProcessor.processIncomingEmail({
          from,
          to,
          subject,
          text,
          html,
          attachments: req.files,
          headers: req.body.headers ? JSON.parse(req.body.headers) : {}
        });
      } catch (error) {
        console.error('[Email Webhook] Processing error:', error);
      }
    });
  } catch (error) {
    console.error('[Email Webhook] Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.post('/email/mailgun', async (req, res) => {
  try {
    const { sender, recipient, subject, 'body-plain': text, 'body-html': html } = req.body;

    res.status(200).send('OK');

    setImmediate(async () => {
      try {
        const emailProcessor = require('../services/emailProcessor');
        await emailProcessor.processIncomingEmail({
          from: sender,
          to: recipient,
          subject,
          text,
          html,
          attachments: req.files
        });
      } catch (error) {
        console.error('[Email Webhook Mailgun] Processing error:', error);
      }
    });
  } catch (error) {
    console.error('[Email Webhook Mailgun] Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
