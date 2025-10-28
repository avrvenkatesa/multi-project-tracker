# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system enhances project oversight and efficiency through AI-driven insights and robust security measures. Key capabilities include: AI Meeting Analysis, AI Checklist Generation, Checklist Validation, comprehensive PDF and CSV reporting, and an enhanced comment system with markdown support and @mention autocomplete. The project aims to be a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles. It includes a Project Dashboard with analytics and Chart.js visualizations, Kanban boards, tag displays, risk cards, and a comprehensive unified checklist system. The UI implements consistent navigation, responsive design, and prioritizes clarity and interactivity. CSP compliance is maintained through external JavaScript files and event delegation. A unified `checklists.html` page consolidates linked, standalone, and template checklists into a single tabbed view.

Key UI features include:
-   **Checklist Completion Validation**: Warns users about incomplete checklists when moving items to "Done" status, with visual progress badges on Kanban cards. Allows project owners to toggle enforcement.
-   **Checklist Feedback System**: Users can provide thumbs up/down feedback on completed checklists, which is persistently stored and displayed.
-   **Effort Estimates Tab**: Dedicated tab in the detail modal for comprehensive estimate management, version history with visual source icons and confidence badges, version comparison, and CSV export. Includes a full estimation UI with AI/Hybrid options and permission-based controls.
-   **Quick Log Time**: "Log" button on Kanban cards for rapid time entry without opening the full detail modal, visible to Team Members and above.
-   **Project Scheduling with Advanced Item Selection**: Pre-submission validation for unestimated items, allowing selective estimation or exclusion, with a guided estimation workflow for selected items. Features improved status filtering that excludes Done items and allows multi-select filtering for To Do and In Progress statuses.
-   **Strict Resource Assignment Mode**: Optional project-level setting to require all scheduled tasks have assignees. When enabled, prevents schedule creation if any selected items lack resource assignments, ensuring accurate workload calculations and preventing oversight of unassigned work. Users can disable strict mode on-the-fly if needed.
-   **Task-Level Estimate Selection for What-If Analysis**: Pre-schedule review modal allows users to choose which estimate type (Planning Source, AI, Manual, or Hybrid) to use for each individual task. Includes bulk actions ("Use All AI", "Use All Manual", "Use Planning Source", "Use All Hybrid") and real-time total hours calculation. Enables flexible scenario planning and comparison of different estimate approaches within the same schedule.
-   **Enhanced Schedule Visualization**: Schedule detail view displays assignee information under each task, clearly indicating "Unassigned" for tasks without resource assignments. Tasks are grouped by assignee for better workload visibility.
-   **Inline Resource Assignment**: Missing Resource Assignments modal now includes dropdown selection and quick assign functionality, allowing users to assign resources directly in the validation modal without returning to the main board. Features visual feedback and automatic revalidation.
-   **Professional Schedule Outputs**: Schedule detail view features a tabbed interface with Timeline, Gantt Chart, and Resources views, plus one-click CSV export. Gantt chart powered by Frappe Gantt library with interactive timeline visualization, dependency arrows, critical path highlighting, and adjustable view modes (Quarter Day, Half Day, Day, Week, Month).
-   **Resource Workload Analysis**: Dedicated Resources tab calculates daily workload per team member, detects overloading (>configured hours/day), and displays peak daily load, utilization percentage, and overloaded days count. Visual warnings highlight overallocated resources with actionable recommendations.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system. Joi is used for request validation, and bcryptjs for password hashing. The backend handles complete CRUD operations, atomic transactions, project-level authorization, and logging.

Performance optimizations include a bulk metadata endpoint, debounced search, loading indicators, and non-blocking queue loading.

Key service layers: Completion, Template, Dependency, Document, AI, Standalone Checklist, Workstream Detector, Checklist Matcher, Topological Sort, and Schedule Calculation. These services manage various aspects from checklist operations and AI processing to dependency management and project scheduling.

API endpoints support advanced features like auto-creating checklists, status updates based on checklist completion, bulk template application, comprehensive checklist dependency management, document upload for AI processing, standalone checklist lifecycle, checklist quality feedback, effort estimate version history, and project scheduling with critical path analysis.

### System Design Choices
The database schema includes Users, Projects, Issues, Action Items, and a comprehensive checklist system with templates, sections, items, responses, and signoffs. It supports AI-specific data, collaboration data, user preferences, risk management, and tag typing. Checklist templates include public/featured flags and auto-creation mappings. `checklist_item_dependencies` tracks dependencies with circular dependency prevention. Standalone checklists and user feedback for quality ratings are supported.

Project scheduling involves `project_schedules` (versioning), `schedule_items`, `task_schedules` (calculated dates, critical path, risk indicators), and `schedule_changes`. Schedules support multiple scenarios, topological sort-based task ordering, critical path identification, risk detection, and resource allocation analysis.

### AI Features
-   **AI Meeting Analysis**: Two-phase processing for item extraction and status update detection with a persistent review queue.
-   **AI Checklist Generation**: Generates comprehensive checklists from issue/action descriptions and uploaded documents using OpenAI GPT-4o, supporting multi-checklist generation and batch preview.
-   **Workstream Detection**: AI-powered document analysis to identify 3-10 distinct workstreams, extract key requirements, and generate focused checklists using OpenAI GPT-4o.
-   **Intelligent Issue Matching**: AI-powered semantic matching of generated checklists to existing issues with confidence scoring and automatic new issue suggestions for unmatched checklists.
-   **AI Dependency Suggestion**: GPT-4o analyzes selected tasks and suggests logical dependencies based on workflow patterns, technical prerequisites, and risk mitigation, with automatic circular dependency detection and filtering.
-   **Comprehensive Cycle Detection**: Multi-layer circular dependency validation prevents invalid dependency graphs at all entry points (AI suggestions, user approval, and schedule creation) with detailed, actionable error messages showing exact cycle paths and remediation steps.
-   **Checklist Validation**: Provides quality scoring, required field validation, and consistency checks.

### Reporting & Export
-   **PDF Export**: Generates professional PDF reports for checklists.
-   **CSV Export**: Provides CSV file generation for checklists and project schedules, including task details, dates, assignees, dependencies, and risk indicators.

## External Dependencies

### Core Frameworks
-   Express.js
-   Axios
-   Tailwind CSS

### Security Libraries
-   Helmet
-   CORS
-   bcryptjs
-   jsonwebtoken
-   express-rate-limit

### Validation & Utilities
-   Joi
-   Multer
-   uuid
-   string-similarity
-   pdf-parse
-   mammoth
-   file-type

### AI Integration
-   OpenAI (GPT-3.5-Turbo, GPT-4o) - Exclusive AI provider for consistent validation and reliability

### Database & ORM
-   @neondatabase/serverless
-   drizzle-orm
-   drizzle-kit

### Email & Notifications
-   nodemailer
-   node-cron

### Reporting & Export
-   pdfkit
-   stream-buffers
-   csv-writer

### CDN Services
-   Chart.js
-   Frappe Gantt (v0.6.1)