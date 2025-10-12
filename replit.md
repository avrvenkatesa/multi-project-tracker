# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures, thereby enhancing project oversight and efficiency.

## Recent Changes (October 2025)
- **Edit Modal Complete Fix** (October 12, 2025): Resolved all critical bugs in Edit Issue and Edit Action Item modals:
  - **Tags Loading**: Fixed API calls to use `currentProject.id` instead of `currentProject` object
  - **Assignee Dropdown**: Corrected property access from `member.username` to `member.name` (backend returns 'name' property)
  - **Category Dropdown**: Added dynamic population using `generateCategoryOptions()` before setting value
  - **Save Operation**: Fixed `loadProjectData()` function call (was calling non-existent `loadIssues()`/`fetchProjectData()`)
  - **Action Item Progress**: Corrected field name from `progress_percentage` to `progress` to match database schema
  - All edit modals now fully functional with complete CRUD operations, tag assignment, and proper data refresh
  - Cache version: app.js v23
- **Unified Tag Management System** (Complete): Implemented comprehensive tag type system supporting Issues/Actions, Risks, or Both:
  - **Tag Types**: Added tag_type field (enum: 'issue_action', 'risk', 'both') to tags table with default 'issue_action'
  - **Visual Indicators**: Tags display color-coded badges - Blue (Issues/Actions), Orange (Risks), Purple (Both)
  - **Smart Filtering**: Tag Management page includes filter buttons (All, Issues/Actions, Risks, Both) with active state highlighting
  - **Risk Junction Table**: Created risk_tags table replacing TEXT[] tags, enabling proper tag relationships for risks with foreign key constraints
  - **Secure Backend APIs**: Complete tag assignment endpoints with project-level authorization, tag-type validation, and atomic transactions:
    - GET/PUT `/api/issues/:issueId/tags` - Issue tag management (allows 'issue_action' and 'both' tags only)
    - GET/PUT `/api/action-items/:actionItemId/tags` - Action item tag management (allows 'issue_action' and 'both' tags only)
    - GET/PUT `/api/risks/:riskId/tags` - Risk tag management (allows 'risk' and 'both' tags only)
  - **Security Pattern**: All endpoints verify project access via checkProjectAccess(), validate tag ownership, enforce tag-type constraints, and use BEGIN/COMMIT transactions
  - **Frontend Integration**: Complete multi-select tag dropdowns in all Create/Edit modals:
    - Issue modals: Tag selector with 'issue_action' and 'both' tags, saves via PUT endpoint after create/update
    - Action Item modals: Tag selector with 'issue_action' and 'both' tags, saves via PUT endpoint after create/update
    - Risk modals: Replaced text input with tag selector showing 'risk' and 'both' tags, saves via PUT endpoint after create/update
  - Cache version: tags.html/js v10, app.js v11, risks.js updated
- **Tag Management Complete Restoration**: Rebuilt Tag Management page to match production with full CRUD functionality:
  - **Backend API**: Created complete tags API with GET/POST/PUT/DELETE endpoints at `/api/projects/:projectId/tags` with usage count calculations
  - **UI Components**: Tag cards display colored badges, descriptions, usage counts, and edit/delete controls
  - **RGB Color Picker**: Replaced fixed color palette with HTML5 color input for custom RGB color selection with preview button
  - **Database Integration**: Tags persist to PostgreSQL tags table with proper junction table relationships to issues/action items
- **Comprehensive Teams Notifications**: Implemented complete Microsoft Teams integration with instant notifications and daily scheduled reports:
  - **Instant Notifications**: Real-time Teams alerts for issue/action item creation, status changes, and completions (with celebration 🎉 emoji for Done status)
  - **Daily Scheduled Reports** (9 AM): Automated overdue alerts showing top overdue items with days-overdue count, and project health summaries with health score (0-100), completion rates, and activity metrics
  - **Scheduler Service**: Created schedulerService.js with node-cron for reliable daily notifications at 9 AM (timezone-aware)
  - All notifications use Microsoft Teams Adaptive Cards, respect project-level configuration (teams_webhook_url, teams_notifications_enabled), and run non-blocking
- **Teams Notification Fix**: Fixed "Created by undefined" error in Teams notifications by implementing proper Teams webhook integration in notificationService.js. Issue creation notifications now correctly display creator username via Microsoft Teams Adaptive Cards with all issue details (priority, status, project, due date). Non-blocking notification respects project-level Teams configuration (teams_webhook_url, teams_notifications_enabled).
- **CSP Compliance for Tags Page**: Eliminated all Content Security Policy violations on Tags page by replacing inline onclick handlers with proper event listeners and event delegation. Navigation buttons and tag card clicks now use data attributes with addEventListener instead of inline scripts.
- **Risk Register Currency Selector**: Added multi-currency support for mitigation costs with 18 global currencies (USD, EUR, GBP, JPY, CNY, INR, AUD, CAD, CHF, SEK, NZD, SGD, HKD, NOK, KRW, MXN, BRL, ZAR). Currency selection is persisted in database and displayed with appropriate symbols.
- **Tag System Clarification**: Risk Register tags are stored separately (TEXT[] in risks table) from Issue/Action Item tags (JSONB). The Tags page only displays Issue/Action Item tags, not Risk tags.
- **Modal UX Improvements**: Fixed modal close buttons (X, Cancel, Close) with proper event listeners across all Risk modals.
- **Navigation Consistency**: Unified header design across Risk Register, Tags, and Dashboard pages with intelligent "Back to Project/Projects" button toggling.
- **Risk Register CSP Compliance** (October 12, 2025): Eliminated all Content Security Policy violations on Risk Register page by replacing inline onclick handlers with proper event listeners. All navigation buttons, modal close buttons (X, Cancel, Close), and risk action buttons (View Details, Edit, Delete) now use addEventListener pattern with event delegation instead of inline scripts. Fixed Edit button functionality - now properly opens editable Edit Risk Modal with form fields and Save button instead of read-only detail view. Cache version: risks.js v57.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles and authentication. Key features include AI analysis capabilities (in-modal search, review queue, smart matching, relationship detection), a comprehensive comment system with markdown support and real-time @mention autocomplete, and a Project Dashboard with analytics, Chart.js visualizations, activity feed, and team performance metrics.

### Backend
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing.

### Data Management
A PostgreSQL database stores core entities such as Users, Projects, Issues, Action Items, Meeting Transcripts, and the Risk Register. It also handles relationships (including AI-generated), AI-specific data (Status Update Review Queue, AI analysis audit trail), collaboration data (comments, mention notifications), user preferences, and comprehensive risk management with automatic risk scoring and tracking.

### Request Handling
Express.js handles requests, incorporating `express-rate-limit` for API protection and comprehensive error handling. It supports JSON and URL-encoded data parsing.

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