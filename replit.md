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

### Demo Credentials
- Email: demo@multiproject.com
- Password: demo123
- Role: System Administrator (full access for testing)

## Technical Notes

The application is designed to run on Node.js version 16.0.0 or higher and includes comprehensive middleware for production-ready security and performance. All sensitive endpoints are protected by RBAC middleware, and the frontend dynamically adjusts UI based on user permissions. Database schema is managed through Drizzle ORM with support for safe migrations.