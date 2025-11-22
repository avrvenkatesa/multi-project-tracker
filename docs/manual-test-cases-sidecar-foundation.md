# Manual Test Cases: Story 5.4.1 - Sidecar Bot Foundation

## Test Environment Setup

**Prerequisites:**
- Server running on http://localhost:5000
- Database migration 020_sidecar_foundation.sql applied
- Test user account created with email: test@example.com
- At least one test project created
- Authentication token obtained via login

**Test Data:**
- Test Project ID: `[INSERT_PROJECT_ID]`
- Test User ID: `[INSERT_USER_ID]`
- Auth Token: `[INSERT_TOKEN]`

---

## Test Suite 1: Role Management System

### Test Case 1.1: List Default Roles
**Objective:** Verify that default roles are auto-seeded for new projects

**Steps:**
1. Create a new project via POST `/api/projects`
2. Send GET request to `/api/projects/{projectId}/roles` with auth token
3. Verify response contains at least 5 default roles

**Expected Result:**
```json
{
  "success": true,
  "roles": [
    {
      "id": 1,
      "role_name": "System Administrator",
      "authority_level": 5,
      "description": "Full system access"
    },
    {
      "id": 2,
      "role_name": "Project Manager",
      "authority_level": 4,
      "description": "Manages project scope, schedule, and resources"
    },
    // ... more roles
  ]
}
```

**Pass Criteria:**
- ✅ Response status: 200
- ✅ Contains 5+ default roles
- ✅ Roles include: System Administrator, Project Manager, Team Lead, Team Member, Stakeholder
- ✅ Authority levels range from 1-5

---

### Test Case 1.2: Create Custom Role

**Objective:** Create a new custom role with specific authority level

**Steps:**
1. Send POST request to `/api/projects/{projectId}/roles`:
```json
{
  "role_name": "DevOps Engineer",
  "authority_level": 4,
  "description": "Manages CI/CD pipelines and infrastructure"
}
```

**Expected Result:**
```json
{
  "success": true,
  "role": {
    "id": 10,
    "project_id": 1,
    "role_name": "DevOps Engineer",
    "authority_level": 4,
    "description": "Manages CI/CD pipelines and infrastructure",
    "created_at": "2025-01-15T10:30:00Z"
  }
}
```

**Pass Criteria:**
- ✅ Response status: 201
- ✅ Role created with correct name and authority level
- ✅ Role ID is returned

**Negative Test:**
- Send same request again → Should return 409 Conflict (duplicate role name)
- Send request with authority_level: 10 → Should return 400 Bad Request

---

### Test Case 1.3: Get Role Hierarchy

**Objective:** Verify role hierarchy is sorted by authority level

**Steps:**
1. Send GET request to `/api/projects/{projectId}/roles/hierarchy`

**Expected Result:**
```json
{
  "success": true,
  "hierarchy": [
    { "role_name": "System Administrator", "authority_level": 5 },
    { "role_name": "Project Manager", "authority_level": 4 },
    { "role_name": "DevOps Engineer", "authority_level": 4 },
    { "role_name": "Team Lead", "authority_level": 3 },
    { "role_name": "Team Member", "authority_level": 2 },
    { "role_name": "Stakeholder", "authority_level": 1 }
  ]
}
```

**Pass Criteria:**
- ✅ Roles sorted by authority_level DESC
- ✅ Same authority level roles appear in alphabetical order

---

### Test Case 1.4: Update Role Permissions

**Objective:** Set granular permissions for a role

**Steps:**
1. Get role ID from previous test
2. Send PUT request to `/api/roles/{roleId}/permissions`:
```json
{
  "permissions": [
    { "permission_key": "task.create", "can_perform": true },
    { "permission_key": "task.update", "can_perform": true },
    { "permission_key": "task.delete", "can_perform": false },
    { "permission_key": "project.settings.update", "can_perform": false }
  ]
}
```

**Expected Result:**
```json
{
  "success": true,
  "permissions": [
    { "permission_key": "task.create", "can_perform": true },
    { "permission_key": "task.update", "can_perform": true },
    { "permission_key": "task.delete", "can_perform": false },
    { "permission_key": "project.settings.update", "can_perform": false }
  ]
}
```

