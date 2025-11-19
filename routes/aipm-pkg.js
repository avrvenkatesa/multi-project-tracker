const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/aipm/projects/:projectId/pkg
// Get all PKG nodes and edges for a project
router.get('/aipm/projects/:projectId/pkg', async (req, res) => {
  try {
    const { projectId } = req.params;

    // Get all nodes for project
    const nodesResult = await pool.query(`
      SELECT 
        id,
        type,
        source_table,
        source_id,
        attrs,
        created_by_ai,
        ai_confidence,
        created_at,
        updated_at
      FROM pkg_nodes
      WHERE project_id = $1
      ORDER BY created_at DESC
    `, [projectId]);

    // Get all edges for project
    const edgesResult = await pool.query(`
      SELECT 
        id,
        type,
        from_node_id,
        to_node_id,
        attrs,
        evidence_quote,
        ai_confidence,
        created_at
      FROM pkg_edges
      WHERE project_id = $1
      ORDER BY created_at DESC
    `, [projectId]);

    res.json({
      nodes: nodesResult.rows.map(row => ({
        id: row.id,
        type: row.type,
        sourceTable: row.source_table,
        sourceId: row.source_id,
        attrs: row.attrs,
        createdByAi: row.created_by_ai,
        aiConfidence: row.ai_confidence,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      })),
      edges: edgesResult.rows.map(row => ({
        id: row.id,
        type: row.type,
        fromNodeId: row.from_node_id,
        toNodeId: row.to_node_id,
        attrs: row.attrs,
        evidenceQuote: row.evidence_quote,
        aiConfidence: row.ai_confidence,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching PKG data:', error);
    res.status(500).json({ error: 'Failed to fetch PKG data' });
  }
});

// GET /api/aipm/pkg/query
// Query PKG nodes with filters
router.get('/aipm/pkg/query', async (req, res) => {
  try {
    const { project_id, type, attr_filter, limit = 100 } = req.query;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id parameter required' });
    }

    let query = `
      SELECT 
        id,
        type,
        source_table,
        source_id,
        attrs,
        created_by_ai,
        ai_confidence,
        created_at,
        updated_at
      FROM pkg_nodes
      WHERE project_id = $1
    `;

    const params = [project_id];
    let paramCount = 1;

    // Filter by type
    if (type) {
      paramCount++;
      query += ` AND type = $${paramCount}`;
      params.push(type);
    }

    // Filter by JSONB attrs
    if (attr_filter) {
      try {
        const filterObj = JSON.parse(attr_filter);
        Object.keys(filterObj).forEach(key => {
          paramCount++;
          query += ` AND attrs->>'${key}' = $${paramCount}`;
          params.push(filterObj[key]);
        });
      } catch (error) {
        return res.status(400).json({ error: 'Invalid attr_filter JSON' });
      }
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      nodes: result.rows.map(row => ({
        id: row.id,
        type: row.type,
        sourceTable: row.source_table,
        sourceId: row.source_id,
        attrs: row.attrs,
        createdByAi: row.created_by_ai,
        aiConfidence: row.ai_confidence,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (error) {
    console.error('Error querying PKG:', error);
    res.status(500).json({ error: 'Failed to query PKG nodes' });
  }
});

module.exports = router;
