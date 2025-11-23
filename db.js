/**
 * Database Connection Module
 * 
 * Provides shared database pool for all service modules
 */

let pool;

// Check if we're in test mode or using local PostgreSQL
const isLocalPostgres = process.env.NODE_ENV === 'test' || 
                        process.env.DATABASE_URL?.includes('localhost') ||
                        process.env.DATABASE_URL?.includes('127.0.0.1');

if (isLocalPostgres) {
  // Use standard pg library for local/test PostgreSQL
  const { Pool: PgPool } = require('pg');
  pool = new PgPool({ 
    connectionString: process.env.DATABASE_URL 
  });
  console.log('[DB] Using standard PostgreSQL driver for local/test environment');
} else {
  // Use Neon serverless for production cloud database
  const { Pool: NeonPool, neonConfig } = require('@neondatabase/serverless');
  const ws = require('ws');
  
  // Configure WebSocket for Node.js < v22
  neonConfig.webSocketConstructor = ws;
  
  pool = new NeonPool({ 
    connectionString: process.env.DATABASE_URL 
  });
  console.log('[DB] Using Neon serverless driver for cloud database');
}

module.exports = { pool };
