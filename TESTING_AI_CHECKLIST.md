# AI Checklist Generation - Testing Guide (Stage 4)

## Overview
This document provides comprehensive testing procedures for the AI Checklist Generation feature (Phase 2a). All tests should be executed to ensure the feature works correctly across different scenarios.

## Test Environment Setup

### Prerequisites
- ✅ OPENAI_API_KEY configured in Replit secrets
- ✅ Server running on port 5000
- ✅ Test user accounts available (admin@test.com, demo@multiproject.com)
- ✅ Test projects with issues and action items

### API Endpoints to Test
1. `POST /api/checklists/generate-from-issue` - Generate checklist from issue
2. `POST /api/checklists/generate-from-action` - Generate checklist from action
3. `POST /api/checklists/confirm-generated` - Create checklist from preview
4. `POST /api/templates/:id/promote` - Promote template to reusable

---

## Test Suite

### Test 1: Issue Checklist Generation ✅

**Objective**: Verify AI creates appropriate checklist from issue data

**Test Data**: Use Issue #26 - "Implement automated security scanning in the pipeline"

**Steps**:
1. Login to application
2. Navigate to "Test Database Project" (Project ID: 1)
3. Locate issue card "Implement automated security scanning in the pipeline"
4. Click "🤖 Generate Checklist" button

**Expected Results**:
- [ ] Loading modal appears with AI animation (pulse rings, sparkle, bouncing dots)
- [ ] Loading message: "AI is analyzing your content..." displayed
- [ ] Generation completes within 10-30 seconds
- [ ] Preview shows relevant sections (e.g., "Setup", "Implementation", "Testing")
- [ ] Sections contain appropriate checklist items related to security scanning
- [ ] Item counts displayed for each section
- [ ] Field types shown (checkbox, text, date, etc.)

**API Test (curl)**:
```bash
curl -X POST http://localhost:5000/api/checklists/generate-from-issue \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_AUTH_TOKEN" \
  -d '{
    "issueId": 26,
    "projectId": 1
  }'
```

**Success Criteria**: Returns JSON with `preview` object containing `title`, `sections[]`, and each section has `items[]`

---

### Test 2: Action Item Checklist Generation ✅

**Objective**: Verify AI creates appropriate checklist from action item data

**Test Data**: Find any action item with detailed description

**Steps**:
1. Login to application
2. Navigate to project with action items
3. Locate an action item card
4. Click "🤖 Generate Checklist" button

**Expected Results**:
- [ ] Same UI behavior as Test 1
- [ ] Preview shows action-specific checklist sections
- [ ] Items are contextually appropriate for the action

**API Test (curl)**:
```bash
curl -X POST http://localhost:5000/api/checklists/generate-from-action \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_AUTH_TOKEN" \
  -d '{
    "actionItemId": ACTION_ID,
    "projectId": PROJECT_ID
  }'
```

**Success Criteria**: Returns JSON with `preview` object, different from issue checklist but contextually relevant

---

### Test 3: Template Matching ✅

**Objective**: Verify system finds and uses existing templates correctly

**Setup**:
1. Create a checklist manually for a specific type of task (e.g., "Security Implementation")
2. Promote it to a reusable template
3. Create a new issue with similar title/description

**Steps**:
1. Click "🤖 Generate Checklist" on the new similar issue
2. Observe if existing template is used or new one is generated

**Expected Results**:
- [ ] If matching template exists (by name similarity), it should be reused
- [ ] Template name lookup works (not hardcoded ID)
- [ ] AI generates new template if no match found

**Note**: Current implementation uses dynamic template lookup by name

---

### Test 4: Error Scenarios ✅

**Objective**: Test error handling for various failure conditions

#### Test 4a: API Failure Simulation
**Steps**:
1. Temporarily remove or corrupt OPENAI_API_KEY
2. Attempt checklist generation
3. Observe error handling

**Expected Results**:
- [ ] Error modal displays with enhanced error message
- [ ] Helpful troubleshooting suggestions shown in box:
  - Check internet connection
  - Ensure clear description
  - Rate limit warning
- [ ] "Try Again" and "Cancel" buttons visible
- [ ] Retry button has icon and proper styling

#### Test 4b: Malformed Data
**Steps**:
1. Send API request with missing required fields
2. Send request with invalid issue/action ID

**API Test**:
```bash
# Missing projectId
curl -X POST http://localhost:5000/api/checklists/generate-from-issue \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_AUTH_TOKEN" \
  -d '{"issueId": 26}'

# Invalid issueId
curl -X POST http://localhost:5000/api/checklists/generate-from-issue \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_AUTH_TOKEN" \
  -d '{"issueId": 99999, "projectId": 1}'
```

