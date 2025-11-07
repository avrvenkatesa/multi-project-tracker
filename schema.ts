import { pgTable, serial, varchar, text, timestamp, integer, boolean, jsonb, date, decimal } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  createdBy: varchar('created_by', { length: 255 }).default('Demo User'),
  createdAt: timestamp('created_at').defaultNow(),
  archived: boolean('archived').default(false),
  archivedAt: timestamp('archived_at'),
  archivedBy: integer('archived_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
  startDate: date('start_date'),
  endDate: date('end_date'),
  teamsWebhookUrl: text('teams_webhook_url'),
  teamsNotificationsEnabled: boolean('teams_notifications_enabled').default(true),
  checklistCompletionEnabled: boolean('checklist_completion_enabled').default(true),
  requireAssigneeForScheduling: boolean('require_assignee_for_scheduling').default(false),
  complexityLevel: varchar('complexity_level', { length: 20 }).default('standard'),
  maxFileUploads: integer('max_file_uploads').default(5),
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
  startDate: date('start_date'),
  endDate: date('end_date'),
  effortHours: decimal('effort_hours', { precision: 10, scale: 2 }),
});

// Action Item Categories
export const actionItemCategories = pgTable('action_item_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  icon: text('icon'),
  displayOrder: integer('display_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
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
  categoryId: integer('category_id').references(() => actionItemCategories.id),
  createdBy: varchar('created_by', { length: 255 }),
  createdViaAiBy: integer('created_via_ai_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const issueDependencies = pgTable('issue_dependencies', {
  id: serial('id').primaryKey(),
  issueId: integer('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  prerequisiteItemType: varchar('prerequisite_item_type', { length: 20 }).notNull(),
  prerequisiteItemId: integer('prerequisite_item_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const actionItemDependencies = pgTable('action_item_dependencies', {
  id: serial('id').primaryKey(),
  actionItemId: integer('action_item_id').notNull().references(() => actionItems.id, { onDelete: 'cascade' }),
  prerequisiteItemType: varchar('prerequisite_item_type', { length: 20 }).notNull(),
  prerequisiteItemId: integer('prerequisite_item_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const statusHistory = pgTable('status_history', {
  id: serial('id').primaryKey(),
  itemType: varchar('item_type', { length: 50 }).notNull(),
  itemId: integer('item_id').notNull(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  fromStatus: varchar('from_status', { length: 50 }),
  toStatus: varchar('to_status', { length: 50 }).notNull(),
  changedBy: integer('changed_by').references(() => users.id),
  changedAt: timestamp('changed_at').defaultNow(),
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

// Checklist System Tables
export const checklistTemplates = pgTable('checklist_templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }),
  icon: varchar('icon', { length: 50 }),
  isActive: boolean('is_active').default(true),
  isSystem: boolean('is_system').default(false),
  isReusable: boolean('is_reusable').default(true),
  isPublic: boolean('is_public').default(false),
  isFeatured: boolean('is_featured').default(false),
  tags: text('tags').array(),
  usageCount: integer('usage_count').default(0),
  ratingSum: integer('rating_sum').default(0),
  ratingCount: integer('rating_count').default(0),
  createdFromChecklistId: integer('created_from_checklist_id'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const checklistTemplateSections = pgTable('checklist_template_sections', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id').notNull().references(() => checklistTemplates.id, { onDelete: 'cascade' }),
  parentSectionId: integer('parent_section_id').references(() => checklistTemplateSections.id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  sectionNumber: varchar('section_number', { length: 20 }),
  displayOrder: integer('display_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const checklistTemplateItems = pgTable('checklist_template_items', {
  id: serial('id').primaryKey(),
  sectionId: integer('section_id').notNull().references(() => checklistTemplateSections.id, { onDelete: 'cascade' }),
  itemText: text('item_text').notNull(),
  fieldType: varchar('field_type', { length: 50 }).notNull(),
  fieldOptions: text('field_options'),
  isRequired: boolean('is_required').default(false),
  helpText: text('help_text'),
  displayOrder: integer('display_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const checklists = pgTable('checklists', {
  id: serial('id').primaryKey(),
  checklistId: varchar('checklist_id', { length: 30 }),
  templateId: integer('template_id').references(() => checklistTemplates.id),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).default('not-started'),
  relatedIssueId: integer('related_issue_id').references(() => issues.id),
  relatedActionId: integer('related_action_id').references(() => actionItems.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  dueDate: date('due_date'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  approvedAt: timestamp('approved_at'),
  approvedBy: integer('approved_by').references(() => users.id),
  totalItems: integer('total_items').default(0),
  completedItems: integer('completed_items').default(0),
  completionPercentage: integer('completion_percentage').generatedAlwaysAs(
    sql`CASE WHEN total_items > 0 THEN (completed_items * 100 / total_items) ELSE 0 END`
  ),
  sourceDocument: text('source_document'),
  isStandalone: boolean('is_standalone').default(false),
  userFeedback: varchar('user_feedback', { length: 20 }),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Checklist Sections (for custom/standalone checklists)
export const checklistSections = pgTable('checklist_sections', {
  id: serial('id').primaryKey(),
  checklistId: integer('checklist_id').notNull().references(() => checklists.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  displayOrder: integer('display_order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const checklistResponses = pgTable('checklist_responses', {
  id: serial('id').primaryKey(),
  checklistId: integer('checklist_id').references(() => checklists.id, { onDelete: 'cascade' }),
  templateItemId: integer('template_item_id').references(() => checklistTemplateItems.id),
  sectionId: integer('section_id').references(() => checklistSections.id, { onDelete: 'cascade' }),
  itemText: text('item_text'),
  displayOrder: integer('display_order').default(0),
  responseValue: text('response_value'),
  responseDate: date('response_date'),
  responseBoolean: boolean('response_boolean'),
  notes: text('notes'),
  isCompleted: boolean('is_completed').default(false),
  completedBy: integer('completed_by').references(() => users.id),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const checklistComments = pgTable('checklist_comments', {
  id: serial('id').primaryKey(),
  checklistId: integer('checklist_id').notNull().references(() => checklists.id, { onDelete: 'cascade' }),
  responseId: integer('response_id').references(() => checklistResponses.id),
  comment: text('comment').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const checklistSignoffs = pgTable('checklist_signoffs', {
  id: serial('id').primaryKey(),
  checklistId: integer('checklist_id').notNull().references(() => checklists.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 100 }).notNull(),
  signedBy: integer('signed_by').references(() => users.id),
  signedAt: timestamp('signed_at'),
  signature: text('signature'),
  comments: text('comments'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Auto-Create Checklist Mapping Tables (Phase 3b Feature 1)
export const issueTypeTemplates = pgTable('issue_type_templates', {
  id: serial('id').primaryKey(),
  issueType: text('issue_type').notNull(),
  templateId: integer('template_id').references(() => checklistTemplates.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').default(true),
  autoCreate: boolean('auto_create').default(true),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const actionItemCategoryTemplates = pgTable('action_item_category_templates', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').references(() => actionItemCategories.id, { onDelete: 'cascade' }),
  templateId: integer('template_id').references(() => checklistTemplates.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').default(true),
  autoCreate: boolean('auto_create').default(true),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Checklist Completion Actions (Phase 3b Feature 2)
// Auto-update issue/action item status when checklist reaches completion
export const checklistCompletionActions = pgTable('checklist_completion_actions', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(), // 'issue' or 'action_item'
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  sourceStatus: text('source_status'), // Status to transition FROM (NULL = any status)
  targetStatus: text('target_status').notNull(), // Status to transition TO
  completionThreshold: integer('completion_threshold').default(100), // 0-100
  isActive: boolean('is_active').default(true),
  notifyAssignee: boolean('notify_assignee').default(true),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Checklist Item Dependencies (Phase 3b Feature 5)
// Tracks dependencies between checklist items - an item cannot be completed until dependencies are met
export const checklistItemDependencies = pgTable('checklist_item_dependencies', {
  id: serial('id').primaryKey(),
  itemId: integer('item_id').notNull().references(() => checklistResponses.id, { onDelete: 'cascade' }),
  dependsOnItemId: integer('depends_on_item_id').notNull().references(() => checklistResponses.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
});
