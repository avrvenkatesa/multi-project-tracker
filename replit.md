# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing, in-modal search for matching items, and a persistent review queue for unmatched status updates. It also provides AI-driven checklist generation from various sources, a robust checklist validation system with quality scoring, and PDF export capabilities. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures, envisioning a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (October 2025)

- **Multi-Checklist Generation Fixes & Progress Indicator** (October 16, 2025):
  - **Critical Backend Fix**: Fixed batch generation response structure (changed `checklist` to `preview` in generateMultipleChecklists())
    - Frontend expected `result.preview` but backend was returning `result.checklist`
    - This was causing "Failed to generate checklists" errors despite successful backend generation
  - **Progress Indicator Added**: Implemented visual progress tracking for batch generation
    - Shows real-time progress bar with percentage (0-100%)
    - Displays "Generating checklist X of Y..." text updates
    - Estimated time calculation based on number of checklists (~8 seconds per checklist)
    - Smooth completion animation before showing preview
  - **PDF Extraction Fix v2**: Corrected pdf-parse v2.3.12 API usage
    - Changed from `pdf(dataBuffer)` to `new PDFParse({ data: dataBuffer })`
    - Added proper `await parser.getText()` call
    - Implemented resource cleanup with `parser.destroy()` in finally block
  - **UI Enhancements**: Added batch progress UI elements (progress bar, percentage, status text)
  - **Files Modified**: services/ai-service.js (preview fix), services/file-processor.js (PDF v2 API), public/index.html (progress UI), public/app.js (progress logic)

- **Phase 2B: Multi-Checklist Generation from Documents** (October 16, 2025):
  - **Backend Complete**: Implemented full backend support for analyzing documents and generating multiple focused checklists
  - **Document Analyzer Service** (services/document-analyzer.js):
    - Analyzes documents to detect 3-8 distinct workstreams/phases
    - Identifies complexity level and recommends single vs multi-checklist generation
    - Returns structured workstream data with estimated items, priorities, and dependencies
    - Supports both OpenAI GPT-4o and Anthropic Claude 3.5 Sonnet
  - **Batch Generation Functions** (services/ai-service.js):
    - generateMultipleChecklists(): Creates N checklists from workstream analysis
    - buildWorkstreamPrompt(): Focused prompts for each workstream with 1-second delays between API calls
    - Enhanced rate limiting to support batch requests (counts as N generations)
  - **New API Endpoints** (server.js):
    - POST /api/checklists/analyze-document: Analyzes uploaded document for workstreams
    - POST /api/checklists/generate-batch: Generates multiple checklists from workstreams
    - POST /api/checklists/confirm-batch: Creates multiple checklists from previews
  - **Benefits**:
    - One 92-page SOW → 5-8 focused checklists instead of 1 overwhelming checklist
    - Each checklist has 15-40 items focused on specific workstream
    - Better organization for teams where different people handle different areas
    - Total of 100-200 items across all checklists for large documents
  - **Frontend Complete**: Full UI implementation with workstream selection and batch preview modals
    - Workstream Analysis UI: Shows detected workstreams with complexity level and item estimates
    - Single vs Multiple Choice: Users choose between one comprehensive or multiple focused checklists
    - Batch Preview: Expandable preview cards showing all generated checklists before creation
    - Smart Flow: Automatically analyzes documents when attachments are selected, falls back to single generation for description-only
  - **Files Created**: services/document-analyzer.js
  - **Files Modified**: services/ai-service.js (batch functions), server.js (3 new endpoints), public/index.html (3 new UI states), public/app.js (multi-checklist flow)

- **AI Service Comprehensive Extraction Fix - 7-Point Enhancement** (October 16, 2025):
  - **Fixed Unicode Characters**: Replaced corrupted emoji (⚠️, ✅, ❌) with plain text ([!], [OK], [X]) to prevent parsing issues
  - **Increased Token Limits**: Set max_tokens to 16,384 for OpenAI GPT-4o (maximum supported by model, allows 150+ item responses)
  - **Debug Logging Added**: 
    - Context length logging in buildEnhancedPrompt() shows attachment text extraction success
    - Character count logging after file processing to verify SOW content is being used
  - **Strengthened System Message**: Changed from "comprehensive task decomposition" to "EXHAUSTIVELY DETAILED checklists with 100-200+ items" with explicit 100-item minimum for attachments
  - **Mandatory Targets Section**: Added non-negotiable minimum targets (100 items for attachments, 40 for descriptions) with failure warnings
  - **Granularity Examples**: Added concrete 15-item examples showing how to decompose "Migrate Active Directory" and "Set up AWS infrastructure" tasks
  - **Strengthened Final Reminder**: Replaced weak "Requirements" with "ABSOLUTE REQUIREMENTS - NON-NEGOTIABLE" and item count verification
  - **Fixed PDF Extraction**: Corrected pdf-parse usage to call pdfParse(dataBuffer) directly (resolves "Class constructor PDFParse cannot be invoked without 'new'" error)
  - **Expected Results**: 100-180 items (up from 40), 10-20 items per section (up from 8), SOW-specific technical details throughout
  - **Files Modified**: services/ai-service.js (buildEnhancedPrompt, callAI, getAttachmentContent), services/file-processor.js (PDF extraction fix)

