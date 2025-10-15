# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures, envisioning a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (October 2025)
- **Checklist Validation System - Phase 2a Prompt 3 - COMPLETE** (October 15, 2025):
  - **Database Schema**: New checklist_validations table tracking validation history, quality scores, errors, warnings, and recommendations; added validation status columns to checklists table
  - **Validation Service**: Intelligent quality scoring system (services/validation-service.js) with three validation layers:
    - Required Fields Validation: Flags missing required items
    - Consistency Validation: Checks date validity, text length, placeholder detection, section completion consistency
    - Quality Assessment: Evaluates comments, completion time, AI-generated checklist specifics
  - **Quality Scoring Algorithm**: Weighted scoring system (0-100) with three components:
    - Completeness Score (50% weight): Based on required item completion
    - Consistency Score (30% weight): Deducts points for errors (-10) and warnings (-3)
    - Quality Rating (20% weight): Bonuses for comments (+2 each), detailed responses (+3 each), penalties for placeholders (-5)
  - **Validation Status**: Auto-calculated status (passed/warnings/failed) based on score thresholds and error count
  - **API Endpoints**: POST /api/checklists/:id/validate, GET /api/checklists/:id/validations, GET /api/checklists/:id/validation/latest
  - **Frontend UI**: 
    - Validate Quality button with loading states
    - Rich validation results panel showing score breakdown, errors, warnings, and recommendations
    - Color-coded quality badge (green ≥80, yellow ≥60, red <60)
    - Jump-to-item functionality for quick issue resolution
    - Score-based validation messages (Excellent/Good/Fair/Acceptable/Needs Work)
  - **Validation Rules**:
    - Errors: Required fields missing, invalid dates
    - Warnings: Optional items incomplete >30%, dates >5 years future or >10 years past, brief textarea responses <10 chars, very long responses >5000 chars, placeholder text (todo/tbd/pending/n/a/none/test/xxx), sections <25% complete
    - Recommendations: Add comments for large checklists, verify AI-generated items, complete 50%+ before approval, aim for 80%+ quality
  - **Files**: services/validation-service.js, public/js/checklist-validation.js, server.js, public/checklist-fill.html, public/js/checklists.js

- **PDF Export for Checklists - Phase 2a - COMPLETE & ALL BUGS FIXED** (October 15, 2025):
  - **Backend**: Comprehensive PDF service (services/pdf-service.js) using pdfkit and stream-buffers with native progress bar rendering
  - **API**: GET /api/checklists/:id/export/pdf endpoint with format and inclusion query parameters
  - **Frontend**: Export button on checklist detail page, modal with format selection (full/summary/completed-only) and inclusion options (comments/charts/metadata)
  - **PDF Features**: Professional formatting with header/footer, metadata section, native progress bar (replaced chartjs to avoid antivirus false positives), checklist items with responses, sign-off section with signatures or placeholders
  - **Format Options**: Full Report (all data), Summary (key info only), Completed Items Only (filtered view)
  - **Inclusion Options**: Toggle comments, progress charts, and metadata sections
  - **File Management**: Clean filenames using checklist title (e.g., "Checklist_Title_Report.pdf"), enhanced security headers (X-Content-Type-Options, Cache-Control), proper content-disposition headers for downloads
  - **Download Mechanism**: Improved browser compatibility with delayed triggers, fallback to open-in-tab if download blocked
  - **Error Handling**: Authentication checks, project access validation, graceful error handling
  - **Antivirus Fix**: Complete rewrite using dashboard report PDF generation pattern (proven to work without antivirus issues):
    - Removed problematic chartjs-node-canvas library (failed libuuid.so.1 dependency)
    - Replaced with native PDFKit drawing for progress visualization
    - Switched from stream-buffers to Buffer.concat(chunks) approach (same as dashboard reports)
    - Using event-based PDF generation (doc.on('data'), doc.on('end'))
    - Proper page numbering using bufferedPageRange() method
    - Clean metadata matching dashboard reports (Title, Author, Subject, Keywords, Creator, Producer)
    - PDF structure validation (magic bytes %PDF-, trailer %%EOF)
    - Simple filenames matching dashboard pattern (checklist-report-{id}-{timestamp}.pdf)
    - Minimal HTTP headers (exact same as dashboard reports - Content-Type and Content-Disposition only)
    - Standard fonts only (Helvetica, Helvetica-Bold, Helvetica-Oblique)
    - ASCII-only checkbox symbols ([ ] and [X] instead of Unicode checkboxes)
    - A4 page size for consistency with other reports
  - **Critical Bug Fix - Completion Percentage & Checkbox Display** (October 15, 2025):
    - Fixed incorrect completion calculation: Changed from checking `response_value IS NOT NULL` to `is_completed = true`
    - Fixed missing checkbox responses: Query now includes all response fields (response_boolean, response_date, response_value, is_completed, notes)
    - Fixed PDF display logic: Now properly checks `is_completed` flag instead of just `response_value`
    - Fixed response value extraction: Correctly retrieves data from response_boolean for checkboxes, response_date for dates, response_value for text fields
    - Result: PDFs now show correct 100% completion and display all filled checkbox entries with proper [X] or [ ] symbols
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
- **pdfkit**: Server-side PDF generation for reports and checklist exports with native drawing capabilities for progress bars and visualizations.
- **stream-buffers**: Buffer management for PDF generation and streaming.
- **csv-writer**: CSV file generation for data export.
- **Note**: chartjs-node-canvas removed due to system library conflicts (libuuid.so.1) that caused antivirus false positives; replaced with native PDFKit drawing.

### CDN Services
- **Chart.js**: Data visualization charts for dashboard analytics.