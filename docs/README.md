# Multi-Project Tracker Documentation

## Table of Contents

### System Documentation

1. **[Thought Capture System](./thought-capture-system.md)**
   - Mobile thought capture with voice-to-text
   - Offline-first PWA architecture
   - AI-powered entity detection
   - Quick capture workflows

### Getting Started

- **Installation**: See main project README
- **Configuration**: Environment variables and setup
- **Deployment**: Production deployment guide

### API Documentation

- **REST API**: Complete endpoint reference available in thought capture docs
- **Authentication**: JWT-based authentication system
- **Authorization**: Role-Based Access Control (RBAC)

### Features

- **AI-Powered Features**
  - Meeting Analysis
  - Checklist Generation & Validation
  - Document Classification
  - Timeline & Hierarchy Extraction
  - Workstream Detection
  - Risk Detection & Proposals
  
- **Project Management**
  - Multi-project dashboard
  - Kanban boards
  - Gantt charts with critical path
  - Action items & tasks
  
- **Collaboration**
  - Comment system
  - AI Agent assistance
  - Meeting transcription
  - Thought capture

### Architecture

- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Frontend**: Vanilla JavaScript + Tailwind CSS
- **AI Integration**: Multi-provider (Claude, GPT-4, Gemini)

### Development

- **Testing**: Mocha + Chai integration tests
- **CI/CD**: GitHub Actions → AWS ECS
- **Database Migrations**: Drizzle Kit

---

For detailed system architecture, see `../replit.md`
