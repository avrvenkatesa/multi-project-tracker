# Postman Collection for Hierarchical Issues API

This directory contains a Postman collection for testing the Multi-Project Tracker's hierarchical issue management endpoints.

## 📦 Collection File

**File**: `hierarchy-endpoints.postman_collection.json`

**Collection Name**: Multi-Project Tracker - Hierarchical Issues

## 🚀 Getting Started

### 1. Import Collection

1. Open Postman
2. Click **Import** button
3. Select **File** tab
4. Choose `hierarchy-endpoints.postman_collection.json`
5. Click **Import**

### 2. Set Up Variables

Before running requests, configure the collection variables:

1. Click on the collection name
2. Go to **Variables** tab
3. Set the following variables:

| Variable | Example Value | Description |
|----------|---------------|-------------|
| `baseUrl` | `http://localhost:5000` | Base URL of your API (pre-configured) |
| `projectId` | `42` | ID of an existing project |
| `issueId` | `100` | ID of an existing issue |
| `parentIssueId` | `99` | ID of parent issue (for creating children) |

> **Note**: `authToken`, `childIssueId` are automatically populated by the collection

### 3. Authenticate

Before testing hierarchy endpoints:

1. Navigate to **Authentication** folder
2. Run the **Login** request
3. The collection will automatically:
   - Store the JWT token from the cookie
   - Set the `authToken` variable
   - Include it in subsequent requests

**Default Credentials** (update in request body if needed):
- Email: `demo@multiproject.com`
- Password: `demo123`

### 4. Run Requests

Navigate through the folders and run requests in order:

#### **Hierarchy Management** Folder

1. **Create Issue with Parent Linkage** - Create new hierarchical issues
2. **Get Issue Hierarchy** - View complete tree structure
3. **Get Issue Children** - List direct children
4. **Calculate Effort Rollup** - Calculate and update parent efforts
5. **Update All Parent Efforts** - Bulk update all parents in project
6. **Get Estimate with Dependencies** - View effort with dependency analysis
7. **Get Project Hierarchy** - View complete project structure

#### **Error Scenarios** Folder

Test validation and error handling:
- Invalid Issue ID (NaN)
- Non-existent Issue
- Invalid updateParent Type

---

## 📋 Collection Features

### ✅ Automatic Test Scripts

Each request includes automated tests that verify:

- HTTP status codes (200, 201, 400, 404, etc.)
- Response structure and required fields
- Data types and validations
- Business logic correctness

View test results in the **Test Results** tab after running a request.

### 🔧 Pre-Request Scripts

**Collection Level**:
- Logs request details
- Shows current variable values
- Helps debug issues

**Folder Level** (Hierarchy Management):
- Checks for authentication token
- Validates required variables are set
- Provides helpful warnings

### 📊 Collection Variables

Variables are automatically managed:

| Variable | Auto-populated | Purpose |
|----------|----------------|---------|
| `authToken` | ✅ Yes | JWT token from login |
| `issueId` | ✅ Yes | ID from created issue |
| `childIssueId` | ✅ Yes | First child from children list |
| `projectId` | ❌ Manual | Set manually to your project |
| `parentIssueId` | ❌ Manual | Set manually if creating children |

---

## 🎯 Example Workflows

### Workflow 1: Test Complete Hierarchy Flow

1. **Login** → Get authentication
2. Set `projectId` = your project ID
3. **Create Issue with Parent Linkage** → Creates parent issue
   - Response auto-sets `issueId`
4. **Get Issue Children** → View children (empty initially)
5. Create more child issues using the same endpoint
6. **Calculate Effort Rollup** → Calculate total effort
7. **Get Issue Hierarchy** → View complete tree

### Workflow 2: Test Project-Wide Updates

1. **Login** → Authenticate
2. Set `projectId` = your project ID
3. **Get Project Hierarchy** → View current state
4. **Update All Parent Efforts** → Bulk recalculate
5. **Get Project Hierarchy** → Verify updates

### Workflow 3: Test Validation

1. **Login** → Authenticate
2. Run all requests in **Error Scenarios** folder
3. Verify each returns appropriate error codes
4. Check error messages are descriptive

---

## 📝 Request Details

### 1. Create Issue with Parent Linkage

**Method**: `POST /api/issues`

**Body**:
```json
{
  "projectId": {{projectId}},
  "title": "Mobile App Development",
  "description": "Build iOS and Android apps",
  "priority": "high",
  "parentIssueId": {{parentIssueId}},
  "isEpic": true,
  "estimatedEffortHours": 80
}
```

**Tests**:
- ✅ Status 201
- ✅ Issue has ID and required fields
- ✅ Parent linkage correct
- ✅ Auto-saves `issueId` variable

### 2. Get Issue Hierarchy

**Method**: `GET /api/issues/:issueId/hierarchy`

