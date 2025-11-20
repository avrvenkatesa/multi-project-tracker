const OpenAI = require('openai');
const { neon } = require('@neondatabase/serverless');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const sql = neon(process.env.DATABASE_URL);

/**
 * Generate embedding vector for text using OpenAI API
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - 1536-dimensional embedding vector
 */
async function generateEmbedding(text) {
  if (!text || text.trim() === '') {
    throw new Error('Text cannot be empty');
  }

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
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
 * Generate and store embedding for a RAG document
 * @param {string} documentId - UUID of the document
 * @param {string} text - Combined title + content to embed
 * @returns {Promise<void>}
 */
async function embedDocument(documentId, text) {
  const embedding = await generateEmbedding(text);
  
  await sql`
    UPDATE rag_documents
    SET embedding = ${JSON.stringify(embedding)}::vector
    WHERE id = ${documentId}
  `;
}

/**
 * Batch generate embeddings for multiple documents
 * @param {Array<{id: string, text: string}>} documents - Array of {id, text} objects
 * @returns {Promise<{success: number, failed: number, errors: Array}>}
 */
async function batchEmbedDocuments(documents) {
  const results = {
    success: 0,
    failed: 0,
    errors: []
  };

  for (const doc of documents) {
    try {
      await embedDocument(doc.id, doc.text);
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
 * Perform semantic similarity search using vector embeddings
 * @param {number} projectId - Project ID to search within
 * @param {string} query - Search query
 * @param {number} limit - Maximum number of results
 * @param {string|null} sourceType - Optional filter by source type
 * @returns {Promise<Array>} - Array of matching documents with similarity scores
 */
async function semanticSearch(projectId, query, limit = 10, sourceType = null) {
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Build query with optional source type filter
  let sqlQuery;
  if (sourceType) {
    sqlQuery = sql`
      SELECT
        id,
        title,
        source_type,
        source_id,
        content,
        meta,
        created_at,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM rag_documents
      WHERE project_id = ${projectId}
        AND embedding IS NOT NULL
        AND source_type = ${sourceType}
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `;
  } else {
    sqlQuery = sql`
      SELECT
        id,
        title,
        source_type,
        source_id,
        content,
        meta,
        created_at,
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM rag_documents
      WHERE project_id = ${projectId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${limit}
    `;
  }

  const results = await sqlQuery;
  return results;
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
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Hybrid search query combining full-text and vector similarity
  let sqlQuery;
  if (sourceType) {
    sqlQuery = sql`
      WITH keyword_search AS (
        SELECT
          id,
          ts_rank(content_tsv, plainto_tsquery('english', ${query})) as keyword_score
        FROM rag_documents
        WHERE project_id = ${projectId}
          AND content_tsv @@ plainto_tsquery('english', ${query})
          AND source_type = ${sourceType}
      ),
      semantic_search AS (
        SELECT
          id,
          1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as semantic_score
        FROM rag_documents
        WHERE project_id = ${projectId}
          AND embedding IS NOT NULL
          AND source_type = ${sourceType}
      )
      SELECT
        r.id,
        r.title,
        r.source_type,
        r.source_id,
        ts_headline('english', r.content, plainto_tsquery('english', ${query}),
          'MaxWords=50, MinWords=25, HighlightAll=false') as snippet,
        r.content,
        r.meta,
        r.created_at,
        COALESCE(k.keyword_score, 0) as keyword_score,
        COALESCE(s.semantic_score, 0) as semantic_score,
        (COALESCE(k.keyword_score, 0) * ${keywordWeight} + 
         COALESCE(s.semantic_score, 0) * ${semanticWeight}) as combined_score
      FROM rag_documents r
      LEFT JOIN keyword_search k ON r.id = k.id
      LEFT JOIN semantic_search s ON r.id = s.id
      WHERE r.project_id = ${projectId}
        AND r.source_type = ${sourceType}
        AND (k.id IS NOT NULL OR s.id IS NOT NULL)
      ORDER BY combined_score DESC
      LIMIT ${limit}
    `;
  } else {
    sqlQuery = sql`
      WITH keyword_search AS (
        SELECT
          id,
          ts_rank(content_tsv, plainto_tsquery('english', ${query})) as keyword_score
        FROM rag_documents
        WHERE project_id = ${projectId}
          AND content_tsv @@ plainto_tsquery('english', ${query})
      ),
      semantic_search AS (
        SELECT
          id,
          1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as semantic_score
        FROM rag_documents
        WHERE project_id = ${projectId}
          AND embedding IS NOT NULL
      )
      SELECT
        r.id,
        r.title,
        r.source_type,
        r.source_id,
        ts_headline('english', r.content, plainto_tsquery('english', ${query}),
          'MaxWords=50, MinWords=25, HighlightAll=false') as snippet,
        r.content,
        r.meta,
        r.created_at,
        COALESCE(k.keyword_score, 0) as keyword_score,
        COALESCE(s.semantic_score, 0) as semantic_score,
        (COALESCE(k.keyword_score, 0) * ${keywordWeight} + 
         COALESCE(s.semantic_score, 0) * ${semanticWeight}) as combined_score
      FROM rag_documents r
      LEFT JOIN keyword_search k ON r.id = k.id
      LEFT JOIN semantic_search s ON r.id = s.id
      WHERE r.project_id = ${projectId}
        AND (k.id IS NOT NULL OR s.id IS NOT NULL)
      ORDER BY combined_score DESC
      LIMIT ${limit}
    `;
  }

  const results = await sqlQuery;
  return results;
}

module.exports = {
  generateEmbedding,
  embedDocument,
  batchEmbedDocuments,
  semanticSearch,
  hybridSearch
};
