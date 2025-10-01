# Multi-Project Tracker

## Overview

Multi-Project Tracker is an AI-powered issue tracking system with comprehensive Role-Based Access Control (RBAC). The application provides a centralized platform for tracking issues and action items across different projects, with built-in AI capabilities for enhanced project management. The system features a clean, responsive web interface built with modern frontend technologies, a secure Node.js backend with JWT authentication, and persistent PostgreSQL database storage with full role-based permission enforcement.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built as a single-page application (SPA) using vanilla JavaScript with Tailwind CSS for styling:
- **Core Logic**: `app.js` - Project management, UI rendering, modal controls
- **Authentication**: `auth.js` - AuthManager with role checking, login/register/logout flows
- **UI Components**: `index.html` - Responsive layout with role-based visibility controls
- **Permission System**: Dynamic UI updates based on user role and authentication status
  - Login/Register/Logout modals with form validation
  - Role badges displayed for authenticated users
  - Conditional rendering of action buttons (create, edit, delete) based on permissions
  - User management interface for System Administrators
- **HTTP Communication**: Fetch API with credentials for cookie-based auth
- **Event Handling**: Event delegation for efficient DOM manipulation

### Backend Architecture
The backend follows a RESTful API architecture built on Express.js with PostgreSQL database (Neon). The application implements a layered architecture with:
- Security middleware (Helmet, CORS, rate limiting)
- JWT authentication with httpOnly cookie-based session management
- Role-Based Access Control (RBAC) middleware with 6-tier role hierarchy
- Database access layer using Drizzle ORM
- Comprehensive request validation and error handling

### Security Implementation
The application implements comprehensive security measures including:
- **Authentication**: JWT tokens stored in httpOnly cookies with SameSite=Lax and Secure flag in production
- **Password Security**: bcryptjs hashing with salt rounds for secure password storage
- **RBAC System**: 6-tier role hierarchy with granular permission enforcement
  - System Administrator (highest): Full system access, user management
  - Project Manager: Create/delete projects, manage all content
  - Team Lead: Edit any issues, moderate content
  - Team Member: Create issues, edit own content
  - Stakeholder: Read-only project access with comments
  - External Viewer (lowest): Read-only access
- **API Protection**: Helmet.js security headers, CORS configuration, rate limiting (100 req/15min)
- **Input Validation**: Joi schema validation for all endpoints
- **Authorization**: Role-based middleware protecting all sensitive endpoints

### Data Management
PostgreSQL database with Drizzle ORM provides:
- **Users table**: Authentication credentials, roles, profile data with bcrypt-hashed passwords
- **Projects table**: Project metadata, templates, timestamps
- **Issues table**: Issue tracking with status, priority, assignments
- **Action Items table**: Granular action item tracking linked to issues and projects
- **Relationships**: Foreign key constraints ensuring data integrity
- **Migrations**: Schema managed through Drizzle with safe push/pull capabilities

### Request Handling
The application uses express-rate-limit for API protection and implements proper error handling middleware. Request body parsing is configured with size limits (10MB) and supports both JSON and URL-encoded data formats.

## External Dependencies

### Core Framework Dependencies
- **Express.js** - Web application framework for the backend API
- **Axios** - HTTP client library for frontend-backend communication
- **Tailwind CSS** - Utility-first CSS framework for responsive UI design

### Security Dependencies
- **Helmet** - Security middleware for Express applications
- **CORS** - Cross-Origin Resource Sharing middleware
- **bcryptjs** - Password hashing library
- **jsonwebtoken** - JWT token implementation for authentication
- **express-rate-limit** - Rate limiting middleware for API protection

### Validation and File Handling
- **Joi** - Schema validation library for request data
- **Multer** - Multipart/form-data middleware for file uploads

### AI Integration
- **OpenAI** - GPT-3.5-Turbo integration for AI-powered meeting transcript analysis

### Database & ORM
- **@neondatabase/serverless** - Neon PostgreSQL serverless driver
- **drizzle-orm** - TypeScript ORM for database operations
- **drizzle-kit** - Schema migration and management tools

### Development Tools
- **nodemon** - Development server with automatic restart capabilities
- **dotenv** - Environment variable management

### External CDN Services
- **Tailwind CSS CDN** - For CSS framework delivery
- **Unpkg CDN** - For JavaScript library delivery (Axios)

## Recent Changes (September 2025)

### Complete RBAC Implementation
- Migrated from in-memory storage to PostgreSQL database with Drizzle ORM
- Implemented JWT authentication with httpOnly cookie sessions
- Built 6-tier role hierarchy with granular permission controls
- Added role-based middleware protecting all API endpoints
- Created frontend AuthManager for role checking and UI updates
- Implemented user management system for System Administrators
- Added permission-based UI visibility (buttons, modals, features)
- Deployed comprehensive security measures across the entire stack

