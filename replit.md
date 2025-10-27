# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system enhances project oversight and efficiency through AI-driven insights and robust security measures. Key capabilities include: AI Meeting Analysis, AI Checklist Generation, Checklist Validation, comprehensive PDF and CSV reporting, and an enhanced comment system with markdown support and @mention autocomplete. The project aims to be a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles. It includes a Project Dashboard with analytics and Chart.js visualizations, Kanban boards, tag displays, risk cards, and a comprehensive unified checklist system. The UI implements consistent navigation (blue header, white text), responsive design, and prioritizes clarity and interactivity. All inline JavaScript is moved to external files, and event delegation with data attributes (`data-action`, `data-checklist-id`, etc.) is used for CSP compliance. A unified `checklists.html` page consolidates linked, standalone, and template checklists into a single tabbed view, improving UX by centralizing all checklist operations. Project header navigation includes View, AI Analysis, Transcripts, and Create options, all CSP-compliant. Comprehensive filtering and search capabilities with persistent URL parameters are also integrated.

**Checklist Completion Validation**: When moving issues or action items to "Done" status via drag-and-drop, the system validates whether associated checklists are complete. If checklists are incomplete, a warning modal displays the completion percentage and lists remaining items. Users can cancel, view the checklist, or proceed anyway with acknowledgment. Visual badges on kanban cards show real-time checklist progress with color-coded indicators (green for complete, yellow for 50%+, red for <50%). When an issue has multiple checklists, individual badges are displayed for each checklist with abbreviated names (using acronyms or truncation), allowing users to see the status of each checklist at a glance. Tooltips provide full checklist names and detailed completion information. The system blocks status changes if checklist status cannot be verified, preventing silent validation bypasses.

**Checklist Feedback System**: Users can provide thumbs up/down feedback on completed checklists to rate their quality and usefulness. Feedback is persistently stored and displayed with visual indicators (green for positive, red for negative). The system uses real-time state management to ensure feedback is immediately reflected across all UI components. This feature helps track checklist effectiveness and supports continuous improvement.

**Project-Level Checklist Completion Toggle**: Project owners and administrators can enable or disable checklist completion enforcement at the project level via the Edit Project modal. When enabled (default), the system shows checklist progress badges on kanban cards and enforces completion validation when moving items to "Done" status. When disabled, badges are hidden and validation is skipped, allowing teams flexibility to use checklists as optional guides. The feature is fully backward compatible - existing projects default to enabled, and the toggle only affects future actions without retroactive enforcement. The implementation includes database storage (checklist_completion_enabled column), frontend UI controls, and case-insensitive status validation.

**Effort Estimates Tab**: The detail modal includes a dedicated "📊 Effort Estimates" tab providing comprehensive estimate management and version history. Features include: complete version history with visual source icons (🎯 Initial Analysis, 📝 Transcript Update, 🔄 Manual Regeneration, ✏️ Manual Edit, ⚡ Hybrid Selection) and color-coded confidence badges (green=high, yellow=medium, red=low); version comparison highlighting showing changes between estimates (AI hours ↑/↓, confidence shifts, hybrid adjustments); collapse/expand functionality (shows last 3 versions by default with "Show All" option); CSV export for complete estimate history; full estimation UI with manual input, AI/Hybrid estimate displays with breakdown modals, three-way selector for planning estimate source, Generate AI Estimate button, and Save Changes functionality that updates without closing the modal; permission-based controls that disable editing features for users without appropriate access (requires owner/assignee/team lead+ role). All changes persist across sessions and sync with kanban/table views.

**Quick Log Time**: Kanban cards feature a "⏱️ Log" button (visible to Team Members and above) enabling rapid time entry without opening the full detail modal. The modal provides streamlined time logging with validation (0.25-24 hours), optional notes, loading states, and immediate board refresh. Implementation uses CSP-compliant event delegation with data attributes and secure textContent rendering to prevent XSS attacks. Multiple time logs per day are supported, and the feature integrates with the backend `/log-time` endpoint for immediate persistence. The system automatically refreshes actual hours and completion percentages on cards after successful logging.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system. Joi is used for request validation, and bcryptjs for password hashing. The backend handles complete CRUD operations, atomic transactions, project-level authorization, and logging of status changes.

