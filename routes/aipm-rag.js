const express = require('express');
const router = express.Router();
const multer = require('multer');
const { pool } = require('../db');
const { extractTextFromFile } = require('../services/file-processor');

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// GET /api/aipm/projects/:projectId/rag/search
// Full-text search with relevance ranking
router.get('/aipm/projects/:projectId/rag/search', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { q, limit = 10, source_type } = req.query;

    if (!q || q.trim() === '') {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    // Build query with full-text search
    let query = `
      SELECT
        id,
        title,
        source_type,
        source_id,
        ts_headline('english', content, plainto_tsquery('english', $1),
          'MaxWords=50, MinWords=25, HighlightAll=false') as snippet,
        ts_rank(content_tsv, plainto_tsquery('english', $1)) as relevance,
        meta,
        created_at
      FROM rag_documents
      WHERE project_id = $2
        AND content_tsv @@ plainto_tsquery('english', $1)
    `;

    const params = [q, projectId];

    // Optional filter by source type
    if (source_type) {
      params.push(source_type);
      query += ` AND source_type = $${params.length}`;
    }

    query += ` ORDER BY relevance DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      query: q,
      count: result.rows.length,
      results: result.rows.map(row => ({
        id: row.id,
        title: row.title,
        sourceType: row.source_type,
        sourceId: row.source_id,
        snippet: row.snippet,
        relevance: parseFloat(row.relevance),
        meta: row.meta,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    console.error('Error searching RAG:', error);
    res.status(500).json({ error: 'Failed to search RAG documents' });
  }
});

// POST /api/aipm/projects/:projectId/rag/docs
// Manual document upload for indexing
router.post('/aipm/projects/:projectId/rag/docs',
  upload.single('file'),
  async (req, res) => {
    try {
      // Ensure user is authenticated
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { projectId } = req.params;
      const { title, source_type = 'uploaded_doc' } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Extract text from file (supports PDF, DOCX, TXT)
      const content = await extractTextFromFile(file.path, file.mimetype);

      // Create RAG document
      const result = await pool.query(`
        INSERT INTO rag_documents (project_id, source_type, title, content, meta)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, project_id, source_type, source_id, title, meta, created_at, updated_at
      `, [
        projectId,
        source_type,
        title || file.originalname,
        content,
        JSON.stringify({
          filename: file.originalname,
          mime_type: file.mimetype,
          file_size: file.size,
          uploaded_by: req.user.id
        })
      ]);

      res.status(201).json({
        id: result.rows[0].id,
        projectId: result.rows[0].project_id,
        sourceType: result.rows[0].source_type,
        sourceId: result.rows[0].source_id,
        title: result.rows[0].title,
        meta: result.rows[0].meta,
        createdAt: result.rows[0].created_at,
        updatedAt: result.rows[0].updated_at
      });
    } catch (error) {
      console.error('Error uploading RAG document:', error);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  }
);

// GET /api/aipm/rag/context
// Retrieve context for LLM prompts (used by agents in Story 5.2+)
router.get('/aipm/rag/context', async (req, res) => {
  try {
    const { project_id, query, max_tokens = 3000 } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'Query parameter required' });
    }

    if (!project_id) {
      return res.status(400).json({ error: 'project_id parameter required' });
    }

    // Search RAG documents
    const searchResults = await pool.query(`
      SELECT
        id,
        title,
        content,
        source_type,
        source_id,
        meta,
        ts_rank(content_tsv, plainto_tsquery('english', $1)) as relevance
      FROM rag_documents
      WHERE project_id = $2
        AND content_tsv @@ plainto_tsquery('english', $1)
      ORDER BY relevance DESC
      LIMIT 20
    `, [query, project_id]);

    // Assemble context (truncate to max_tokens)
    let context = '';
    const sources = [];
    let tokenCount = 0;

    for (const doc of searchResults.rows) {
      // Rough token estimation: ~4 chars per token
      const docTokens = Math.ceil(doc.content.length / 4);

      if (tokenCount + docTokens > max_tokens) break;

      context += `\n\n--- Source: ${doc.title} (${doc.source_type}) ---\n`;
      context += doc.content;

      sources.push({
        id: doc.id,
        title: doc.title,
        sourceType: doc.source_type,
        sourceId: doc.source_id,
        relevance: parseFloat(doc.relevance)
      });

      tokenCount += docTokens;
    }

    res.json({
      context,
      sources,
      estimatedTokens: tokenCount
    });
  } catch (error) {
    console.error('Error retrieving RAG context:', error);
    res.status(500).json({ error: 'Failed to retrieve context' });
  }
});

module.exports = router;