- **Comprehensive Extraction AI Enhancement** (October 15, 2025):
  - **Extraction-Focused Prompts**: Changed from "summarization" to "comprehensive extraction" approach in buildEnhancedPrompt()
  - **Document-Size-Based Targets**: 
    - Small documents (1-10 pages): 30-60 checklist items minimum
    - Medium documents (10-30 pages): 60-100 items minimum
    - Large documents (30-100+ pages): 100-200+ items minimum
    - Complex SOWs/specifications: 150-250+ items for complete coverage
  - **Granular Task Decomposition**: Breaks complex tasks into atomic, single-action steps with pre/during/post validation
  - **Enhanced Section Generation**: 5-12 comprehensive sections for complex documents, 8-20 items per section (up from 5-15)
  - **Extraction Rules**: Emphasizes granularity, decomposition, completeness, validation steps, and logical phases (Planning → Preparation → Execution → Validation → Documentation)
  - **Increased Token Limits**: 16000 tokens for OpenAI (up from 2000), 8000 for Anthropic to handle larger responses
  - **Quality Emphasis**: "MORE IS BETTER - EXTRACT DON'T SUMMARIZE" approach for exhaustive coverage
  - **Example**: "Migrate Active Directory" now generates 12+ specific items instead of 1 generic item
  - **Files Modified**: services/ai-service.js (buildEnhancedPrompt and callAI functions)

- **Attachment Management for Issues & Action Items** (October 15, 2025):
  - **UI Added**: Attachment upload sections in Edit Issue and Edit Action Item modals
  - **Full Management**: Upload, download, and delete attachments with file previews
  - **Supported Formats**: PDF, DOCX, TXT, XLSX, images (max 10MB per file)
  - **Integration**: Seamlessly integrates with AI checklist generation from attachments

- **Toast Message Fix** (October 15, 2025):
  - **Fixed**: Missing "AI Checklist created successfully!" toast (now visible for 2 seconds before navigation)
  - **Fixed**: Missing "Template promoted to reusable!" toast (now visible for 2 seconds before navigation)
  - **Enhancement**: Added delays before page navigation to ensure toast visibility

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS. It features a dynamic UI based on user roles, real-time AI analysis capabilities (in-modal search, review queue), a comprehensive comment system with markdown support and @mention autocomplete, and a Project Dashboard with analytics, Chart.js visualizations, and team performance metrics. UI elements like Kanban boards, tag displays, risk cards, and a comprehensive checklist system prioritize clarity and interactivity.

### Backend
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing. The backend handles complete CRUD operations for core entities, including atomic transactions for tag management, project-level authorization, and checklist management. Status changes are logged to a `status_history` table for auditing.

### Data Management
A PostgreSQL database stores core entities such as Users, Projects, Issues, Action Items, Meeting Transcripts, and the Risk Register. It manages relationships, AI-specific data (Status Update Review Queue, AI analysis audit trail, checklist generation sources), collaboration data (comments, mention notifications), user preferences, and comprehensive risk management with automatic risk scoring and tracking. Tags are managed with a type system. A dedicated `status_history` table tracks all status transitions. A comprehensive checklist system stores templates, sections, items, responses, comments, and signoffs, with generated completion percentages, performance indexes, and validation history.

### AI Features
- **AI Meeting Analysis**: Two-phase processing for item extraction and status update detection, with in-modal search and a persistent review queue.
- **AI Checklist Generation**: Generates checklists from issue/action descriptions and uploaded documents (PDF, DOCX, TXT) with attachment analysis and source tracking. Supports both OpenAI GPT-4o and Anthropic Claude 3.5 Sonnet.
- **Checklist Validation**: An intelligent quality scoring system with required fields validation, consistency checks, and quality assessments, providing errors, warnings, and recommendations.

### Reporting & Export
- **PDF Export**: Generates professional PDF reports for checklists, including various formats and inclusion options, with native progress bar rendering.
- **CSV Export**: Provides CSV file generation for data export.

## External Dependencies

### Core Frameworks
- **Express.js**: Backend web application framework.
- **Axios**: Frontend HTTP client.
- **Tailwind CSS**: Frontend styling.

### Security Libraries
- **Helmet**: Express security headers.
- **CORS**: Cross-Origin Resource Sharing.
- **bcryptjs**: Password hashing.
- **jsonwebtoken**: JWT implementation.
- **express-rate-limit**: API rate limiting.

### Validation & Utilities
- **Joi**: Data validation.
- **Multer**: File uploads.
- **uuid**: Unique ID generation.
- **string-similarity**: Duplicate detection.
- **pdf-parse**: PDF text extraction.
- **mammoth**: DOCX text extraction.
- **file-type**: File type detection.

### AI Integration
- **OpenAI**: GPT-3.5-Turbo for AI-powered meeting transcript analysis, GPT-4o for AI checklist generation.
- **Anthropic**: Claude 3.5 Sonnet support for AI checklist generation.

### Database & ORM
- **@neondatabase/serverless**: Neon PostgreSQL driver.
- **drizzle-orm**: TypeScript ORM.
- **drizzle-kit**: Schema migration tools.

### Email & Notifications
- **nodemailer**: SMTP email sending library.
- **node-cron**: Scheduled task manager for daily notifications.

### Reporting & Export
- **pdfkit**: Server-side PDF generation for reports and checklist exports.
- **stream-buffers**: Buffer management for PDF generation and streaming.
- **csv-writer**: CSV file generation for data export.

### File Processing
- **pdf-parse**: Text extraction from PDF documents for AI analysis.
- **mammoth**: Text extraction from DOCX/DOC files for AI analysis.
- **file-type**: File type detection and validation for uploads.

### CDN Services
- **Chart.js**: Data visualization charts for dashboard analytics.