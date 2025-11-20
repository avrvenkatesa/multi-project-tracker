/**
 * Embedding Service - Backward compatibility wrapper for VectorStore abstraction
 * 
 * This service now delegates to the VectorStore abstraction layer (PgVectorStore).
 * Existing code using embeddingService will continue to work without changes.
 * 
 * Migration path: New code should use vectorStore directly from services/vectorStore
 */

const vectorStore = require('./vectorStore');

/**
 * Generate embedding vector for text using OpenAI API
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - 1536-dimensional embedding vector
 */
async function generateEmbedding(text) {
  return vectorStore.generateEmbedding(text);
}

/**
 * Generate and store embedding for a RAG document
 * Now uses VectorStore abstraction for full consistency
 * @param {string} documentId - UUID of the document
 * @param {string} text - Combined title + content to embed
 * @returns {Promise<void>}
 */
async function embedDocument(documentId, text) {
  const { pool } = require('../db');
  const embedding = await generateEmbedding(text);
  
  // Update via direct SQL for backward compatibility
  // (VectorStore.upsertDocuments is for full document upserts)
  const vectorString = `[${embedding.join(',')}]`;
  
  await pool.query(
    'UPDATE rag_documents SET embedding = $1::vector WHERE id = $2',
    [vectorString, documentId]
  );
}

/**
 * Batch generate embeddings for multiple documents
 * @param {Array<{id: string, text: string}>} documents - Array of {id, text} objects
 * @returns {Promise<{success: number, failed: number, errors: Array}>}
 */
async function batchEmbedDocuments(documents) {
  return vectorStore.batchEmbedDocuments(documents);
}

/**
 * Perform semantic similarity search using vector embeddings
 * @param {number} projectId - Project ID to search within
 * @param {string} query - Search query
 * @param {number} limit - Maximum number of results
 * @param {string|null} sourceType - Optional filter by source type
 * @returns {Promise<Array>} - Array of matching documents with similarity scores
 */
async function semanticSearch(projectId, query, limit = 10, sourceType = null) {
  const results = await vectorStore.query({
    projectId,
    queryText: query,
    k: limit,
    mode: 'semantic',
    filters: { sourceType }
  });

  // Map to legacy format for backward compatibility
  return results.map(r => ({
    id: r.id,
    title: r.title,
    source_type: r.sourceType,
    source_id: r.sourceId,
    content: r.content,
    meta: r.meta,
    created_at: r.createdAt,
    similarity: r.score
  }));
}

/**
 * Hybrid search combining keyword (full-text) and semantic (vector) search
 * @param {number} projectId - Project ID to search within
 * @param {string} query - Search query
 * @param {number} limit - Maximum number of results
 * @param {string|null} sourceType - Optional filter by source type
 * @param {number} keywordWeight - Weight for keyword search (0-1, default 0.3)
 * @param {number} semanticWeight - Weight for semantic search (0-1, default 0.7)
 * @returns {Promise<Array>} - Array of documents with combined scores
 */
async function hybridSearch(projectId, query, limit = 10, sourceType = null, keywordWeight = 0.3, semanticWeight = 0.7) {
  const results = await vectorStore.query({
    projectId,
    queryText: query,
    k: limit,
    mode: 'hybrid',
    filters: { sourceType },
    keywordWeight,
    semanticWeight
  });

  // Map to legacy format for backward compatibility
  return results.map(r => ({
    id: r.id,
    title: r.title,
    source_type: r.sourceType,
    source_id: r.sourceId,
    snippet: r.snippet,
    content: r.content,
    meta: r.meta,
    created_at: r.createdAt,
    keyword_score: r.keywordScore,
    semantic_score: r.semanticScore,
    combined_score: r.score
  }));
}

module.exports = {
  generateEmbedding,
  embedDocument,
  batchEmbedDocuments,
  semanticSearch,
  hybridSearch
};
