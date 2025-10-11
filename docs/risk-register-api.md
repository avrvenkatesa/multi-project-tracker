# Risk Register API - Backend Implementation

## Overview
Complete backend API implementation for the Risk Register feature, providing comprehensive risk management capabilities with role-based access control.

## Implementation Summary

### ✅ Completed Components

#### 1. Utility Functions (4 functions)
Located in `server.js` starting at line 370.

**`checkProjectAccess(userId, projectId, userRole)`**
- Validates user access to a project
- System Administrators have automatic access to all projects
- Other users must be active project members
- Returns: `boolean`

**`generateRiskId(projectId)`**
- Generates unique sequential risk IDs per project
- Format: `RISK-001`, `RISK-002`, etc.
- Returns: `string`

**`calculateRiskScore(probability, impact)`**
- Calculates risk score and level from probability × impact
- Returns: `{ score, level, color }`
- Levels: Low (1-6), Medium (8-12), High (15-20), Critical (25)

**`canPerformRiskAction(user, action, risk)`**
- Checks if user can perform specific risk actions
- Supports: VIEW_RISKS, CREATE_RISK, EDIT_ANY_RISK, EDIT_OWN_RISK, DELETE_RISK
- Returns: `boolean`

#### 2. API Endpoints (6 endpoints)
Located in `server.js` starting at line 5440.

##### GET `/api/projects/:projectId/risk-categories`
**Purpose:** Retrieve risk categories for a project  
**Authentication:** Required  
**Permissions:** Project member or System Administrator  
**Response:** Array of category objects (default + project-specific)

##### POST `/api/projects/:projectId/risks`
**Purpose:** Create a new risk  
**Authentication:** Required  
**Permissions:** System Administrator, Project Manager, Team Lead  
**Request Body:**
```json
{
  "title": "string (required)",
  "category": "string (required)",
  "description": "string",
  "probability": "number (1-5)",
  "impact": "number (1-5)",
  "response_strategy": "string",
  "mitigation_plan": "string",
  "contingency_plan": "string",
  "mitigation_cost": "number",
  "mitigation_effort_hours": "number",
  "risk_owner_id": "number",
  "target_resolution_date": "date",
  "review_date": "date",
  "status": "string"
}
```
**Actions:**
- Generates unique risk ID
- Creates initial risk assessment (if probability/impact provided)
- Logs creation in risk_updates table
- Returns created risk object

##### GET `/api/projects/:projectId/risks`
**Purpose:** List risks for a project with filtering and sorting  
**Authentication:** Required  
**Permissions:** All roles can view  
**Query Parameters:**
- `status` - Filter by risk status
- `category` - Filter by category
- `level` - Filter by risk level (Low/Medium/High/Critical)
- `owner` - Filter by risk owner ID
- `sort` - Sort order: score_desc, score_asc, date_desc, date_asc, title_asc, title_desc

**Response:** Array of risk objects with owner details

##### GET `/api/risks/:riskId`
**Purpose:** Get single risk details  
**Authentication:** Required  
**Permissions:** Project member or System Administrator  
**Response:** Risk object with owner and creator names

##### PATCH `/api/risks/:riskId`
**Purpose:** Update an existing risk  
**Authentication:** Required  
**Permissions:**
- System Administrator, Project Manager: Can edit any risk
- Team Lead, Team Member: Can edit risks they own

**Allowed Fields:**
- title, description, category, risk_source, tags
- probability, impact, response_strategy
- mitigation_plan, contingency_plan
- mitigation_cost, mitigation_effort_hours
- risk_owner_id, target_resolution_date, review_date
- status, residual_probability, residual_impact

**Actions:**
- Updates risk with provided fields
- Logs update in risk_updates table
- Creates new assessment if probability/impact changed
- Auto-updates `updated_at` timestamp

##### DELETE `/api/risks/:riskId`
**Purpose:** Delete a risk  
**Authentication:** Required  
**Permissions:** System Administrator, Project Manager  
**Actions:**
- Deletes risk (cascade handles related records)
- Returns success message

## Permission Matrix

| Role                  | View | Create | Edit Any | Edit Own | Delete |
|----------------------|------|--------|----------|----------|--------|
| System Administrator | ✅   | ✅     | ✅       | ✅       | ✅     |
| Project Manager      | ✅   | ✅     | ✅       | ✅       | ✅     |
| Team Lead           | ✅   | ✅     | ❌       | ✅       | ❌     |
| Team Member         | ✅   | ❌     | ❌       | ✅       | ❌     |
| Stakeholder         | ✅   | ❌     | ❌       | ❌       | ❌     |

