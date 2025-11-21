const { Pool } = require('@neondatabase/serverless');
const { simpleParser } = require('mailparser');
const Imap = require('imap');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Email Processor Service
 * Handles email integration in 3 modes:
 * 1. Dedicated address (webhook)
 * 2. Forwarding rules (webhook)
 * 3. IMAP polling (scheduled)
 */
class EmailProcessor {
  constructor() {
    this.activePollers = new Map();
  }

  /**
   * Process incoming email from webhook (SendGrid, Mailgun)
   */
  async processIncomingEmail({ from, to, subject, html, text, attachments, headers, projectId }) {
    try {
      console.log(`[Email Processor] Processing email: ${subject} from ${from}`);

      if (!projectId) {
        projectId = await this.extractProjectFromEmail(to);
      }

      if (!projectId) {
        console.warn(`[Email Processor] No project found for email to: ${to}`);
        return { success: false, reason: 'No project matched' };
      }

      const config = await this.getSidecarConfig(projectId);
      if (!config) {
        console.warn(`[Email Processor] No sidecar config for project ${projectId}`);
        return { success: false, reason: 'Sidecar not configured' };
      }

      if (!this.shouldProcessEmail(from, config)) {
        console.log(`[Email Processor] Email filtered out by rules`);
        return { success: false, reason: 'Filtered by rules' };
      }

      const emailContent = text || this.stripHtml(html);

      const metadata = {
        from: from,
        to: to,
        subject: subject,
        timestamp: headers?.date || new Date().toISOString(),
        messageId: headers?.['message-id'],
        inReplyTo: headers?.['in-reply-to']
      };

      let documentId = null;
      if (config.email_process_internal || config.email_process_external) {
        documentId = await this.storeEmailInRAG(projectId, emailContent, metadata, from);
      }

      const processedAttachments = [];
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          if (attachment.filename && this.isDocumentFile(attachment.filename)) {
            const attachmentId = await this.storeAttachment(projectId, attachment);
            processedAttachments.push(attachmentId);
          }
        }
      }

      let analysis = null;
      if (config.enabled) {
        try {
          const sidecarBot = require('./sidecarBot');
          analysis = await sidecarBot.analyzeContent({
            projectId,
            content: emailContent,
            source: {
              type: 'email',
              from: from,
              subject: subject,
              messageId: metadata.messageId
            }
          });
        } catch (error) {
          console.warn('[Email Processor] Sidecar bot analysis skipped:', error.message);
        }
      }

      console.log(`[Email Processor] Email processed successfully. Document ID: ${documentId}`);

