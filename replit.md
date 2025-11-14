# Multi-Project Tracker

## Recent Changes

### November 14, 2025 - Comprehensive Hierarchical API Test Suite + Parent Linkage + Enhanced Validation
**Feature**: Complete end-to-end testing framework for all 6 hierarchical issue management endpoints, enhanced issue creation API with parent-child relationship support, and comprehensive input validation with descriptive error messages.

**Implementation**:
- **Comprehensive Test Suite** (`test/test-hierarchy-api.js`):
  - Cookie-based authentication using real user credentials
  - Automated test project and hierarchical issue creation (1 parent epic + 3 children)
  - Tests all 6 hierarchical endpoints: GET children, POST calculate-rollup, GET hierarchy, GET estimate-with-dependencies, POST update-parent-efforts, GET project hierarchy
  - Validates response structure, status codes, and data integrity
  - Robust cleanup with 404-tolerance for idempotent teardown
  - Clear ✅/❌ logging with detailed request/response output
  - 100% success rate (6/6 tests passed)
  - Run with: `node test/test-hierarchy-api.js`

- **Parent Linkage Support**: Enhanced `POST /api/issues` endpoint to accept:
  - `parentIssueId`: Links new issue to parent issue (validated to same project)
  - `isEpic`: Marks issue as an epic for hierarchy organization
  - `estimatedEffortHours`: Sets initial effort estimate during creation
  - Type-safe validation ensures parent project ID matches child project ID
  - Enables programmatic creation of hierarchical issue structures via API

- **Enhanced Input Validation**: Added comprehensive validation to all 6 hierarchical endpoints:
  - ID validation: All issueId and projectId parameters validated as positive integers with descriptive error messages
  - Resource existence: Issues and projects verified to exist BEFORE processing (404 with details)
  - Type validation: Request body fields validated (e.g., updateParent must be boolean)
  - Access control: All endpoints verify user access via checkProjectAccess (403 with details)
  - Error details: All error responses include descriptive details for better debugging
  - Validation test suite (`test/test-hierarchy-validation.js`): 10/10 tests pass (100% coverage)

**Key Benefits**:
1. **Automated Testing**: All hierarchical endpoints validated with repeatable test suite (6/6 functional + 10/10 validation = 16 total tests)
2. **API Completeness**: Can now create parent-child issue relationships through API (previously required manual database updates)
3. **Type Safety**: Parent linkage validation prevents project mismatch errors
4. **Developer Experience**: Clear, descriptive error messages with details field for debugging
5. **CI/CD Ready**: Test suites can be integrated into continuous integration pipelines
6. **Robust Validation**: Handles invalid inputs gracefully with proper HTTP status codes (400, 403, 404, 500)

**Architect Review**: Passed as production-ready. Enhanced validation enforces positive-integer checks, confirms resource existence before service calls, and consistently returns descriptive error messages. Both functional suite (6/6) and validation suite (10/10) run clean with 100% pass rates.

**API Documentation**: Comprehensive endpoint documentation created at `docs/api/hierarchy-endpoints.md` including:
- Full endpoint specifications (HTTP method, path, parameters)
- cURL request examples for all 7 endpoints (6 hierarchical + 1 enhanced creation)
- JSON response examples with real data from test suite
- Complete error handling documentation (400, 401, 403, 404, 500)
- Example workflows for common use cases (creating hierarchies, viewing progress)
- Best practices for performance optimization and error handling
- Rate limiting information

**Postman Collection**: Importable Postman collection for manual testing (`test/postman/hierarchy-endpoints.postman_collection.json`):
- 11 requests across 3 folders (Authentication, Hierarchy Management, Error Scenarios)
- Automatic test scripts validating response structure and business logic
- Pre-request scripts for variable validation and authentication checks
- 6 collection variables with auto-population from responses
- Complete README with setup instructions and troubleshooting guide
- Global test assertions for response time and content-type validation

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system enhances project oversight and efficiency through AI-driven insights and robust security measures. Key capabilities include: AI Meeting Analysis, AI Checklist Generation, Checklist Validation, comprehensive PDF and CSV reporting, and an enhanced comment system with markdown support and @mention autocomplete. The project aims to be a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles. It includes a Project Dashboard with analytics and Chart.js visualizations, Kanban boards, tag displays, risk cards, and a comprehensive unified checklist system. A professional enterprise-grade design token system is implemented for UI consistency, including a CSS variable system, shared button components, and WCAG AA compliant styles. Key UI features include project complexity configuration, comprehensive checklist management, an effort estimates tab, quick time logging, advanced project scheduling with strict resource assignment, task-level estimate selection for what-if analysis, enhanced schedule visualization, and professional schedule outputs (Timeline, Gantt Chart, Resources views). The Gantt chart features interactive timeline visualization, dependency arrows, critical path highlighting, adjustable view modes, swim-lane grouping, and optimized popups. Resource workload analysis provides visual warnings for overloading.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system. Joi is used for request validation and bcryptjs for password hashing. The backend handles CRUD operations, atomic transactions, project-level authorization, and logging. Performance optimizations include a bulk metadata endpoint, debounced search, and loading indicators. Service layers manage various functionalities including completion, templates, dependencies, documents, AI processing, standalone checklists, workstream detection, checklist matching, document classification, topological sort, schedule calculation, AI cost tracking, and timeline extraction. API endpoints support features such as auto-creating checklists, status updates, bulk template application, checklist dependency management, document upload for AI processing, standalone checklist lifecycle, checklist quality feedback, effort estimate version history, and project scheduling with critical path analysis. New API endpoints also provide comprehensive hierarchical issue management with effort rollups and dependency-aware estimation, including security authorization. Project-level timesheet entry configuration with item-level overrides is supported via database migrations, backend services, and frontend UI updates, including visual indicators on Kanban cards and a friendly inline time entry modal for completion.

### System Design Choices
The database schema includes Users, Projects, Issues, Action Items, and a comprehensive checklist system with templates, sections, items, responses, and signoffs. It supports AI-specific data, collaboration data, user preferences, risk management, and tag typing. `checklist_item_dependencies` tracks dependencies with circular dependency prevention. Standalone checklists and user feedback for quality ratings are supported. `document_classifications` stores AI-generated document classifications. Projects include a `complexity_level` field with automatic `max_file_uploads` calculation. Project scheduling involves `project_schedules`, `schedule_items`, `task_schedules`, and `schedule_changes`, supporting multiple scenarios, topological sort-based task ordering, critical path identification, risk detection, and resource allocation analysis. The schedule creation process queries dependencies from legacy tables and the unified `issue_relationships` table. Timesheet entry configuration includes `timesheet_entry_required` on projects, `timesheet_required_override` on items, an audit table, and a view for requirements. Hierarchical issue data is managed within the database structure for effort rollups and dependency tracking.

### AI Features
- **AI Meeting Analysis**: Two-phase processing for item extraction and status updates with a review queue and automatic model fallback. Supports multi-file document upload.
- **AI Checklist Generation**: Generates comprehensive checklists from descriptions and documents using OpenAI GPT-4o.
- **AI Document Classification**: Hybrid classification system using GPT-4o for uploaded documents.
- **AI Timeline Extraction**: Extracts project timeline information from document text using GPT-4o.
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