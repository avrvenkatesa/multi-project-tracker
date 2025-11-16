# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system enhances project oversight and efficiency through AI-driven insights and robust security measures. Key capabilities include: AI Meeting Analysis, AI Checklist Generation, Checklist Validation, comprehensive PDF and CSV reporting, and an enhanced comment system with markdown support and @mention autocomplete. The project aims to be a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles. It includes a Project Dashboard with analytics and Chart.js visualizations, Kanban boards with hierarchical issue display, tag displays, risk cards, and a comprehensive unified checklist system. A professional enterprise-grade design token system is implemented for UI consistency, including a CSS variable system, shared button components, and WCAG AA compliant styles. Key UI features include project complexity configuration, comprehensive checklist management, an effort estimates tab, quick time logging, advanced project scheduling with strict resource assignment, task-level estimate selection for what-if analysis, enhanced schedule visualization, and professional schedule outputs (Timeline, Gantt Chart, Resources views). The Gantt chart features interactive timeline visualization, dependency arrows, critical path highlighting, adjustable view modes, swim-lane grouping, and optimized popups. Resource workload analysis provides visual warnings for overloading.

**Hierarchical Kanban Board**: The Kanban board now supports parent-child issue relationships with expandable/collapsible cards. Epics are displayed with a chevron toggle, indented children (16px per level), epic badges, and indigo borders. Expand/collapse state persists in localStorage per project with global Expand All / Collapse All controls. All existing features (drag-and-drop, metadata badges, quick log, permissions, filtering, search) are preserved. Note: Hierarchy features apply to issues only; action items lack hierarchical relationships in the current data model.

**KanbanCard Component**: A reusable, tested component for rendering hierarchical Kanban cards. Features include HTML rendering with XSS protection, recursive child rendering, expand/collapse functionality, epic progress calculation, and configurable options. The component has comprehensive test coverage with 35 automated tests covering initialization, rendering, hierarchy, expand/collapse, progress calculation, and edge cases.

**HierarchicalGanttEnhancer Component**: A wrapper component for Frappe Gantt that adds hierarchical visualization features to timeline charts. Enhances existing Gantt instances with epic badges, expand/collapse controls, tree lines, and visual indentation markers. Supports state persistence via localStorage, configurable display options, and seamless integration with existing swim lanes and dependency highlighting. The component preserves all Frappe Gantt features while adding parent-child relationship visualization. The schedules page includes UI controls for toggling hierarchy visibility (checkbox), expanding all tasks, collapsing all tasks, and a visual legend showing epic/task/subtask indicators. All hierarchy controls are integrated into the Gantt Chart tab with proper event listeners and re-rendering support.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system. Joi is used for request validation and bcryptjs for password hashing. The backend handles CRUD operations, atomic transactions, project-level authorization, and logging. Performance optimizations include a bulk metadata endpoint, debounced search, and loading indicators. Service layers manage various functionalities including completion, templates, dependencies, documents, AI processing, standalone checklists, workstream detection, checklist matching, document classification, topological sort, schedule calculation, AI cost tracking, timeline extraction, and hierarchy extraction. API endpoints support features such as auto-creating checklists, status updates, bulk template application, checklist dependency management, document upload for AI processing, standalone checklist lifecycle, checklist quality feedback, effort estimate version history, project scheduling with critical path analysis, AI hierarchy extraction from documents (`POST /api/analyze/extract-hierarchy`), multi-document analysis with automatic issue creation (`POST /api/projects/:projectId/analyze-documents`), and hierarchical issue retrieval (`GET /api/projects/:projectId/hierarchy`). New API endpoints also provide comprehensive hierarchical issue management with effort rollups and dependency-aware estimation, including security authorization. Project-level timesheet entry configuration with item-level overrides is supported via database migrations, backend services, and frontend UI updates, including visual indicators on Kanban cards and a friendly inline time entry modal for completion.

**Frontend Hierarchy Integration**: The Kanban board fetches hierarchy data from `GET /api/projects/:projectId/hierarchy` and builds tree structures using `HierarchyUtils.buildHierarchyTree()`. The `renderKanbanCardWithHierarchy()` helper function enhances the existing card template with chevron toggles, indentation, epic badges, and recursive child rendering while preserving all existing data attributes (data-item-id, data-item-type, draggable), metadata badges, action buttons, and permission checks. Expand/collapse state is managed via localStorage with project-scoped keys.

### System Design Choices
The database schema includes Users, Projects, Issues, Action Items, and a comprehensive checklist system with templates, sections, items, responses, and signoffs. It supports AI-specific data, collaboration data, user preferences, risk management, and tag typing. `checklist_item_dependencies` tracks dependencies with circular dependency prevention. Standalone checklists and user feedback for quality ratings are supported. `document_classifications` stores AI-generated document classifications. Projects include a `complexity_level` field with automatic `max_file_uploads` calculation. Project scheduling involves `project_schedules`, `schedule_items`, `task_schedules`, and `schedule_changes`, supporting multiple scenarios, topological sort-based task ordering, critical path identification, risk detection, and resource allocation analysis. The schedule creation process queries dependencies from legacy tables and the unified `issue_relationships` table. Timesheet entry configuration includes `timesheet_entry_required` on projects, `timesheet_required_override` on items, an audit table, and a view for requirements. Hierarchical issue data is managed within the database structure for effort rollups and dependency tracking.

### AI Features
- **AI Meeting Analysis**: Two-phase processing for item extraction and status updates with a review queue and automatic model fallback. Supports multi-file document upload.
- **AI Checklist Generation**: Generates comprehensive checklists from descriptions and documents using OpenAI GPT-4o.
- **AI Document Classification**: Hybrid classification system using GPT-4o for uploaded documents.
- **AI Timeline Extraction**: Extracts project timeline information from document text using GPT-4o.
- **AI-Powered Hierarchy Extraction Service**: Uses Claude AI (Anthropic) to extract hierarchical task structures from documents with intelligent parsing of epics, tasks, and subtasks. It supports multi-format documents, tracks API call costs, provides robust validation, and offers tree operations. Integrated with multi-document analyzer for end-to-end workflow: document upload → AI extraction → validation → automatic issue creation.
- **Workstream Detection**: AI-powered document analysis to identify workstreams, extract requirements, and generate focused checklists.
- **Automatic Effort Estimation**: AI-created issues automatically receive effort estimates based on workstream complexity, including confidence scoring.
- **Automatic Schedule Generation**: Multi-document processing automatically creates project schedules with Gantt charts using AI effort estimates and dependencies.
- **Intelligent Issue Matching**: AI-powered semantic matching of generated checklists to existing issues.
- **AI Dependency Suggestion**: GPT-4o analyzes tasks and suggests logical dependencies, with circular dependency detection.
- **Comprehensive Cycle Detection**: Multi-layer circular dependency validation.
- **Checklist Validation**: Provides quality scoring, required field validation, and consistency checks.
- **Centralized AI Cost Tracking**: All AI features integrate with a centralized cost tracking service for recording usage data to the `ai_usage_tracking` table.

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
- Anthropic (Claude Sonnet 4)

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