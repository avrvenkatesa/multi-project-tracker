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

A **RAG (Retrieval-Augmented Generation) Foundation** offers a unified document indexing and hybrid search system built on PostgreSQL. The system combines keyword-based full-text search with semantic vector search using **pgvector extension**. Documents are automatically indexed from various sources (meeting transcripts, uploaded documents, attachments, AI analysis docs) and assigned 1536-dimensional embeddings using OpenAI's text-embedding-3-small model. The RAG system supports three search modes: keyword-only (traditional full-text), semantic-only (vector similarity), and hybrid (default, combining both with configurable weights of 30% keyword + 70% semantic). Hybrid search uses HNSW indexing for fast vector similarity queries and GIN indexing for full-text search. All new documents automatically generate embeddings asynchronously after upload, and a backfill script (`scripts/backfill-embeddings.js`) generates embeddings for existing documents.

**VectorStore Abstraction Layer** provides a clean interface (`IVectorStore`) that decouples the application from the specific vector database implementation. Current implementation uses `PgVectorStore` (pgvector in PostgreSQL), chosen for the MVP due to simplicity (single database stack), developer ergonomics (SQL-based queries), good performance for single-tenant scale, and cost-effectiveness. The abstraction enables future migration to Weaviate, Pinecone, or Qdrant for multi-tenant SaaS scale without changing application code. The factory pattern (`services/vectorStore/index.js`) allows swapping implementations via the `VECTOR_STORE_PROVIDER` environment variable. Migration path: When scaling to multiple customers and millions of chunks, implement `WeaviateVectorStore` with the same interface and switch the provider configuration.

The **AI Agent Core Engine** provides intelligent project management assistance through context assembly from PKG and RAG, LLM integration (Claude/GPT), session tracking, and audit logging. It supports specialized modes for decision assistance, risk detection, meeting analysis, and knowledge exploration.

**Autonomous Decision Making** extends the AI agent with capabilities to analyze proposed decisions, identify impacts, generate alternatives, and create proposals for human approval via a Human-in-the-Loop (HITL) workflow, ensuring AI provenance tracking.

**Proactive Risk Detection (Story 5.2.3)** identifies project risks using multi-dimensional analysis across 5 detection methods: meeting mentions (RAG full-text search), dependency bottlenecks (PKG graph analysis ≥5 dependencies), decision risks (high-impact decisions with <2 alternatives), pattern anomalies (stuck/orphaned tasks), and overdue items (escalating impact). Detected risks are ranked by severity (probability × impact) and atomically deduplicated using database-level unique index on (project_id, detection_source, source_identifier). High-confidence risks (≥0.9) are auto-created with sequential RISK-### IDs via PostgreSQL function generate_risk_id(), while lower-confidence risks create proposals for HITL review. Concurrent-safe implementation uses INSERT ... ON CONFLICT DO NOTHING to prevent race conditions.

**AI Agent API & Integration (Story 5.2.4)** provides a complete real-time AI assistant interface with streaming responses using Server-Sent Events (SSE). The system includes a dedicated AI Agent Dashboard UI component (`public/ai-agent.html`) with chat interface, agent type selection (knowledge_explorer, decision_assistant, risk_detector, meeting_analyzer), and real-time streaming responses. Backend streaming service (`services/aiAgentStreaming.js`) streams LLM responses token-by-token from Claude/GPT APIs, providing immediate feedback during context assembly and response generation. Comprehensive API documentation (`docs/AI-AGENT-API.md`) covers all AIPM endpoints including chat (streaming & non-streaming), decision proposals, risk scanning, session management, and health checks. The UI features markdown formatting, session history, integrated risk scanning, and EventSource-based real-time updates.

**AI Proposals Dashboard** (`public/proposals.html`) provides a dedicated interface for reviewing and managing AI-generated risk proposals that require human approval. The dashboard displays pending proposals with confidence scores (0.7-0.89), detection sources, AI rationale, and one-click approve/reject actions. Approved proposals are automatically created as risks in the Risk Register, while rejected proposals are logged for audit purposes. The interface follows the application's design system with consistent Tailwind styling, blue gradient header, and View dropdown navigation. Cookie-based authentication ensures secure API communication with endpoints for fetching, approving, and rejecting proposals.

