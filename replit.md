# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It provides comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system aims to enhance project oversight and efficiency through AI-driven insights such as Meeting Analysis, Checklist Generation, Checklist Validation, PDF/CSV reporting, and an enhanced comment system. It is envisioned as a leading solution for centralized project oversight, efficient team collaboration, and advanced project scheduling with critical path analysis. The project is production-ready with a full CI/CD pipeline to AWS ECS.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) using vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles and a professional design token system. Key UI features include a Project Dashboard with Chart.js analytics, hierarchical Kanban boards, a unified checklist system, interactive Gantt charts with dependency visualization and critical path highlighting, and dedicated dashboards for AI Agent interaction and AI-generated proposal review.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing PostgreSQL via Drizzle ORM. It employs a layered architecture with security middleware, JWT authentication, and a 6-tier RBAC system. Core functionalities include CRUD operations, atomic transactions, project-level authorization, and logging. Service layers manage AI processing for features like Meeting Analysis, Checklist Generation/Validation, Document Classification, Timeline/Hierarchy/Workstream Extraction, Effort Estimation, Schedule Generation, Issue Matching, Dependency Suggestion, AI Cost Tracking, AI Thought Analysis, and Role-Based Auto-Entity Creation. It also supports sidecar bot functionalities like custom roles, thought capture, and meeting transcription. The system integrates a multi-provider AI analysis engine supporting Claude, OpenAI, and Gemini with intelligent fallback for entity extraction. A Role-Based Auto-Creation Workflow Engine determines whether extracted entities are auto-created or require approval based on user authority and AI confidence. A complete AI pipeline integrates context assembly, prompt building, LLM client, and workflow engine. A mobile thought capture and voice-to-text system with offline support and AI-powered entity detection is also implemented.

**Hallway Meetings System** provides ambient intelligence for spontaneous conversations through wake-word activation, real-time Deepgram transcription with speaker diarization, and AI-powered entity extraction. The system supports manual/wake-word/scheduled activation modes, mobile capture interface with state persistence, and comprehensive meeting analysis with automatic detection of decisions, risks, action items, tasks, and blockers. See [docs/hallway-meetings-system.md](docs/hallway-meetings-system.md) for complete documentation.

### System Design Choices
The database schema supports Users, Projects, Issues, Action Items, and a comprehensive checklist system, including AI-specific data, collaboration, user preferences, risk management, tag typing, and project scheduling.

A **PKG (Project Knowledge Graph) Overlay** provides a unified graph abstraction layer on PostgreSQL for AI agents to query and manipulate project entities, tracking AI provenance and supporting versioning.

A **RAG (Retrieval-Augmented Generation) Foundation** offers a unified document indexing and hybrid search system built on PostgreSQL, combining keyword search with semantic vector search using `pgvector` and OpenAI's `text-embedding-3-small` model.

A **VectorStore Abstraction Layer** provides an interface (`IVectorStore`) to decouple the application from specific vector database implementations, currently using `PgVectorStore`.

The **AI Agent Core Engine** provides intelligent project management assistance through context assembly from PKG and RAG, LLM integration, session tracking, and audit logging. It supports specialized modes for decision assistance, risk detection, meeting analysis, knowledge exploration, and Autonomous Decision Making with Human-in-the-Loop (HITL) workflows.

**Proactive Risk Detection** identifies project risks using multi-dimensional analysis, automatically creating high-confidence risks and generating proposals for HITL review for lower-confidence risks.

The **AI Agent API & Integration** provides a real-time AI assistant interface with streaming responses using Server-Sent Events (SSE), including a dedicated UI component with chat and agent type selection.

**Grounded RAG Responses with Citations** ensures AI responses reference specific sources from PKG nodes or RAG documents, storing them as evidence records.

**PKG Write Integration** implements bi-directional, atomic synchronization between AI-generated entities and the Project Knowledge Graph using database transactions.

A **Sidecar Bot Foundation** provides infrastructure for ambient AI assistance through custom roles, thought capture, and meeting transcription.

**CI/CD Pipeline** uses GitHub Actions for continuous deployment to AWS ECS, featuring automated testing, Drizzle ORM migrations, multi-stage Docker builds, ECR pushes, and environment-aware database driver selection.

## Feature Documentation

Detailed documentation for major system features:
- [Hallway Meetings System](docs/hallway-meetings-system.md) - Spontaneous conversation capture with wake-word activation, real-time transcription, and AI entity detection
- [AI Agent API](docs/AI-AGENT-API.md) - Intelligent project management assistant with streaming responses
- [Thought Capture System](docs/thought-capture-system.md) - Mobile voice-to-text capture with offline support
- [Risk Register API](docs/risk-register-api.md) - Comprehensive risk management endpoints

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
- OpenAI (GPT-3.5-Turbo, GPT-4o, GPT-4 Turbo, GPT-4 Turbo Preview)
- Anthropic (Claude Sonnet 4.5, Claude 3.5 Sonnet)
- Google Generative AI (Gemini 1.5 Pro)
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
- Deepgram (voice-to-text transcription)