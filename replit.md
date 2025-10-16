# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system enhances project oversight and efficiency through AI-driven insights and robust security measures. Key capabilities include:

-   **AI Meeting Analysis**: Two-phase processing for item extraction and status update detection, with in-modal search and a persistent review queue for unmatched status updates.
-   **AI Checklist Generation**: Generates checklists from issue/action descriptions and uploaded documents, supporting focused multi-checklist generation from extensive documents.
-   **Checklist Validation**: An intelligent quality scoring system with required fields validation, consistency checks, and quality assessments.
-   **Comprehensive Reporting**: PDF and CSV export capabilities for checklists and project data.
-   **Enhanced Collaboration**: A comment system with markdown support and @mention autocomplete.

The project aims to be a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (October 2025)

- **Bug Fixes** (October 16, 2025):
  - Fixed "null" prefix in checklist section headings (public/js/checklists.js)
  - Fixed action item attachment upload failure - corrected response data structure handling (public/app.js)
  - Fixed stale analysis cache causing old results to display in new generations (public/app.js)
  - Fixed total items showing 0 by correcting field name from `estimated_total_items` to `total_estimated_items` (public/app.js)
  - Fixed identical checklists from different documents by clearing analysis cache on each generation (public/app.js)

- **Enhanced Modal Context Display** (October 16, 2025):
  - **Redesigned AI Checklist Modal Header**: 
    - Removed icon from modal title for cleaner appearance
    - Shows project name prominently below title
    - Displays item type (Issue/Action Item) and name
    - Real-time sources display showing selected attachments and description
    - Sources update dynamically as user selects/deselects options
  - **Project-Aware Progress**: Progress indicators now display "Generating <checklist name> for <project name>"
    - During generation: Shows current workstream name being processed with project context
    - During creation: Shows current checklist being saved to database
  - **Creation Progress Tracking**: Added visual progress bar when clicking "Create All Checklists"
    - Shows real-time progress as each checklist is saved to database
    - Displays checklist names during creation process
    - Smooth completion animation before navigation
  - **Files Modified**: public/index.html (modal header), public/app.js (openAIChecklistModal, updateSourcesDisplay, setupSourceSelectionListeners)

- **Database Schema Fixes** (October 16, 2025):
  - Fixed `checklist_template_items` column name: changed `text` to `item_text` in batch creation
  - Fixed `checklists` table: made `checklist_id` nullable and removed from INSERT statements
  - Removed non-existent `ai_confidence` column from checklist creation queries
  - All multi-checklist generation now works successfully

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS. It features a dynamic UI based on user roles, real-time AI analysis capabilities, a comprehensive comment system, and a Project Dashboard with analytics and Chart.js visualizations. UI elements such as Kanban boards, tag displays, risk cards, and a comprehensive checklist system prioritize clarity and interactivity.

### Backend
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing. The backend handles complete CRUD operations, atomic transactions for tag management, project-level authorization, and comprehensive checklist management. Status changes are logged to a `status_history` table for auditing.

### Data Management
A PostgreSQL database stores core entities such as Users, Projects, Issues, Action Items, Meeting Transcripts, and the Risk Register. It manages relationships, AI-specific data (Status Update Review Queue, AI analysis audit trail, checklist generation sources), collaboration data (comments, mention notifications), user preferences, and comprehensive risk management with automatic risk scoring and tracking. Tags are managed with a type system. A dedicated `status_history` table tracks all status transitions. A comprehensive checklist system stores templates, sections, items, responses, comments, and signoffs, with generated completion percentages, performance indexes, and validation history.

### AI Features
-   **AI Meeting Analysis**: Two-phase processing for item extraction and status update detection, with in-modal search and a persistent review queue.
-   **AI Checklist Generation**: Generates comprehensive and granular checklists from issue/action descriptions and uploaded documents (PDF, DOCX, TXT), supporting multi-checklist generation from complex documents with focused workstreams. It leverages large token limits and specific prompting techniques for exhaustive extraction.
-   **Checklist Validation**: Provides intelligent quality scoring, required field validation, consistency checks, and recommendations.

### Reporting & Export
-   **PDF Export**: Generates professional PDF reports for checklists with progress bar rendering.
-   **CSV Export**: Provides CSV file generation for data export.

## External Dependencies

### Core Frameworks
-   **Express.js**: Backend web application framework.
-   **Axios**: Frontend HTTP client.
-   **Tailwind CSS**: Frontend styling.

### Security Libraries
-   **Helmet**: Express security headers.
-   **CORS**: Cross-Origin Resource Sharing.
-   **bcryptjs**: Password hashing.
-   **jsonwebtoken**: JWT implementation.
-   **express-rate-limit**: API rate limiting.

### Validation & Utilities
-   **Joi**: Data validation.
-   **Multer**: File uploads.
-   **uuid**: Unique ID generation.
-   **string-similarity**: Duplicate detection.
-   **pdf-parse**: PDF text extraction.
-   **mammoth**: DOCX text extraction.
-   **file-type**: File type detection.

### AI Integration
-   **OpenAI**: GPT-3.5-Turbo and GPT-4o for AI-powered analysis and checklist generation.
-   **Anthropic**: Claude 3.5 Sonnet support for AI checklist generation.

### Database & ORM
-   **@neondatabase/serverless**: Neon PostgreSQL driver.
-   **drizzle-orm**: TypeScript ORM.
-   **drizzle-kit**: Schema migration tools.

### Email & Notifications
-   **nodemailer**: SMTP email sending library.
-   **node-cron**: Scheduled task manager for daily notifications.

### Reporting & Export
-   **pdfkit**: Server-side PDF generation.
-   **stream-buffers**: Buffer management for PDF generation.
-   **csv-writer**: CSV file generation.

### CDN Services
-   **Chart.js**: Data visualization charts.