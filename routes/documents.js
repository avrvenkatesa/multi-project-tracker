const express = require('express');
const router = express.Router();
const { pool } = require('../db');

/**
 * Helper function to check project access
 */
async function checkProjectAccess(userId, projectId, userRole) {
  if (userRole === 'admin') return true;
  
  const result = await pool.query(`
    SELECT 1 FROM project_members
    WHERE project_id = $1 AND user_id = $2 AND status = 'active'
  `, [projectId, userId]);
  
  return result.rows.length > 0;
}

/**
 * GET /api/projects/:projectId/documents
 * List documents with filtering, pagination, and lazy loading
 * ENHANCED: Only sends preview (first 200 chars) for performance
 */
router.get('/projects/:projectId/documents', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { 
      source_type, 
      uploaded_by, 
      start_date, 
      end_date, 
      search,
      limit = 50,
      offset = 0
    } = req.query;

    // SECURITY: Validate pagination parameters to prevent abuse
    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);  // 1-100 range
    const safeOffset = Math.max(parseInt(offset) || 0, 0);  // Non-negative

    // Verify project access
    const hasAccess = await checkProjectAccess(req.user.id, projectId, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // FIXED: Build WHERE clause separately for both queries
    let whereClause = 'WHERE r.project_id = $1';
    const params = [projectId];
    let paramIndex = 2;

    // Apply filters
    if (source_type) {
      whereClause += ` AND r.source_type = $${paramIndex}`;
      params.push(source_type);
      paramIndex++;
    }

    if (uploaded_by) {
      whereClause += ` AND r.uploaded_by = $${paramIndex}`;
      params.push(uploaded_by);
      paramIndex++;
    }

    if (start_date) {
      whereClause += ` AND r.created_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereClause += ` AND r.created_at <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND r.content_tsv @@ plainto_tsquery('english', $${paramIndex})`;
      params.push(search);
      paramIndex++;
    }

    // FIXED: Separate COUNT query with identical filters (no regex replacement)
    const countQuery = `
      SELECT COUNT(*) 
      FROM rag_documents r
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Build main query with same WHERE clause
    const query = `
      SELECT
        r.id,
        r.title,
        r.source_type,
        r.source_id,
        r.word_count,
        r.original_filename,
        r.created_at,
        r.meta,
        LEFT(r.content, 200) as preview,
        u.id as uploader_id,
        u.username as uploader_name
      FROM rag_documents r
      LEFT JOIN users u ON r.uploaded_by = u.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(safeLimit, safeOffset);

    const result = await pool.query(query, params);

    // Format response
    const documents = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      sourceType: row.source_type,
      sourceId: row.source_id,
      wordCount: row.word_count,
      preview: row.preview,
      uploadedBy: {
        id: row.uploader_id,
        name: row.uploader_name
      },
      createdAt: row.created_at,
      meta: row.meta,
      linkedEntities: row.meta?.created_entities || {}
    }));

    res.json({
      documents,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Error listing documents:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
});

/**
 * GET /api/documents/:docId
 * Get full document details (including complete content)
 */
router.get('/documents/:docId', async (req, res) => {
  const { docId } = req.params;

  try {
    const result = await pool.query(`
      SELECT
        r.id,
        r.project_id,
        r.title,
        r.source_type,
        r.content,
        r.word_count,
        r.original_filename,
        r.created_at,
        r.meta,
        u.id as uploader_id,
        u.username as uploader_name,
        u.email as uploader_email
      FROM rag_documents r
      LEFT JOIN users u ON r.uploaded_by = u.id
      WHERE r.id = $1
    `, [docId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Verify project access
    const hasAccess = await checkProjectAccess(req.user.id, doc.project_id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      id: doc.id,
      projectId: doc.project_id,
      title: doc.title,
      sourceType: doc.source_type,
      content: doc.content,
      wordCount: doc.word_count,
      originalFilename: doc.original_filename,
      uploadedBy: {
        id: doc.uploader_id,
        name: doc.uploader_name,
        email: doc.uploader_email
      },
      createdAt: doc.created_at,
      meta: doc.meta,
      linkedEntities: doc.meta?.created_entities || {}
    });

  } catch (error) {
    console.error('Error getting document:', error);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

/**
 * GET /api/documents/:docId/download
 * Download document as text file
 */
router.get('/documents/:docId/download', async (req, res) => {
  const { docId } = req.params;

  try {
    const result = await pool.query(`
      SELECT r.*, p.id as project_id
      FROM rag_documents r
      LEFT JOIN projects p ON r.project_id = p.id
      WHERE r.id = $1
    `, [docId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Verify project access
    const hasAccess = await checkProjectAccess(req.user.id, doc.project_id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Set headers for file download
    const filename = doc.original_filename || `document-${docId}.txt`;
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(doc.content);

  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

/**
 * DELETE /api/documents/:docId
 * Delete document with cascade (removes evidence records)
 * FIXED: Proper transaction and cascade delete
 */
router.delete('/documents/:docId', async (req, res) => {
  const { docId } = req.params;

  try {
    // Get document details first
    const docResult = await pool.query(`
      SELECT r.*, 
        (SELECT COUNT(*) FROM evidence WHERE source_type = 'rag_documents' AND source_id = $1::text) as evidence_count
      FROM rag_documents r
      WHERE r.id = $1
    `, [docId]);

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = docResult.rows[0];

    // Check permissions
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && doc.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own documents' });
    }

    // FIXED: Transaction with cascade delete
    await pool.query('BEGIN');

    // Delete evidence records first
    await pool.query(`
      DELETE FROM evidence
      WHERE source_type = 'rag_documents' AND source_id = $1::text
    `, [docId]);

    // Delete document
    await pool.query('DELETE FROM rag_documents WHERE id = $1', [docId]);

    await pool.query('COMMIT');

    res.json({
      success: true,
      message: 'Document deleted successfully',
      deletedEvidenceCount: parseInt(doc.evidence_count),
      linkedEntities: doc.meta?.created_entities || {}
    });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
