# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles and authentication. Key features include AI analysis capabilities (in-modal search, review queue, smart matching, relationship detection), a comprehensive comment system with markdown support and real-time @mention autocomplete, and a Project Dashboard with analytics, Chart.js visualizations, activity feed, and team performance metrics. Kanban boards include automatic due date sorting with color-coded visual indicators for urgency and attachment count badges.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing. File attachment functionality is implemented with Multer for secure uploads, supporting various file types with size limits and unique filename generation. AI-powered meeting transcript analysis leverages OpenAI for extracting and updating project items.

### Feature Specifications
- **AI Meeting Analysis**: Two-phase processing (item extraction + status update detection) with in-modal search and a persistent review queue for unmatched status updates. AI-created items send assignment notifications.
- **Role-Based Access Control (RBAC)**: A 6-tier RBAC system ensures granular permissions across the application.
- **Authentication**: JWT authentication with httpOnly cookie-based session management.
- **Project Management**: Centralized tracking of issues and action items with full CRUD operations.
- **Reporting**: PDF and CSV export capabilities for various reports (Project, Executive, Team Performance).
- **Communication**: Comprehensive comment system with markdown and @mention autocomplete. Email notifications for assignments and updates.
- **File Attachments**: Upload, view, download, and delete files associated with issues and action items, supported directly within create/edit modals.
- **Kanban Board**: Automatic sorting of items by due date urgency and color-coded visual badges for status.

### System Design Choices
- **Frontend**: Vanilla JavaScript SPA with Tailwind CSS for responsiveness and dynamic UI rendering based on user roles.
- **Backend**: Express.js RESTful API with PostgreSQL and Drizzle ORM for data persistence. Layered architecture for maintainability and scalability.
- **Data Management**: PostgreSQL stores core entities (Users, Projects, Issues, Action Items, Meeting Transcripts), relationships (including AI-generated), and AI-specific data.
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

### Bug Fix: PDF Report Completion Counts (October 9, 2025)
Fixed critical bug in PDF team performance reports showing zero completion counts:
- **Root Cause**: Multiple issues in getMemberDetails() query:
  1. Team metrics query was checking action items with status = 'Done', but action items use status = 'Completed'
  2. Original query created cartesian product by LEFT JOINing ALL issues and action items (not pre-aggregated)
  3. Case-sensitive assignee matching failed when usernames had different casing
  4. No NULL/empty assignee filtering
- **Fix Applied**: 
  1. Rewrote query to use pre-aggregated subqueries (matching dashboard pattern)
  2. Added LOWER(TRIM(assignee)) normalization to all subqueries
  3. Added NULL and empty string filtering for assignees
  4. Fixed action items completion status from 'Done' to 'Completed'
- **Impact**: PDF reports now accurately reflect completed items, matching dashboard metrics exactly
- **Related**: This complements the earlier dashboard bug fix where JOIN was corrected from user_id to username for assignee matching
- **Files Updated**: `services/reportService.js` - completely rewrote getMemberDetails() query with proper normalization
- **Verification**: All three PDF report types (Executive Summary, Detailed Report, Team Performance) now show accurate completion statistics

### Feature: Phase 3 - Multi-Criteria Sorting and Automated Features (October 9, 2025)
Implemented advanced multi-criteria sorting modes and automated daily refresh functionality:
- **3 New Multi-Criteria Sort Modes**:
  - 🔥📅 **Priority + Due Date**: Primary sort by priority (Critical > High > Medium > Low), secondary by due date (earliest first)
  - ⚠️🔥 **Overdue + Priority**: Primary sort by overdue status (overdue items first), secondary by priority within each group
  - 🎯 **Smart Sort**: Weighted algorithm combining priority and due date urgency with calculated scores (priority: 0-8 points, overdue: up to 30 points, due today: +5 bonus)
- **Organized Dropdown Structure**: Sort options grouped into "Single Criteria" and "Multi-Criteria" sections with optgroup labels
- **Automated Daily Refresh**: Automatically refreshes Kanban board at midnight to update due date urgency
  - Defaults to enabled with localStorage persistence
  - Schedules next refresh after each midnight trigger
  - User preference persists across sessions
- **Manual Refresh Controls**: Added to project header for on-demand refresh
  - "Refresh Sort" button with sync icon
  - "Auto-refresh daily" toggle checkbox
  - Controls appear dynamically when project is selected
