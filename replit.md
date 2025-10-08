# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures, thereby enhancing project oversight and efficiency.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles and authentication. Key features include AI analysis capabilities (in-modal search, review queue, smart matching, relationship detection), a comprehensive comment system with markdown support and real-time @mention autocomplete, and a Project Dashboard with analytics, Chart.js visualizations, activity feed, and team performance metrics.

### Backend
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing.

### Data Management
A PostgreSQL database, managed by Drizzle ORM, stores core entities such as Users, Projects, Issues, Action Items, and Meeting Transcripts. It also handles relationships (including AI-generated), AI-specific data (Status Update Review Queue, AI analysis audit trail), collaboration data (comments, mention notifications), and user preferences.

### Request Handling
Express.js handles requests, incorporating `express-rate-limit` for API protection and comprehensive error handling. It supports JSON and URL-encoded data parsing.

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

### AI Integration
- **OpenAI**: GPT-3.5-Turbo for AI-powered meeting transcript analysis.

### Database & ORM
- **@neondatabase/serverless**: Neon PostgreSQL driver.
- **drizzle-orm**: TypeScript ORM.
- **drizzle-kit**: Schema migration tools.

### Email & Notifications
- **nodemailer**: SMTP email sending library.

### Reporting & Export
- **pdfkit**: Server-side PDF generation for reports.
- **csv-writer**: CSV file generation for data export.

### CDN Services
- **Tailwind CSS CDN**: CSS framework delivery.
- **Unpkg CDN**: JavaScript library delivery.
- **Chart.js**: Data visualization charts for dashboard analytics.

## Recent Changes

### Feature: File Attachment Support for Issues and Action Items (October 8, 2025)
Implemented comprehensive file attachment functionality allowing users to upload, view, download, and delete files associated with issues and action items:
- **Database Schema**: Created `attachments` table with automatic count maintenance via triggers on issues and action_items tables
- **Backend Implementation**: 
  - Multer file storage with 10MB per file limit, maximum 5 files per upload
  - Supported file types: PDF, Word, Excel, images (PNG, JPG, JPEG, GIF), text, CSV, ZIP
  - Crypto-based unique filename generation for security
  - Four API endpoints: POST /upload, GET /list, GET /download/:id, DELETE /:id
- **Permission System**: 
  - Upload: Any authenticated user can upload to items they can view
  - Delete: Original uploader, System Administrator, or Project Manager
  - Download: Any user with access to the item
- **Frontend Features**:
  - File upload UI in issue/action item edit modals with drag-and-drop support
  - Attachment display section in item detail modals with download/delete actions
  - Attachment count badges on kanban cards (green, clickable to open detail modal)
  - Real-time count updates after upload/delete operations
  - File size formatting and validation feedback
- **Security**: Unique filenames prevent overwrites, MIME type validation, permission checks on all operations
- **Files Added/Updated**: `db/schema.js` (attachments table + triggers), `server.js` (multer config + endpoints), `public/app.js` (v19), `public/comments.js` (v3)

### Bug Fix: Action Item/Issue Edit - Permission Check for AI-Created Items (October 8, 2025)
Fixed critical bug where users couldn't edit AI-generated items even when they were the owner:
- **Root Cause**: Owner check used string comparison (`===`) but `created_by` field could have type inconsistencies between manual and AI-created items
- **Fix**: Changed permission check to use numeric comparison with `parseInt()` on both sides for reliable owner identification
- **Affected Endpoints**: `PATCH /api/issues/:id` and `PATCH /api/action-items/:id`
- **Impact**: Users can now successfully edit all items they own, including those created by AI Meeting Analysis
- **Added Logging**: Comprehensive debug logging for request bodies, permission checks, and SQL queries to aid future debugging
- **Files Updated**: `server.js` - owner comparison logic in both PATCH endpoints

### Bug Fix: Display Due Date and Capitalize Priority in Detail View (October 7, 2025)
Fixed Issue #31 where due dates weren't displaying and priorities were showing in lowercase:
- **Due Date Display**: Added due date field to item detail modal with proper formatting (MM/DD/YYYY)
- **Overdue Highlighting**: Overdue items show due date in red/bold for visual emphasis
- **Priority Capitalization**: Priority values now display properly capitalized (Low, Medium, High, Critical instead of lowercase)
- **Null Handling**: Gracefully handles missing due dates with "No due date set" message in gray italics
- **Utility Functions**: Added `formatPriority()` and `formatDate()` functions for consistent formatting
- **Files Updated**: `public/comments.js` (v2) - openItemDetailModal function
- **User Experience**: Detail modal now shows complete item information in a clean, professional format