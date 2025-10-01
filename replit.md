# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS. It features a dynamic UI that adjusts based on user roles and authentication status, including conditional rendering of actions and a user management interface for administrators. HTTP communication uses the Fetch API with credentialed requests, and event handling is managed through delegation.

### Backend
The backend is a RESTful API built with Express.js, using a PostgreSQL database via Drizzle ORM. It implements a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permission enforcement. All sensitive endpoints are protected by role-based middleware, and request validation is handled with Joi.

### Security
The application incorporates robust security measures including bcryptjs for password hashing, JWT tokens in httpOnly cookies, and a comprehensive 6-tier RBAC system (System Administrator, Project Manager, Team Lead, Team Member, Stakeholder, External Viewer). API protection includes Helmet.js, CORS, and rate limiting, with Joi for input validation and role-based authorization for all sensitive endpoints.

### Data Management
A PostgreSQL database, managed by Drizzle ORM, stores:
- **Users**: Authentication credentials, roles, hashed passwords.
- **Projects**: Project metadata.
- **Issues**: Issue tracking details.
- **Action Items**: Granular action item tracking.
- **Meeting Transcripts**: Metadata, text, analysis results, and cost.
- **Issue Relationships**: Tracks dependencies and links between issues.
Foreign key constraints ensure data integrity, and Drizzle manages schema migrations.

### Request Handling
Express.js handles requests, utilizing `express-rate-limit` for API protection and comprehensive error handling middleware. Request body parsing supports JSON and URL-encoded data with a 10MB size limit.

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
- **uuid**: Unique ID generation for analysis.
- **string-similarity**: Duplicate detection for AI-generated items.

### AI Integration
- **OpenAI**: GPT-3.5-Turbo for AI-powered meeting transcript analysis.

### Database & ORM
- **@neondatabase/serverless**: Neon PostgreSQL driver.
- **drizzle-orm**: TypeScript ORM.
- **drizzle-kit**: Schema migration tools.

### Development Tools
- **nodemon**: Development server.
- **dotenv**: Environment variable management.

### CDN Services
- **Tailwind CSS CDN**: CSS framework delivery.
- **Unpkg CDN**: JavaScript library delivery.