- **Toast Notification System**: User-friendly feedback messages
  - Success notifications (green) for feature enablement
  - Info notifications (blue) for status updates
  - Smooth fade-in/out animations
  - Auto-dismiss after 3 seconds
- **Complete Mobile Responsiveness**: All Phase 3 features fully responsive with mobile breakpoints
- **Files Updated**: `public/app.js` (v27) - added 3 multi-criteria sort functions, auto-refresh system, toast notifications; `public/index.html` - updated dropdowns with optgroup structure, added CSS for refresh controls and toasts
- **Impact**: Users now have 10 total sort modes (7 single + 3 multi-criteria), automatic daily refresh for time-sensitive sorting, and immediate visual feedback through toast notifications

### Feature: Phase 2 - User-Controlled Sort Options (October 9, 2025)
Implemented user-controlled sort dropdown with 7 sort modes and localStorage persistence:
- **Sort Modes Available**: Each Kanban column header now includes a dropdown with 7 sorting options:
  - ⚠️ Due Date (Overdue First) - Default from Phase 1, prioritizes overdue items
  - 📅 Due Date (Earliest) - All items sorted by due date ascending (null dates last)
  - 📅 Due Date (Latest) - All items sorted by due date descending (null dates last)
  - 🔥 Priority - Sort by priority level (Critical > High > Medium > Low)
  - 🆕 Recently Created - Newest items first (created_at descending)
  - 🕐 Recently Updated - Most recently updated first (updated_at descending)
  - ✋ Manual - Preserves current order (full drag-drop reordering planned for Phase 3)
- **Per-Column Preferences**: Each column can have an independent sort mode (e.g., To Do sorted by priority, In Progress by due date)
- **localStorage Persistence**: User's sort preferences saved to browser localStorage and restored on page reload
- **Dynamic Item Counts**: Column headers show live item counts (e.g., "To Do (5)")
- **Responsive Design**: Sort dropdowns styled with mobile breakpoints for smaller screens
- **Implementation Notes**:
  - sortItems() function handles all 7 sort modes with array copies to prevent mutation
  - getSortPreference() / saveSortPreference() manage localStorage persistence
  - Manual mode preserves order when switching modes and moving between columns
  - TODO: Full drag-drop reordering within same column (Phase 3 enhancement)
- **Files Updated**: `public/app.js` (v26) - added sort functions and preference management; `public/index.html` - added column header dropdowns with item counts and CSS styling
- **Impact**: Users can customize Kanban sorting per column, with preferences persisting across sessions for personalized workflow management

### Feature: Phase 1 - Kanban Due Date Auto-Sorting with Visual Indicators (October 9, 2025)
Implemented automatic due date sorting and color-coded visual indicators for the Kanban board:
- **Sorting Logic**: Items in each Kanban column are automatically grouped and sorted by due date urgency:
  - Overdue items (due_date < today): Displayed first, oldest overdue items at top
  - Due today items (due_date = today): Shown after overdue
  - Upcoming items (due_date > today): Sorted by soonest first
  - No due date items (due_date is null): Displayed at bottom
- **Visual Badges**: Every issue and action item card displays a color-coded due date badge:
  - 🔴 Overdue: Red badge (#fee2e2 bg, #dc2626 text) - shows "X days overdue"
  - 🟡 Today: Yellow/amber badge (#fef3c7 bg, #d97706 text) - shows "Due today"
  - 🟠 Soon (1-3 days): Orange badge (#fef3c7 bg, #f59e0b text) - shows "Due tomorrow" or "Due in X days"
  - 🔵 Future (3+ days): Blue badge (#dbeafe bg, #2563eb text) - shows "Due in X days"
  - ⚪ None: Gray badge (#f3f4f6 bg, #6b7280 text) - shows "No due date"
- **Implementation Details**:
  - Added `sortByDueDate()` function that partitions items into buckets using normalized midnight date comparisons
  - Added `createDueDateBadge()` function that generates badge HTML with appropriate icons and text
  - Updated `renderKanbanBoard()` to apply sorting to each column before rendering
  - Badge includes FontAwesome icons (calendar-times, exclamation-circle, calendar-day, clock, calendar)
- **Responsive Design**: CSS includes mobile breakpoint (@media max-width: 768px) with smaller text and padding
- **Files Updated**: `public/app.js` - added sorting and badge functions, updated renderKanbanBoard(); `public/index.html` - added CSS styles for all badge variants
- **Impact**: Users can quickly identify urgent items at a glance with automatic sorting and clear visual indicators for due date status