**Performance Optimizations**: The system implements several performance optimizations for fast page loads and responsive filtering:
- **Bulk Metadata Endpoint** (`/api/projects/:projectId/items-metadata`): Replaces 150+ individual API calls with a single bulk request that returns all relationships, comments, and checklist statuses for all items in a project.
- **Debounced Search**: Search input uses 300ms debouncing to prevent excessive API calls while typing.
- **Loading Indicators**: Visual feedback during data loading improves user experience.
- **Performance Monitoring**: Page load times are logged to console for monitoring (typical load time: <500ms).
- **Non-blocking Queue Loading**: Review queue loads asynchronously to avoid blocking main UI rendering.

Key service layers include:
-   **Completion Service**: Manages checklist completion, rule management, and automatic status updates.
-   **Template Service**: Handles checklist template operations, auto-create mappings, and bulk template application.
-   **Dependency Service**: Manages checklist item dependencies with circular dependency prevention and blocking indicators.
-   **Document Service**: Handles document upload and text extraction for AI processing.
-   **AI Service**: Provides AI-powered meeting analysis and checklist generation.
-   **Standalone Checklist Service**: Manages standalone checklist lifecycle, including creation from documents, linking, and deletion.
-   **Workstream Detector Service**: AI-powered analysis to identify 3-10 distinct workstreams from project documents, with automatic checklist generation for each workstream (Phase 4 Mode 2).
-   **Checklist Matcher Service**: Intelligent AI-powered matching of generated checklists to existing project issues with confidence scoring (0-100%), semantic analysis, and automatic new issue suggestions for unmatched checklists (Phase 4 Mode 2).
-   **Topological Sort Service**: Orders tasks based on dependencies using Kahn's algorithm for dependency-based scheduling.
-   **Schedule Calculation Service**: Calculates project schedules with start/end dates, critical path analysis, risk detection, and resource allocation timelines based on effort estimates and dependencies.

API endpoints support advanced features such as auto-creating checklists, auto-updating issue/action item status based on checklist completion, checklist completion validation (GET /api/issues/:id/checklist-status, GET /api/action-items/:id/checklist-status), bulk applying templates, comprehensive checklist dependency management, document upload for AI processing, full lifecycle management for standalone checklists, checklist quality feedback (PATCH /api/checklists/:id/feedback) for continuous improvement tracking, effort estimate version history (GET /api/issues/:id/effort-estimate-history, GET /api/action-items/:id/effort-estimate-history) for comprehensive estimate tracking and audit trails, and project scheduling (POST /api/projects/:projectId/schedules, GET /api/projects/:projectId/schedules, GET /api/schedules/:scheduleId, DELETE /api/schedules/:scheduleId) for creating and managing dependency-based project timelines with critical path analysis.

### System Design Choices
The database schema includes core entities like Users, Projects, Issues, Action Items, and a comprehensive checklist system with templates, sections, items, responses, and signoffs. It supports AI-specific data (review queues, audit trails), collaboration data (comments, notifications), user preferences, and risk management. Tags have a type system, and status transitions are tracked in a `status_history` table. Checklist templates include public/featured flags, tags, usage counts, and ratings. Auto-creation of checklists is supported via mappings. `checklist_item_dependencies` tracks dependencies with database-level circular dependency prevention. Standalone checklists are supported with `is_standalone` flags, source document tracking, and linking capabilities. Checklists include a `user_feedback` field for quality ratings ('positive' or 'negative').

**Project Scheduling**: The system includes comprehensive scheduling with `project_schedules` (main schedule table with versioning support), `schedule_items` (selected issues/action items per schedule), `task_schedules` (calculated dates, critical path flags, risk indicators), and `schedule_changes` (version comparison tracking). Schedules support multiple scenarios per project (Optimistic, Realistic, MVP), topological sort-based task ordering using dependencies from `issue_relationships`, critical path identification, risk detection (no estimate, no assignee, late finish, high complexity), and resource allocation analysis.

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