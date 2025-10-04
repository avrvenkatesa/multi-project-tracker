# Multi-Project Tracker

> **AI-Powered Project Management Platform with Advanced Collaboration Features**

[![Version](https://img.shields.io/badge/version-0.10.0-blue.svg)](https://github.com/avrvenkatesa/multi-project-tracker/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-16+-blue.svg)](https://www.postgresql.org/)

## 🌟 Overview

Multi-Project Tracker is a comprehensive project management platform designed for teams managing multiple projects simultaneously. Built with AI-powered meeting analysis, real-time collaboration, and advanced reporting capabilities.

### ✨ Key Features

- 🤖 **AI Meeting Analysis** - Automatic transcript processing and action item extraction
- 👥 **Team Collaboration** - Comments, @mentions, and real-time notifications
- 📊 **Advanced Dashboards** - Interactive analytics and progress tracking
- 🔐 **Role-Based Access Control** - Granular permissions (5 role levels)
- 📧 **Email Notifications** - Automated alerts for assignments and mentions
- 📈 **Comprehensive Reporting** - PDF and CSV exports with visual analytics
- 📚 **Integrated Help Wiki** - Built-in documentation with 11+ help pages
- 🏗️ **Project Templates** - Pre-configured templates for various project types
- 📦 **Project Lifecycle** - Edit, archive, and restore project capabilities
- 🎨 **Modern UI** - Responsive design with intuitive navigation

## 🚀 Quick Start

### Prerequisites

- Node.js 18.x or higher
- PostgreSQL 16+
- npm or yarn package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/avrvenkatesa/multi-project-tracker.git
cd multi-project-tracker

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials and JWT secret

# Initialize database
npm run db:migrate

# Start the application
npm start
```

The application will be available at `http://localhost:5000`

### Environment Variables

```env
# Database Configuration
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Authentication
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d

# Email Configuration (optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password

# Application
PORT=5000
NODE_ENV=production
```

## 📖 Documentation

### Project Templates

The platform includes pre-configured templates for:

- **Cloud Migration** - Infrastructure and application migration projects
- **Software Development** - Agile development workflows
- **Marketing Campaign** - Campaign planning and execution
- **Data Analytics** - Analytics and reporting projects
- **Product Launch** - New product introduction processes
- **Custom** - Build your own project structure

### User Roles

1. **System Administrator** - Full system access and configuration
2. **Project Manager** - Project creation, team assignment, full project control
3. **Team Lead** - Team-specific access, task assignment, reporting
4. **Team Member** - Create/edit assigned items, comment, view dashboards
5. **Stakeholder** - Read-only access to dashboards and reports

### Core Features

#### AI Meeting Analysis
Upload meeting transcripts to automatically:
- Extract action items with owners and due dates
- Identify key decisions and discussion points
- Generate meeting summaries
- Create trackable tasks

#### Real-Time Collaboration
- **Comments** - Discussion threads on issues and action items
- **@Mentions** - Tag team members to notify them
- **Notifications** - Real-time alerts for assignments and mentions
- **Activity Feed** - Track all project activities

#### Advanced Reporting
- **Dashboard Analytics** - Interactive charts and metrics
- **PDF Reports** - Professional project summaries
- **CSV Exports** - Data exports for external analysis
- **Custom Filters** - Filter by status, assignee, date range

## 🏗️ Architecture

### Technology Stack

**Backend:**
- Node.js with Express.js
- PostgreSQL 16 (Neon Database)
- Raw SQL with parameterized queries
- Cookie-based JWT authentication

**Frontend:**
- Vanilla JavaScript (ES6+)
- Chart.js for visualizations
- Responsive CSS with modern design patterns
- No framework dependencies

**Security:**
- httpOnly cookies for authentication
- Parameterized SQL queries (SQL injection prevention)
- RBAC with dual-layer permissions (global + project roles)
- CSRF protection
- Input validation and sanitization

### Database Schema

The platform uses 12 core tables:

```sql
- users                 # User accounts and global roles
- projects              # Project information
- project_members       # Project team assignments with roles
- categories            # Project phases/categories
- issues                # Tasks and issues
- action_items          # Actionable items with due dates
- comments              # Discussion threads
- notifications         # User notifications
- meeting_transcripts   # AI-processed meeting data
- email_notifications   # Email queue
- team_invitations      # Pending invitations
- audit_logs            # Activity tracking
```

## 📊 Release History

### v0.10.0 - Latest (October 4, 2025)
- Header UI modernization with hamburger menu
- Enhanced invitation acceptance workflow
- Project description expand/collapse functionality
- UI consistency improvements across all pages

### v0.9.0 - Project Management (October 3, 2025)
- Edit project details (name, description, template, dates)
- Archive and restore projects
- Audit trail tracking

### v0.8.0 - Documentation (October 3, 2025)
- Integrated help wiki with 11 detailed pages
- Searchable help center
- Context-sensitive help links

### v0.7.0 - Advanced Reporting (October 3, 2025)
- PDF report generation
- CSV data exports
- Visual analytics dashboard

### v0.6.0 - Email Notifications (October 2, 2025)
- Automated email notifications
- Assignment alerts
- Mention notifications

[View Complete Release History](https://github.com/avrvenkatesa/multi-project-tracker/releases)

## 🔧 Development

### Running in Development Mode

```bash
# Install dependencies
npm install

# Run in development mode with auto-reload
npm run dev

# Run tests
npm test

# Run linter
npm run lint
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: description of your changes"

# Push and create PR
git push origin feature/your-feature-name
```

### Version Tagging

```bash
# Create annotated tag
git tag -a v0.x.0 -m "Release v0.x.0: Description"

# Push tag to remote
git push origin v0.x.0
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'feat: Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Commit Message Convention

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Test updates
- `chore:` Build process or auxiliary tool changes

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Authors

- **avrvenkatesa** - *Initial work* - [@avrvenkatesa](https://github.com/avrvenkatesa)

## 🙏 Acknowledgments

- Chart.js for visualization capabilities
- Neon Database for PostgreSQL hosting
- Replit for development environment
- All contributors who have helped improve this project

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/avrvenkatesa/multi-project-tracker/issues)
- **Documentation**: Built-in Help Wiki (accessible from navigation menu)
- **Email**: avr.venkatesa@gmail.com

## 🗺️ Roadmap

### Planned Features (v0.11.0+)
- [ ] Bulk operations for issues and action items
- [ ] Workflow designer with custom states
- [ ] Mobile application
- [ ] API documentation and public API
- [ ] Integration with Microsoft 365
- [ ] Advanced analytics and predictive insights
- [ ] Multi-language support

---

**Built with ❤️ for efficient project management**
