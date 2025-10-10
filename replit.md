# Multi-Project Tracker

## Overview
Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system includes advanced AI meeting analysis with two-phase processing (item extraction + status update detection), in-modal search for matching items, and a persistent review queue for unmatched status updates. The system aims to enhance project oversight and efficiency through AI-driven insights and robust security measures.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS, featuring a dynamic UI based on user roles and authentication. Key features include AI analysis capabilities (in-modal search, review queue, smart matching, relationship detection), a comprehensive comment system with markdown support and real-time @mention autocomplete, and a Project Dashboard with analytics, Chart.js visualizations, activity feed, and team performance metrics. Kanban boards include automatic due date sorting with color-coded visual indicators for urgency, attachment count badges, and multi-criteria sorting options. A comprehensive tagging system is also implemented with custom color-coded tags and a dedicated tag management interface.

### Technical Implementations
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing. File attachment functionality is implemented with Multer for secure uploads. AI-powered meeting transcript analysis leverages OpenAI. The system also includes robust PDF and CSV export capabilities.

### Feature Specifications
- **AI Meeting Analysis**: Two-phase processing (item extraction + status update detection) with in-modal search and a persistent review queue. AI-created items send assignment notifications.
- **Role-Based Access Control (RBAC)**: A 6-tier RBAC system ensures granular permissions.
- **Authentication**: JWT authentication with httpOnly cookie-based session management.
- **Project Management**: Centralized tracking of issues and action items with full CRUD operations.
- **Communication**: Comprehensive comment system with markdown and @mention autocomplete, including email notifications.
- **File Attachments**: Upload, view, download, and delete files associated with issues and action items.
- **Kanban Board**: Automatic and user-controlled multi-criteria sorting, color-coded visual badges, and automated daily refreshes.
- **Tagging System**: Comprehensive tagging functionality with custom color-coded tags, dedicated tag management interface (tags.html), visual display on Kanban cards with color-coded badges, on-the-fly tag creation from all modals, tag selection for issues and action items, tag-based filtering for issues and action items, and deletion protection (tags in use cannot be deleted).
- **Filtering & Search**: Advanced filtering system supporting search, type (Issues/Action Items), status, priority, assignee, category, and tags. Filters are composable, persist in URL for shareable links, and display as removable badges.
- **Shareable Links**: One-click copy link functionality for issues and action items. Copy buttons available on Kanban cards and in edit modals. Shared links automatically open the item in the appropriate modal with visual highlighting (pulsing blue border animation) and smooth scroll-to-item functionality.
- **Toast Notification System**: User-friendly feedback messages.

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
- **Chart.js**: Data visualization charts for dashboard analytics.