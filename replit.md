# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing, in-modal search for matching items, and a persistent review queue for unmatched status updates. It also provides AI-driven checklist generation from various sources, a robust checklist validation system with quality scoring, and PDF export capabilities. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures, envisioning a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

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