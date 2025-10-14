# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (October 2025)
- **Checklist System Phase 2 - Backend API** (October 14, 2025): Implemented 6 RESTful API endpoints for checklist CRUD operations with secure permission handling:
  - **Critical Bug Fix**: Fixed SQL queries referencing non-existent `u.name` column - changed to `u.username` in 6 locations (list, details, comments, signoffs)
  - **Security Fix**: Added `status = 'active'` filters to prevent inactive project members from accessing checklists
  - **Utility Functions**: generateChecklistId(), getUserProjectIds(), canAccessChecklist() with active member filtering
  - **GET /api/checklists**: List checklists with filtering by project_id, status, template_id, assigned_to (only accessible projects)
  - **GET /api/checklists/:id**: Retrieve full checklist with template structure, responses, comments, signoffs
  - **POST /api/checklists**: Create checklist from template with total_items calculation and unique ID generation
  - **PUT /api/checklists/:id**: Update checklist metadata (title, description, status, assigned_to, due_date) with COALESCE for partial updates
  - **POST /api/checklists/:id/responses**: Save responses with transaction handling (BEGIN/COMMIT/ROLLBACK), auto-updates completed_items and status
  - **DELETE /api/checklists/:id**: Delete checklist with CASCADE to responses, comments, signoffs
  - **Permission Model**: All endpoints verify active project membership before data access
  - **Transaction Safety**: Response endpoint uses database transactions for atomic multi-step operations
  - **Field Routing**: checkbox/radio → response_boolean, date → response_date, text/textarea → response_value
  - **Status Auto-Update**: Checklist status auto-transitions: not-started (0 items) → in-progress (partial) → completed (all items)
  - Files updated: server.js
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