/**
 * VectorStore Factory
 * 
 * Provides a singleton instance of the VectorStore implementation.
 * This factory allows easy swapping between different vector database implementations
 * by changing a single configuration value.
 * 
 * Usage:
 *   const vectorStore = require('./services/vectorStore');
 *   const results = await vectorStore.query({ ... });
 */

const PgVectorStore = require('./PgVectorStore');

// Configuration - change this to swap implementations
const VECTOR_STORE_PROVIDER = process.env.VECTOR_STORE_PROVIDER || 'pgvector';

let vectorStoreInstance = null;

/**
 * Get the VectorStore singleton instance
 * @returns {IVectorStore}
 */
function getVectorStore() {
  if (!vectorStoreInstance) {
    switch (VECTOR_STORE_PROVIDER.toLowerCase()) {
      case 'pgvector':
        vectorStoreInstance = new PgVectorStore();
        break;
      
      // Future implementations can be added here:
      // case 'weaviate':
      //   vectorStoreInstance = new WeaviateVectorStore();
      //   break;
      // case 'pinecone':
      //   vectorStoreInstance = new PineconeVectorStore();
      //   break;
      // case 'qdrant':
      //   vectorStoreInstance = new QdrantVectorStore();
      //   break;
      
      default:
        throw new Error(`Unsupported vector store provider: ${VECTOR_STORE_PROVIDER}`);
    }
    
    console.log(`[VectorStore] Initialized with provider: ${VECTOR_STORE_PROVIDER}`);
  }
  
  return vectorStoreInstance;
}

// Export singleton instance
module.exports = getVectorStore();

// Also export the factory function and interface for testing
module.exports.getVectorStore = getVectorStore;
module.exports.IVectorStore = require('./IVectorStore');
module.exports.PgVectorStore = PgVectorStore;