### Latest Updates (September 30, 2025)
- Fixed Content Security Policy to allow unpkg.com connections for axios source maps
- Removed all inline event handlers, replaced with proper event listeners for CSP compliance
- Implemented full Action Item creation modal with title, description, priority, status, assignee, and due date
- Fixed issue creation form to handle missing project properties with default fallback options
- Added robust error handling for dynamic dropdown generation in issue/action item forms
- **Board Filtering and Search (Story 1.4.2)**:
  - Backend: Added comprehensive filtering to GET /api/issues and /api/action-items endpoints using Neon Pool.query() for dynamic parameterized queries
  - Frontend: Implemented filter UI with search input, status/priority/assignee/type dropdowns above Kanban board
  - Features: Real-time search with 300ms debounce, active filter badges with remove buttons, results count display, type filter to show issues only or action items only
  - State Management: Filter state persists in URL parameters for shareable filtered views
  - Security: SQL injection protected via parameterized queries, CSP compliant (no inline handlers)
  - Dynamic assignee dropdown populated from actual project data
  - Bug fixes: Configured WebSocket support for Node.js v20 (ws package), removed non-existent status column from project creation
- **Issue Relationships (Story 1.3.3)**:
  - Database: Created issue_relationships table with support for blocks/blocked_by, parent_of/child_of, and related_to relationships
  - Backend: Implemented GET/POST/DELETE endpoints with automatic reciprocal relationship handling (e.g., creating "blocks" auto-creates "blocked_by")
  - Frontend: Added relationship management modal accessible via "🔗 Relationships" button on each kanban card
  - Features: View outgoing/incoming relationships, add new relationships with type selector and target picker, delete relationships
  - Security: Prevents self-referencing relationships, checks for duplicate relationships, Team Member+ role required
  - UI: Relationship modal shows current relationships color-coded (blue for outgoing, yellow for incoming auto-managed)
  - Visual Indicators: Kanban cards display relationship count badges (e.g., "2") in blue when relationships exist, auto-update on add/delete
- **AI Meeting Analysis (Story 2.1.1)**:
  - AI Integration: GPT-3.5-Turbo powered transcript analysis to automatically extract action items and issues from meeting transcripts
  - Backend: POST /api/meetings/analyze endpoint with multer file upload, OpenAI API integration, and cost tracking
  - Backend: POST /api/meetings/create-items endpoint for batch creating selected items from AI suggestions
  - Frontend: Two-step AI Analysis modal with file upload (Step 1) and review interface (Step 2)
  - Features: Upload .txt transcripts up to 10MB, AI extracts action items with assignees/due dates and issues with categories/priorities
  - Features: Review AI suggestions with confidence scores, selectively create items with checkboxes, displays token usage and cost per analysis
  - Security: Team Member+ role required, file type validation, 10MB size limit, automatic file cleanup
  - Cost: ~$0.001-0.01 per transcript analysis using GPT-3.5-Turbo (10-20x cheaper than GPT-4)
  - UI: "AI Analysis" button in project toolbar with lightbulb icon, CSP-compliant event listeners
- **UI Improvement (October 1, 2025)**:
  - Repositioned AI Analysis button from right-side button group to left side next to project title
  - Separated "analyze" action from "create" actions for better visual hierarchy and reduced clutter
  - Enhanced button styling with shadow and hover scale effect for improved prominence
  - Maintained CSP compliance and role-based visibility (data-requires-write)
- **Visual Distinction for AI-Generated Items (Story 2.1.2)**:
  - Database: Added created_by_ai (boolean), ai_confidence (decimal 0-100), ai_analysis_id (text) columns to issues and action_items tables
  - Backend: Updated POST /api/issues and POST /api/action-items to accept optional AI metadata fields
  - Backend: Modified POST /api/meetings/create-items to automatically flag AI-generated items with confidence scores and analysis IDs
  - Frontend: Added 4 helper functions for AI badge rendering and card styling (getAISourceBadge, getConfidenceColor, getAICardBorderClass, getAICardBackgroundClass)
  - Visual Design: AI-generated cards display indigo background (bg-indigo-50) with colored left border based on confidence level
  - Badge System: Manual items show "👤 Manual" badge, AI items show "⚡ AI XX%" badge with color-coded confidence
  - Confidence Colors: 90%+ green, 75%+ blue, 60%+ yellow, <60% orange for visual quality indication
  - UI Integration: All Kanban cards automatically display creation source with appropriate styling
  - Analysis Grouping: AI-generated items linked by unique ai_analysis_id for batch tracking
- **Enhanced AI Extraction Prompt (October 1, 2025)**:
  - Improved extraction rules with 5 categories for action items (direct assignments, commitments, soft assignments, recurring tasks, implied tasks)
  - Enhanced issue detection for 5 types (problems, blockers, risks, technical debt, timeline concerns)
  - Advanced assignee extraction supporting direct/implied/multiple assignments with fallback to null
  - Smart due date extraction including specific dates, relative dates (next Friday), and recurring patterns
  - Refined priority assessment with keyword-based classification (critical/high/medium/low)
  - Detailed confidence scoring guidelines (90-100% explicit, 80-89% partial, 70-79% implied, <70% ambiguous)
  - Added current meeting date context for relative date calculations
  - Comprehensive extraction directive to capture ALL action items and issues, even implied ones

### Demo Credentials
- Email: demo@multiproject.com
- Password: demo123
- Role: System Administrator (full access for testing)

## Technical Notes

The application is designed to run on Node.js version 16.0.0 or higher and includes comprehensive middleware for production-ready security and performance. All sensitive endpoints are protected by RBAC middleware, and the frontend dynamically adjusts UI based on user permissions. Database schema is managed through Drizzle ORM with support for safe migrations.