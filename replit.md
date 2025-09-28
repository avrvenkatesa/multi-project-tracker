# Multi-Project Tracker

## Overview

Multi-Project Tracker is an AI-powered issue tracking system designed to manage multiple projects simultaneously. The application provides a centralized platform for tracking issues and action items across different projects, with built-in AI capabilities for enhanced project management. The system features a clean, responsive web interface built with modern frontend technologies and a secure Node.js backend with comprehensive security middleware.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built as a single-page application (SPA) using vanilla JavaScript with Tailwind CSS for styling. The architecture follows a component-based approach where the main application logic is contained in `app.js` and the user interface is defined in `index.html`. The frontend uses Axios for HTTP communication with the backend API and implements event delegation for efficient DOM manipulation.

### Backend Architecture
The backend follows a RESTful API architecture built on Express.js. The application implements a layered architecture with security middleware, request handling, and data management. Currently uses in-memory data storage for projects, issues, and action items, with a clear structure that can be easily migrated to a persistent database solution.

### Security Implementation
The application implements comprehensive security measures including:
- Helmet.js for setting security headers and Content Security Policy
- CORS configuration for cross-origin resource sharing
- Express rate limiting to prevent abuse (100 requests per 15-minute window)
- JWT token-based authentication system
- bcryptjs for password hashing
- Input validation using Joi schema validation
- File upload handling with Multer

### Data Management
Currently implements an in-memory data store with structured objects for projects, issues, action items, and users. The data structure is designed to be easily portable to a database solution, with clear entity relationships and consistent data models.

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

### Development Tools
- **nodemon** - Development server with automatic restart capabilities
- **dotenv** - Environment variable management

### External CDN Services
- **Tailwind CSS CDN** - For CSS framework delivery
- **Unpkg CDN** - For JavaScript library delivery (Axios)

The application is designed to run on Node.js version 16.0.0 or higher and includes comprehensive middleware for production-ready security and performance.