**AI Agent PKG/RAG Integration (Story 5.2.5.1)** refactors the AI Agent Core Engine to use modular PKG/RAG context assembly with enhanced type filtering and structured formatting. The `assembleContext` method now orchestrates three specialized helper methods: `performRAGSearch` (RAG document search), `queryPKG` (PKG node retrieval with agent-specific type filters), and `queryPKGEdges` (relationship retrieval with confidence and evidence quotes). Enhanced agent-specific type filtering includes knowledge_explorer (Task, Risk, Decision, Meeting), decision_assistant (Decision, Risk, Task), risk_detector (Risk, Task, Decision), and meeting_analyzer (Meeting, Decision, Task). PKG queries prioritize AI-detected nodes first, then sort by creation date, with limit increased to 50 nodes for richer context. The `buildContextText` method groups PKG nodes by type, intelligently extracts titles/identifiers, displays status/priority when available, shows AI detection info with confidence scores, and formats relationships with evidence quotes for provenance. Critical null-safety guard (`attrs = node.attrs || {}`) prevents TypeErrors on sparse PKG rows. This modular architecture enables maintainable code, evidence-based AI responses with citations, and improved context quality for LLM reasoning.

**Grounded RAG Responses with Citations (Story 5.2.5.2)** enhances the AI Agent with citation-based grounding to ensure responses reference specific sources. The `performRAGSearch` method now uses PostgreSQL's `ts_headline` to return highlighted excerpts (MaxWords=50, MinWords=25) instead of full content, enabling the LLM to focus on relevant passages. The `buildGroundedPrompt` method creates system prompts with explicit grounding instructions requiring [Source: title] citation format, responses based ONLY on provided context, and graceful handling when information is unavailable. The `callLLM` method now uses grounded prompts and extracts citations via regex parsing of [Source: ...] patterns. Citations are matched to PKG nodes (by decision_id, risk_id, meeting_id, title) or RAG documents (by title, meeting_id) and stored as evidence records linking AI responses to source entities. The `storeCitations` method persists both PKG and RAG citations with proper foreign keys (PKG uses node.source_table/source_id, RAG uses rag_documents/document.id). The complete grounded flow ensures AI responses are traceable, verifiable, and based on actual project data.

**PKG Write Integration (Story 5.2.5.4)** implements complete bi-directional synchronization between AI-generated entities (decisions, risks) and the Project Knowledge Graph. The implementation follows a strict atomic pattern: (1) generate entity ID, (2) create PKG node FIRST with entity attrs, (3) create source entity with pkg_node_id foreign key, (4) update PKG node with source_table and source_id for bi-directional linking, (5) create PKG edges for evidence relationships. All PKG write operations are wrapped in database transactions (BEGIN/COMMIT/ROLLBACK) to ensure atomicity and prevent orphaned nodes. Database migration `032_add_risks_pkg_node_id.sql` adds the missing `pkg_node_id` column to the risks table with proper indexing. The `aiDecisionMaker.createProposal()` method creates PKG nodes for proposed decisions within a transaction, ensuring proposals and their graph representations are created atomically. The `aiDecisionMaker.approveProposal()` method handles all entity types (decision, risk, action_item) with transactional PKG sync, creating entities with pkg_node_id links and updating PKG nodes with source references. The `aiRiskDetector.autoCreateHighConfidenceRisks()` method implements per-risk transactions with proper ON CONFLICT handling—when duplicate risks are detected via unique index constraints, the entire transaction (including the PKG node creation) is rolled back cleanly without orphaning nodes. Evidence edges are created to link risks back to their detection sources (meetings, tasks, decisions) when source PKG nodes exist. Resource management ensures database clients are released exactly once in finally blocks. This transactional approach guarantees PKG consistency: either all PKG operations succeed together (node creation, entity creation, bi-directional sync, edge creation) or all are rolled back atomically on any failure or conflict.

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
- Anthropic (Claude Sonnet 4.5)
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