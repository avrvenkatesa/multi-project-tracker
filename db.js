/**
 * Database Connection Module
 * 
 * Exports database pool for use across services
 */

const { Pool } = require('@neondatabase/serverless');
const ws = require('ws');
const { neonConfig } = require('@neondatabase/serverless');

// Configure WebSocket for Node.js < v22
neonConfig.webSocketConstructor = ws;

// Create and export pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { pool };
