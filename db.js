/**
 * Database Connection Module
 * 
 * Provides shared database pool for all service modules
 */

const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

// Configure WebSocket for Node.js < v22
neonConfig.webSocketConstructor = ws;

// Create connection pool
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL 
});

module.exports = { pool };