**Pass Criteria:**
- ✅ Response status: 200
- ✅ All permissions updated correctly

---

### Test Case 1.5: Assign Role to User

**Objective:** Assign a custom role to a user in a project

**Steps:**
1. Send POST request to `/api/projects/{projectId}/users/{userId}/role`:
```json
{
  "role_id": 10
}
```

**Expected Result:**
```json
{
  "success": true,
  "assignment": {
    "user_id": 5,
    "role_id": 10,
    "project_id": 1,
    "assigned_at": "2025-01-15T11:00:00Z"
  }
}
```

**Pass Criteria:**
- ✅ Response status: 200
- ✅ Assignment recorded in database
- ✅ User can now perform role-specific actions

---

### Test Case 1.6: Delete Role (Negative Test)

**Objective:** Verify that roles with active assignments cannot be deleted

**Steps:**
1. Attempt to delete role with active assignment: DELETE `/api/roles/{roleId}`

**Expected Result:**
```json
{
  "success": false,
  "error": "Cannot delete role with active user assignments"
}
```

**Pass Criteria:**
- ✅ Response status: 409 Conflict
- ✅ Role NOT deleted from database

---

## Test Suite 2: Sidecar Configuration

### Test Case 2.1: Configure Slack Integration

**Objective:** Set up Slack platform integration

**Steps:**
1. Send PUT request to `/api/projects/{projectId}/sidecar/config`:
```json
{
  "platform_type": "slack",
  "enabled": true,
  "platform_config": {
    "workspace_id": "T01ABC123",
    "bot_token": "xoxb-your-bot-token",
    "channels": ["#general", "#dev-team", "#product"]
  },
  "auto_create_threshold": 4,
  "notification_settings": {
    "notify_on_create": true,
    "notify_on_update": false,
    "notify_channel": "#notifications"
  }
}
```

**Expected Result:**
```json
{
  "success": true,
  "config": {
    "id": 1,
    "project_id": 1,
    "platform_type": "slack",
    "enabled": true,
    "platform_config": { /* config object */ },
    "auto_create_threshold": 4,
    "notification_settings": { /* settings object */ }
  }
}
```

**Pass Criteria:**
- ✅ Response status: 200
- ✅ Configuration saved to database
- ✅ platform_config stored as JSONB

---

### Test Case 2.2: Get Platform Configuration

**Objective:** Retrieve configuration for specific platform

**Steps:**
1. Send GET request to `/api/projects/{projectId}/sidecar/config/slack`

**Expected Result:**
```json
{
  "success": true,
  "config": {
    "platform_type": "slack",
    "enabled": true,
    "platform_config": {
      "workspace_id": "T01ABC123",
      "channels": ["#general", "#dev-team", "#product"]
    },
    "auto_create_threshold": 4
  }
}
```

**Pass Criteria:**
- ✅ Response status: 200
- ✅ Correct platform configuration returned
- ✅ Sensitive tokens NOT exposed in response

---

### Test Case 2.3: Test Platform Connection

**Objective:** Verify platform credentials are valid

**Steps:**
1. Send POST request to `/api/projects/{projectId}/sidecar/test-connection`:
```json
{
  "platform_type": "slack",
  "platform_config": {
    "workspace_id": "T01ABC123",
    "bot_token": "xoxb-your-bot-token"
  }
}
```

**Expected Result (Success):**
```json
{
  "success": true,
  "message": "Successfully connected to Slack workspace",
  "workspace_name": "Your Team Workspace"
}
```

**Expected Result (Failure):**
```json
{
  "success": false,
  "message": "Invalid bot token or workspace ID"
}
```

**Pass Criteria:**
- ✅ Valid credentials return success
- ✅ Invalid credentials return clear error message
- ✅ No exception thrown for connection failures

---

### Test Case 2.4: Configure Multiple Platforms

**Objective:** Verify multiple platforms can be configured for one project

