import { pgTable, serial, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  email: text('email'),
  createdAt: timestamp('created_at').defaultNow()
});

// Projects table
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  template: text('template').default('generic'),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: text('created_by').default('Demo User')
});

// Issues table
export const issues = pgTable('issues', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').default('medium'),
  category: text('category').default('Technical'),
  phase: text('phase').default('Assessment'),
  component: text('component').default('Application'),
  assignee: text('assignee').default('Demo User'),
  dueDate: timestamp('due_date'),
  status: text('status').default('To Do'),
  projectId: integer('project_id').references(() => projects.id),
  type: text('type').default('issue'),
  milestone: text('milestone'),
  isDeliverable: boolean('is_deliverable').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: text('created_by').default('Demo User')
});

// Action items table
export const actionItems = pgTable('action_items', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').default('medium'),
  assignee: text('assignee').default('Demo User'),
  dueDate: timestamp('due_date'),
  status: text('status').default('To Do'),
  progress: integer('progress').default(0),
  projectId: integer('project_id').references(() => projects.id),
  type: text('type').default('action-item'),
  milestone: text('milestone'),
  isDeliverable: boolean('is_deliverable').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  createdBy: text('created_by').default('Demo User')
});

// Relations
export const projectsRelations = relations(projects, ({ many }) => ({
  issues: many(issues),
  actionItems: many(actionItems),
}));

export const issuesRelations = relations(issues, ({ one }) => ({
  project: one(projects, {
    fields: [issues.projectId],
    references: [projects.id],
  }),
}));

export const actionItemsRelations = relations(actionItems, ({ one }) => ({
  project: one(projects, {
    fields: [actionItems.projectId],
    references: [projects.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({}));

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;
export type Issue = typeof issues.$inferSelect;
export type InsertIssue = typeof issues.$inferInsert;
export type ActionItem = typeof actionItems.$inferSelect;
export type InsertActionItem = typeof actionItems.$inferInsert;