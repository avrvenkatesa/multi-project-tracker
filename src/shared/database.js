import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Create the connection
const sql = postgres(connectionString);
export const db = drizzle(sql, { schema });

// Export tables for easy access
export const { users, projects, issues, actionItems } = schema;