## Risk Scoring Matrix

| Probability/Impact | 1 (Very Low) | 2 (Low) | 3 (Medium) | 4 (High) | 5 (Very High) |
|-------------------|--------------|---------|------------|----------|---------------|
| **5 (Very High)** | 5 (Low)      | 10 (Med)| 15 (High)  | 20 (High)| 25 (Critical) |
| **4 (High)**      | 4 (Low)      | 8 (Med) | 12 (Med)   | 16 (High)| 20 (High)     |
| **3 (Medium)**    | 3 (Low)      | 6 (Low) | 9 (Med)    | 12 (Med) | 15 (High)     |
| **2 (Low)**       | 2 (Low)      | 4 (Low) | 6 (Low)    | 8 (Med)  | 10 (Med)      |
| **1 (Very Low)**  | 1 (Low)      | 2 (Low) | 3 (Low)    | 4 (Low)  | 5 (Low)       |

**Level Colors:**
- Low: #10b981 (Green)
- Medium: #f59e0b (Amber)
- High: #f97316 (Orange)
- Critical: #ef4444 (Red)

## Testing

### Manual Testing with cURL

#### 1. Login and Get Cookie
```bash
curl -X POST "http://localhost:5000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}' \
  -c cookies.txt
```

#### 2. Get Risk Categories
```bash
curl -X GET "http://localhost:5000/api/projects/1/risk-categories" \
  --cookie cookies.txt
```

#### 3. Create Risk
```bash
curl -X POST "http://localhost:5000/api/projects/1/risks" \
  -H "Content-Type: application/json" \
  --cookie cookies.txt \
  -d '{
    "title": "Database Performance Risk",
    "category": "Technical",
    "probability": 3,
    "impact": 4,
    "description": "Database queries may slow down as data grows",
    "response_strategy": "Mitigate",
    "mitigation_plan": "Implement database indexing and query optimization"
  }'
```

#### 4. Get All Risks
```bash
curl -X GET "http://localhost:5000/api/projects/1/risks?sort=score_desc" \
  --cookie cookies.txt
```

#### 5. Update Risk
```bash
curl -X PATCH "http://localhost:5000/api/risks/1" \
  -H "Content-Type: application/json" \
  --cookie cookies.txt \
  -d '{
    "status": "mitigating",
    "probability": 2,
    "impact": 3
  }'
```

#### 6. Delete Risk
```bash
curl -X DELETE "http://localhost:5000/api/risks/1" \
  --cookie cookies.txt
```

## Security Features

1. **Authentication**: All endpoints require valid JWT token in httpOnly cookie
2. **Authorization**: Role-based access control with fine-grained permissions
3. **SQL Injection Protection**: Parameterized queries throughout
4. **Input Validation**: Required fields validated before processing
5. **Project Access Control**: Users can only access risks in projects they belong to
6. **Audit Trail**: All risk changes logged in risk_updates table

## Database Integration

### Tables Used
- `risks` - Main risk storage with auto-calculated score/level
- `risk_categories` - Risk categories (default + custom)
- `risk_updates` - Audit trail of all changes
- `risk_assessments` - Historical assessments for trend analysis
- `project_members` - For access control
- `users` - For user details and ownership

### Automatic Calculations
The database handles risk_score and risk_level calculations automatically using PostgreSQL GENERATED columns, ensuring data consistency.

## Error Handling

All endpoints include comprehensive error handling:
- 400: Bad Request (validation errors)
- 401: Unauthorized (authentication required)
- 403: Forbidden (insufficient permissions)
- 404: Not Found (risk/project doesn't exist)
- 500: Internal Server Error (database/server errors)

## Next Steps - Frontend Integration

The backend API is complete and ready for frontend integration. To build the UI:

1. **Risk Register Dashboard**
   - Risk heat map visualization
   - Filterable risk list with sorting
   - Risk statistics and charts

2. **Risk Forms**
   - Create/edit risk modal
   - Category selection dropdown
   - Probability/Impact matrix selector
   - Owner assignment

3. **Risk Details View**
   - Full risk information
   - Update history timeline
   - Assessment trend charts
   - Quick status updates

4. **Reports & Export**
   - PDF risk register report
   - CSV data export
   - Risk matrix visualization

## Status
✅ **Backend API: COMPLETE**  
🔄 **Frontend UI: PENDING**  
🔄 **Integration Testing: PENDING**
