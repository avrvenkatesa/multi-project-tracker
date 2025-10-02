# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS. It features a dynamic UI that adjusts based on user roles and authentication status, including conditional rendering of actions and a user management interface for administrators. HTTP communication uses the Fetch API with credentialed requests, and event handling is managed through delegation.

**Key Features:**
- **AI Analysis Features**: Includes in-modal search for matching items, a persistent review queue for unmatched status updates, smart matching with confidence scoring, and AI relationship detection (blocking, parent-child, related) from meeting transcripts.
- **Comments and @Mentions**: A comprehensive comment system with markdown support, real-time @mention autocomplete, and a notification system for unread mentions.
- **Project Dashboard**: Provides analytics with real-time statistics, Chart.js visualizations (status, priority, activity trends), an activity feed, and team performance metrics.

### Backend
The backend is a RESTful API built with Express.js, using a PostgreSQL database via Drizzle ORM. It implements a layered architecture with security middleware (Helmet, CORS, rate limiting) and JWT authentication with httpOnly cookie-based session management. A 6-tier RBAC system enforces granular permissions for all sensitive endpoints, and Joi handles request validation.

**Security:** The application uses bcryptjs for password hashing, JWT tokens in httpOnly cookies, and a 6-tier RBAC system (System Administrator, Project Manager, Team Lead, Team Member, Stakeholder, External Viewer). API protection includes Helmet.js, CORS, rate limiting, and Joi for input validation. All inline JavaScript has been eliminated, and URL sanitization is in place to prevent XSS.

### Data Management
A PostgreSQL database, managed by Drizzle ORM, stores:
- **Core Entities**: Users, Projects, Issues, Action Items, Meeting Transcripts.
- **Relationships**: Issue relationships, including AI-generated with confidence scores and evidence.
- **AI-specific Data**: Status Update Review Queue, AI analysis audit trail.
- **Collaboration**: Comments for issues and action items, mention notifications.
- **User Preferences**: User notification preferences and unsubscribe tokens.

### Request Handling
Express.js handles requests, utilizing `express-rate-limit` for API protection and comprehensive error handling. Request body parsing supports JSON and URL-encoded data.

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

### CDN Services
- **Tailwind CSS CDN**: CSS framework delivery.
- **Unpkg CDN**: JavaScript library delivery.
- **Chart.js**: Data visualization charts for dashboard analytics (local copy in public/).

## Recent Changes

### Improved Invitation Acceptance Flow (October 2, 2025)
Enhanced email invitation acceptance with proper web-based handling and comprehensive security:
- **Email URL Fix**: All notification emails now use Replit domain instead of localhost (via `getAppUrl()` helper that auto-detects `REPLIT_DEV_DOMAIN`)
- **GET Endpoint**: Added `GET /api/invitations/:token/accept` for email link clicks (previously only had POST endpoint)
- **Smart Flow**: Checks authentication via cookie, redirects to login if needed, handles all edge cases gracefully
- **User-Friendly Pages**: Beautiful HTML success/error pages for all scenarios (invalid invitation, wrong account, already member, success with auto-redirect)
- **Security**: Comprehensive HTML escaping with `escapeHtml()` helper for all user-controlled values (prevents XSS), URL encoding for redirect parameters
- **Graceful Handling**: Both GET and POST endpoints now handle "already a member" case gracefully - updates invitation status and shows friendly confirmation instead of error
- **Bug Fix**: Fixed POST endpoint duplicate key error when accepting invitations for projects user is already a member of

### Added Notification Settings Navigation & Test Email (October 2, 2025)
Completed the notification settings feature with full user access:
- **Navigation Link**: Added "⚙️ Settings" button in main navigation (next to My Invitations)
- **Test Email Endpoint**: Added `POST /api/notifications/test-email` to send test notifications
- **Accessible Settings**: Users can now easily access notification-settings.html to manage preferences
- **Features Available**: Toggle mentions, assignments, status changes, and invitations; set email frequency

### Fixed Comment Email Notification Deep-Linking (October 2, 2025)
Fixed the "View Comment" link in @mention email notifications to navigate directly to the specific comment:
- **Email Link**: Updated notification emails to include `itemId` and `itemType` parameters in URL
- **Deep-Linking**: Added automatic project selection and modal opening from URL parameters
- **Auto-Open Modal**: When clicking email link, automatically opens the specific issue/action item modal
- **URL Cleanup**: After opening modal, cleans up URL parameters for cleaner navigation

### Cancel Pending Invitations Feature (October 2, 2025)
Implemented invitation management for project managers to cancel pending invitations:
- **Backend API**: `DELETE /api/projects/:projectId/invitations/:invitationId` with manager-only authorization
- **Frontend**: Red "Cancel" button on pending invitation cards with confirmation dialog and automatic UI refresh
- **Security**: Role-based authorization, project ownership validation, proper error handling