**Expected Results**:
- [ ] Appropriate validation error messages
- [ ] 400 status code for validation errors
- [ ] 404 status code for not found items

#### Test 4c: Network Timeout
**Steps**:
1. Simulate slow network (browser dev tools)
2. Attempt checklist generation

**Expected Results**:
- [ ] Loading state remains visible
- [ ] Eventually shows error or success
- [ ] No UI freeze or crash

---

### Test 5: Rate Limiting ✅

**Objective**: Verify 10 generations per hour limit enforced correctly

**Steps**:
1. Login as a test user
2. Generate checklists 10 times in rapid succession
3. Attempt 11th generation

**Expected Results**:
- [ ] First 10 generations succeed
- [ ] 11th generation returns rate limit error
- [ ] Error message indicates: "Rate limit exceeded: 10 generations per hour"
- [ ] After 1 hour, rate limit resets

**API Test**:
```bash
# Loop 11 times
for i in {1..11}; do
  echo "Generation attempt $i"
  curl -X POST http://localhost:5000/api/checklists/generate-from-issue \
    -H "Content-Type: application/json" \
    -H "Cookie: token=YOUR_AUTH_TOKEN" \
    -d '{"issueId": 26, "projectId": 1}' \
    -s | grep -o "error\|preview" | head -1
  sleep 1
done
```

**Success Criteria**: 
- First 10 show "preview"
- 11th shows "error" with rate limit message

**Known Limitation**: Rate limit is in-memory (resets on server restart) - will be persisted in Phase 2b

---

### Test 6: Template Promotion ✅

**Objective**: Verify only authorized users can promote, templates become reusable

#### Test 6a: Authorized Promotion
**Steps**:
1. Login as Team Lead or Project Manager
2. Generate and create a checklist
3. Observe promotion toast notification
4. Click "✨ Promote Template"

**Expected Results**:
- [ ] Enhanced toast appears with:
  - Gradient icon (blue to purple)
  - "Recommended" badge
  - Benefits list (✓ Reuse, Team access, Template library)
  - Gradient CTA button
- [ ] Toast auto-dismisses after 20 seconds
- [ ] Clicking "Promote Template" succeeds
- [ ] Success toast confirms promotion
- [ ] Template appears in template library
- [ ] Template marked as `is_reusable = true` in database

**API Test**:
```bash
curl -X POST http://localhost:5000/api/templates/TEMPLATE_ID/promote \
  -H "Cookie: token=TEAM_LEAD_TOKEN" \
  -d '{}'
```

**Success Criteria**: Returns `{ "message": "Template promoted to reusable successfully" }`

#### Test 6b: Unauthorized Promotion
**Steps**:
1. Login as Team Member (not Team Lead/PM)
2. Generate checklist created by another user
3. Attempt to promote template

**Expected Results**:
- [ ] 403 Forbidden error
- [ ] Error message: "Only the template creator or Team Lead+ can promote templates"

**API Test**:
```bash
curl -X POST http://localhost:5000/api/templates/TEMPLATE_ID/promote \
  -H "Cookie: token=TEAM_MEMBER_TOKEN" \
  -d '{}'
```

**Success Criteria**: Returns 403 with appropriate error message

#### Test 6c: Creator Promotion
**Steps**:
1. Login as Team Member
2. Generate and create own checklist
3. Attempt to promote own template

**Expected Results**:
- [ ] Promotion succeeds (creator can promote their own)
- [ ] Template becomes reusable

---

## UI/UX Polish Tests

### Test 7: Loading Animation ✅

**Objective**: Verify enhanced loading animation works correctly

**Steps**:
1. Generate checklist
2. Observe loading state

**Expected Results**:
- [ ] Pulse rings animate outward (ping animation)
- [ ] Rotating border spins smoothly
- [ ] Center sparkle (✨) pulses
- [ ] Three bouncing dots with staggered delay (0ms, 150ms, 300ms)
- [ ] Messages display:
  - "AI is analyzing your content..."
  - "Creating a comprehensive checklist"
  - "This usually takes 10-30 seconds"

---

### Test 8: Preview Display ✅

**Objective**: Verify preview modal displays correctly

**Expected Results**:
- [ ] Badge shows: "✨ [Template Name] • [X] items"
- [ ] Sections numbered (1, 2, 3...) with circular badges
- [ ] Each section shows item count ("5 items", "3 items")
- [ ] Items numbered within sections (1., 2., 3...)
- [ ] Required items marked with red asterisk (*)
- [ ] Field types shown for non-checkbox items (text, date, etc.)
- [ ] Hover effects on section cards
- [ ] Clean visual hierarchy

