# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures, thereby enhancing project oversight and efficiency.

## Recent Changes (October 2025)
- **Checklist System Phase 1** (October 14, 2025): Implemented comprehensive checklist system database schema and seeded Access Verification template for S4Carlisle Cloud Migration:
  - **7 Database Tables Created**: checklist_templates, checklist_template_sections, checklist_template_items, checklists, checklist_responses, checklist_comments, checklist_signoffs
  - **Schema Strategy**: Added Drizzle ORM definitions to schema.ts for documentation; used raw SQL CREATE TABLE statements for actual table creation to avoid migration conflicts with orphaned tables
  - **Key Features**: Hierarchical section structure with parent_section_id, GENERATED ALWAYS AS completion_percentage column, UNIQUE constraint on (checklist_id, template_item_id), CASCADE deletes for referential integrity
  - **Field Types Supported**: checkbox, text, textarea, date, radio, dropdown with JSON field_options
  - **Indexes Created**: 6 performance indexes on project_id, status, assigned_to, checklist_id, template_id, section_id
  - **Access Verification Template**: Seeded with 10 main sections (Server Access, Access Methods, Admin Credentials, Access Levels, Security, Documentation, Validation, Security Considerations, Deliverables, Sign-Off)
  - **Template Statistics**: 1 template, 55 total sections (10 main + 45 subsections), 303 checklist items with proper field types and validation rules
  - **Sample Section 1.1**: Pathfinder Application Servers with 8 items (hostname, access confirmed, RDP tested, credentials validated, access level radio, tested by, date, notes)
  - **Seed Script**: seed-checklist.js uses @neondatabase/serverless for template population
  - Files: schema.ts, seed-checklist.js
- **Done Column Delivery Performance Badges** (October 14, 2025): Implemented status history tracking and delivery performance badges for completed items:
  - **Status History Table**: Created `status_history` table to track all status transitions with audit trail (item_type, item_id, from_status, to_status, changed_by, changed_at)
  - **Backend Logging**: Both Issues and Action Items PATCH endpoints now log status changes to history table when status field changes
  - **Completion Timestamp**: GET endpoints use LEFT JOIN LATERAL to fetch most recent 'Done' status change as `completed_at` field
  - **Badge Logic Enhancement**: Updated `createDueDateBadge()` to show delivery performance for Done items:
    - **On Time** (green) - Completed on due date
    - **X days early** (blue) - Completed before due date
    - **X days late** (red) - Completed after due date
    - **Completed** (gray) - No due date or completion timestamp
  - **Non-Done Items**: Continue showing urgency badges (overdue, due today, due soon, future)
  - **CSS Styles**: Added 4 new badge variants with distinct color coding for delivery performance
  - **User Value**: Done column now provides meaningful delivery metrics instead of confusing urgency indicators
  - **Performance**: LATERAL join efficiently returns single row per item without N+1 queries
  - Cache version: app.js v32, Files updated: schema.ts, server.js, app.js, index.html
- **@Mention Dropdown Positioning Fix** (October 14, 2025): Fixed @mention autocomplete dropdown not appearing in Item Detail Modal comments:
  - **Root Cause**: Dropdown with absolute positioning lacked proper relative positioning context in parent container
  - **Solution**: Wrapped textarea and dropdown in dedicated `<div class="relative">` container, separate from flex button row
  - **Previous Oct 13 Fix**: Backend endpoint and field names were correct (`/api/projects/:projectId/team`, `member.name`)
  - **CSS Structure Fix**: Ensured dropdown anchors directly to textarea without interference from sibling flex layouts
  - **Result**: @mention typing now correctly displays team member autocomplete dropdown below textarea
  - Files updated: index.html (lines 676-698)
- **Item Detail Modal Due Date Display** (October 14, 2025): Added due date display with urgency badge to Issue and Action Item detail modals:
  - **createDueDateBadge() Function**: Added to comments.js to provide same badge functionality as Kanban cards
  - **Modal Enhancement**: Detail modal now displays due date section below Status/Priority/Assigned To/Created grid
  - **Visual Urgency Indicators**: Same color-coded badges (overdue in red, today in orange, soon in yellow, future in blue, none in gray)
  - **User Request**: Users can now see due date urgency at a glance when viewing item details and comments
  - Cache version: comments.js v3
- **Teams Notification URL Fix** (October 14, 2025): Fixed Teams notification links pointing to incorrect workspace URL instead of production deployment:
  - **Root Cause**: getAppUrl() functions in three service files prioritized workspace URL over deployment URL
  - **Services Updated**: teamsNotifications.js, schedulerService.js, notificationService.js
  - **URL Priority Logic**: 
    1. Custom APP_URL environment variable (for production)
    2. REPLIT_DOMAINS (automatic for deployed apps)
    3. REPLIT_DEV_DOMAIN (development workspace)
    4. Localhost fallback
  - **Production Setup**: Set APP_URL environment variable to your production domain (e.g., `https://your-app.repl.co`)
  - All "View Action" and "View Issue" buttons in Teams notifications now correctly link to production deployment
