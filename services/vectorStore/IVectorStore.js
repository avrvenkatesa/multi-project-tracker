/**
 * VectorStore Interface
 * 
 * Abstraction layer for vector database operations.
 * This interface allows swapping between different vector database implementations
 * (e.g., pgvector, Weaviate, Pinecone, Qdrant) without changing the rest of the codebase.
 * 
 * Current implementation: PgVectorStore (pgvector extension in PostgreSQL)
 * Future migrations: WeaviateVectorStore (for multi-tenant SaaS scale)
 */

/**
 * @typedef {Object} DocInput
 * @property {string} id - Document UUID
 * @property {number} projectId - Project ID for tenant isolation
 * @property {string} title - Document title
 * @property {string} content - Full document content
 * @property {string} sourceType - Type of document (meeting_transcript, uploaded_doc, attachment, ai_analysis_doc)
 * @property {string|null} sourceId - ID of the source entity (meeting_id, issue_id, etc.)
 * @property {Object} meta - Additional metadata (uploader, timestamps, etc.)
 * @property {number[]|null} embedding - Optional precomputed embedding vector (1536 dimensions)
 */

/**
 * @typedef {Object} SearchFilters
 * @property {number} projectId - Project ID (required for tenant isolation)
 * @property {string|null} sourceType - Filter by source type
 * @property {Object|null} meta - Additional metadata filters
 */

/**
 * @typedef {Object} ScoredChunk
 * @property {string} id - Document ID
 * @property {string} title - Document title
 * @property {string} sourceType - Document source type
 * @property {string|null} sourceId - Source entity ID
 * @property {string} content - Full content or snippet
 * @property {Object} meta - Metadata
 * @property {Date} createdAt - Creation timestamp
 * @property {number} score - Relevance score (0-1 range, higher is better)
 * @property {string|null} snippet - Highlighted snippet (for keyword search)
 */

/**
 * @typedef {Object} SearchOptions
 * @property {number} projectId - Project ID to search within
 * @property {string|null} queryText - Search query text
 * @property {number[]|null} embedding - Pre-computed query embedding vector
 * @property {number} k - Number of results to return
 * @property {SearchFilters} filters - Search filters
 * @property {string} mode - Search mode: 'keyword', 'semantic', or 'hybrid'
 * @property {number} keywordWeight - Weight for keyword search (0-1, for hybrid mode)
 * @property {number} semanticWeight - Weight for semantic search (0-1, for hybrid mode)
 */

class IVectorStore {
  /**
   * Upsert (insert or update) documents into the vector store
   * @param {DocInput[]} docs - Array of documents to upsert
   * @returns {Promise<void>}
   */
  async upsertDocuments(docs) {
    throw new Error('upsertDocuments() must be implemented by subclass');
  }

  /**
   * Query the vector store for relevant documents
   * @param {SearchOptions} opts - Search options
   * @returns {Promise<ScoredChunk[]>} - Array of scored results
   */
  async query(opts) {
    throw new Error('query() must be implemented by subclass');
  }

  /**
   * Generate embedding vector for text
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} - Embedding vector
   */
  async generateEmbedding(text) {
    throw new Error('generateEmbedding() must be implemented by subclass');
  }

  /**
   * Delete documents from the vector store
   * @param {string[]} documentIds - Array of document IDs to delete
   * @returns {Promise<void>}
   */
  async deleteDocuments(documentIds) {
    throw new Error('deleteDocuments() must be implemented by subclass');
  }

  /**
   * Batch generate embeddings for multiple documents
   * @param {Array<{id: string, text: string}>} documents - Documents to embed
   * @returns {Promise<{success: number, failed: number, errors: Array}>}
   */
  async batchEmbedDocuments(documents) {
    throw new Error('batchEmbedDocuments() must be implemented by subclass');
  }

  /**
   * Health check - verify vector store is accessible
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    throw new Error('healthCheck() must be implemented by subclass');
  }
}

module.exports = IVectorStore;
