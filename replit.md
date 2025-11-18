# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system enhances project oversight and efficiency through AI-driven insights and robust security measures, including AI Meeting Analysis, AI Checklist Generation, Checklist Validation, comprehensive PDF and CSV reporting, and an enhanced comment system. The project aims to be a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles. It includes a Project Dashboard with analytics and Chart.js visualizations, Kanban boards with hierarchical issue display, and a comprehensive unified checklist system. A professional enterprise-grade design token system ensures UI consistency. Key UI features include project complexity configuration, comprehensive checklist management, effort estimates, quick time logging, advanced project scheduling with strict resource assignment, task-level estimate selection for what-if analysis, and professional schedule outputs (Timeline, Gantt Chart, Resources views). The Gantt chart features interactive timeline visualization, dependency arrows, critical path highlighting, and adjustable view modes.

**Hierarchical Kanban Board**: Supports parent-child issue relationships with expandable/collapsible cards, epic badges, and persistent state in localStorage.

**HierarchicalGanttEnhancer Component**: A wrapper for Frappe Gantt that adds hierarchical visualization, including epic badges, expand/collapse controls, tree lines, and indentation markers, while preserving all original Frappe Gantt features.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication, and a 6-tier RBAC system. Joi is used for request validation and bcryptjs for password hashing. The backend handles CRUD operations, atomic transactions, project-level authorization, and logging. Performance optimizations include a bulk metadata endpoint and debounced search. Service layers manage various functionalities including AI processing, standalone checklists, workstream detection, document classification, topological sort, schedule calculation, AI cost tracking, and hierarchy extraction. API endpoints support features such as auto-creating checklists, status updates, bulk template application, document upload for AI processing, project scheduling with critical path analysis, AI hierarchy extraction, and multi-document analysis with automatic issue creation.

**Frontend Hierarchy Integration**: The Kanban board fetches hierarchy data from the backend and builds tree structures, enhancing existing card templates with hierarchical display features.

### System Design Choices
The database schema includes Users, Projects, Issues, Action Items, and a comprehensive checklist system. It supports AI-specific data, collaboration data, user preferences, risk management, and tag typing. Project scheduling involves `project_schedules`, `schedule_items`, `task_schedules`, and `schedule_changes`, supporting multiple scenarios and critical path identification. Timesheet entry configuration is supported at project and item levels.

**PKG (Project Knowledge Graph) Overlay**: A unified graph abstraction layer built on PostgreSQL, providing a non-invasive overlay over all project entities (Tasks, Risks, Decisions, Meetings) via `pkg_nodes` and `pkg_edges` tables. It enables AI agents to query and manipulate entities through a single unified interface, tracking AI provenance and supporting versioning.

**RAG (Retrieval-Augmented Generation) Foundation**: A unified document indexing and semantic search system built on PostgreSQL full-text search. The `rag_documents` table with `content_tsv` columns enables fast full-text search. Documents are automatically indexed from meetings, decisions, and risks via database triggers. API endpoints provide semantic search, manual document upload, and LLM context assembly.

**PKG Query API**: Provides programmatic access to the knowledge graph via `GET /api/aipm/projects/:projectId/pkg` and `GET /api/aipm/pkg/query` endpoints for advanced filtering.

### Testing & Documentation (Story 5.1.4)
**Integration Testing**: Comprehensive end-to-end test suite (`__tests__/integration/aipm-foundation.test.js`) validates the complete AIPM foundation workflow including Decision → PKG → RAG flow, Meeting → Evidence → PKG edges, Issue Hierarchy → PKG edges, PKG API endpoints, and RAG search functionality. Tests verify auto-sync triggers, data consistency, and API correctness.

**Smoke Testing**: Fast-running smoke test script (`scripts/smoke-test-aipm.js`) provides quick validation of system health including table existence checks, PKG seeding verification (591 nodes), sync trigger testing, RAG indexing verification (8 documents), and full-text search validation. Script uses color-coded output for easy visual scanning with 10/11 tests passing on deployment.

**Performance Testing**: Dedicated performance test suite (`__tests__/performance/pkg-query-perf.test.js`) validates query performance at scale with benchmarks for PKG node queries (<500ms), complex graph JOINs (<1s), RAG full-text search (<300ms), type filtering (<100ms), and JSONB attribute queries (<200ms).

**API Documentation**: Comprehensive API reference (`docs/AIPM-API.md`) documents all AIPM endpoints including Decisions API, Meetings API, Evidence API, PKG API, and RAG API with request/response examples, auto-sync behavior, PKG node/edge types, error responses, and performance characteristics.

### AI Agent Core Engine (Story 5.2.1)
**AI Agent Orchestration**: Core AI agent service (`services/aiAgent.js`) provides intelligent project management assistance through context assembly from PKG and RAG, LLM integration (Claude/GPT), session tracking, and comprehensive audit logging. The agent supports four specialized modes: `decision_assistant` for architectural decisions, `risk_detector` for proactive risk identification, `meeting_analyzer` for meeting intelligence, and `knowledge_explorer` for general Q&A.

**Agent Database Schema**: Three core tables support AI agent operations: `ai_agent_sessions` tracks AI invocations with context metadata (PKG nodes used, RAG docs used, tokens, latency), `ai_agent_proposals` stores AI-generated suggestions awaiting human approval (HITL workflow), and `ai_agent_audit_log` provides detailed action traceability for transparency.

**Agent API Endpoints**: REST API (`routes/aiAgent.js`) provides `POST /api/aipm/projects/:projectId/agent/chat` for conversational interaction, `GET /api/aipm/projects/:projectId/agent/sessions` for session history, `GET /api/aipm/agent/sessions/:sessionId` for detailed session inspection with audit logs, and `GET /api/aipm/agent/health` for service health monitoring.

**Context Assembly**: Intelligent context builder assembles relevant project knowledge by querying RAG for semantic document search (top 10 results), PKG for entity retrieval (filtered by agent type, 20 nodes), and PKG edges for relationship mapping (up to 50 edges). Context assembly is optimized for <500ms performance with full audit trail logging.

### AI Features
- **AI Meeting Analysis**: Two-phase processing for item extraction and status updates.
- **AI Checklist Generation**: Generates comprehensive checklists from descriptions and documents using OpenAI GPT-4o.
- **AI Document Classification**: Hybrid classification system using GPT-4o for uploaded documents.
- **AI Timeline Extraction**: Extracts project timeline information from document text using GPT-4o.
- **AI-Powered Hierarchy Extraction Service**: Uses Anthropic Claude AI to extract hierarchical task structures from documents.
- **Workstream Detection**: AI-powered document analysis to identify workstreams and extract requirements.
- **Automatic Effort Estimation**: AI-created issues automatically receive effort estimates.
- **Automatic Schedule Generation**: Multi-document processing automatically creates project schedules.
- **Intelligent Issue Matching**: AI-powered semantic matching of generated checklists to existing issues.
- **AI Dependency Suggestion**: Analyzes tasks and suggests logical dependencies.
- **Checklist Validation**: Provides quality scoring and consistency checks.
- **Centralized AI Cost Tracking**: All AI features integrate with a centralized cost tracking service.

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