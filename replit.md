# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (October 2025)
- **Checklist ID Schema Fix** (October 14, 2025): Fixed database schema mismatch causing 500 error when creating checklists:
  - **Issue**: Generated checklist IDs (CHK-{timestamp}-{random}) were 21+ characters but column was varchar(20)
  - **Fix**: Increased checklist_id column from varchar(20) to varchar(30) using ALTER TABLE
  - **Files**: schema.ts (updated definition), database (column altered directly)
- **CSP Compliance Enhancement** (October 14, 2025): Eliminated all Content Security Policy violations by implementing event delegation pattern across the entire application:
  - **HTML Files**: Removed all inline event handlers (onclick, onchange, oninput) from index.html, checklists.html, and checklist-fill.html
  - **Navigation Buttons**: Fixed Checklists button in index.html - removed inline onclick handler, added addEventListener in app.js setupEventListeners()
  - **Project Cards**: Fixed toggle description "More" button - removed inline onclick, added e.stopPropagation() to prevent card click propagation
  - **Event Delegation**: Implemented setupChecklistsPageListeners() and setupChecklistFillPageListeners() functions for unobtrusive JavaScript
  - **Data Attributes**: Replaced inline handlers with data-* attributes (data-checklist-id, data-section-id, data-item-id) for dynamic elements
  - **Event Listeners**: Static elements use addEventListener, dynamic elements use event delegation on parent containers
  - **Field Input Handling**: Delegated change/input events on sectionsContainer for checkbox, date, radio, dropdown (change), text/textarea (input with debounce)
  - **Browser Console**: Zero CSP violations confirmed across all pages - only expected Tailwind CDN warnings and auth errors for unauthenticated users
  - **Production Ready**: Fully CSP-compliant frontend suitable for production deployment with strict Content Security Policy headers
  - Files: public/index.html, public/app.js, public/checklists.html, public/checklist-fill.html, public/js/checklists.js
- **Checklist System Phase 3 - Frontend UI** (October 14, 2025): Implemented complete frontend interface for checklist management with responsive design and all field type support:
  - **Files Created**: public/checklists.html (list view), public/checklist-fill.html (filling interface), public/js/checklists.js (functionality), public/css/checklists.css (styling)
  - **Navigation**: Added Checklists button to index.html main navigation bar
  - **List View Features**: Checklist cards with progress bars, status badges (not-started/in-progress/completed/approved), filtering by project/status/template, create modal with template selection
  - **Fill Interface Features**: Hierarchical collapsible sections, all field types supported (checkbox, text, textarea, date, radio, dropdown), auto-save with 500ms debounce, real-time progress updates with circular progress indicator and bar
  - **Progress Tracking**: Auto-calculates completion percentage, updates status transitions (not-started → in-progress → completed), displays completed vs total items
  - **Comments System**: Add comments to checklists, display with commenter name and timestamp
  - **Field Type Rendering**: Checkbox (immediate save), text/textarea (debounced save), date picker, radio buttons, dropdown selects with JSON options parsing
  - **Security**: Cookie-based authentication, CSP-compliant (no inline scripts), 401/403 handling with redirect to login
  - **Responsive Design**: Mobile-first CSS, grid layout for cards, collapsible sections for mobile, accessible form controls with focus states
  - **Status Colors**: Gray (not-started), Blue (in-progress), Green (completed), Purple (approved)
  - **API Integration**: Calls /api/checklist-templates, /api/checklists (GET/POST/PUT/DELETE), /api/checklists/:id/responses, /api/checklists/:id/comments
  - Files: public/checklists.html, public/checklist-fill.html, public/js/checklists.js, public/css/checklists.css, public/index.html
- **Checklist System Phase 2 - Backend API** (October 14, 2025): Implemented 8 RESTful API endpoints for checklist CRUD operations with secure permission handling:
  - **Critical Bug Fix**: Fixed SQL queries referencing non-existent `u.name` column - changed to `u.username` in 6 locations (list, details, comments, signoffs)
  - **Security Fix**: Added `status = 'active'` filters to prevent inactive project members from accessing checklists
  - **Utility Functions**: generateChecklistId(), getUserProjectIds(), canAccessChecklist() with active member filtering
  - **GET /api/checklist-templates**: List all available templates with name, description, icon, category
  - **GET /api/checklists**: List checklists with filtering by project_id, status, template_id, assigned_to (only accessible projects)
  - **GET /api/checklists/:id**: Retrieve full checklist with template structure, responses, comments, signoffs
  - **POST /api/checklists**: Create checklist from template with total_items calculation and unique ID generation
  - **PUT /api/checklists/:id**: Update checklist metadata (title, description, status, assigned_to, due_date) with COALESCE for partial updates
  - **POST /api/checklists/:id/responses**: Save responses with transaction handling (BEGIN/COMMIT/ROLLBACK), auto-updates completed_items and status, returns updated checklist
  - **POST /api/checklists/:id/comments**: Add comment to checklist with commenter tracking
  - **DELETE /api/checklists/:id**: Delete checklist with CASCADE to responses, comments, signoffs
  - **Permission Model**: All endpoints verify active project membership before data access
  - **Transaction Safety**: Response endpoint uses database transactions for atomic multi-step operations
  - **Field Routing**: checkbox/radio → response_boolean, date → response_date, text/textarea → response_value
  - **Status Auto-Update**: Checklist status auto-transitions: not-started (0 items) → in-progress (partial) → completed (all items)
  - Files updated: server.js (8 endpoints total)
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

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles and authentication. Key features include AI analysis capabilities (in-modal search, review queue, smart matching, relationship detection), a comprehensive comment system with markdown support and real-time @mention autocomplete, and a Project Dashboard with analytics, Chart.js visualizations, activity feed, and team performance metrics. UI elements like Kanban boards, tag displays, and risk cards are designed for clarity and interactivity, including icon-based actions and toast notifications. The system also includes a comprehensive checklist system with hierarchical sections, various field types, and status auto-updates. Visual due date badges with urgency indicators are integrated into Kanban cards and detail modals, and delivery performance badges are displayed for completed items.

### Backend
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing. The backend handles complete CRUD operations for core entities, including atomic transactions for tag management, project-level authorization, and checklist management. It also logs status changes to a `status_history` table for auditing and performance metrics.

### Data Management
A PostgreSQL database stores core entities such as Users, Projects, Issues, Action Items, Meeting Transcripts, and the Risk Register. It also handles relationships (including AI-generated), AI-specific data (Status Update Review Queue, AI analysis audit trail), collaboration data (comments, mention notifications), user preferences, and comprehensive risk management with automatic risk scoring and tracking. Tags are managed with a type system supporting Issues/Actions, Risks, or Both, and stored with proper junction table relationships. A dedicated `status_history` table tracks all status transitions. A comprehensive checklist system stores templates, sections, items, responses, comments, and signoffs, with generated completion percentages and performance indexes.

### Request Handling
Express.js handles requests, incorporating `express-rate-limit` for API protection and comprehensive error handling. It supports JSON and URL-encoded data parsing.

### Notifications
The system integrates with Microsoft Teams for instant notifications (issue/action item creation, status changes) and daily scheduled reports (overdue items, project health summaries) using Adaptive Cards. Notifications include correctly formed URLs to the application.

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