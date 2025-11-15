# Hierarchy Extraction API Endpoints

## Overview
This document describes the two new API endpoints for AI-powered hierarchical task extraction from documents.

---

## 1. Extract Hierarchy from Document Text

**Endpoint:** `POST /api/analyze/extract-hierarchy`

**Authentication:** Required (JWT token)

**Description:** Extracts a hierarchical task structure from document text using Claude AI. Optionally creates issues in a specified project.

### Request Body

```json
{
  "documentText": "string (required)",
  "projectId": "number (optional)",
  "options": {
    "createIssues": "boolean (optional, default: false)",
    "includeEffort": "boolean (optional, default: true)",
    "projectContext": "string (optional)"
  }
}
```

### Request Parameters

- **documentText** (required): The document text to analyze
- **projectId** (optional): If provided, validates project access. Required if `createIssues` is true.
- **options** (optional):
  - **createIssues**: Whether to create issues from extracted hierarchy
  - **includeEffort**: Whether to include effort estimates (passed to AI)
  - **projectContext**: Additional context for the AI extraction

### Response (Success)

```json
{
  "success": true,
  "extraction": {
    "items": [
      {
        "id": "string",
        "title": "string",
        "description": "string",
        "type": "epic|task|subtask",
        "parent": "string|null",
        "children": ["string"],
        "priority": "Low|Medium|High|Critical",
        "estimatedHours": "number",
        "confidence": "low|medium|high",
        "dependencies": ["string"]
      }
    ],
    "summary": {
      "totalItems": "number",
      "epics": "number",
      "tasks": "number",
      "subtasks": "number",
      "totalEffort": "number"
    },
    "metadata": {
      "model": "string",
      "tokensUsed": "number",
      "cost": "number",
      "timestamp": "string"
    }
  },
  "createdIssues": {
    "created": ["array of created issue IDs"],
    "epicsList": ["array of epic IDs"],
    "tasksList": ["array of task IDs"]
  },
  "message": "string"
}
```

### Response (Error)

```json
{
  "error": "string",
  "details": "string",
  "metadata": "object (optional)"
}
```

### Status Codes

- **200**: Success
- **400**: Bad request (missing/invalid documentText or projectId)
- **403**: Access denied (user lacks project access)
- **404**: Project not found
- **500**: Extraction or issue creation failed

### Example Usage

```bash
curl -X POST http://localhost:5000/api/analyze/extract-hierarchy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "documentText": "# Project Plan\n## Phase 1: Setup\n### Database Design (8 hours)\nDesign the schema...",
    "projectId": 1,
    "options": {
      "createIssues": true,
      "includeEffort": true
    }
  }'
```

---

## 2. Analyze Multiple Documents and Create Issues

**Endpoint:** `POST /api/projects/:projectId/analyze-documents`

**Authentication:** Required (JWT token)

**Description:** Analyzes multiple documents, extracts hierarchical task structure, validates the hierarchy, and automatically creates issues in the specified project.

### URL Parameters

- **projectId** (required): The project ID where issues will be created

### Request Body

```json
{
  "documents": [
    {
      "text": "string (required)",
      "name": "string (required)",
      "classification": "string (optional)"
    }
  ],
  "options": {
    "includeEffort": "boolean (optional, default: true)",
    "projectContext": "string (optional)"
  }
}
```

### Request Parameters

- **documents** (required): Array of document objects, each with:
  - **text**: The document content
  - **name**: Document name/filename
  - **classification**: Optional document type (e.g., "Requirements Document", "Project Plan")
- **options** (optional):
  - **includeEffort**: Whether to include AI-generated effort estimates
  - **projectContext**: Additional context about the project

### Response (Success)

```json
{
  "success": true,
  "hierarchy": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "type": "epic|task|subtask",
      "parent": "string|null",
      "children": ["string"],
      "priority": "string",
      "estimatedHours": "number",
      "confidence": "string",
      "dependencies": ["string"]
    }
  ],
  "created": {
    "total": "number",
    "epics": "number",
    "tasks": "number",
    "issues": [
      {
        "id": "number",
        "title": "string",
        "type": "epic|task",
        "parent_id": "number|null"
      }
    ],
    "epicsList": ["array of epic issue objects"],
    "tasksList": ["array of task issue objects"]
  },
  "validation": {
    "valid": "boolean",
    "errors": ["array of error messages"],
    "warnings": ["array of warning messages"],
    "stats": {
      "totalItems": "number",
      "duplicateTitles": "number",
      "missingParents": "number",
      "circularDependencies": "number"
    }
  },
  "extraction": {
    "summary": {
      "totalItems": "number",
      "epics": "number",
      "tasks": "number",
      "totalEffort": "number"
    },
    "metadata": {
      "model": "string",
      "tokensUsed": "number",
      "cost": "number"
    }
  },
  "creationErrors": ["array of error messages"],
  "message": "string"
}
```

### Response (Error)

```json
{
  "success": false,
  "error": "string",
  "errors": ["array of error messages"],
  "warnings": ["array of warning messages"],
  "hierarchy": "array (optional)",
  "stats": "object (optional)"
}
```

### Status Codes

- **200**: Success
- **400**: Bad request (missing/invalid documents or projectId)
- **403**: Access denied (user lacks project access)
- **404**: Project not found
- **500**: Analysis or issue creation failed

### Example Usage

```bash
curl -X POST http://localhost:5000/api/projects/1/analyze-documents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "documents": [
      {
        "name": "project-plan.md",
        "text": "# E-Commerce Platform\n## Phase 1: Frontend\n### UI Design (20 hours)\nModern interface...",
        "classification": "Project Plan"
      },
      {
        "name": "requirements.md",
        "text": "# Requirements\n## User Authentication\nImplement OAuth2...",
        "classification": "Requirements Document"
      }
    ],
    "options": {
      "includeEffort": true,
      "projectContext": "E-commerce platform modernization"
    }
  }'
```

---

## Security & Authorization

Both endpoints:
- **Require authentication** via JWT token
- **Verify project access** using the existing `checkProjectAccess` middleware
- **Validate input** to prevent malformed requests
- **Include comprehensive error handling** with detailed error messages

---

## AI Cost Tracking

Both endpoints integrate with the centralized AI cost tracking service:
- All Claude AI API calls are logged to the `ai_usage_tracking` table
- Costs are calculated based on token usage
- Metadata includes model name, tokens used, and estimated cost

---

## Integration with Existing Services

### First Endpoint (`/api/analyze/extract-hierarchy`)
- Uses: `hierarchyExtractor.extractHierarchy()`
- Optionally uses: `dependencyMapper.createHierarchicalIssues()`

### Second Endpoint (`/api/projects/:projectId/analyze-documents`)
- Uses: `multiDocAnalyzer.analyzeAndCreateHierarchy()`
- Which internally calls:
  - `hierarchyExtractor.extractHierarchy()`
  - `hierarchyExtractor.validateHierarchy()`
  - `dependencyMapper.createHierarchicalIssues()`

---

## Error Handling

Both endpoints provide:
1. **Input validation** with specific error messages
2. **Project access verification** with 403 errors
3. **AI extraction error handling** with fallback responses
4. **Issue creation error handling** with partial success reporting
5. **Comprehensive logging** for debugging

---

## Notes

- The first endpoint is more flexible and can be used for testing or preview purposes
- The second endpoint is the full end-to-end workflow for production use
- Both endpoints support the same AI extraction backend but have different workflows
- Validation ensures data quality before issues are created
- All created issues include proper parent-child relationships and dependencies
