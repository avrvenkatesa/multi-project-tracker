const { pgTable, serial, text, timestamp, integer, boolean } = require('drizzle-orm/pg-core');
const { relations } = require('drizzle-orm');

// Users table
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  email: text('email'),
  createdAt: timestamp('created_at').defaultNow()
});

// Projects table
const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  template: text('template').default('generic'),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: text('created_by').default('Demo User')
});

// Issues table
const issues = pgTable('issues', {
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
const actionItems = pgTable('action_items', {
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
const projectsRelations = relations(projects, ({ many }) => ({
  issues: many(issues),
  actionItems: many(actionItems),
}));

const issuesRelations = relations(issues, ({ one }) => ({
  project: one(projects, {
    fields: [issues.projectId],
    references: [projects.id],
  }),
}));

const actionItemsRelations = relations(actionItems, ({ one }) => ({
  project: one(projects, {
    fields: [actionItems.projectId],
    references: [projects.id],
  }),
}));

const usersRelations = relations(users, ({ many }) => ({}));

module.exports = {
  users,
  projects,
  issues,
  actionItems,
  projectsRelations,
  issuesRelations,
  actionItemsRelations,
  usersRelations
};