- **Due Date Badge Restoration & Fix** (October 14, 2025): Restored visual due date badges on Kanban cards that were accidentally deleted in Risk Register commit:
  - **createDueDateBadge() Function**: Restored function with color-coded badges for different urgency levels
  - **Badge Variants**: 
    - Overdue (red) - "X days overdue" with exclamation icon
    - Due Today (orange) - "Due today" with calendar icon
    - Due Tomorrow (yellow) - "Due tomorrow" with clock icon
    - Due Soon 2-3 days (yellow) - "Due in X days" with clock icon
    - Future 4+ days (blue) - "Due in X days" with calendar icon
    - No Due Date (gray) - "No due date" with calendar-times icon
  - **CSS Styles**: Added complete badge styling with border-left accents and mobile responsive design
  - **Card Integration**: Replaced plain date display with badge rendering in Kanban board
  - **Critical Bug Fix**: Fixed field name mismatch where badge was using camelCase `item.dueDate` instead of database snake_case `item.due_date`, causing "No due date" to display for valid dates
  - Badges provide instant visual urgency indicators for better task prioritization
  - Cache version: app.js v31
- **@Mention Autocomplete Fix** (October 13, 2025): Fixed broken @mention autocomplete in comment fields that prevented team member dropdown from appearing:
  - **Root Cause**: Frontend was calling non-existent `/api/projects/:projectId/members` endpoint
  - **Solution**: Updated to use existing `/api/projects/:projectId/team` endpoint
  - **Field Name Alignment**: Changed all references from `member.username` to `member.name` to match backend response structure
  - **Files Updated**: comments.js (loadProjectMembers, setupMentionAutocomplete, showMentionDropdown)
  - Typing "@" followed by team member names now correctly displays autocomplete dropdown with matching users
  - Cache version: comments.js v2
- **Kanban Sorting & Copy Link UI Restoration** (October 13, 2025): Fixed missing sort dropdown UI that prevented sorting functionality from being visible:
  - **Sort Dropdown UI**: Added sort dropdown controls to all four Kanban column headers (To Do, In Progress, Blocked, Done) with 10 sort modes
  - **Event Listeners**: Integrated handleSortChange() event listeners in initializeFilters() for real-time dropdown interaction
  - **Sorting Functions**: All sorting algorithms confirmed working (sortByDueDate, sortByPriorityAndDueDate, sortByOverdueAndPriority, sortBySmartScore)
  - **Copy Link**: Copy Link feature confirmed operational with clipboard API and toast notifications
  - Both features were implemented Oct 9, deleted Oct 11 in risk register commit, code restored Oct 12, UI completed Oct 13
  - Cache version: index.html v29, app.js v29

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles and authentication. Key features include AI analysis capabilities (in-modal search, review queue, smart matching, relationship detection), a comprehensive comment system with markdown support and real-time @mention autocomplete, and a Project Dashboard with analytics, Chart.js visualizations, activity feed, and team performance metrics. UI elements like Kanban boards, tag displays, and risk cards are designed for clarity and interactivity, including icon-based actions and toast notifications.

### Backend
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing. The backend handles complete CRUD operations for core entities, including atomic transactions for tag management and project-level authorization.

### Data Management
A PostgreSQL database stores core entities such as Users, Projects, Issues, Action Items, Meeting Transcripts, and the Risk Register. It also handles relationships (including AI-generated), AI-specific data (Status Update Review Queue, AI analysis audit trail), collaboration data (comments, mention notifications), user preferences, and comprehensive risk management with automatic risk scoring and tracking. Tags are managed with a type system supporting Issues/Actions, Risks, or Both, and stored with proper junction table relationships.

### Request Handling
Express.js handles requests, incorporating `express-rate-limit` for API protection and comprehensive error handling. It supports JSON and URL-encoded data parsing.

### Notifications
The system integrates with Microsoft Teams for instant notifications (issue/action item creation, status changes) and daily scheduled reports (overdue items, project health summaries) using Adaptive Cards.

## External Dependencies

### Core Frameworks
- **Express.js**: Backend web application framework.
- **Axios**: Frontend HTTP client.
- **Tailwind CSS**: Frontend styling.

### Security Libraries
- **Helmet**: Express security headers.
- **CORS**: Cross-Origin Resource Sharing.
- **bcryptjs**: Password hashing.
- **jsonwebtoken**: JWT implementation.
- **express-rate-limit**: API rate limiting.

### Validation & Utilities
- **Joi**: Data validation.
- **Multer**: File uploads.
- **uuid**: Unique ID generation.
- **string-similarity**: Duplicate detection.

### AI Integration
- **OpenAI**: GPT-3.5-Turbo for AI-powered meeting transcript analysis.

### Database & ORM
- **@neondatabase/serverless**: Neon PostgreSQL driver.
- **drizzle-orm**: TypeScript ORM.
- **drizzle-kit**: Schema migration tools.

### Email & Notifications
- **nodemailer**: SMTP email sending library.
- **node-cron**: Scheduled task manager for daily notifications.

### Reporting & Export
- **pdfkit**: Server-side PDF generation for reports.
- **csv-writer**: CSV file generation for data export.

### CDN Services
- **Tailwind CSS CDN**: CSS framework delivery.
- **Unpkg CDN**: JavaScript library delivery.
- **Chart.js**: Data visualization charts for dashboard analytics.