**Steps:**
1. Configure Slack (from Test 2.1)
2. Send PUT request to configure Teams:
```json
{
  "platform_type": "teams",
  "enabled": true,
  "platform_config": {
    "tenant_id": "your-tenant-id",
    "app_id": "your-app-id",
    "app_password": "your-app-password"
  },
  "auto_create_threshold": 4
}
```
3. Send GET request to `/api/projects/{projectId}/sidecar/config`

**Expected Result:**
```json
{
  "success": true,
  "configs": [
    { "platform_type": "slack", "enabled": true },
    { "platform_type": "teams", "enabled": true }
  ]
}
```

**Pass Criteria:**
- ✅ Both platforms configured
- ✅ Each platform has separate configuration
- ✅ No conflicts between platforms

---

## Test Suite 3: Webhook Endpoints

### Test Case 3.1: Slack URL Verification

**Objective:** Handle Slack's URL verification challenge

**Steps:**
1. Send POST request to `/webhooks/slack`:
```json
{
  "type": "url_verification",
  "challenge": "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P"
}
```

**Expected Result:**
```json
{
  "challenge": "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P"
}
```

**Pass Criteria:**
- ✅ Response status: 200
- ✅ Challenge token echoed back
- ✅ Response sent within 3 seconds

---

### Test Case 3.2: Process Slack Message Event

**Objective:** Process incoming Slack message and extract project entities

**Steps:**
1. Ensure Slack is configured for project
2. Send POST request to `/webhooks/slack`:
```json
{
  "type": "event_callback",
  "team_id": "T01ABC123",
  "event": {
    "type": "message",
    "channel": "C01ABC123",
    "user": "U01ABC123",
    "text": "We need to implement OAuth login with Google and Microsoft. This is critical for Q1 launch.",
    "ts": "1641024000.000100"
  }
}
```

**Expected Result:**
```json
{
  "success": true,
  "processed": true,
  "analysis": {
    "entities_detected": ["task"],
    "confidence": 0.85,
    "action_taken": "proposal_created"
  }
}
```

**Pass Criteria:**
- ✅ Response status: 200
- ✅ Message analyzed by AI
- ✅ Entity proposal created in database
- ✅ No duplicate processing for same message

---

### Test Case 3.3: Teams Message Webhook

**Objective:** Process Microsoft Teams message

**Steps:**
1. Send POST request to `/webhooks/teams`:
```json
{
  "type": "message",
  "id": "1641024000000",
  "timestamp": "2025-01-15T12:00:00Z",
  "serviceUrl": "https://smba.trafficmanager.net/teams/",
  "channelId": "msteams",
  "from": {
    "id": "29:user-id",
    "name": "John Doe"
  },
  "conversation": {
    "id": "19:meeting_id"
  },
  "text": "Bug report: The checkout page crashes when applying discount codes"
}
```

**Expected Result:**
```json
{
  "success": true,
  "processed": true,
  "analysis": {
    "entities_detected": ["bug"],
    "confidence": 0.92,
    "action_taken": "auto_created"
  }
}
```

**Pass Criteria:**
- ✅ Response status: 200
- ✅ Bug entity auto-created (confidence > threshold)
- ✅ User notified in Teams

---

### Test Case 3.4: Email Webhook Processing

**Objective:** Process incoming email and extract entities

**Steps:**
1. Send POST request to `/webhooks/email`:
```json
{
  "from": "client@example.com",
  "to": "project-inbox@yourapp.com",
  "subject": "Feature Request: Export reports to PDF",
  "body": "Hi team, we really need the ability to export all reports as PDF files. This would help us share data with stakeholders who don't have system access.",
  "headers": {
    "message-id": "<abc123@example.com>",
    "date": "2025-01-15T12:00:00Z"
  }
}
```

**Expected Result:**
```json
{
  "success": true,
  "processed": true,
  "analysis": {
    "entities_detected": ["feature"],
    "confidence": 0.88,
    "action_taken": "proposal_created",
    "capture_id": 15
  }
}
```

**Pass Criteria:**
- ✅ Email parsed correctly
- ✅ Entity type identified (feature request)
- ✅ Sender info captured
- ✅ Duplicate emails not processed twice (check message-id)

---

### Test Case 3.5: GitHub Issue Comment Webhook

**Objective:** Process GitHub webhook for issue comments

