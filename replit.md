# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures, thereby enhancing project oversight and efficiency.

## Recent Changes (October 2025)
- **CSP Compliance for Tags Page**: Eliminated all Content Security Policy violations on Tags page by replacing inline onclick handlers with proper event listeners and event delegation. Navigation buttons and tag card clicks now use data attributes with addEventListener instead of inline scripts (tags.js v6).
- **Risk Register Currency Selector**: Added multi-currency support for mitigation costs with 18 global currencies (USD, EUR, GBP, JPY, CNY, INR, AUD, CAD, CHF, SEK, NZD, SGD, HKD, NOK, KRW, MXN, BRL, ZAR). Currency selection is persisted in database and displayed with appropriate symbols.
- **Tag System Clarification**: Risk Register tags are stored separately (TEXT[] in risks table) from Issue/Action Item tags (JSONB). The Tags page only displays Issue/Action Item tags, not Risk tags.
- **Modal UX Improvements**: Fixed modal close buttons (X, Cancel, Close) with proper event listeners across all Risk modals.
- **Navigation Consistency**: Unified header design across Risk Register, Tags, and Dashboard pages with intelligent "Back to Project/Projects" button toggling.
- **Tags Page API Fix**: Fixed Tags page JSON parsing errors by correcting API endpoint format to use query parameters (/api/issues?projectId=X instead of /api/projects/X/issues). Added missing GET /api/projects/:projectId endpoint for fetching single project details.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles and authentication. Key features include AI analysis capabilities (in-modal search, review queue, smart matching, relationship detection), a comprehensive comment system with markdown support and real-time @mention autocomplete, and a Project Dashboard with analytics, Chart.js visualizations, activity feed, and team performance metrics.

### Backend
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing.

### Data Management
A PostgreSQL database stores core entities such as Users, Projects, Issues, Action Items, Meeting Transcripts, and the Risk Register. It also handles relationships (including AI-generated), AI-specific data (Status Update Review Queue, AI analysis audit trail), collaboration data (comments, mention notifications), user preferences, and comprehensive risk management with automatic risk scoring and tracking.

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