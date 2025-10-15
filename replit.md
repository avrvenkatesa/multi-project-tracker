# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures, envisioning a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (October 2025)
- **PDF Export for Checklists - Phase 2a - COMPLETE** (October 15, 2025):
  - **Backend**: Comprehensive PDF service (services/pdf-service.js) using pdfkit, chartjs-node-canvas, and stream-buffers
  - **API**: GET /api/checklists/:id/export/pdf endpoint with format and inclusion query parameters
  - **Frontend**: Export button on checklist detail page, modal with format selection (full/summary/completed-only) and inclusion options (comments/charts/metadata)
  - **PDF Features**: Professional formatting with header/footer, metadata section, progress doughnut chart, checklist items with responses, sign-off section with signatures or placeholders, page numbers on all pages
  - **Format Options**: Full Report (all data), Summary (key info only), Completed Items Only (filtered view)
  - **Inclusion Options**: Toggle comments, progress charts, and metadata sections
  - **File Management**: Auto-generated filenames with checklist ID and timestamp, proper content-disposition headers for downloads
  - **Error Handling**: Authentication checks, project access validation, graceful chart generation failures
  - **Deliverables**: TESTING_PDF_EXPORT.md (comprehensive testing guide with 10 manual test cases)
  - **Files**: services/pdf-service.js, server.js, public/checklist-fill.html, public/js/checklists.js, TESTING_PDF_EXPORT.md

- **AI Checklist Generation - Phase 2a - ALL 4 STAGES COMPLETE** (October 15, 2025):
  - **Stage 1 (Foundation)**: Backend AI service, database schema, 4 API endpoints, dual provider support (OpenAI GPT-4o/Anthropic Claude)
  - **Stage 2 (Integration)**: UI buttons on all cards, generation modal with 3 states (loading/error/preview)
  - **Stage 3 (Polish)**: Enhanced animations (pulse rings, sparkle, bouncing dots), improved error messages with troubleshooting, numbered sections with item counts, template promotion toast with benefits, keyboard shortcuts (Escape/Enter/R), tooltips with rate limits
  - **Stage 4 (Testing)**: Comprehensive test suite with 20 manual test cases + 7 automated tests covering authentication, generation, rate limiting, error handling, template promotion, and data persistence
  - **Deliverables**: TESTING_AI_CHECKLIST.md (comprehensive guide), test-ai-checklist.js (automated script), STAGE4_QUICKSTART.md (quick start guide)
  - **Test Coverage**: Functional (generation, templates, errors), UI/UX (animations, shortcuts, tooltips), Integration (end-to-end), Database (persistence), Performance (speed), Security (auth, validation), Regression (existing features)
  - **Rate Limiting**: 10 AI generations per hour per user (in-memory, Phase 2b: persist to database)
  - **Known Limitations**: In-memory rate limiting, no custom instructions yet, no cost tracking (all Phase 2b)
  - **Files**: services/ai-service.js, server.js, public/app.js, public/index.html, TESTING_AI_CHECKLIST.md, test-ai-checklist.js, STAGE4_QUICKSTART.md

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS. It features a dynamic UI based on user roles, real-time AI analysis capabilities (in-modal search, review queue), a comprehensive comment system with markdown support and @mention autocomplete, and a Project Dashboard with analytics, Chart.js visualizations, and team performance metrics. UI elements like Kanban boards, tag displays, risk cards, and a comprehensive checklist system prioritize clarity and interactivity. Consistent header design and universal dropdown navigation are applied across all project-aware pages.

### Backend
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing. The backend handles complete CRUD operations for core entities, including atomic transactions for tag management, project-level authorization, and checklist management. Status changes are logged to a `status_history` table for auditing.

### Data Management
A PostgreSQL database stores core entities such as Users, Projects, Issues, Action Items, Meeting Transcripts, and the Risk Register. It manages relationships, AI-specific data (Status Update Review Queue, AI analysis audit trail), collaboration data (comments, mention notifications), user preferences, and comprehensive risk management with automatic risk scoring and tracking. Tags are managed with a type system supporting Issues/Actions, Risks, or Both. A dedicated `status_history` table tracks all status transitions. A comprehensive checklist system stores templates, sections, items, responses, comments, and signoffs, with generated completion percentages and performance indexes.

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
- **OpenAI**: GPT-3.5-Turbo for AI-powered meeting transcript analysis, GPT-4o for AI checklist generation.
- **Anthropic**: Claude 3.5 Sonnet support for AI checklist generation (alternative to OpenAI).

### Database & ORM
- **@neondatabase/serverless**: Neon PostgreSQL driver.
- **drizzle-orm**: TypeScript ORM.
- **drizzle-kit**: Schema migration tools.

### Email & Notifications
- **nodemailer**: SMTP email sending library.
- **node-cron**: Scheduled task manager for daily notifications.

### Reporting & Export
- **pdfkit**: Server-side PDF generation for reports and checklist exports.
- **chartjs-node-canvas**: Server-side chart rendering for PDF reports (progress charts, analytics).
- **stream-buffers**: Buffer management for PDF generation and streaming.
- **csv-writer**: CSV file generation for data export.

### CDN Services
- **Chart.js**: Data visualization charts for dashboard analytics.