# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system enhances project oversight and efficiency through AI-driven insights and robust security measures. Key capabilities include: AI Meeting Analysis, AI Checklist Generation, Checklist Validation, comprehensive PDF and CSV reporting, and an enhanced comment system with markdown support and @mention autocomplete. The project aims to be a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles. It includes a Project Dashboard with analytics and Chart.js visualizations, Kanban boards, tag displays, risk cards, and a comprehensive unified checklist system. A professional enterprise-grade design token system is implemented for UI consistency, including a CSS variable system, shared button components, and WCAG AA compliant styles.

Key UI features include:
- **Project Complexity Configuration**: Three-tier complexity system (Standard/Complex/Enterprise) determining file upload limits, with visual badges.
- **Checklist Management**: Features include completion validation with visual progress badges, user feedback system (thumbs up/down), and a unified tabbed view for linked, standalone, and template checklists.
- **Effort Estimates Tab**: Dedicated tab in the detail modal for comprehensive estimate management, version history, comparison, and CSV export, with AI/Hybrid options.
- **Quick Log Time**: "Log" button on Kanban cards for rapid time entry.
- **Project Scheduling with Advanced Item Selection**: Pre-submission validation, selective estimation, improved status filtering, and multi-select filtering.
- **Strict Resource Assignment Mode**: Optional project-level setting to require all scheduled tasks have assignees for accurate workload calculation.
- **Task-Level Estimate Selection for What-If Analysis**: Pre-schedule review modal allows users to choose estimate types (Planning Source, AI, Manual, Hybrid) for individual tasks, with bulk actions and real-time calculations.
- **Enhanced Schedule Visualization**: Schedule detail view displays assignee information, groups tasks by assignee, and allows inline resource assignment.
- **Professional Schedule Outputs**: Tabbed interface with Timeline, Gantt Chart, and Resources views, plus one-click CSV export. The Gantt chart features interactive timeline visualization, dependency arrows, critical path highlighting, and adjustable view modes.
- **Resource Workload Analysis**: Calculates daily workload, detects overloading, and provides visual warnings and recommendations.
- **Enterprise Gantt Chart Redesign**: Professional redesign with neutral styling, compact view toggle, swim-lane grouping by assignee, interactive dependency chain highlighting, optimized popup layout, and professional view controls.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system. Joi is used for request validation and bcryptjs for password hashing. The backend handles CRUD operations, atomic transactions, project-level authorization, and logging. Performance optimizations include a bulk metadata endpoint, debounced search, and loading indicators.

Key service layers manage completion, templates, dependencies, documents, AI processing, standalone checklists, workstream detection, checklist matching, document classification, topological sort, schedule calculation, AI cost tracking, and timeline extraction.

API endpoints support features like auto-creating checklists, status updates based on checklist completion, bulk template application, comprehensive checklist dependency management, document upload for AI processing, standalone checklist lifecycle, checklist quality feedback, effort estimate version history, and project scheduling with critical path analysis.

### System Design Choices
The database schema includes Users, Projects, Issues, Action Items, and a comprehensive checklist system with templates, sections, items, responses, and signoffs. It supports AI-specific data, collaboration data, user preferences, risk management, and tag typing. `checklist_item_dependencies` tracks dependencies with circular dependency prevention. Standalone checklists and user feedback for quality ratings are supported. `document_classifications` stores AI-generated document classifications with category, confidence, reasoning, and custom category flags.

Projects include a `complexity_level` field (standard/complex/enterprise) with automatic `max_file_uploads` calculation via a database trigger.

Project scheduling involves `project_schedules` (versioning), `schedule_items`, `task_schedules` (calculated dates, critical path, risk indicators), and `schedule_changes`. Schedules support multiple scenarios, topological sort-based task ordering, critical path identification, risk detection, and resource allocation analysis. The schedule creation process queries dependencies from both legacy tables (`issue_dependencies`, `action_item_dependencies`) and the unified `issue_relationships` table, ensuring compatibility with AI-generated dependencies from multi-document processing.

### AI Features
- **AI Meeting Analysis**: Two-phase processing for item extraction and status updates with a persistent review queue and automatic model fallback (GPT-3.5-Turbo to GPT-4o). Supports multi-file document upload with project-based complexity limits.
- **AI Checklist Generation**: Generates comprehensive checklists from issue/action descriptions and uploaded documents using OpenAI GPT-4o.
- **AI Document Classification**: Hybrid classification system using GPT-4o for uploaded documents, checking against base categories and creating custom categories if necessary. Stores classifications with confidence scores and reasoning.
- **AI Timeline Extraction**: Extracts project timeline information from document text using GPT-4o, parsing relative dates and converting them to absolute dates.
- **Workstream Detection**: AI-powered document analysis to identify workstreams, extract requirements, and generate focused checklists using OpenAI GPT-4o.
- **Automatic Effort Estimation (November 2025)**: AI-created issues from multi-document processing automatically receive effort estimates based on workstream complexity. Base estimates: Low=30h, Medium=60h, High=120h, with ±15-20% adjustments based on requirements count. Includes confidence scoring (0.60-0.85) based on description quality, requirements clarity, and document references. Enables immediate schedule creation without manual estimation.
- **Automatic Schedule Generation (November 2025)**: Multi-document processing automatically creates project schedules with Gantt charts after Step 7. Uses reusable `schedulerService.createScheduleFromIssues()` to generate schedules with AI effort estimates, dependencies from `issue_relationships` table, and critical path analysis. Skips creation if schedule already exists (idempotent). Frontend displays "View Schedule & Gantt Chart" button in results with direct navigation to schedule detail view.
- **Intelligent Issue Matching**: AI-powered semantic matching of generated checklists to existing issues, with new issue suggestions.
- **AI Dependency Suggestion**: GPT-4o analyzes tasks and suggests logical dependencies, with automatic circular dependency detection.
- **Comprehensive Cycle Detection**: Multi-layer circular dependency validation prevents invalid dependency graphs at all entry points.
- **Checklist Validation**: Provides quality scoring, required field validation, and consistency checks.
- **Centralized AI Cost Tracking**: All AI features integrate with a centralized cost tracking service that records prompt/completion tokens, total tokens, cost, model used, and feature-specific metadata to the `ai_usage_tracking` table.

### Reporting & Export
- **PDF Export**: Generates professional PDF reports for checklists.
- **CSV Export**: Provides CSV file generation for checklists and project schedules.

## External Dependencies

### Core Frameworks
- Express.js
- Axios
- Tailwind CSS

### Security Libraries
- Helmet
- CORS
- bcryptjs
- jsonwebtoken
- express-rate-limit

### Validation & Utilities
- Joi
- Multer
- uuid
- string-similarity
- pdf-parse
- mammoth
- file-type

### AI Integration
- OpenAI (GPT-3.5-Turbo, GPT-4o)

### Database & ORM
- @neondatabase/serverless
- drizzle-orm
- drizzle-kit

### Email & Notifications
- nodemailer
- node-cron

### Reporting & Export
- pdfkit
- stream-buffers
- csv-writer

### CDN Services
- Chart.js
- Frappe Gantt (v0.6.1)