**Steps:**
1. Send POST request to `/webhooks/github` with header `X-GitHub-Event: issue_comment`:
```json
{
  "action": "created",
  "issue": {
    "number": 42,
    "title": "Login fails on Safari",
    "state": "open",
    "html_url": "https://github.com/org/repo/issues/42"
  },
  "comment": {
    "id": 123456,
    "body": "This issue also affects Firefox. We need to test all browsers.",
    "user": {
      "login": "testuser",
      "id": 789
    },
    "created_at": "2025-01-15T12:00:00Z"
  },
  "repository": {
    "full_name": "org/repo",
    "id": 12345
  }
}
```

**Expected Result:**
```json
{
  "success": true,
  "processed": true,
  "linked_issue": 42,
  "action_taken": "task_updated"
}
```

**Pass Criteria:**
- ✅ GitHub signature validated (if configured)
- ✅ Issue linked to existing task (if found)
- ✅ Comment content analyzed for new entities

---

## Test Suite 4: Thought Capture

### Test Case 4.1: Capture Text Thought

**Objective:** Capture and analyze a text-based thought

**Steps:**
1. Send POST request to `/api/sidecar/thought-capture`:
```json
{
  "project_id": 1,
  "capture_type": "text",
  "content": "We should add real-time collaboration features like Google Docs. Users could see each other's cursors and edits live."
}
```

**Expected Result:**
```json
{
  "success": true,
  "capture": {
    "id": 20,
    "user_id": 5,
    "project_id": 1,
    "capture_type": "text",
    "raw_content": "We should add real-time collaboration...",
    "ai_analysis": {
      "entity_type": "feature",
      "title": "Real-time Collaboration Features",
      "description": "Add live editing with cursor tracking",
      "priority": "medium",
      "estimated_complexity": "high",
      "suggested_tags": ["feature", "collaboration", "real-time"]
    },
    "created_at": "2025-01-15T12:30:00Z"
  }
}
```

**Pass Criteria:**
- ✅ Response status: 201
- ✅ AI analysis completed
- ✅ Entity type identified
- ✅ Reasonable title and description extracted

---

### Test Case 4.2: Capture Voice Thought

**Objective:** Capture voice recording with transcription

**Steps:**
1. Upload audio file or provide audio URL
2. Send POST request to `/api/sidecar/thought-capture`:
```json
{
  "project_id": 1,
  "capture_type": "voice",
  "audio_url": "https://storage.example.com/audio/recording123.mp3",
  "transcription": "The mobile app needs push notifications when new tasks are assigned"
}
```

**Expected Result:**
```json
{
  "success": true,
  "capture": {
    "id": 21,
    "capture_type": "voice",
    "transcription": "The mobile app needs push notifications...",
    "ai_analysis": {
      "entity_type": "feature",
      "title": "Push Notifications for Task Assignments",
      "platform": "mobile"
    }
  }
}
```

**Pass Criteria:**
- ✅ Voice transcription saved
- ✅ Audio URL stored
- ✅ AI analysis performed on transcription

---

### Test Case 4.3: List Thought Captures

**Objective:** Retrieve all thought captures for a project

**Steps:**
1. Send GET request to `/api/sidecar/thought-captures/{projectId}`

**Expected Result:**
```json
{
  "success": true,
  "captures": [
    {
      "id": 21,
      "capture_type": "voice",
      "created_at": "2025-01-15T12:30:00Z",
      "ai_analysis": { /* analysis */ }
    },
    {
      "id": 20,
      "capture_type": "text",
      "created_at": "2025-01-15T12:25:00Z",
      "ai_analysis": { /* analysis */ }
    }
  ],
  "total": 2
}
```

**Pass Criteria:**
- ✅ All captures returned
- ✅ Sorted by created_at DESC
- ✅ Pagination supported (if implemented)

---

### Test Case 4.4: Filter Thought Captures by Type

**Objective:** Filter captures by capture_type

**Steps:**
1. Send GET request to `/api/sidecar/thought-captures/{projectId}?type=voice`

**Expected Result:**
- Only voice captures returned
- Text captures excluded

**Pass Criteria:**
- ✅ Correct filtering applied
- ✅ Type parameter validated