**Tests**:
- ✅ Status 200
- ✅ Tree structure with children
- ✅ Effort data included

### 3. Get Issue Children

**Method**: `GET /api/issues/:issueId/children`

**Tests**:
- ✅ Status 200
- ✅ Array response
- ✅ Children have required fields
- ✅ Auto-saves first `childIssueId`

### 4. Calculate Effort Rollup

**Method**: `POST /api/issues/:issueId/calculate-rollup`

**Body**:
```json
{
  "updateParent": true
}
```

**Tests**:
- ✅ Status 200
- ✅ Has totalHours and childCount
- ✅ Update status matches request

### 5. Update All Parent Efforts

**Method**: `POST /api/projects/:projectId/update-parent-efforts`

**Tests**:
- ✅ Status 200
- ✅ Update summary returned
- ✅ Parents array has correct structure

### 6. Get Estimate with Dependencies

**Method**: `GET /api/issues/:issueId/estimate-with-dependencies`

**Tests**:
- ✅ Status 200
- ✅ Has effort and buffer fields
- ✅ Breakdown included
- ✅ Dependencies is array

### 7. Get Project Hierarchy

**Method**: `GET /api/projects/:projectId/hierarchy`

**Tests**:
- ✅ Status 200
- ✅ Array of issues
- ✅ Hierarchy fields present (depth, path)
- ✅ Root issues have depth 0

---

## 🔍 Viewing Test Results

After running a request:

1. Click on the **Test Results** tab
2. View passed/failed tests
3. Green ✅ = passed
4. Red ❌ = failed (with details)

### Global Tests

Every request automatically tests:
- ✅ Response time < 5 seconds
- ✅ Content-Type is JSON

---

## 🐛 Troubleshooting

### "No auth token found" Warning

**Solution**: Run the **Login** request first

### "No issueId set" Warning

**Solution**: Either:
1. Run **Create Issue** request first (auto-sets it), OR
2. Manually set `issueId` variable

### "No projectId set" Warning

**Solution**: Manually set `projectId` in collection variables:
1. Click collection name
2. Go to **Variables** tab
3. Set `projectId` value

### 401 Unauthorized

**Solution**: 
1. Run **Login** request to refresh token
2. Ensure cookies are enabled in Postman

### 404 Not Found

**Solution**: Verify the resource exists:
- Check `issueId` points to valid issue
- Check `projectId` points to valid project

### 400 Bad Request

**Solution**: Check request body format:
- Ensure IDs are integers (not strings)
- Boolean fields must be `true`/`false` (not strings)

---

## 📊 Expected Test Results

### Successful Hierarchy Flow

When all variables are properly set:

| Request | Status | Tests Passed |
|---------|--------|--------------|
| Login | 200 | 3/3 |
| Create Issue | 201 | 3/3 |
| Get Hierarchy | 200 | 3/3 |
| Get Children | 200 | 3/3 |
| Calculate Rollup | 200 | 4/4 |
| Update Parent Efforts | 200 | 3/3 |
| Get Estimate | 200 | 4/4 |
| Get Project Hierarchy | 200 | 4/4 |

**Total**: All tests passing with appropriate status codes

### Error Scenarios

| Request | Expected Status | Tests |
|---------|----------------|-------|
| Invalid Issue ID | 400 | Error message descriptive |
| Non-existent Issue | 404 | Error with details |
| Invalid updateParent | 400 | Mentions boolean |

---

## 💡 Tips

1. **Use Environments**: Create Postman environments for dev/staging/prod
2. **Run Collection**: Use Collection Runner to test all endpoints at once
3. **Monitor**: Use Postman Monitor to schedule automated tests
4. **Export Variables**: Save variable state for sharing with team
5. **Check Console**: Use Postman Console (View → Show Postman Console) for debugging

---

## 🔗 Related Documentation

- **API Docs**: `docs/api/hierarchy-endpoints.md`
- **Validation Summary**: `VALIDATION_SUMMARY.md`
- **Test Suites**: 
  - `test/test-hierarchy-api.js` (Node.js functional tests)
  - `test/test-hierarchy-validation.js` (Node.js validation tests)

---

## 📈 Collection Statistics

- **Total Requests**: 10
- **Folders**: 3 (Authentication, Hierarchy Management, Error Scenarios)
- **Collection Variables**: 6
- **Test Scripts**: 10 requests with automated tests
- **Pre-Request Scripts**: Collection and folder level
- **Global Scripts**: 2 (pre-request and test)

---

## 🆘 Support

If you encounter issues:

1. Check the Postman Console for detailed error logs
2. Verify your server is running on the correct port
3. Ensure database is accessible
4. Review the API documentation for endpoint requirements
5. Check variable values are correctly set

---

**Last Updated**: November 14, 2025  
**Collection Version**: 1.0.0  
**Postman Schema**: v2.1.0
