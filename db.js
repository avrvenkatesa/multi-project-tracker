/**
 * Database Connection Pool
 * 
 * Shared database pool for all services and modules.
 * Prevents creating multiple pool instances.
 * 
 * @module db
 */

const { Pool } = require('pg');

// Create single pool instance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Log connection
pool.on('connect', () => {
  console.log('📊 Database pool connected');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database pool error:', err);
});

module.exports = { pool };
