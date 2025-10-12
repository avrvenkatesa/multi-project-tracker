import { pgTable, serial, varchar, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('Team Member'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  template: varchar('template', { length: 50 }).default('generic'),
  createdBy: varchar('created_by', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const projectMembers = pgTable('project_members', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull().default('Member'),
  joinedAt: timestamp('joined_at').defaultNow(),
  invitedBy: integer('invited_by').references(() => users.id),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  lastActive: timestamp('last_active'),
  removedAt: timestamp('removed_at'),
  removedBy: integer('removed_by').references(() => users.id),
});

export const issues = pgTable('issues', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('Open'),
  priority: varchar('priority', { length: 50 }).default('Medium'),
  category: varchar('category', { length: 100 }),
  assignee: varchar('assignee', { length: 255 }),
  createdBy: varchar('created_by', { length: 255 }),
  createdViaAiBy: integer('created_via_ai_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const actionItems = pgTable('action_items', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('todo'),
  priority: varchar('priority', { length: 50 }).default('medium'),
  assignee: varchar('assignee', { length: 255 }),
  dueDate: timestamp('due_date'),
  createdBy: varchar('created_by', { length: 255 }),
  createdViaAiBy: integer('created_via_ai_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const meetingTranscripts = pgTable('meeting_transcripts', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 500 }).notNull(),
  transcriptText: text('transcript_text').notNull(),
  uploadedBy: integer('uploaded_by').notNull().references(() => users.id),
  visibility: varchar('visibility', { length: 50 }).notNull().default('all'),
  canViewUsers: jsonb('can_view_users'),
  projectSensitive: boolean('project_sensitive').default(false),
  containsConfidential: boolean('contains_confidential').default(false),
  analysisId: varchar('analysis_id', { length: 255 }),
  analysisResults: jsonb('analysis_results'),
  cost: varchar('cost', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow(),
  analyzedAt: timestamp('analyzed_at'),
});

export const issueRelationships = pgTable('issue_relationships', {
  id: serial('id').primaryKey(),
  sourceType: varchar('source_type', { length: 50 }).notNull(),
  sourceId: integer('source_id').notNull(),
  targetType: varchar('target_type', { length: 50 }).notNull(),
  targetId: integer('target_id').notNull(),
  relationshipType: varchar('relationship_type', { length: 50 }).notNull(),
  createdBy: integer('created_by').references(() => users.id),
  createdByAi: boolean('created_by_ai').default(false),
  aiConfidence: varchar('ai_confidence', { length: 10 }),
  transcriptId: integer('transcript_id').references(() => meetingTranscripts.id),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const statusUpdateReviewQueue = pgTable('status_update_review_queue', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  transcriptId: integer('transcript_id').references(() => meetingTranscripts.id),
  itemDescription: text('item_description').notNull(),
  assignee: text('assignee'),
  statusChange: text('status_change').notNull(),
  evidence: text('evidence').notNull(),
  progressDetails: text('progress_details'),
  aiConfidence: integer('ai_confidence'),
  unmatchedReason: text('unmatched_reason'),
  closestMatch: text('closest_match'),
  createdBy: integer('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  resolved: boolean('resolved').default(false),
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: integer('resolved_by').references(() => users.id),
});

export const aiAnalysisAudit = pgTable('ai_analysis_audit', {
  id: serial('id').primaryKey(),
  transcriptId: integer('transcript_id').notNull().references(() => meetingTranscripts.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  action: varchar('action', { length: 50 }).notNull(),
  itemType: varchar('item_type', { length: 20 }),
  itemId: integer('item_id'),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const issueComments = pgTable('issue_comments', {
  id: serial('id').primaryKey(),
  issueId: integer('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  comment: text('comment').notNull(),
  mentions: jsonb('mentions'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at'),
  edited: boolean('edited').default(false),
});

export const actionItemComments = pgTable('action_item_comments', {
  id: serial('id').primaryKey(),
  actionItemId: integer('action_item_id').notNull().references(() => actionItems.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  comment: text('comment').notNull(),
  mentions: jsonb('mentions'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at'),
  edited: boolean('edited').default(false),
});

export const mentionNotifications = pgTable('mention_notifications', {
  id: serial('id').primaryKey(),
  recipientUserId: integer('recipient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sourceCommentType: varchar('source_comment_type', { length: 20 }).notNull(),
  sourceCommentId: integer('source_comment_id').notNull(),
  sourceItemType: varchar('source_item_type', { length: 20 }).notNull(),
  sourceItemId: integer('source_item_id').notNull(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  unread: boolean('unread').default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

export const projectInvitations = pgTable('project_invitations', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  inviterId: integer('inviter_id').notNull().references(() => users.id),
  inviteeEmail: varchar('invitee_email', { length: 255 }).notNull(),
  inviteeUserId: integer('invitee_user_id').references(() => users.id),
  role: varchar('role', { length: 50 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  invitationToken: varchar('invitation_token', { length: 255 }).notNull().unique(),
  message: text('message'),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  respondedAt: timestamp('responded_at'),
});

export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  color: varchar('color', { length: 50 }).notNull(),
  description: text('description'),
  tagType: varchar('tag_type', { length: 20 }).notNull().default('issue_action'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const issueTags = pgTable('issue_tags', {
  id: serial('id').primaryKey(),
  issueId: integer('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
});

export const actionItemTags = pgTable('action_item_tags', {
  id: serial('id').primaryKey(),
  actionItemId: integer('action_item_id').notNull().references(() => actionItems.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
});

export const riskTags = pgTable('risk_tags', {
  id: serial('id').primaryKey(),
  riskId: integer('risk_id').notNull(),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
});
