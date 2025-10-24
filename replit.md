# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system enhances project oversight and efficiency through AI-driven insights and robust security measures. Key capabilities include: AI Meeting Analysis, AI Checklist Generation, Checklist Validation, comprehensive PDF and CSV reporting, and an enhanced comment system with markdown support and @mention autocomplete. The project aims to be a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles. It includes a Project Dashboard with analytics and Chart.js visualizations, Kanban boards, tag displays, risk cards, and a comprehensive unified checklist system. The UI implements consistent navigation (blue header, white text), responsive design, and prioritizes clarity and interactivity. All inline JavaScript is moved to external files, and event delegation with data attributes (`data-action`, `data-checklist-id`, etc.) is used for CSP compliance. A unified `checklists.html` page consolidates linked, standalone, and template checklists into a single tabbed view, improving UX by centralizing all checklist operations. Project header navigation includes View, AI Analysis, Transcripts, and Create options, all CSP-compliant. Comprehensive filtering and search capabilities with persistent URL parameters are also integrated.

**Checklist Completion Validation**: When moving issues or action items to "Done" status via drag-and-drop, the system validates whether associated checklists are complete. If checklists are incomplete, a warning modal displays the completion percentage and lists remaining items. Users can cancel, view the checklist, or proceed anyway with acknowledgment. Visual badges on kanban cards show real-time checklist progress with color-coded indicators (green for complete, yellow for 50%+, red for <50%). The system blocks status changes if checklist status cannot be verified, preventing silent validation bypasses.

**Checklist Feedback System**: Users can provide thumbs up/down feedback on completed checklists to rate their quality and usefulness. Feedback is persistently stored and displayed with visual indicators (green for positive, red for negative). The system uses real-time state management to ensure feedback is immediately reflected across all UI components. This feature helps track checklist effectiveness and supports continuous improvement.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system. Joi is used for request validation, and bcryptjs for password hashing. The backend handles complete CRUD operations, atomic transactions, project-level authorization, and logging of status changes.

Key service layers include:
-   **Completion Service**: Manages checklist completion, rule management, and automatic status updates.
-   **Template Service**: Handles checklist template operations, auto-create mappings, and bulk template application.
-   **Dependency Service**: Manages checklist item dependencies with circular dependency prevention and blocking indicators.
-   **Document Service**: Handles document upload and text extraction for AI processing.
-   **AI Service**: Provides AI-powered meeting analysis and checklist generation.
-   **Standalone Checklist Service**: Manages standalone checklist lifecycle, including creation from documents, linking, and deletion.
-   **Workstream Detector Service**: AI-powered analysis to identify 3-10 distinct workstreams from project documents, with automatic checklist generation for each workstream (Phase 4 Mode 2).
-   **Checklist Matcher Service**: Intelligent AI-powered matching of generated checklists to existing project issues with confidence scoring (0-100%), semantic analysis, and automatic new issue suggestions for unmatched checklists (Phase 4 Mode 2).

API endpoints support advanced features such as auto-creating checklists, auto-updating issue/action item status based on checklist completion, checklist completion validation (GET /api/issues/:id/checklist-status, GET /api/action-items/:id/checklist-status), bulk applying templates, comprehensive checklist dependency management, document upload for AI processing, full lifecycle management for standalone checklists, and checklist quality feedback (PATCH /api/checklists/:id/feedback) for continuous improvement tracking.

### System Design Choices
The database schema includes core entities like Users, Projects, Issues, Action Items, and a comprehensive checklist system with templates, sections, items, responses, and signoffs. It supports AI-specific data (review queues, audit trails), collaboration data (comments, notifications), user preferences, and risk management. Tags have a type system, and status transitions are tracked in a `status_history` table. Checklist templates include public/featured flags, tags, usage counts, and ratings. Auto-creation of checklists is supported via mappings. `checklist_item_dependencies` tracks dependencies with database-level circular dependency prevention. Standalone checklists are supported with `is_standalone` flags, source document tracking, and linking capabilities. Checklists include a `user_feedback` field for quality ratings ('positive' or 'negative').

### AI Features
-   **AI Meeting Analysis**: Two-phase processing for item extraction and status update detection, with a persistent review queue.
-   **AI Checklist Generation**: Generates comprehensive checklists from issue/action descriptions and uploaded documents (PDF, DOCX, TXT) using OpenAI and Anthropic models. Supports multi-checklist generation, selective creation, batch preview, and robust error handling.
-   **Workstream Detection (Phase 4 Mode 2)**: AI-powered document analysis to identify distinct work areas, phases, or workstreams. Analyzes project documents to detect 3-10 non-overlapping workstreams with automatic extraction of key requirements, dependencies, complexity estimates, and suggested phases. Each workstream receives a focused, actionable checklist (5-15 items) organized into logical sections. Supports both OpenAI GPT-4o and Anthropic Claude 3.5 Sonnet models. Includes comprehensive validation, error handling, and detailed metadata tracking (token usage, document length, workstream count).
-   **Intelligent Issue Matching (Phase 4 Mode 2)**: AI-powered semantic matching of generated checklists to existing project issues. Analyzes checklist content, scope, and complexity against issue titles and descriptions to calculate confidence scores (0-100%). Uses configurable thresholds (≥40% for matches) to prevent low-quality pairings. Provides detailed reasoning for each match decision. Automatically generates new issue suggestions for unmatched checklists with appropriate titles, descriptions, types, and priorities. Supports batch operations for creating issues and linking checklists with full transaction support.
-   **Checklist Validation**: Provides quality scoring, required field validation, and consistency checks.

### Reporting & Export
-   **PDF Export**: Generates professional PDF reports for checklists.
-   **CSV Export**: Provides CSV file generation for data export.

## External Dependencies

### Core Frameworks
-   **Express.js**
-   **Axios**
-   **Tailwind CSS**

### Security Libraries
-   **Helmet**
-   **CORS**
-   **bcryptjs**
-   **jsonwebtoken**
-   **express-rate-limit**

### Validation & Utilities
-   **Joi**
-   **Multer**
-   **uuid**
-   **string-similarity**
-   **pdf-parse**
-   **mammoth**
-   **file-type**

### AI Integration
-   **OpenAI** (GPT-3.5-Turbo, GPT-4o)
-   **Anthropic** (Claude 3.5 Sonnet)

### Database & ORM
-   **@neondatabase/serverless**
-   **drizzle-orm**
-   **drizzle-kit**

### Email & Notifications
-   **nodemailer**
-   **node-cron**

### Reporting & Export
-   **pdfkit**
-   **stream-buffers**
-   **csv-writer**

### CDN Services
-   **Chart.js**