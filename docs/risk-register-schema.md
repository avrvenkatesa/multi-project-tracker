# Risk Register - Database Schema Documentation

## Overview
The Risk Register is a comprehensive risk management system integrated into the Multi-Project Tracker. It provides project teams with tools to identify, assess, track, and mitigate project risks throughout the project lifecycle.

## Database Schema

### Tables Created

#### 1. `risk_categories` (9 columns)
Stores risk categories (both default and project-specific).

**Columns:**
- `id` - Serial primary key
- `project_id` - Reference to projects (NULL for default categories)
- `name` - Category name (VARCHAR 100)
- `description` - Category description
- `color` - Hex color code for UI display
- `icon` - Emoji icon for visual identification
- `is_active` - Boolean flag for active/inactive categories
- `display_order` - Integer for sorting categories
- `created_at` - Timestamp

**Default Categories Installed:**
1. 🔧 **Technical** (#3b82f6) - Technology, architecture, technical implementation
2. 📅 **Schedule** (#f59e0b) - Timeline and deadline risks
3. 💰 **Budget** (#10b981) - Cost and financial risks
4. 👥 **Resource** (#8b5cf6) - People, skills, resource availability
5. 🌐 **External** (#ef4444) - Third-party, vendor, external dependencies
6. 📋 **Compliance** (#6366f1) - Regulatory or compliance risks
7. 🔒 **Security** (#dc2626) - Information security, data privacy
8. ✓ **Quality** (#ec4899) - Quality assurance, defect risks

#### 2. `risks` (29 columns)
Main table storing all risk information.

**Key Features:**
- **Auto-calculated Fields** (PostgreSQL GENERATED ALWAYS AS):
  - `risk_score` = probability × impact (stored, indexed)
  - `risk_level` = Calculated based on score:
    - Low: 1-6
    - Medium: 8-12
    - High: 15-20
    - Critical: 25

**Response Strategies:**
- Avoid
- Mitigate
- Transfer
- Accept
- Exploit
- Share
- Enhance

**Risk Statuses:**
- identified
- assessed
- mitigating
- monitoring
- closed
- realized

**Columns:**
- `id` - Serial primary key
- `risk_id` - Unique risk identifier (e.g., 'RISK-001')
- `project_id` - Reference to projects
- `title` - Risk title (VARCHAR 255)
- `description` - Detailed risk description
- `category` - Risk category
- `risk_source` - Where the risk originated
- `tags` - Array of tags
- `probability` - 1-5 scale (CHECK constraint)
- `impact` - 1-5 scale (CHECK constraint)
- `risk_score` - GENERATED: probability × impact
- `risk_level` - GENERATED: Low/Medium/High/Critical
- `response_strategy` - How to respond to the risk
- `mitigation_plan` - Plan to reduce risk
- `contingency_plan` - Backup plan if risk occurs
- `mitigation_cost` - Estimated cost to mitigate
- `mitigation_effort_hours` - Effort required
- `risk_owner_id` - Person responsible
- `target_resolution_date` - When to resolve by
- `review_date` - Next review date
- `status` - Current risk status
- `residual_probability` - After mitigation (1-5)
- `residual_impact` - After mitigation (1-5)
- `created_by` - User who created the risk
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp (auto-updated)
- `closed_at` - When risk was closed
- `realized_at` - When risk actually occurred
- `attachment_count` - Number of attachments

#### 3. `risk_updates` (12 columns)
Tracks all changes to risks for audit trail.

**Update Types:**
- status_change
- reassessment
- mitigation_update
- note
- closure
- realization

**Columns:**
- `id` - Serial primary key
- `risk_id` - Reference to risks
- `update_type` - Type of update
- `old_value` - Previous value
- `new_value` - New value
- `notes` - Update notes
- `old_probability` - Previous probability
- `new_probability` - New probability
- `old_impact` - Previous impact
- `new_impact` - New impact
- `created_by` - User who made the update
- `created_at` - Update timestamp

#### 4. `risk_assessments` (9 columns)
Historical assessments for trend analysis.

**Columns:**
- `id` - Serial primary key
- `risk_id` - Reference to risks
- `probability` - Assessment probability (1-5)
- `impact` - Assessment impact (1-5)
- `risk_score` - Calculated score
- `risk_level` - Risk level (Low/Medium/High/Critical)
- `assessment_notes` - Assessment notes
- `assessed_by` - User who assessed
- `assessed_at` - Assessment timestamp

## Indexes

**Performance Optimizations:**

### risks table (7 indexes)
- `idx_risks_project` - Fast project filtering
- `idx_risks_status` - Quick status queries
- `idx_risks_owner` - Owner lookups
- `idx_risks_level` - Level-based filtering
- `idx_risks_category` - Category filtering
- `idx_risks_score` - Score-based sorting (DESC)
- `idx_risks_created` - Chronological sorting (DESC)

### risk_updates table (3 indexes)
- `idx_risk_updates_risk` - Find updates for a risk
- `idx_risk_updates_created` - Chronological sorting (DESC)
- `idx_risk_updates_type` - Filter by update type

### risk_assessments table (2 indexes)
- `idx_risk_assessments_risk` - Find assessments for a risk
- `idx_risk_assessments_date` - Chronological sorting (DESC)

### risk_categories table (2 indexes)
- `idx_risk_categories_project` - Project-specific categories
- `idx_risk_categories_active` - Active categories only (partial index)

## Database Triggers

### `risks_updated_at_trigger`
Automatically updates the `updated_at` timestamp whenever a risk record is modified.

**Function:** `update_risks_updated_at()`
- Trigger Type: BEFORE UPDATE
- Execution: FOR EACH ROW
- Action: Sets `NEW.updated_at = CURRENT_TIMESTAMP`

## Risk Scoring Matrix

| Probability/Impact | 1 (Very Low) | 2 (Low) | 3 (Medium) | 4 (High) | 5 (Very High) |
|-------------------|--------------|---------|------------|----------|---------------|
| **5 (Very High)** | 5 (Low)      | 10 (Med)| 15 (High)  | 20 (High)| 25 (Critical) |
| **4 (High)**      | 4 (Low)      | 8 (Med) | 12 (Med)   | 16 (High)| 20 (High)     |
| **3 (Medium)**    | 3 (Low)      | 6 (Low) | 9 (Med)    | 12 (Med) | 15 (High)     |
| **2 (Low)**       | 2 (Low)      | 4 (Low) | 6 (Low)    | 8 (Med)  | 10 (Med)      |
| **1 (Very Low)**  | 1 (Low)      | 2 (Low) | 3 (Low)    | 4 (Low)  | 5 (Low)       |

**Risk Levels:**
- **Low** (1-6): Minor impact, low priority
- **Medium** (8-12): Moderate impact, requires monitoring
- **High** (15-20): Significant impact, needs mitigation
- **Critical** (25): Severe impact, immediate action required

## Verification Tests Completed

✅ All 4 tables created successfully
✅ All 14 indexes created and verified
✅ 8 default risk categories inserted
✅ GENERATED columns tested and working correctly
  - Test: probability=3, impact=4 → score=12, level='Medium' ✓
✅ Auto-update trigger created and functional
✅ Foreign key relationships validated
✅ CHECK constraints verified

## Migration File
Location: `/migrations/001_create_risk_register.sql`

## Next Steps - Phase 2 (API & UI)

### Backend API Endpoints (To Be Implemented)
- `GET /api/projects/:projectId/risks` - List risks
- `POST /api/projects/:projectId/risks` - Create risk
- `GET /api/risks/:riskId` - Get risk details
- `PUT /api/risks/:riskId` - Update risk
- `DELETE /api/risks/:riskId` - Delete risk
- `POST /api/risks/:riskId/assess` - Add assessment
- `POST /api/risks/:riskId/update` - Add update note
- `GET /api/risks/:riskId/history` - Get audit trail
- `GET /api/projects/:projectId/risk-categories` - Get categories
- `POST /api/projects/:projectId/risk-categories` - Create custom category

### Frontend Components (To Be Implemented)
- Risk Register dashboard (heat map, list view, charts)
- Risk creation/edit form with validation
- Risk detail modal with history timeline
- Risk assessment tool with matrix visualization
- Category management UI
- Risk filtering and search
- Export to PDF/CSV reports
- Risk heat map visualization

### Business Logic (To Be Implemented)
- Automatic risk ID generation (RISK-001, RISK-002, etc.)
- Risk owner assignment and notifications
- Email alerts for high/critical risks
- Automated review reminders
- Risk trend analysis
- Residual risk calculations
- Integration with issues/action items

## Schema Design Decisions

1. **GENERATED Columns**: Using PostgreSQL's GENERATED ALWAYS AS ensures risk_score and risk_level are always in sync with probability/impact values.

2. **Separate Updates Table**: Maintains complete audit trail without bloating the main risks table.

3. **Assessments History**: Allows tracking risk evolution over time for trend analysis.

4. **Flexible Categories**: Supports both global defaults and project-specific categories.

5. **Response Strategies**: Aligned with PMBOK/PMI standards for professional risk management.

6. **Residual Risk Tracking**: Enables measurement of mitigation effectiveness.

7. **Comprehensive Indexing**: Optimized for common query patterns (by project, status, level, score).

## Status
✅ **Phase 1 - Database Schema: COMPLETE**
🔄 **Phase 2 - API Implementation: PENDING**
🔄 **Phase 3 - Frontend UI: PENDING**