      return {
        success: true,
        documentId,
        attachments: processedAttachments,
        analysis
      };

    } catch (error) {
      console.error('[Email Processor] Error:', error.message || 'Unknown error');
      throw new Error('Failed to process email');
    }
  }

  /**
   * Extract project from email address
   * Format: sidecar+{project_code}@domain.com
   */
  async extractProjectFromEmail(emailAddress) {
    const match = emailAddress.match(/sidecar\+([^@]+)@/i);
    if (match) {
      const projectCode = match[1];

      const result = await pool.query(
        'SELECT id FROM projects WHERE code = $1',
        [projectCode]
      );

      if (result.rows.length > 0) {
        return result.rows[0].id;
      }
    }

    const result = await pool.query(`
      SELECT project_id FROM sidecar_config
      WHERE email_dedicated_address = $1
    `, [emailAddress]);

    if (result.rows.length > 0) {
      return result.rows[0].project_id;
    }

    return null;
  }

  /**
   * Check if email should be processed based on filters
   */
  shouldProcessEmail(fromAddress, config) {
    if (!config) return true;

    if (config.email_ignore_domains && Array.isArray(config.email_ignore_domains) && config.email_ignore_domains.length > 0) {
      const domain = fromAddress.split('@')[1];
      if (config.email_ignore_domains.includes(domain)) {
        return false;
      }
    }

    const isInternal = this.isInternalEmail(fromAddress, config);

    if (isInternal && config.email_process_internal === false) {
      return false;
    }

    if (!isInternal && config.email_process_external === false) {
      return false;
    }

    return true;
  }

  /**
   * Check if email is from internal domain
   */
  isInternalEmail(emailAddress, config) {
    const domain = emailAddress.split('@')[1];

    if (config.email_imap_username) {
      const internalDomain = config.email_imap_username.split('@')[1];
      return domain === internalDomain;
    }

    return false;
  }

  /**
   * Store email in RAG documents
   */
  async storeEmailInRAG(projectId, content, metadata, fromEmail) {
    const result = await pool.query(`
      INSERT INTO rag_documents (
        project_id, source_type, source_id, title, content, meta
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      projectId,
      'email',
      metadata.messageId,
      `Email: ${metadata.subject}`,
      content,
      JSON.stringify({
        from: fromEmail,
        subject: metadata.subject,
        timestamp: metadata.timestamp,
        message_id: metadata.messageId,
        in_reply_to: metadata.inReplyTo
      })
    ]);

    return result.rows[0].id;
  }

  /**
   * Store email attachment
   */
  async storeAttachment(projectId, attachment) {
    const content = await this.extractTextFromFile(attachment);

    const result = await pool.query(`
      INSERT INTO rag_documents (
        project_id, source_type, title, content, original_filename, meta
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      projectId,
      'email_attachment',
      attachment.filename,
      content,
      attachment.filename,
      JSON.stringify({
        mime_type: attachment.contentType,
        size: attachment.size
      })
    ]);

    return result.rows[0].id;
  }

  /**
   * Extract text from file (PDF, DOCX, etc.)
   */
  async extractTextFromFile(attachment) {
    if (attachment.contentType === 'text/plain') {
      return attachment.content.toString();
    }

    return `[Binary file: ${attachment.filename}]`;
  }

  /**
   * Check if file is a document
   */
  isDocumentFile(filename) {
    const documentExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.xls'];
    return documentExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  }

  /**
   * Strip HTML tags
   */
  stripHtml(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Get Sidecar config for project
   */
  async getSidecarConfig(projectId) {
    const result = await pool.query(
      'SELECT * FROM sidecar_config WHERE project_id = $1',
      [projectId]
    );
    return result.rows[0] || null;
  }

  /**
   * Start IMAP poller for a project
   */
  async startIMAPPoller(projectId) {
    const config = await this.getSidecarConfig(projectId);

    if (!config.email_imap_enabled) {
      console.log(`[IMAP] IMAP not enabled for project ${projectId}`);
      return;
    }

    if (this.activePollers.has(projectId)) {
      console.log(`[IMAP] Poller already running for project ${projectId}`);
      return;
    }

    console.log(`[IMAP] Starting poller for project ${projectId}`);

    const imap = new Imap({
      user: config.email_imap_username,
      password: config.email_imap_password,
      host: config.email_imap_host,
      port: config.email_imap_port || 993,
      tls: config.email_imap_use_tls !== false,
      tlsOptions: { rejectUnauthorized: false }
    });

    imap.once('ready', () => {
      console.log(`[IMAP] Connected for project ${projectId}`);

      imap.openBox(config.email_imap_folder || 'INBOX', false, (err, box) => {
        if (err) {
          console.error('[IMAP] Error opening mailbox:', err.message || 'Unknown error');
          return;
        }

        const pollInterval = setInterval(() => {
          this.checkNewEmails(imap, projectId, config);
        }, 60000);

        this.activePollers.set(projectId, { imap, pollInterval });
      });
    });

    imap.once('error', (err) => {
      console.error(`[IMAP] Connection error for project ${projectId}:`, err.message || 'Unknown error');
      this.stopIMAPPoller(projectId);
    });

    imap.once('end', () => {
      console.log(`[IMAP] Connection ended for project ${projectId}`);
      this.stopIMAPPoller(projectId);
    });

    imap.connect();
  }

  /**
   * Check for new emails via IMAP
   */
  async checkNewEmails(imap, projectId, config) {
    try {
      imap.search(['UNSEEN'], async (err, results) => {
        if (err || !results || results.length === 0) return;

        console.log(`[IMAP] Found ${results.length} new emails for project ${projectId}`);

        const fetch = imap.fetch(results, { bodies: '', markSeen: true });

        fetch.on('message', (msg) => {
          msg.on('body', async (stream) => {
            try {
              const parsed = await simpleParser(stream);

              await this.processIncomingEmail({
                from: parsed.from.text,
                to: parsed.to.text,
                subject: parsed.subject,
                html: parsed.html,
                text: parsed.text,
                attachments: parsed.attachments,
                headers: parsed.headers,
                projectId: projectId
              });
            } catch (error) {
              console.error('[IMAP] Message processing error:', error.message || 'Unknown error');
            }
          });
        });

        fetch.once('error', (err) => {
          console.error('[IMAP] Fetch error:', err.message || 'Unknown error');
        });
      });
    } catch (error) {
      console.error('[IMAP] Check emails error:', error.message || 'Unknown error');
    }
  }

  /**
   * Stop IMAP poller for a project
   */
  stopIMAPPoller(projectId) {
    const poller = this.activePollers.get(projectId);
    if (poller) {
      clearInterval(poller.pollInterval);
      poller.imap.end();
      this.activePollers.delete(projectId);
      console.log(`[IMAP] Stopped poller for project ${projectId}`);
    }
  }

  /**
   * Stop all IMAP pollers
   */
  stopAllPollers() {
    for (const projectId of this.activePollers.keys()) {
      this.stopIMAPPoller(projectId);
    }
  }
}

module.exports = new EmailProcessor();
