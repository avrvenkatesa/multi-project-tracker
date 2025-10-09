# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles and authentication. Key features include AI analysis capabilities (in-modal search, review queue, smart matching, relationship detection), a comprehensive comment system with markdown support and real-time @mention autocomplete, and a Project Dashboard with analytics, Chart.js visualizations, activity feed, and team performance metrics. Kanban boards include automatic due date sorting with color-coded visual indicators for urgency, attachment count badges, and multi-criteria sorting options.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing. File attachment functionality is implemented with Multer for secure uploads. AI-powered meeting transcript analysis leverages OpenAI.

### Feature Specifications
- **AI Meeting Analysis**: Two-phase processing (item extraction + status update detection) with in-modal search and a persistent review queue. AI-created items send assignment notifications.
- **Role-Based Access Control (RBAC)**: A 6-tier RBAC system ensures granular permissions.
- **Authentication**: JWT authentication with httpOnly cookie-based session management.
- **Project Management**: Centralized tracking of issues and action items with full CRUD operations.
- **Reporting**: PDF and CSV export capabilities for various reports.
- **Communication**: Comprehensive comment system with markdown and @mention autocomplete. Email notifications for assignments, updates, and item completion.
- **File Attachments**: Upload, view, download, and delete files associated with issues and action items.
- **Kanban Board**: Automatic and user-controlled multi-criteria sorting of items by due date urgency, priority, and update status, with color-coded visual badges and automated daily refreshes.
- **Toast Notification System**: User-friendly feedback messages for various actions.

### System Design Choices
- **Frontend**: Vanilla JavaScript SPA with Tailwind CSS for responsiveness and dynamic UI rendering.
- **Backend**: Express.js RESTful API with PostgreSQL and Drizzle ORM.
- **Data Management**: PostgreSQL stores core entities (Users, Projects, Issues, Action Items, Meeting Transcripts), relationships, and AI-specific data.
- **Security**: Robust security measures including Helmet, CORS, rate limiting, bcryptjs for password hashing, and secure file handling.

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

### Feature: Admin Assignee Name Correction Tool (October 9, 2025)
Created a dedicated admin tool to fix mismatched assignee names that were causing Team Performance Reports to show incorrect data:
- **Root Issue**: Items had assignee names like "Sri Hari" and "Sakthi S4" that didn't exactly match usernames like "Srihari S" and "Sakthi", causing report queries to fail matching
- **Solution**: Admin tool with bulk update capability instead of complex fuzzy matching logic
- **Backend APIs**: 
  - GET /api/admin/assignee-mismatches - Detects all mismatches and provides statistics
  - POST /api/admin/update-assignees - Bulk updates assignee names with proper validation
  - GET /api/admin/valid-usernames - Returns all valid usernames for dropdown selection
- **Frontend UI**: Clean admin page (admin-assignees.html) with:
  - Visual highlighting of mismatched names (yellow background)
  - Dropdown selection to pick correct username
  - Bulk update with confirmation and success feedback
  - Admin-only access (System Administrator role required)
- **Navigation**: Added "Admin Tools" link to hamburger menu, visible only to System Administrators
- **Implementation**: Uses exact username matching after updates, ensuring accurate Team Performance Reports
- **Files Modified**: server.js (3 new admin endpoints), public/admin-assignees.html (new), public/admin-assignees.js (external script), public/index.html (admin link), public/auth.js (v10 - show admin link)
- **Impact**: Provides clean solution to fix data at source rather than complex workaround matching logic

### Bug Fix: Dashboard Metrics and API Query Issues (October 9, 2025)
Fixed multiple critical bugs preventing correct data display in dashboard and reports:
- **Root Cause 1 - Incorrect Status Values**: Dashboard stats were checking for status 'Completed' for action items, but action items use status 'Done' (same as issues)
- **Root Cause 2 - Missing Table Aliases**: After adding JOINs for creator information, WHERE clause conditions lacked table aliases (e.g., `project_id` instead of `i.project_id`), causing ambiguous column references
- **Impact**: 
  - Dashboard showed 0 Total Issues despite data existing
  - Completion rates showed 0% even with completed items
  - Team performance reports displayed incorrect metrics
  - API queries with filters failed to return data
- **Fix Applied**:
  - Updated dashboard stats to check for 'Done' status for both issues and action items (lines 1956, 1968, 1978)
  - Added table aliases (`i.` and `a.`) to all WHERE clause conditions in GET /api/issues and GET /api/action-items endpoints
  - Fixed overdue and upcoming deadlines queries to use 'Done' status consistently
- **Files Modified**: server.js (dashboard stats endpoint, issues/action items GET endpoints)
- **Result**: Dashboard and reports now correctly display all data with accurate completion rates

### Feature: Creator Display and Completion Email Notifications (October 9, 2025)
Implemented creator username display on Kanban cards and email notifications when items are completed:
- **API Enhancements**: Updated GET /api/issues and GET /api/action-items endpoints to include creator information via LEFT JOIN with users table
  - Returns creator_username and creator_email for each item
  - Maintains backward compatibility with existing frontend code
- **Kanban Card Display**: Added creator information to all issue and action item cards
  - Shows "Created by [Username]" below due date badge
  - Displays user icon with creator username
  - Falls back to 'Unknown' if creator information not available
- **Completion Email Notifications**: New automated email sent to item creator when status changes to 'Done'
  - Email includes item details (ID, title, priority, completion date, completed by)
  - Only sent when status changes TO 'Done' (not from Done or between other statuses)
  - Respects user notification preferences (uses status_changes preference)
  - Includes direct link to view item details
  - Professional HTML formatting with plain text fallback
- **Implementation Details**:
  - Added sendCompletionNotification() method to NotificationService following existing patterns
  - Updated PATCH endpoints for both issues and action items to detect completion
  - Completion email sent to creator (not assignee) with details of who completed the item
  - Comprehensive error handling for missing creator email and database errors
- **UI Styling**: Added card-creator CSS class with responsive design
  - Separated by top border for visual clarity
  - Includes user-circle icon and semi-bold text
  - Mobile-responsive with smaller font sizes on narrow screens
- **Files Modified**: server.js (GET and PATCH endpoints), services/notificationService.js (new method), public/app.js (v28 - card rendering), public/index.html (CSS styles)
- **Impact**: Provides visibility into item ownership and automated recognition when work is completed, improving team communication and accountability
- **Note**: Users table contains username field only (no separate name field), so creator display uses username