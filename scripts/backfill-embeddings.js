#!/usr/bin/env node

/**
 * Backfill Embeddings Script
 * Generates embeddings for existing RAG documents that don't have them yet
 * 
 * Usage: node scripts/backfill-embeddings.js [options]
 * Options:
 *   --batch-size <number>  Process N documents at a time (default: 10)
 *   --delay <ms>          Delay between batches in milliseconds (default: 1000)
 *   --project-id <id>     Only process documents for specific project
 *   --dry-run             Show what would be processed without making changes
 */

const { pool } = require('../db');
const { embedDocument } = require('../services/embeddingService');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  batchSize: 10,
  delay: 1000,
  projectId: null,
  dryRun: false
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--batch-size':
      options.batchSize = parseInt(args[++i]);
      break;
    case '--delay':
      options.delay = parseInt(args[++i]);
      break;
    case '--project-id':
      options.projectId = parseInt(args[++i]);
      break;
    case '--dry-run':
      options.dryRun = true;
      break;
  }
}

async function getDocumentsWithoutEmbeddings(limit, offset = 0) {
  let query = `
    SELECT id, title, content, project_id, source_type
    FROM rag_documents
    WHERE embedding IS NULL
  `;

  const params = [];

  if (options.projectId) {
    params.push(options.projectId);
    query += ` AND project_id = $${params.length}`;
  }

  params.push(limit);
  query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

  params.push(offset);
  query += ` OFFSET $${params.length}`;

  const result = await pool.query(query, params);
  return result.rows;
}

async function countDocumentsWithoutEmbeddings() {
  let query = `
    SELECT COUNT(*) as count
    FROM rag_documents
    WHERE embedding IS NULL
  `;

  const params = [];

  if (options.projectId) {
    params.push(options.projectId);
    query += ` AND project_id = $${params.length}`;
  }

  const result = await pool.query(query, params);
  return parseInt(result.rows[0].count);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function backfillEmbeddings() {
  console.log('🔍 Backfill Embeddings Script');
  console.log('==============================');
  console.log(`Batch size: ${options.batchSize}`);
  console.log(`Delay: ${options.delay}ms`);
  console.log(`Project ID: ${options.projectId || 'All projects'}`);
  console.log(`Dry run: ${options.dryRun ? 'Yes' : 'No'}`);
  console.log('');

  try {
    // Count total documents without embeddings
    const totalCount = await countDocumentsWithoutEmbeddings();
    console.log(`📊 Found ${totalCount} documents without embeddings`);

    if (totalCount === 0) {
      console.log('✅ All documents already have embeddings!');
      process.exit(0);
    }

    if (options.dryRun) {
      console.log('\n🔍 Dry run - showing first batch:');
      const docs = await getDocumentsWithoutEmbeddings(options.batchSize);
      docs.forEach((doc, idx) => {
        console.log(`  ${idx + 1}. [${doc.source_type}] ${doc.title} (ID: ${doc.id})`);
      });
      console.log('\n💡 Run without --dry-run to process these documents');
      process.exit(0);
    }

    console.log(`\n🚀 Starting backfill process...`);
    console.log('');

    let processed = 0;
    let failed = 0;
    let offset = 0;

    while (processed < totalCount) {
      const docs = await getDocumentsWithoutEmbeddings(options.batchSize, offset);

      if (docs.length === 0) {
        break;
      }

      console.log(`📦 Processing batch ${Math.floor(offset / options.batchSize) + 1} (${docs.length} documents)...`);

      for (const doc of docs) {
        try {
          const text = `${doc.title}\n\n${doc.content}`;
          await embedDocument(doc.id, text);
          processed++;
          console.log(`  ✓ [${processed}/${totalCount}] ${doc.source_type}: ${doc.title.substring(0, 50)}...`);
        } catch (error) {
          failed++;
          console.error(`  ✗ Failed: ${doc.id} - ${error.message}`);
        }
      }

      offset += options.batchSize;

      // Delay between batches to avoid rate limits
      if (offset < totalCount) {
        console.log(`⏳ Waiting ${options.delay}ms before next batch...\n`);
        await delay(options.delay);
      }
    }

    console.log('');
    console.log('==============================');
    console.log('✅ Backfill Complete!');
    console.log(`📊 Successfully processed: ${processed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Total: ${totalCount}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the backfill
backfillEmbeddings();
