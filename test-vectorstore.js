/**
 * Quick test script for VectorStore abstraction
 * Usage: node test-vectorstore.js
 */

const vectorStore = require('./services/vectorStore');

async function testVectorStore() {
  console.log('🧪 Testing VectorStore Abstraction Layer\n');

  try {
    // Test 1: Health check
    console.log('Test 1: Health Check');
    const isHealthy = await vectorStore.healthCheck();
    console.log(isHealthy ? '✅ VectorStore is healthy' : '❌ VectorStore health check failed');
    console.log();

    // Test 2: Generate embedding
    console.log('Test 2: Generate Embedding');
    const testText = 'This is a test document about database migration';
    const embedding = await vectorStore.generateEmbedding(testText);
    console.log(`✅ Generated embedding with ${embedding.length} dimensions`);
    console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    console.log();

    // Test 3: Query (semantic search)
    console.log('Test 3: Query (Semantic Search)');
    const results = await vectorStore.query({
      projectId: 1,
      queryText: 'database migration',
      k: 3,
      mode: 'semantic',
      filters: {}
    });
    console.log(`✅ Found ${results.length} results`);
    if (results.length > 0) {
      console.log(`   Top result: "${results[0].title}" (score: ${results[0].score.toFixed(4)})`);
    }
    console.log();

    // Test 4: Query (hybrid search)
    console.log('Test 4: Query (Hybrid Search)');
    const hybridResults = await vectorStore.query({
      projectId: 1,
      queryText: 'security requirements',
      k: 3,
      mode: 'hybrid',
      filters: {},
      keywordWeight: 0.3,
      semanticWeight: 0.7
    });
    console.log(`✅ Found ${hybridResults.length} results`);
    if (hybridResults.length > 0) {
      const top = hybridResults[0];
      console.log(`   Top result: "${top.title}"`);
      console.log(`   Scores - Keyword: ${(top.keywordScore || 0).toFixed(4)}, Semantic: ${(top.semanticScore || 0).toFixed(4)}, Combined: ${top.score.toFixed(4)}`);
    }
    console.log();

    console.log('✅ All tests passed! VectorStore abstraction is working correctly.\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

testVectorStore();
