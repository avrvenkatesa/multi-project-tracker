# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system enhances project oversight and efficiency through AI-driven insights and robust security measures. Key capabilities include: AI Meeting Analysis, AI Checklist Generation, Checklist Validation, comprehensive PDF and CSV reporting, and an enhanced comment system with markdown support and @mention autocomplete. The project recently underwent UX improvements with a unified Checklists interface that consolidates linked, standalone, and template checklists into a single tabbed view. The project aims to be a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles, real-time AI analysis capabilities, a comprehensive comment system, and a Project Dashboard with analytics and Chart.js visualizations. UI elements such as Kanban boards, tag displays, risk cards, and a comprehensive checklist system prioritize clarity and interactivity. The UI implements consistent navigation, blue header design with white text, and user information display with responsive design. All inline JavaScript is moved to external files for CSP compliance.

**Checklist Dependency UI** (Phase 3b Feature 5): The checklist-fill.html page includes visual dependency management with blocking indicators (red-bordered items with warning messages), dependency badges showing completion status, "Manage Dependencies" buttons on each item, and a comprehensive dependency modal for adding/removing dependencies with circular dependency prevention, same-checklist validation, and real-time dependency status display.

**Unified Checklists Page** (Latest): The checklists.html page now provides a unified tabbed interface consolidating all checklist functionality in one place:
- **Linked Tab**: Shows all checklists linked to issues or action items with completion percentages and related entities
- **Standalone Tab**: Displays standalone checklists generated from documents with stats dashboard (total checklists, items, documents), search and sort functionality, and quick linking to issues/actions
- **Templates Tab**: Lists all available checklist templates for quick access and usage

The unified interface replaced the separate standalone-checklists.html page, improving UX by centralizing all checklist operations. Users can seamlessly switch between linked checklists, standalone checklists awaiting assignment, and templates. The "Checklist Library" option has been removed from View dropdowns across the application in favor of the Standalone tab.

### Backend
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing. The backend handles complete CRUD operations, atomic transactions for tag management, project-level authorization, comprehensive checklist management, and logging of status changes to a `status_history` table.

**Service Layer:**
- **completion-service.js**: Manages checklist completion actions, including rule management (get, save, delete), completion percentage calculation, and automatic status updates for issues/action items when checklists reach completion thresholds. Supports project-specific and global rules with smart priority-based matching. Integrated into `POST /api/checklists/:id/responses` to automatically trigger status updates.
- **template-service.js**: Handles checklist template operations, auto-create checklist mappings, template library features, and bulk template application. Includes `bulkApplyTemplate()` for applying templates to multiple issues or action items simultaneously (max 100 entities per request) with sequential processing, partial failure support, and detailed success/failure tracking.
- **dependency-service.js**: Manages checklist item dependencies with 5 core functions: `addDependency()` with same-checklist validation and circular dependency error handling, `removeDependency()` for cleanup, `getItemDependencies()` to list dependencies, `checkIfItemBlocked()` with detailed blocking information, and `getItemsDependingOn()` for reverse lookup.
- **document-service.js**: Handles document upload and text extraction from memory buffers for AI checklist generation. Supports PDF, DOCX, and TXT files up to 10MB with validation and metadata extraction.
- **ai-service.js**: Provides AI-powered meeting analysis and checklist generation capabilities.
- **standalone-checklist-service.js** (Phase 4 Mode 3): Manages standalone checklist operations including creation from documents, retrieval, linking to issues/actions (with copy mode support), deletion, and document upload tracking. Provides 7 core functions for complete standalone checklist lifecycle management.

**API Endpoints - Phase 3b Features:**
- **Feature 1**: Auto-create checklists via issue type and action item category mappings
- **Feature 2**: Auto-update issue/action item status when checklists reach completion thresholds
- **Feature 3**: `POST /api/templates/bulk-apply` - Bulk apply templates to multiple issues or action items (max 100 entities)
- **Feature 4**: `GET /api/issues/:id/checklists` - Get all checklists linked to an issue with completion stats; `GET /api/action-items/:id/checklists` - Same for action items; `DELETE /api/checklists/:id/link` - Unlink checklist from entity
- **Feature 5**: Checklist Item Dependencies - Full dependency management with 5 API endpoints:
  - `POST /api/checklist-items/:id/dependencies` - Add dependency
  - `DELETE /api/dependencies/:id` - Remove dependency
  - `GET /api/checklist-items/:id/dependencies` - List all dependencies
  - `GET /api/checklist-items/:id/blocking-status` - Check if item is blocked
  - `GET /api/checklist-items/:id/dependent-items` - Get items depending on this one
  - Integrated into completion endpoint to prevent completing blocked items
  - Circular dependency prevention via database triggers
  - Same-checklist validation
- **Feature 6**: Document Upload + AI Checklist Generation
  - `POST /api/documents/extract` - Upload document (PDF, DOCX, TXT) and extract text for AI processing
  - Memory-based upload (no permanent storage) with 10MB file size limit
  - Returns extracted text, page count, character count, and metadata
  - Integrated with existing AI checklist generation service

