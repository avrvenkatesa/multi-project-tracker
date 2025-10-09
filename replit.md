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

### Bug Fix: Delete Functionality for Issues and Action Items (October 9, 2025)
Fixed critical bug where delete functionality was broken and showing "Failed to delete issue/action item" error:
- **Root Cause**: DELETE endpoints used restrictive `requireRole('Team Lead')` middleware that blocked item creators from deleting their own items
- **Secondary Issue**: Used incorrect user ID property (`req.user.userId` instead of `req.user.id`) causing creator checks to always fail
- **Frontend Issue**: confirmDeleteItem() called non-existent `loadIssues()` and `loadActionItems()` functions
- **Permission Fix**: Updated both endpoints to allow deletion by:
  - Item creator (using `parseInt(created_by) === parseInt(req.user.id)`)
  - OR users with Team Lead+ role level
- **Attachment Cleanup**: Added manual deletion of attachments before item deletion (no FK constraint exists on attachments table)
- **Database Cascade**: Comments automatically cascade delete (existing FK constraint with CASCADE rule)
- **Frontend Fix**: Changed confirmDeleteItem() to use `loadProjectData(currentProject.id)` to reload data after deletion
- **Error Handling**: Proper 404 (not found), 403 (forbidden), and 500 (server error) responses
- **Affected Endpoints**: 
  - `DELETE /api/issues/:id` (lines 2709-2756)
  - `DELETE /api/action-items/:id` (lines 3057-3104)
- **Impact**: Users can now delete issues and action items they created, Team Lead+ can delete any items, attachments are properly cleaned up
- **Files Updated**: `server.js` - modified both DELETE endpoints with corrected permission logic and attachment cleanup; `public/app.js` (v22) - fixed confirmDeleteItem() to use correct reload function

### Bug Fix: Modal Scrolling for Create Issue/Action Item Forms (October 9, 2025)
Fixed accessibility issue where create issue and action item modals were too tall and lacked scrollbars, making the attachments field unreachable:
- **Root Cause**: Main modal-content div was missing `max-h-[90vh] overflow-y-auto` classes that all other modals in the system already had
- **Fix**: Added scrolling classes to match the pattern used by edit modals, AI analysis modal, and all other modals
- **Result**: Modal height now capped at 90% viewport height with vertical scrolling enabled
- **Impact**: Users can now scroll to access all fields including the attachments input at the bottom
- **Files Updated**: `public/index.html` (v21) - added max-h-[90vh] overflow-y-auto to modal-content

### Enhancement: File Attachment Upload in Create/Edit Modals (October 9, 2025)
Added file attachment upload functionality directly to issue and action item create/edit modals, allowing users to attach files during item creation instead of only after:
- **Create Modals**: Added file upload input fields to both issue and action item creation modals
  - File input IDs: `create-issue-attachments` and `create-action-item-attachments`
  - Support for multiple files (max 5), 10MB per file limit
  - Accepted types: PDF, Word, Excel, images, text, CSV, ZIP
- **Upload Flow**: Items created first, then attachments uploaded in sequence
  - Uses FormData with proper authentication (`credentials: 'include'`)
  - Upload failures don't block item creation - item is saved successfully
  - Response checking with `if (!uploadResponse.ok)` for proper error detection
- **User Feedback**: Distinct success messages based on upload outcome:
  - "created with X attachment(s)" when upload succeeds
  - "created but attachments failed to upload" when upload fails
  - "created successfully" when no files selected
- **API Integration**: Uses existing attachment endpoints
  - `/api/issues/{id}/attachments` for issues
  - `/api/action-items/{id}/attachments` for action items
- **Files Updated**: `public/app.js` (v20) - modified showCreateIssue(), showCreateActionItem(), createIssue(), createActionItem(); `public/index.html` (v20) - version bump for cache busting
- **Impact**: Streamlined workflow - users can now attach files during initial item creation, improving UX and reducing clicks

### Bug Fix: Dashboard Report Showing 0% Completion Rate (October 8, 2025)
Fixed critical bug in PDF report generation where completion rate was incorrectly calculated as 0% despite having completed items:
- **Root Cause**: ReportService only checked for status 'Done' when counting completed items, missing all completed action items which use status 'Completed'
- **Impact**: Detailed Project Reports, Executive Summaries, and Team Performance Reports all showed incorrect completion statistics
- **Fix**: Updated getProjectStats method to properly count both:
  - Completed Issues: status === 'Done'
  - Completed Action Items: status === 'Completed'
- **Status Aggregation**: Fixed counting for all statuses to properly handle both entity types:
  - To Do count: combines issues + action items with 'To Do' status
  - In Progress count: combines issues + action items with 'In Progress' status
  - Done/Completed count: combines issues with 'Done' + action items with 'Completed'
- **Completion Rate Formula**: Now correctly calculates as (completed issues + completed action items) / total items
- **Files Updated**: `services/reportService.js` - getProjectStats method

### Bug Fix: AI-Created Items Missing Assignment Notifications (October 8, 2025)
Fixed critical bug where AI-created items from meeting transcript analysis didn't send assignment notifications to assignees:
- **Root Cause**: AI batch creation endpoints (`/api/meetings/create-items` and `/api/meetings/create-items-smart`) were missing notification logic
- **Issues Fixed**:
  - Issues in AI batch creation didn't support assignee field (now added to both endpoints)
  - No notifications sent when AI assigned items to users
  - Smart creation endpoint lacked assignee permission checks for issues (now added)
- **Implementation**:
  - Added assignee field to issues INSERT statements in both AI endpoints
  - Implemented notification logic matching manual creation pattern (username lookup → user ID → send notification)
  - Added assignee permission validation for issues in smart creation endpoint
  - Non-blocking fire-and-forget notification pattern to avoid slowing batch creation
  - Comprehensive error handling - notification failures don't break item creation
  - Enhanced logging to track notification activity
- **Affected Endpoints**: `POST /api/meetings/create-items` and `POST /api/meetings/create-items-smart`
- **Impact**: Users now receive email notifications when AI assigns them to issues or action items during meeting analysis
- **Files Updated**: `server.js` - added notification logic to both AI batch creation endpoints

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