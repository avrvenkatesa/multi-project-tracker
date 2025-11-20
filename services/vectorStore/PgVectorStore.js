/**
 * PgVectorStore - PostgreSQL pgvector implementation of VectorStore interface
 * 
 * This implementation uses PostgreSQL with the pgvector extension for vector storage
 * and similarity search. Suitable for MVP and single-tenant deployments.
 * 
 * Features:
 * - HNSW indexing for fast vector similarity search
 * - Full-text search using PostgreSQL's tsvector/tsquery
 * - Hybrid search combining keyword + semantic search
 * - Project-level tenant isolation
 * 
 * Migration path: When scaling to multi-tenant SaaS, create WeaviateVectorStore
 * implementing the same interface.
 */

const OpenAI = require('openai');
const { pool } = require('../../db');
const IVectorStore = require('./IVectorStore');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class PgVectorStore extends IVectorStore {
  constructor() {
    super();
    this.embeddingModel = 'text-embedding-3-small';
    this.embeddingDimensions = 1536;
  }

  /**
   * Generate embedding vector for text using OpenAI API
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} - 1536-dimensional embedding vector
   */
  async generateEmbedding(text) {
    if (!text || text.trim() === '') {
      throw new Error('Text cannot be empty');
    }

    try {
      const response = await openai.embeddings.create({
        model: this.embeddingModel,
        input: text.slice(0, 8000), // Limit to ~8k chars to stay under token limit
        encoding_format: 'float'
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Upsert documents into PostgreSQL rag_documents table
   * Accepts optional precomputed embeddings to avoid redundant API calls
   * @param {DocInput[]} docs - Array of documents to upsert
   * @returns {Promise<void>}
   */
  async upsertDocuments(docs) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const doc of docs) {
        // Use provided embedding or generate new one
        let vectorString;
        if (doc.embedding) {
          // Use precomputed embedding
          vectorString = `[${doc.embedding.join(',')}]`;
        } else {
          // Generate embedding for the document
          const text = `${doc.title} ${doc.content}`;
          const embedding = await this.generateEmbedding(text);
          vectorString = `[${embedding.join(',')}]`;
        }

        // Upsert into rag_documents
        await client.query(
          `INSERT INTO rag_documents (id, project_id, title, content, source_type, source_id, meta, embedding, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, NOW(), NOW())
           ON CONFLICT (id) 
           DO UPDATE SET
             title = EXCLUDED.title,
             content = EXCLUDED.content,
             source_type = EXCLUDED.source_type,
             source_id = EXCLUDED.source_id,
             meta = EXCLUDED.meta,
             embedding = EXCLUDED.embedding,
             updated_at = NOW()`,
          [doc.id, doc.projectId, doc.title, doc.content, doc.sourceType, doc.sourceId, doc.meta, vectorString]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error upserting documents:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Query the vector store for relevant documents
   * @param {SearchOptions} opts - Search options
   * @returns {Promise<ScoredChunk[]>} - Array of scored results
   */
  async query(opts) {
    const {
      projectId,
      queryText,
      embedding,
      k = 10,
      filters = {},
      mode = 'hybrid',
      keywordWeight = 0.3,
      semanticWeight = 0.7
    } = opts;

    // Use provided embedding or generate from queryText
    let queryEmbedding = embedding;
    if (!queryEmbedding && queryText) {
      queryEmbedding = await this.generateEmbedding(queryText);
    }

    const sourceType = filters.sourceType || null;

    // Route to appropriate search method based on mode
    switch (mode) {
      case 'keyword':
        return this._keywordSearch(projectId, queryText, k, sourceType);
      case 'semantic':
        return this._semanticSearch(projectId, queryEmbedding, k, sourceType);
      case 'hybrid':
      default:
        return this._hybridSearch(projectId, queryText, queryEmbedding, k, sourceType, keywordWeight, semanticWeight);
    }
  }

  /**
   * Keyword-only search using PostgreSQL full-text search
   * @private
   */
  async _keywordSearch(projectId, query, limit, sourceType) {
    let sqlQuery;
    let params;

    if (sourceType) {
      params = [query, projectId, sourceType, limit];
      sqlQuery = `
        SELECT
          id,
          title,
          source_type,
          source_id,
          content,
          meta,
          created_at,
          ts_rank(content_tsv, plainto_tsquery('english', $1)) as score,
          ts_headline('english', content, plainto_tsquery('english', $1),
            'MaxWords=50, MinWords=25, HighlightAll=false') as snippet
        FROM rag_documents
        WHERE project_id = $2
          AND source_type = $3
          AND content_tsv @@ plainto_tsquery('english', $1)
        ORDER BY score DESC
        LIMIT $4
      `;
    } else {
      params = [query, projectId, limit];
      sqlQuery = `
        SELECT
          id,
          title,
          source_type,
          source_id,
          content,
          meta,
          created_at,
          ts_rank(content_tsv, plainto_tsquery('english', $1)) as score,
          ts_headline('english', content, plainto_tsquery('english', $1),
            'MaxWords=50, MinWords=25, HighlightAll=false') as snippet
        FROM rag_documents
        WHERE project_id = $2
          AND content_tsv @@ plainto_tsquery('english', $1)
        ORDER BY score DESC
        LIMIT $3
      `;
    }

    const result = await pool.query(sqlQuery, params);
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      sourceType: row.source_type,
      sourceId: row.source_id,
      content: row.content,
      meta: row.meta,
      createdAt: row.created_at,
      score: row.score,
      snippet: row.snippet
    }));
  }

  /**
   * Semantic-only search using vector similarity
   * @private
   */
  async _semanticSearch(projectId, queryEmbedding, limit, sourceType) {
    const vectorString = `[${queryEmbedding.join(',')}]`;
    let sqlQuery;
    let params;

    if (sourceType) {
      params = [vectorString, projectId, sourceType, limit];
      sqlQuery = `
        SELECT
          id,
          title,
          source_type,
          source_id,
          content,
          meta,
          created_at,
          1 - (embedding <=> $1::vector) as score
        FROM rag_documents
        WHERE project_id = $2
          AND source_type = $3
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $4
      `;
    } else {
      params = [vectorString, projectId, limit];
      sqlQuery = `
        SELECT
          id,
          title,
          source_type,
          source_id,
          content,
          meta,
          created_at,
          1 - (embedding <=> $1::vector) as score
        FROM rag_documents
        WHERE project_id = $2
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $3
      `;
    }

    const result = await pool.query(sqlQuery, params);
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      sourceType: row.source_type,
      sourceId: row.source_id,
      content: row.content,
      meta: row.meta,
      createdAt: row.created_at,
      score: row.score,
      snippet: null
    }));
  }

  /**
   * Hybrid search combining keyword and semantic search
   * @private
   */
  async _hybridSearch(projectId, query, queryEmbedding, limit, sourceType, keywordWeight, semanticWeight) {
    const vectorString = `[${queryEmbedding.join(',')}]`;
    let sqlQuery;
    let params;

    if (sourceType) {
      params = [query, projectId, sourceType, vectorString, keywordWeight, semanticWeight, limit];
      sqlQuery = `
        WITH keyword_search AS (
          SELECT
            id,
            ts_rank(content_tsv, plainto_tsquery('english', $1)) as keyword_score
          FROM rag_documents
          WHERE project_id = $2
            AND content_tsv @@ plainto_tsquery('english', $1)
            AND source_type = $3
        ),
        semantic_search AS (
          SELECT
            id,
            1 - (embedding <=> $4::vector) as semantic_score
          FROM rag_documents
          WHERE project_id = $2
            AND embedding IS NOT NULL
            AND source_type = $3
        )
        SELECT
          r.id,
          r.title,
          r.source_type,
          r.source_id,
          ts_headline('english', r.content, plainto_tsquery('english', $1),
            'MaxWords=50, MinWords=25, HighlightAll=false') as snippet,
          r.content,
          r.meta,
          r.created_at,
          COALESCE(k.keyword_score, 0) as keyword_score,
          COALESCE(s.semantic_score, 0) as semantic_score,
          (COALESCE(k.keyword_score, 0) * $5 + 
           COALESCE(s.semantic_score, 0) * $6) as score
        FROM rag_documents r
        LEFT JOIN keyword_search k ON r.id = k.id
        LEFT JOIN semantic_search s ON r.id = s.id
        WHERE r.project_id = $2
          AND r.source_type = $3
          AND (k.id IS NOT NULL OR s.id IS NOT NULL)
        ORDER BY score DESC
        LIMIT $7
      `;
    } else {
      params = [query, projectId, vectorString, keywordWeight, semanticWeight, limit];
      sqlQuery = `
        WITH keyword_search AS (
          SELECT
            id,
            ts_rank(content_tsv, plainto_tsquery('english', $1)) as keyword_score
          FROM rag_documents
          WHERE project_id = $2
            AND content_tsv @@ plainto_tsquery('english', $1)
        ),
        semantic_search AS (
          SELECT
            id,
            1 - (embedding <=> $3::vector) as semantic_score
          FROM rag_documents
          WHERE project_id = $2
            AND embedding IS NOT NULL
        )
        SELECT
          r.id,
          r.title,
          r.source_type,
          r.source_id,
          ts_headline('english', r.content, plainto_tsquery('english', $1),
            'MaxWords=50, MinWords=25, HighlightAll=false') as snippet,
          r.content,
          r.meta,
          r.created_at,
          COALESCE(k.keyword_score, 0) as keyword_score,
          COALESCE(s.semantic_score, 0) as semantic_score,
          (COALESCE(k.keyword_score, 0) * $4 + 
           COALESCE(s.semantic_score, 0) * $5) as score
        FROM rag_documents r
        LEFT JOIN keyword_search k ON r.id = k.id
        LEFT JOIN semantic_search s ON r.id = s.id
        WHERE r.project_id = $2
          AND (k.id IS NOT NULL OR s.id IS NOT NULL)
        ORDER BY score DESC
        LIMIT $6
      `;
    }

    const result = await pool.query(sqlQuery, params);
    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      sourceType: row.source_type,
      sourceId: row.source_id,
      content: row.content,
      meta: row.meta,
      createdAt: row.created_at,
      score: row.score,
      snippet: row.snippet,
      keywordScore: row.keyword_score,
      semanticScore: row.semantic_score
    }));
  }

  /**
   * Batch generate embeddings for multiple documents
   * @param {Array<{id: string, text: string}>} documents - Documents to embed
   * @returns {Promise<{success: number, failed: number, errors: Array}>}
   */
  async batchEmbedDocuments(documents) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const doc of documents) {
      try {
        const embedding = await this.generateEmbedding(doc.text);
        const vectorString = `[${embedding.join(',')}]`;
        
        await pool.query(
          'UPDATE rag_documents SET embedding = $1::vector WHERE id = $2',
          [vectorString, doc.id]
        );
        
        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          documentId: doc.id,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Delete documents from the vector store
   * @param {string[]} documentIds - Array of document IDs to delete
   * @returns {Promise<void>}
   */
  async deleteDocuments(documentIds) {
    await pool.query(
      'DELETE FROM rag_documents WHERE id = ANY($1)',
      [documentIds]
    );
  }

  /**
   * Health check - verify PostgreSQL and pgvector extension are accessible
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      // Check database connection
      await pool.query('SELECT 1');
      
      // Check pgvector extension is installed
      const result = await pool.query(
        "SELECT extname FROM pg_extension WHERE extname = 'vector'"
      );
      
      return result.rows.length > 0;
    } catch (error) {
      console.error('VectorStore health check failed:', error);
      return false;
    }
  }
}

module.exports = PgVectorStore;
