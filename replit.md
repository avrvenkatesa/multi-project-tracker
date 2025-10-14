# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures. The project envisions becoming a leading solution for centralized project oversight and efficient team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (October 2025)
- **Project-Aware Checklist Navigation** (October 14, 2025): Enhanced checklist page to maintain project context when navigating from project pages:
  - **Smart Navigation**: When accessing checklists from a project, the project is pre-selected in the filter dropdown
  - **Auto-Filtered Templates**: Template dropdown automatically shows only templates belonging to the selected project
  - **Modal Integration**: Create Checklist modal pre-selects the project and filters templates accordingly
  - **Dynamic Updates**: Template filter updates in real-time when user changes project selection
  - **User Control**: Users can still switch to "All Projects" to see all templates and checklists
  - **Files**: public/app.js (navigation with project parameter), public/js/checklists.js (URL detection, filtering logic)
- **Checklist Page Layout Consistency** (October 14, 2025): Updated checklist page to match the consistent layout of other pages (Tags, Risks, Dashboard):
  - **Navigation Cleanup**: Removed navigation tabs (Dashboard, Issues & Actions, Checklists, Risks, Tags) and replaced with simple "← Back to Projects" button
  - **Header Redesign**: Updated header to match gradient styling and subtitle format used in Tags/Risks pages
  - **Button Positioning**: Moved "+ New Checklist" button to right side of content area (consistent with other pages)
  - **Files**: public/checklists.html (header structure), public/js/checklists.js (back button handler)
- **Dropdown Navigation UI** (October 14, 2025): Consolidated cluttered navigation from 8 buttons to 2 accessible dropdown menus:
  - **UI Cleanup**: Replaced 8 individual buttons (Dashboard, AI Analysis, Transcripts, Checklists, Tags, Risks, + Issue, + Action Item) with 2 dropdown menus ("View" with 6 items, "+ Create" with 2 items)
  - **Accessibility Compliance**: Full WCAG compliance with ARIA attributes (aria-haspopup, aria-expanded, aria-controls, role="menu/menuitem")
  - **Keyboard Navigation**: Complete keyboard support - Enter/Space to toggle, Arrow keys for navigation, Escape to close, Home/End for first/last item
  - **Focus Management**: Auto-focus first item on open, return focus to button on close, proper ARIA state synchronization when switching dropdowns
  - **User Experience**: Cleaner interface while maintaining all functionality, click-outside-to-close, hover states with colored backgrounds matching original button themes
  - **Files**: public/index.html (dropdown structure), public/app.js (interaction logic)
- **Progress Tracking Fix** (October 14, 2025): Fixed data format mismatch preventing progress updates when completing checklist items:
  - **Issue**: Frontend sent separate `response_value`/`response_boolean`/`response_date` fields without `is_completed` flag; backend expected `value`, `type`, and `is_completed`
  - **Root Cause**: Backend only counts items where `is_completed = true`, but frontend never sent this field (always defaulted to false)
  - **Fix**: Updated saveResponse() to send correct format: `{template_item_id, value, type, is_completed}` with smart completion detection
  - **Completion Logic**: Checkbox (checked=true), text/textarea (has content), date (has value), radio/dropdown (has selection)
  - **Result**: Progress circle, completed count, and status transitions now update in real-time as items are filled
  - **Files**: public/js/checklists.js (saveResponse function)

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS. It features a dynamic UI based on user roles, real-time AI analysis capabilities (in-modal search, review queue), a comprehensive comment system with markdown support and @mention autocomplete, and a Project Dashboard with analytics, Chart.js visualizations, and team performance metrics. UI elements like Kanban boards, tag displays, and risk cards prioritize clarity and interactivity. A comprehensive checklist system with hierarchical sections, various field types, and status auto-updates is also integrated. Visual due date badges and delivery performance indicators enhance project tracking.

### Backend
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing. The backend handles complete CRUD operations for core entities, including atomic transactions for tag management, project-level authorization, and checklist management. Status changes are logged to a `status_history` table for auditing.

### Data Management
A PostgreSQL database stores core entities such as Users, Projects, Issues, Action Items, Meeting Transcripts, and the Risk Register. It manages relationships, AI-specific data (Status Update Review Queue, AI analysis audit trail), collaboration data (comments, mention notifications), user preferences, and comprehensive risk management with automatic risk scoring and tracking. Tags are managed with a type system supporting Issues/Actions, Risks, or Both. A dedicated `status_history` table tracks all status transitions. A comprehensive checklist system stores templates, sections, items, responses, comments, and signoffs, with generated completion percentages and performance indexes.

### Request Handling
Express.js handles requests, incorporating `express-rate-limit` for API protection and comprehensive error handling. It supports JSON and URL-encoded data parsing.

### Notifications
The system integrates with Microsoft Teams for instant notifications (issue/action item creation, status changes) and daily scheduled reports (overdue items, project health summaries) using Adaptive Cards. Notifications include correctly formed URLs to the application.

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
- **node-cron**: Scheduled task manager for daily notifications.

### Reporting & Export
- **pdfkit**: Server-side PDF generation for reports.
- **csv-writer**: CSV file generation for data export.

### CDN Services
- **Chart.js**: Data visualization charts for dashboard analytics.