# Multi-Project Tracker

## Overview
The Multi-Project Tracker is an AI-powered issue tracking system designed to centralize and streamline project management. It features comprehensive Role-Based Access Control (RBAC), a responsive web interface, a secure Node.js backend with JWT authentication, and persistent PostgreSQL storage. The system enhances project oversight and efficiency through AI-driven insights and robust security measures. Key capabilities include:

-   **AI Meeting Analysis**: Two-phase processing for item extraction and status update detection, with in-modal search and a persistent review queue for unmatched status updates.
-   **AI Checklist Generation**: Generates checklists from issue/action descriptions and uploaded documents, supporting focused multi-checklist generation from extensive documents.
-   **Checklist Validation**: An intelligent quality scoring system with required fields validation, consistency checks, and quality assessments.
-   **Comprehensive Reporting**: PDF and CSV export capabilities for checklists and project data.
-   **Enhanced Collaboration**: A comment system with markdown support and @mention autocomplete.

The project aims to be a leading solution for centralized project oversight and efficient team collaboration, providing a robust solution for enhanced project oversight and team collaboration.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (October 2025)

- **Template Card Display Enhancements** (October 17, 2025):
  - **Tags on Cards**: Template cards now display up to 3 tags with a "+X more" indicator if additional tags exist
  - **Category Display**: Category is prominently shown below the template name on each card
  - **Visual Design**: Tags use subtle blue styling (bg-blue-50, text-blue-600) to maintain clean card appearance
  - **Files Modified**: public/js/templates.js

- **Template Library Search & Filter Fixes** (October 17, 2025):
  - **Search Resets Category**: When searching templates, category filter automatically resets to "All Templates" to show results across all categories
  - **Category Clears Search**: Clicking a category filter now clears the search input for better UX
  - **Cross-Category Search**: Search now works across all categories instead of being limited to the selected category
  - **Visual Feedback**: Active category button updates to "All Templates" when user performs a search
  - **Files Modified**: public/js/templates.js

- **Template Navigation Added to All Pages** (October 17, 2025):
  - **View Dropdown Enhancement**: Added "Templates" option to View dropdown on Dashboard, Risks, Checklists, and Tags pages
  - **Consistent Navigation**: Templates now accessible from all major project views, not just the main index page
  - **UI Consistency**: Templates button uses indigo color scheme with bookmark icon to match main navigation
  - **Files Modified**: public/dashboard.html, public/risks.html, public/checklists.html, public/tags.html

## System Architecture

### Frontend
The frontend is a single-page application (SPA) built with vanilla JavaScript and Tailwind CSS. It features a dynamic UI based on user roles, real-time AI analysis capabilities, a comprehensive comment system, and a Project Dashboard with analytics and Chart.js visualizations. UI elements such as Kanban boards, tag displays, risk cards, and a comprehensive checklist system prioritize clarity and interactivity. The UI implements consistent navigation, blue header design with white text, and user information display with responsive design. All inline JavaScript is moved to external files for CSP compliance.

### Backend
The backend is a RESTful API built with Express.js, utilizing a PostgreSQL database via Drizzle ORM. It employs a layered architecture with security middleware (Helmet, CORS, rate limiting), JWT authentication with httpOnly cookie-based session management, and a 6-tier RBAC system for granular permissions. Joi is used for request validation, and bcryptjs for password hashing. The backend handles complete CRUD operations, atomic transactions for tag management, project-level authorization, comprehensive checklist management, and logging of status changes to a `status_history` table.

### Data Management
A PostgreSQL database stores core entities such as Users, Projects, Issues, Action Items, Meeting Transcripts, and the Risk Register. It manages relationships, AI-specific data (Status Update Review Queue, AI analysis audit trail, checklist generation sources), collaboration data (comments, mention notifications), user preferences, and comprehensive risk management with automatic risk scoring and tracking. Tags are managed with a type system. A dedicated `status_history` table tracks all status transitions. A comprehensive checklist system stores templates, sections, items, responses, comments, and signoffs, with generated completion percentages, performance indexes, and validation history. Database schemas for checklist templates include `is_public`, `is_featured`, `tags`, `usage_count`, and `avg_rating`, with related `template_ratings`, `template_usage`, and `template_categories` tables.

### AI Features
-   **AI Meeting Analysis**: Two-phase processing for item extraction and status update detection, with in-modal search and a persistent review queue.
-   **AI Checklist Generation**: Generates comprehensive and granular checklists from issue/action descriptions and uploaded documents (PDF, DOCX, TXT), supporting multi-checklist generation from complex documents with focused workstreams. It leverages large token limits and specific prompting techniques for exhaustive extraction. The generation process includes a 5-step visual progress indicator, selective checklist creation, and enhanced batch preview display. Error handling includes partial batch failure UI with distinct visual indicators and retry functionality, rate limiting display, and attachment error handling for unsupported file types or large files.
-   **Checklist Validation**: Provides intelligent quality scoring, required field validation, consistency checks, and recommendations.

### Reporting & Export
-   **PDF Export**: Generates professional PDF reports for checklists with progress bar rendering.
-   **CSV Export**: Provides CSV file generation for data export.

## External Dependencies

### Core Frameworks
-   **Express.js**: Backend web application framework.
-   **Axios**: Frontend HTTP client.
-   **Tailwind CSS**: Frontend styling.

### Security Libraries
-   **Helmet**: Express security headers.
-   **CORS**: Cross-Origin Resource Sharing.
-   **bcryptjs**: Password hashing.
-   **jsonwebtoken**: JWT implementation.
-   **express-rate-limit**: API rate limiting.

### Validation & Utilities
-   **Joi**: Data validation.
-   **Multer**: File uploads.
-   **uuid**: Unique ID generation.
-   **string-similarity**: Duplicate detection.
-   **pdf-parse**: PDF text extraction.
-   **mammoth**: DOCX text extraction.
-   **file-type**: File type detection.

### AI Integration
-   **OpenAI**: GPT-3.5-Turbo and GPT-4o for AI-powered analysis and checklist generation.
-   **Anthropic**: Claude 3.5 Sonnet support for AI checklist generation.

### Database & ORM
-   **@neondatabase/serverless**: Neon PostgreSQL driver.
-   **drizzle-orm**: TypeScript ORM.
-   **drizzle-kit**: Schema migration tools.

### Email & Notifications
-   **nodemailer**: SMTP email sending library.
-   **node-cron**: Scheduled task manager for daily notifications.

### Reporting & Export
-   **pdfkit**: Server-side PDF generation.
-   **stream-buffers**: Buffer management for PDF generation.
-   **csv-writer**: CSV file generation.

### CDN Services
-   **Chart.js**: Data visualization charts.