---

## Test Suite 5: Integration & Edge Cases

### Test Case 5.1: Auto-Create vs Proposal Logic

**Objective:** Verify authority-based auto-creation

**Test Scenarios:**

**Scenario A: High Authority (Level 4+) → Auto-Create**
1. Configure auto_create_threshold = 4
2. Assign user authority level 5
3. Send webhook with entity request
4. Expected: Entity automatically created

**Scenario B: Low Authority (Level < 4) → Proposal**
1. Same config (threshold = 4)
2. Assign user authority level 2
3. Send webhook with entity request
4. Expected: Proposal created, requires approval

**Pass Criteria:**
- ✅ Correct logic based on authority level
- ✅ Threshold comparison accurate
- ✅ Approval workflow triggered when needed

---

### Test Case 5.2: Duplicate Detection

**Objective:** Prevent duplicate entity creation from same message

**Steps:**
1. Send Slack message webhook
2. Wait for processing
3. Send SAME webhook again (same ts timestamp)

**Expected Result:**
```json
{
  "success": true,
  "processed": false,
  "message": "Message already processed"
}
```

**Pass Criteria:**
- ✅ Duplicate detected
- ✅ No second entity created
- ✅ Response indicates duplicate

---

### Test Case 5.3: Concurrent Webhook Processing

**Objective:** Handle multiple webhooks simultaneously

**Steps:**
1. Send 5 different webhook requests concurrently (use tools like Apache Bench or Postman Collection Runner)
2. Verify all are processed without conflicts

**Pass Criteria:**
- ✅ All webhooks processed successfully
- ✅ No database deadlocks
- ✅ Response times acceptable (<2s per request)

---

### Test Case 5.4: Invalid Platform Configuration

**Objective:** Handle invalid credentials gracefully

**Steps:**
1. Configure Slack with invalid token
2. Send webhook to `/webhooks/slack`

**Expected Result:**
- Webhook accepted (200 OK)
- Error logged internally
- User notified of configuration issue
- No crash or 500 error

**Pass Criteria:**
- ✅ Graceful error handling
- ✅ Clear error messages
- ✅ System remains operational

---

### Test Case 5.5: Permission Boundary Testing

**Objective:** Verify permission enforcement at boundaries

**Test Matrix:**

| User Authority | Action                | Required Level | Should Succeed? |
|----------------|-----------------------|----------------|-----------------|
| 5              | Create role (level 4) | 4+             | ✅ Yes           |
| 4              | Create role (level 4) | 4+             | ✅ Yes           |
| 3              | Create role (level 4) | 4+             | ❌ No (403)      |
| 2              | Update own tasks      | 2+             | ✅ Yes           |
| 1              | Delete tasks          | 3+             | ❌ No (403)      |

**Pass Criteria:**
- ✅ All permission checks enforce correctly
- ✅ 403 Forbidden for unauthorized actions
- ✅ Clear error messages

---

## Test Suite 6: Performance & Load

### Test Case 6.1: Role List Performance

**Objective:** Verify role list performs well with many roles

**Setup:**
- Create 50 custom roles in project

**Steps:**
1. Send GET `/api/projects/{projectId}/roles`
2. Measure response time

**Pass Criteria:**
- ✅ Response time < 500ms
- ✅ All roles returned
- ✅ Correct pagination (if implemented)

---

### Test Case 6.2: Thought Capture Volume

**Objective:** Handle high volume of thought captures

**Steps:**
1. Create 100 thought captures via API
2. List all captures
3. Verify performance

**Pass Criteria:**
- ✅ All captures saved
- ✅ List endpoint responds < 1s
- ✅ Database remains performant

---

## Completion Checklist

After running all manual tests, verify:

- ✅ All 19 API endpoints tested
- ✅ Database schema validated
- ✅ Auto-seeding trigger works
- ✅ Permission system enforces correctly
- ✅ Webhooks process all platforms
- ✅ AI analysis provides meaningful output
- ✅ Error handling is graceful
- ✅ Performance is acceptable
- ✅ Security: Auth required where needed
- ✅ Security: Webhook signatures validated (if implemented)