---

### Test 9: Keyboard Shortcuts ✅

**Objective**: Verify keyboard shortcuts work correctly

**Steps & Expected Results**:

**Escape Key**:
- [ ] Modal open → Press Escape → Modal closes

**Enter Key** (Preview State):
- [ ] Preview displayed → Press Enter → Checklist created
- [ ] Loading/Error state → Press Enter → No action

**R Key** (Error State):
- [ ] Error displayed → Press R → Retry generation
- [ ] Other states → Press R → No action

---

### Test 10: Tooltips ✅

**Objective**: Verify tooltips display correctly

**Steps**:
1. Hover over "🤖 Generate Checklist" button

**Expected Results**:
- [ ] Native browser tooltip shows: "AI will analyze this issue/action and create a comprehensive checklist (10-30s)"
- [ ] Custom styled tooltip shows: "✨ AI analyzes & creates checklist (Limit: 10/hour)"
- [ ] Tooltip appears smoothly with transition
- [ ] Tooltip positioned above button
- [ ] Black background, white text, rounded corners

---

## Integration Tests

### Test 11: End-to-End Workflow ✅

**Objective**: Test complete user journey

**Steps**:
1. Login as Team Lead
2. Navigate to project
3. Create new issue: "Setup Docker containerization"
4. Click "🤖 Generate Checklist"
5. Wait for generation
6. Review preview
7. Press Enter to create
8. Click "✨ Promote Template" in toast
9. Navigate to Checklists page
10. Verify checklist exists
11. Open template library
12. Verify template is reusable

**Expected Results**:
- [ ] All steps complete without errors
- [ ] Checklist created with correct data
- [ ] Template promoted successfully
- [ ] Both checklist and template visible in respective pages

---

### Test 12: Cross-Browser Compatibility ✅

**Objective**: Verify feature works across browsers

**Browsers to Test**:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)

**Test Cases**:
- Animations render correctly
- Keyboard shortcuts work
- Modal displays properly
- Tooltips appear
- API calls succeed

---

## Database Tests

### Test 13: Data Persistence ✅

**Objective**: Verify data saved correctly to database

**Steps**:
1. Generate and create checklist
2. Query database

**SQL Verification**:
```sql
-- Check template created
SELECT id, title, is_reusable, category, icon, created_by 
FROM checklist_templates 
ORDER BY created_at DESC LIMIT 1;

-- Check AI template marked correctly
-- Should show is_reusable = false initially
-- After promotion, is_reusable = true, category = 'AI Generated'

-- Check sections created
SELECT id, template_id, title, display_order 
FROM checklist_sections 
WHERE template_id = [TEMPLATE_ID];

-- Check items created
SELECT id, section_id, text, field_type, is_required 
FROM checklist_items 
WHERE section_id IN (SELECT id FROM checklist_sections WHERE template_id = [TEMPLATE_ID]);
```

**Expected Results**:
- [ ] Template exists with correct title
- [ ] Initially: `is_reusable = false`, `category = 'AI Generated'`
- [ ] After promotion: `is_reusable = true`
- [ ] Sections exist with correct order
- [ ] Items exist with correct field types

---

### Test 14: Checklist Instance Creation ✅

**Objective**: Verify checklist instance created from AI template

**Steps**:
1. After creating checklist from preview
2. Query database

**SQL Verification**:
```sql
-- Check checklist created
SELECT id, title, template_id, project_id, issue_id, action_item_id, created_by, status
FROM checklists
ORDER BY created_at DESC LIMIT 1;

-- Should link to template_id, project_id, and either issue_id or action_item_id
```

**Expected Results**:
- [ ] Checklist instance exists
- [ ] Correctly linked to template, project, and source item
- [ ] Status set to 'Not Started'

---

## Performance Tests

### Test 15: Generation Speed ✅

**Objective**: Measure generation time

**Steps**:
1. Record start time when clicking generate
2. Record end time when preview appears
3. Calculate duration

**Expected Results**:
- [ ] 95% of generations complete within 30 seconds
- [ ] Average generation time: 10-20 seconds
- [ ] No timeouts or hangs

---

### Test 16: Concurrent Requests ✅

**Objective**: Test multiple users generating simultaneously

**Steps**:
1. Have 3-5 users generate checklists at same time
2. Observe behavior

**Expected Results**:
- [ ] All requests complete successfully
- [ ] No rate limit interference between users
- [ ] Response times reasonable
- [ ] No server errors

