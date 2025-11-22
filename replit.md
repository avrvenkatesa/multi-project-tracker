# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system enhances project oversight and efficiency through AI-driven insights like Meeting Analysis, Checklist Generation, Checklist Validation, PDF/CSV reporting, and an enhanced comment system. The project aims to be a leading solution for centralized project oversight and efficient team collaboration, providing AI-powered insights, robust security, and advanced project scheduling with critical path analysis.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles and a professional enterprise-grade design token system. Key UI features include a Project Dashboard with Chart.js analytics, hierarchical Kanban boards, and a comprehensive unified checklist system. Advanced project scheduling includes interactive Gantt charts with dependency visualization and critical path highlighting. Dedicated dashboards exist for AI Agent interaction and AI-generated proposal review.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware, JWT authentication, and a 6-tier RBAC system. The backend handles CRUD operations, atomic transactions, project-level authorization, and logging. Service layers manage AI processing, standalone checklists, workstream detection, document classification, topological sort, schedule calculation, AI cost tracking, hierarchy extraction, and sidecar bot functionalities (custom roles, thought capture, meeting transcription). AI features include Meeting Analysis, Checklist Generation, Document Classification, Timeline Extraction, Hierarchy Extraction, Workstream Detection, Effort Estimation, Schedule Generation, Issue Matching, Dependency Suggestion, Checklist Validation, AI Cost Tracking, AI Thought Analysis, and Role-Based Auto-Entity Creation.

### System Design Choices
The database schema supports Users, Projects, Issues, Action Items, and a comprehensive checklist system, including AI-specific data, collaboration, user preferences, risk management, tag typing, and project scheduling.

A **PKG (Project Knowledge Graph) Overlay** provides a unified graph abstraction layer built on PostgreSQL, enabling AI agents to query and manipulate project entities via a single interface, tracking AI provenance and supporting versioning.

A **RAG (Retrieval-Augmented Generation) Foundation** offers a unified document indexing and hybrid search system built on PostgreSQL, combining keyword-based full-text search with semantic vector search using the `pgvector` extension. Documents are automatically indexed from various sources and assigned 1536-dimensional embeddings using OpenAI's `text-embedding-3-small` model. The system supports keyword-only, semantic-only, and hybrid search modes.

A **VectorStore Abstraction Layer** provides an interface (`IVectorStore`) that decouples the application from the specific vector database implementation, currently using `PgVectorStore` for PostgreSQL. This allows for future migration to other vector databases.

The **AI Agent Core Engine** provides intelligent project management assistance through context assembly from PKG and RAG, LLM integration (Claude/GPT), session tracking, and audit logging. It supports specialized modes for decision assistance, risk detection, meeting analysis, and knowledge exploration. It also supports **Autonomous Decision Making** with Human-in-the-Loop (HITL) workflows.

**Proactive Risk Detection** identifies project risks using multi-dimensional analysis (meeting mentions, dependency bottlenecks, decision risks, pattern anomalies, overdue items). High-confidence risks are auto-created, while lower-confidence risks create proposals for HITL review, with atomic deduplication.

The **AI Agent API & Integration** provides a real-time AI assistant interface with streaming responses using Server-Sent Events (SSE). It includes a dedicated UI component with chat interface, agent type selection, and real-time streaming responses. AI proposals for risks and decisions are managed through a dedicated dashboard.

**Grounded RAG Responses with Citations** ensures AI responses reference specific sources by using highlighted excerpts and enforcing citation formatting. Citations are matched to PKG nodes or RAG documents and stored as evidence records.

**PKG Write Integration** implements bi-directional, atomic synchronization between AI-generated entities (decisions, risks) and the Project Knowledge Graph, using database transactions for consistency.

A **Sidecar Bot Foundation** provides infrastructure for ambient AI assistance through custom roles, thought capture, and meeting transcription. This includes tables for custom roles, role permissions, user role assignments, custom entity types, project-level sidecar configuration, thought captures, and meeting transcriptions.

**Sidecar Bot AI Analysis Engine** (`services/sidecarBot.js`) provides complete AI-powered entity detection through a 5-step pipeline: (1) Context Assembly from PKG and RAG systems, (2) Provider-optimized prompt building, (3) Multi-provider LLM entity extraction with automatic fallback, (4) Role-based workflow processing, (5) Entity creation or proposal generation. The engine supports Claude, OpenAI, and Gemini with intelligent fallback, extracting structured entities with confidence scores, citations, and AI reasoning. Integration with the Workflow Engine provides authority-based auto-creation (RULE 1-4) or Human-in-the-Loop proposals. Fallback keyword-based analysis ensures resilience when AI is unavailable. Returns comprehensive results including workflow outcomes, context quality, LLM usage, and cost tracking.

**Multi-Provider AI Analysis Engine (Story 5.4.2)** provides intelligent entity extraction from conversations with support for multiple LLM providers:
- **Context Assembly Service** (`services/contextAssembly.js`) - Assembles rich context by querying PKG (Project Knowledge Graph) and RAG (Retrieval-Augmented Generation) systems, extracting keywords, and calculating context quality scores. Executes all queries in parallel for <500ms p95 latency.
- **Prompt Builder Service** (`services/promptBuilder.js`) - Constructs provider-optimized prompts for Claude (Anthropic), GPT-4 (OpenAI), and Gemini (Google). Adapts formatting (XML for Claude, Markdown for OpenAI, plain text for Gemini) and includes few-shot examples, entity schemas, and project context.
- **LLM Client Service** (`services/llmClient.js`) - Handles API calls to multiple LLM providers with automatic fallback, retry logic with exponential backoff, response validation, and token usage tracking. Supports Claude 3.5 Sonnet, GPT-4 Turbo, and Gemini 1.5 Pro with cost estimation and analytics.

**Role-Based Auto-Creation Workflow Engine (Story 5.4.2)** (`services/workflowEngine.js`) determines whether extracted entities should be auto-created or sent for approval based on user authority levels, AI confidence scores, and role permissions. Implements four decision rules: (1) High confidence + high authority → auto-create, (2) Permission-based auto-create for medium confidence, (3) Critical impact always requires review, (4) Low confidence or low authority → proposal. Features atomic transactions for entity creation, evidence tracking with full attribution, proposal management (approve/reject), and integration with PKG, sidecar config, and role permission systems. Stores proposals in `entity_proposals` table pending approval from designated roles. **Test Coverage: 19/19 tests passing (100%)**

**Complete AI Pipeline Integration** - The Sidecar Bot now orchestrates the full AI analysis pipeline, connecting Context Assembly → Prompt Builder → LLM Client → Workflow Engine → Entity Creation. Webhooks (Slack, Teams, Email, Thought Capture) can integrate with `sidecarBot.analyzeContent()` for end-to-end intelligent entity extraction. Returns structured results with workflow outcomes, context quality scores, LLM usage metadata, and cost tracking. **Integration Test Coverage: 6 tests for end-to-end validation**

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