**API Endpoints - Phase 4 Mode 3 (Standalone Document Processing):**
- `GET /api/projects/:id/standalone-checklists` - List all standalone checklists for a project with full metadata
- `POST /api/projects/:id/upload-and-generate-standalone` - Upload document and generate standalone checklists with AI
- `POST /api/projects/:id/save-standalone-checklists` - Batch save AI-generated standalone checklists
- `POST /api/checklists/:id/link-to-issue` - Link standalone checklist to issue (move or copy mode)
- `POST /api/checklists/:id/link-to-action` - Link standalone checklist to action item (move or copy mode)
- `DELETE /api/checklists/:id/standalone` - Delete unlinked standalone checklist
- Document upload tracking with generation status, metadata, and error handling

### Data Management
A PostgreSQL database stores core entities such as Users, Projects, Issues, Action Items, Meeting Transcripts, and the Risk Register. It manages relationships, AI-specific data (Status Update Review Queue, AI analysis audit trail, checklist generation sources), collaboration data (comments, mention notifications), user preferences, and comprehensive risk management with automatic risk scoring and tracking. Tags are managed with a type system. A dedicated `status_history` table tracks all status transitions. A comprehensive checklist system stores templates, sections, items, responses, comments, and signoffs, with generated completion percentages, performance indexes, and validation history. Database schemas for checklist templates include `is_public`, `is_featured`, `tags`, `usage_count`, and `avg_rating`, with related `template_ratings`, `template_usage`, and `template_categories` tables. Auto-creation of checklists is supported via `issue_type_templates` and `action_item_category_templates` tables, linked to `action_item_categories` and the `action_items` table. `checklist_completion_actions` stores rules for auto-updating issue/action item status upon checklist completion. `checklist_item_dependencies` tracks dependencies between checklist items with database-level circular dependency prevention via triggers and functions, and a `checklist_item_dependency_status` view for tracking dependency completion status.

**Phase 4 - Standalone Document Processing** (Database Schema): The `checklists` table now supports standalone checklists with `is_standalone` flag, `source_document` filename tracking, `linked_at` timestamp, `linked_by` user reference, and `document_metadata` JSONB field. A new `document_uploads` table tracks uploaded documents with generation status, file metadata, and error tracking. The `view_standalone_checklists` view provides a convenient query interface for standalone checklists with full metadata. Helper functions `link_checklist_to_issue()` and `link_checklist_to_action()` support linking standalone checklists to issues or action items, with optional copy-and-link functionality to preserve standalone originals.

### AI Features
-   **AI Meeting Analysis**: Two-phase processing for item extraction and status update detection, with in-modal search and a persistent review queue.
-   **AI Checklist Generation**: Generates comprehensive checklists from issue/action descriptions and uploaded documents (PDF, DOCX, TXT), supporting multi-checklist generation from complex documents. It leverages large token limits and specific prompting techniques for exhaustive extraction. The generation process includes a 5-step visual progress indicator, selective checklist creation, and enhanced batch preview display. Error handling includes partial batch failure UI with distinct visual indicators and retry functionality, rate limiting display, and attachment error handling.
-   **Checklist Validation**: Provides intelligent quality scoring, required field validation, consistency checks, and recommendations.

### Reporting & Export
-   **PDF Export**: Generates professional PDF reports for checklists with progress bar rendering.
-   **CSV Export**: Provides CSV file generation for data export.

## External Dependencies

### Core Frameworks
-   **Express.js**: Backend web application framework.
-   **Axios**: Frontend HTTP client.
-   **Tailwind CSS**: Frontend styling.

### Security Libraries
-   **Helmet**: Express security headers.
-   **CORS**: Cross-Origin Resource Sharing.
-   **bcryptjs**: Password hashing.
-   **jsonwebtoken**: JWT implementation.
-   **express-rate-limit**: API rate limiting.

### Validation & Utilities
-   **Joi**: Data validation.
-   **Multer**: File uploads.
-   **uuid**: Unique ID generation.
-   **string-similarity**: Duplicate detection.
-   **pdf-parse**: PDF text extraction.
-   **mammoth**: DOCX text extraction.
-   **file-type**: File type detection.

### AI Integration
-   **OpenAI**: GPT-3.5-Turbo and GPT-4o for AI-powered analysis and checklist generation.
-   **Anthropic**: Claude 3.5 Sonnet support for AI checklist generation.

### Database & ORM
-   **@neondatabase/serverless**: Neon PostgreSQL driver.
-   **drizzle-orm**: TypeScript ORM.
-   **drizzle-kit**: Schema migration tools.

### Email & Notifications
-   **nodemailer**: SMTP email sending library.
-   **node-cron**: Scheduled task manager for daily notifications.

### Reporting & Export
-   **pdfkit**: Server-side PDF generation.
-   **stream-buffers**: Buffer management for PDF generation.
-   **csv-writer**: CSV file generation.

### CDN Services
-   **Chart.js**: Data visualization charts.