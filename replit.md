# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system enhances project oversight and efficiency through AI-driven insights like Meeting Analysis, Checklist Generation, Checklist Validation, PDF/CSV reporting, and an enhanced comment system. The project aims to be a leading solution for centralized project oversight and efficient team collaboration, providing AI-powered insights, robust security, and advanced project scheduling with critical path analysis.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles and a professional enterprise-grade design token system for consistency. Key UI features include a Project Dashboard with Chart.js analytics, hierarchical Kanban boards with parent-child issue display, and a comprehensive unified checklist system. Advanced project scheduling includes interactive Gantt charts with dependency visualization, critical path highlighting, and task-level estimate selection for what-if analysis.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication, and a 6-tier RBAC system. Joi is used for request validation and bcryptjs for password hashing. The backend handles CRUD operations, atomic transactions, project-level authorization, and logging. Service layers manage AI processing, standalone checklists, workstream detection, document classification, topological sort, schedule calculation, AI cost tracking, and hierarchy extraction. API endpoints support features such as auto-creating checklists, status updates, bulk template application, document upload for AI processing, project scheduling with critical path analysis, AI hierarchy extraction, and multi-document analysis with automatic issue creation.

### System Design Choices
The database schema includes Users, Projects, Issues, Action Items, and a comprehensive checklist system, supporting AI-specific data, collaboration, user preferences, risk management, and tag typing. Project scheduling involves tables for `project_schedules`, `schedule_items`, `task_schedules`, and `schedule_changes`, supporting multiple scenarios and critical path identification. Timesheet entry configuration is supported at project and item levels.

A **PKG (Project Knowledge Graph) Overlay** provides a unified graph abstraction layer built on PostgreSQL, enabling AI agents to query and manipulate project entities via a single interface, tracking AI provenance and supporting versioning.

A **RAG (Retrieval-Augmented Generation) Foundation** offers a unified document indexing and semantic search system built on PostgreSQL full-text search, with documents automatically indexed from various sources.

The **AI Agent Core Engine** provides intelligent project management assistance through context assembly from PKG and RAG, LLM integration (Claude/GPT), session tracking, and audit logging. It supports specialized modes for decision assistance, risk detection, meeting analysis, and knowledge exploration.

**Autonomous Decision Making** extends the AI agent with capabilities to analyze proposed decisions, identify impacts, generate alternatives, and create proposals for human approval via a Human-in-the-Loop (HITL) workflow, ensuring AI provenance tracking.

**Proactive Risk Detection (Story 5.2.3)** identifies project risks using multi-dimensional analysis across 5 detection methods: meeting mentions (RAG full-text search), dependency bottlenecks (PKG graph analysis ≥5 dependencies), decision risks (high-impact decisions with <2 alternatives), pattern anomalies (stuck/orphaned tasks), and overdue items (escalating impact). Detected risks are ranked by severity (probability × impact) and atomically deduplicated using database-level unique index on (project_id, detection_source, source_identifier). High-confidence risks (≥0.9) are auto-created with sequential RISK-### IDs via PostgreSQL function generate_risk_id(), while lower-confidence risks create proposals for HITL review. Concurrent-safe implementation uses INSERT ... ON CONFLICT DO NOTHING to prevent race conditions.

AI features include AI Meeting Analysis, AI Checklist Generation, AI Document Classification, AI Timeline Extraction, AI-Powered Hierarchy Extraction, Workstream Detection, Automatic Effort Estimation, Automatic Schedule Generation, Intelligent Issue Matching, AI Dependency Suggestion, Checklist Validation, and Centralized AI Cost Tracking.

## External Dependencies

- Express.js
- Axios
- Tailwind CSS
- Helmet
- CORS
- bcryptjs
- jsonwebtoken
- express-rate-limit
- Joi
- Multer
- uuid
- string-similarity
- pdf-parse
- mammoth
- file-type
- OpenAI (GPT-3.5-Turbo, GPT-4o)
- Anthropic (Claude Sonnet 4)
- @neondatabase/serverless
- drizzle-orm
- drizzle-kit
- nodemailer
- node-cron
- pdfkit
- stream-buffers
- csv-writer
- Chart.js
- Frappe Gantt (v0.6.1)