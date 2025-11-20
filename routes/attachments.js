const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { pool } = require('../db');
const { extractTextFromFile } = require('../services/file-processor');
const { embedDocument } = require('../services/embeddingService');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = 'uploads/attachments';
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|docx|doc|txt|md|csv|xlsx|xls|pptx|ppt/i;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype.includes('pdf') || 
                     file.mimetype.includes('word') ||
                     file.mimetype.includes('text') ||
                     file.mimetype.includes('document') ||
                     file.mimetype.includes('spreadsheet') ||
                     file.mimetype.includes('presentation');
    
    if (extname || mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, TXT, MD, CSV, XLSX, PPTX files are allowed.'));
    }
  }
});

/**
 * POST /api/issues/:issueId/attachments
 * Upload attachment for an issue
 */
router.post('/issues/:issueId/attachments', upload.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { issueId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    await client.query('BEGIN');

    // Get issue details for project context
    const issueResult = await client.query(
      'SELECT id, project_id, title FROM issues WHERE id = $1',
      [issueId]
    );

    if (issueResult.rows.length === 0) {
      await client.query('ROLLBACK');
      await fs.unlink(file.path);
      return res.status(404).json({ error: 'Issue not found' });
    }

    const issue = issueResult.rows[0];

    // Extract text from file
    let extractedText = '';
    let processingError = null;
    
    try {
      extractedText = await extractTextFromFile(file.path, file.mimetype);
    } catch (error) {
      console.error('Error extracting text:', error);
      processingError = error.message;
    }

    // Insert attachment record
    const insertResult = await client.query(`
      INSERT INTO attachments (
        entity_type,
        entity_id,
        file_name,
        original_name,
        file_path,
        file_size,
        file_type,
        uploaded_by,
        is_processed,
        extracted_text,
        processing_error
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      'issue',
      issueId,
      file.filename,
      file.originalname,
      file.path,
      file.size,
      file.mimetype,
      req.user?.id || null,
      true,
      extractedText,
      processingError
    ]);

    const attachment = insertResult.rows[0];

    // If text was extracted successfully, index into RAG
    let ragDocumentId = null;
    if (extractedText && extractedText.trim().length > 0) {
      const docTitle = `📎 ${file.originalname}`;
      const ragResult = await client.query(`
        INSERT INTO rag_documents (
          project_id,
          source_type,
          source_id,
          title,
          content,
          word_count,
          original_filename,
          uploaded_by,
          meta
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        issue.project_id,
        'attachment',
        attachment.id,
        docTitle,
        extractedText,
        extractedText.split(/\s+/).length,
        file.originalname,
        req.user?.id || null,
        JSON.stringify({
          entity_type: 'issue',
          entity_id: issueId,
          entity_title: issue.title,
          file_type: file.mimetype,
          file_size: file.size,
          attachment_id: attachment.id
        })
      ]);
      ragDocumentId = ragResult.rows[0].id;
    }

    await client.query('COMMIT');

    // Generate embedding asynchronously after transaction commit (don't block response)
    if (ragDocumentId) {
      const docTitle = `📎 ${file.originalname}`;
      embedDocument(ragDocumentId, `${docTitle}\n\n${extractedText}`).catch(err => {
        console.error(`Failed to generate embedding for RAG document ${ragDocumentId}:`, err);
      });
    }

    res.json({
      id: attachment.id,
      file_name: attachment.file_name,
      original_name: attachment.original_name,
      file_size: attachment.file_size,
      file_type: attachment.file_type,
      uploaded_at: attachment.uploaded_at,
      is_indexed: !!extractedText
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error uploading attachment:', error);
    
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    res.status(500).json({ error: 'Failed to upload attachment' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/action-items/:actionItemId/attachments
 * Upload attachment for an action item
 */
router.post('/action-items/:actionItemId/attachments', upload.single('file'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { actionItemId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    await client.query('BEGIN');

    // Get action item details for project context
    const actionItemResult = await client.query(
      'SELECT id, project_id, title FROM action_items WHERE id = $1',
      [actionItemId]
    );

    if (actionItemResult.rows.length === 0) {
      await client.query('ROLLBACK');
      await fs.unlink(file.path);
      return res.status(404).json({ error: 'Action item not found' });
    }

    const actionItem = actionItemResult.rows[0];

    // Extract text from file
    let extractedText = '';
    let processingError = null;
    
    try {
      extractedText = await extractTextFromFile(file.path, file.mimetype);
    } catch (error) {
      console.error('Error extracting text:', error);
      processingError = error.message;
    }

    // Insert attachment record
    const insertResult = await client.query(`
      INSERT INTO attachments (
        entity_type,
        entity_id,
        file_name,
        original_name,
        file_path,
        file_size,
        file_type,
        uploaded_by,
        is_processed,
        extracted_text,
        processing_error
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      'action_item',
      actionItemId,
      file.filename,
      file.originalname,
      file.path,
      file.size,
      file.mimetype,
      req.user?.id || null,
      true,
      extractedText,
      processingError
    ]);

    const attachment = insertResult.rows[0];

    // If text was extracted successfully, index into RAG
    let ragDocumentId = null;
    if (extractedText && extractedText.trim().length > 0) {
      const docTitle = `📎 ${file.originalname}`;
      const ragResult = await client.query(`
        INSERT INTO rag_documents (
          project_id,
          source_type,
          source_id,
          title,
          content,
          word_count,
          original_filename,
          uploaded_by,
          meta
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        actionItem.project_id,
        'attachment',
        attachment.id,
        docTitle,
        extractedText,
        extractedText.split(/\s+/).length,
        file.originalname,
        req.user?.id || null,
        JSON.stringify({
          entity_type: 'action_item',
          entity_id: actionItemId,
          entity_title: actionItem.title,
          file_type: file.mimetype,
          file_size: file.size,
          attachment_id: attachment.id
        })
      ]);
      ragDocumentId = ragResult.rows[0].id;
    }

    await client.query('COMMIT');

    // Generate embedding asynchronously after transaction commit (don't block response)
    if (ragDocumentId) {
      const docTitle = `📎 ${file.originalname}`;
      embedDocument(ragDocumentId, `${docTitle}\n\n${extractedText}`).catch(err => {
        console.error(`Failed to generate embedding for RAG document ${ragDocumentId}:`, err);
      });
    }

    res.json({
      id: attachment.id,
      file_name: attachment.file_name,
      original_name: attachment.original_name,
      file_size: attachment.file_size,
      file_type: attachment.file_type,
      uploaded_at: attachment.uploaded_at,
      is_indexed: !!extractedText
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error uploading attachment:', error);
    
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }
    
    res.status(500).json({ error: 'Failed to upload attachment' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/issues/:issueId/attachments
 * Get all attachments for an issue
 */
router.get('/issues/:issueId/attachments', async (req, res) => {
  try {
    const { issueId } = req.params;

    const result = await pool.query(`
      SELECT
        id,
        file_name,
        original_name,
        file_size,
        file_type,
        uploaded_at,
        is_processed,
        processing_error
      FROM attachments
      WHERE entity_type = 'issue' AND entity_id = $1
      ORDER BY uploaded_at DESC
    `, [issueId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

/**
 * GET /api/action-items/:actionItemId/attachments
 * Get all attachments for an action item
 */
router.get('/action-items/:actionItemId/attachments', async (req, res) => {
  try {
    const { actionItemId } = req.params;

    const result = await pool.query(`
      SELECT
        id,
        file_name,
        original_name,
        file_size,
        file_type,
        uploaded_at,
        is_processed,
        processing_error
      FROM attachments
      WHERE entity_type = 'action_item' AND entity_id = $1
      ORDER BY uploaded_at DESC
    `, [actionItemId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

/**
 * GET /api/attachments/:attachmentId/download
 * Download an attachment
 */
router.get('/attachments/:attachmentId/download', async (req, res) => {
  try {
    const { attachmentId } = req.params;

    const result = await pool.query(`
      SELECT file_path, original_name, file_type
      FROM attachments
      WHERE id = $1
    `, [attachmentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const { file_path, original_name, file_type } = result.rows[0];

    res.download(file_path, original_name);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    res.status(500).json({ error: 'Failed to download attachment' });
  }
});

/**
 * DELETE /api/attachments/:attachmentId
 * Delete an attachment
 */
router.delete('/attachments/:attachmentId', async (req, res) => {
  const client = await pool.connect();
  try {
    const { attachmentId } = req.params;

    await client.query('BEGIN');

    // Get attachment details
    const attachmentResult = await client.query(
      'SELECT file_path FROM attachments WHERE id = $1',
      [attachmentId]
    );

    if (attachmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const { file_path } = attachmentResult.rows[0];

    // Delete from RAG documents
    await client.query(
      "DELETE FROM rag_documents WHERE source_type = 'attachment' AND source_id = $1",
      [attachmentId]
    );

    // Delete attachment record
    await client.query('DELETE FROM attachments WHERE id = $1', [attachmentId]);

    // Delete physical file
    try {
      await fs.unlink(file_path);
    } catch (error) {
      console.error('Error deleting file:', error);
    }

    await client.query('COMMIT');

    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  } finally {
    client.release();
  }
});

module.exports = router;