---

## Security Tests

### Test 17: Authentication ✅

**Objective**: Verify endpoints require authentication

**API Test**:
```bash
# Without auth token
curl -X POST http://localhost:5000/api/checklists/generate-from-issue \
  -H "Content-Type: application/json" \
  -d '{"issueId": 26, "projectId": 1}'
```

**Expected Results**:
- [ ] Returns 401 Unauthorized
- [ ] No checklist generated

---

### Test 18: Authorization ✅

**Objective**: Verify users can only generate for projects they have access to

**Steps**:
1. Login as User A (access to Project 1)
2. Attempt to generate checklist for Project 2 (no access)

**Expected Results**:
- [ ] Returns 403 Forbidden or 404 Not Found
- [ ] Error message about project access

---

### Test 19: Input Validation ✅

**Objective**: Verify input sanitization and validation

**API Tests**:
```bash
# XSS attempt
curl -X POST http://localhost:5000/api/checklists/generate-from-issue \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_TOKEN" \
  -d '{"issueId": "<script>alert(1)</script>", "projectId": 1}'

# SQL injection attempt  
curl -X POST http://localhost:5000/api/checklists/generate-from-issue \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_TOKEN" \
  -d '{"issueId": "1 OR 1=1", "projectId": 1}'
```

**Expected Results**:
- [ ] Validation errors returned
- [ ] No script execution
- [ ] No SQL injection
- [ ] Joi validation catches malformed input

---

## Regression Tests

### Test 20: Existing Functionality ✅

**Objective**: Verify AI feature doesn't break existing checklist functionality

**Test Cases**:
- [ ] Manual checklist creation still works
- [ ] Template selection works
- [ ] Checklist responses save correctly
- [ ] Progress tracking accurate
- [ ] Signoff workflow intact
- [ ] Comments work
- [ ] Notifications sent (if table exists)

---

## Bug Tracking Template

### Found Issues
Use this template to track any bugs found during testing:

```
**Bug ID**: [Unique ID]
**Test**: [Test number/name]
**Severity**: [Critical/High/Medium/Low]
**Description**: [What went wrong]
**Steps to Reproduce**: 
1. 
2. 
3. 
**Expected**: [What should happen]
**Actual**: [What actually happened]
**Environment**: [Browser, OS, etc.]
**Screenshots**: [If applicable]
**Status**: [Open/Fixed/Closed]
```

---

## Test Completion Checklist

### Functional Tests
- [ ] Test 1: Issue Checklist Generation
- [ ] Test 2: Action Item Checklist Generation
- [ ] Test 3: Template Matching
- [ ] Test 4: Error Scenarios (4a, 4b, 4c)
- [ ] Test 5: Rate Limiting
- [ ] Test 6: Template Promotion (6a, 6b, 6c)

### UI/UX Tests
- [ ] Test 7: Loading Animation
- [ ] Test 8: Preview Display
- [ ] Test 9: Keyboard Shortcuts
- [ ] Test 10: Tooltips

### Integration Tests
- [ ] Test 11: End-to-End Workflow
- [ ] Test 12: Cross-Browser Compatibility

### Database Tests
- [ ] Test 13: Data Persistence
- [ ] Test 14: Checklist Instance Creation

### Performance Tests
- [ ] Test 15: Generation Speed
- [ ] Test 16: Concurrent Requests

### Security Tests
- [ ] Test 17: Authentication
- [ ] Test 18: Authorization
- [ ] Test 19: Input Validation

### Regression Tests
- [ ] Test 20: Existing Functionality

---

## Sign-Off

**Tested By**: _______________  
**Date**: _______________  
**Approved By**: _______________  
**Date**: _______________  

**Notes**:
- All critical and high severity bugs must be fixed before sign-off
- Medium and low severity bugs can be tracked for future releases
- Document any known limitations or tech debt

---

## Known Limitations (Tech Debt for Phase 2b)

1. **Rate Limiting**: In-memory (resets on server restart)
   - Future: Persist to database
   
2. **Custom Instructions**: Not yet implemented
   - Future: Allow users to customize AI generation parameters

3. **Cost Tracking**: No tracking of API usage costs
   - Future: Track OpenAI API costs per user/project

4. **Audit Logging**: No detailed audit trail
   - Future: Log all AI generations to audit table

5. **Notifications**: Conditional on notifications table existence
   - Future: Ensure notifications sent for checklist creation

6. **Provider Selection**: Hardcoded to OpenAI (with Anthropic fallback)
   - Future: Allow users to choose AI provider
