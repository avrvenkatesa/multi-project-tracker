import { pgTable, serial, varchar, text, timestamp, integer, boolean, decimal } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 100 }).unique().notNull(),
  password: varchar('password', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).default('Team Member'),
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`now()`).notNull(),
});

// Projects table
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  template: varchar('template', { length: 50 }).default('generic'),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
  createdBy: varchar('created_by', { length: 100 }),
});

// Issues table  
export const issues = pgTable('issues', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  priority: varchar('priority', { length: 20 }).default('medium'),
  category: varchar('category', { length: 50 }).default('General'),
  phase: varchar('phase', { length: 50 }),
  component: varchar('component', { length: 50 }),
  assignee: varchar('assignee', { length: 100 }),
  dueDate: timestamp('due_date'),
  status: varchar('status', { length: 20 }).default('To Do'),
  projectId: integer('project_id').notNull(),
  type: varchar('type', { length: 20 }).default('issue'),
  milestone: varchar('milestone', { length: 100 }),
  isDeliverable: boolean('is_deliverable').default(false),
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`now()`).notNull(),
  createdBy: varchar('created_by', { length: 100 }),
});

// Action Items table
export const actionItems = pgTable('action_items', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  priority: varchar('priority', { length: 20 }).default('medium'),
  category: varchar('category', { length: 50 }).default('General'),
  phase: varchar('phase', { length: 50 }),
  component: varchar('component', { length: 50 }),
  assignee: varchar('assignee', { length: 100 }),
  dueDate: timestamp('due_date'),
  progress: integer('progress').default(0),
  status: varchar('status', { length: 20 }).default('To Do'),
  projectId: integer('project_id').notNull(),
  type: varchar('type', { length: 20 }).default('action-item'),
  milestone: varchar('milestone', { length: 100 }),
  isDeliverable: boolean('is_deliverable').default(false),
  createdAt: timestamp('created_at').default(sql`now()`).notNull(),
  updatedAt: timestamp('updated_at').default(sql`now()`).notNull(),
  createdBy: varchar('created_by', { length: 100 }),
});