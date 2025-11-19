# AIPM Foundation API Documentation

## Overview
This document describes the API endpoints for the AIPM (AI-Powered Project Manager) foundation, covering Decisions, Meetings, Evidence, PKG (Project Knowledge Graph), and RAG (Retrieval-Augmented Generation).

## Authentication
All endpoints require cookie-based authentication with a JWT token. The token is automatically sent via httpOnly cookies after login.

---

## Decisions API

### POST /api/projects/:projectId/decisions
Create a new decision for a project.

**Request Body:**
```json
{
  "title": "Adopt microservices architecture",
  "description": "Migrate from monolith to microservices",
  "decisionType": "architectural",
  "impactLevel": "high",
  "status": "proposed",
  "rationale": "Current monolith limits team autonomy",
  "consequences": "Better scalability but increased complexity",
  "alternativesConsidered": [
    {
      "option": "Modular monolith",
      "pros": "Simpler deployment",
      "cons": "Still coupled"
    }
  ],
  "decidedBy": 123,
  "decidedDate": "2025-11-20T10:00:00Z",
  "reviewDate": "2025-12-20T10:00:00Z"
}
```

**Response (201 Created):**
```json
{
  "id": 42,
  "decisionId": "DEC-00042",
  "projectId": 1,
  "title": "Adopt microservices architecture",
  "description": "Migrate from monolith to microservices",
  "decisionType": "architectural",
  "impactLevel": "high",
  "status": "proposed",
  "rationale": "Current monolith limits team autonomy",
  "pkgNodeId": "uuid-here",
  "createdAt": "2025-11-20T10:00:00.000Z",
  "updatedAt": "2025-11-20T10:00:00.000Z"
}
```

**Auto-Created PKG Node:**
- Automatically creates a PKG node with `type='Decision'`
- Populates `attrs` JSONB with all decision fields
- Backfills `pkg_node_id` in decisions table

**Auto-Indexed in RAG:**
- If `rationale` is provided, creates RAG document with `source_type='decision_rationale'`
- Enables full-text search on decision rationale

---

### GET /api/projects/:projectId/decisions
Get all decisions for a project.

**Response (200 OK):**
```json
{
  "decisions": [
    {
      "id": 42,
      "decisionId": "DEC-00042",
      "title": "Adopt microservices architecture",
      "status": "approved",
      ...
    }
  ]
}
```

---

### PATCH /api/decisions/:id
Update a decision.

**Request Body:**
```json
{
  "status": "approved",
  "decidedBy": 123,
  "decidedDate": "2025-11-20T15:00:00Z"
}
```

**Response (200 OK):**
```json
{
  "id": 42,
  "status": "approved",
  ...
}
```

**Auto-Syncs to PKG:**
- Updates corresponding PKG node's `attrs` field
- Maintains data consistency across tables

---

## Meetings API

### POST /api/projects/:projectId/meetings
Create a new meeting with transcript.

**Request Body:**
```json
{
  "title": "Sprint Planning - Week 45",
  "meetingDate": "2025-11-20T10:00:00Z",
  "durationMinutes": 60,
  "participants": ["alice", "bob", "charlie"],
  "transcriptText": "Alice: We discussed the API migration...",
  "summaryText": "Agreed on migration timeline",
  "actionItemsExtracted": [
    {
      "title": "Document rollback procedure",
      "assignee": "charlie"
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "id": 15,
  "meetingId": "MTG-00015",
  "projectId": 1,
  "title": "Sprint Planning - Week 45",
  "meetingDate": "2025-11-20T10:00:00.000Z",
  "participants": ["alice", "bob", "charlie"],
  "createdAt": "2025-11-20T10:05:00.000Z"
}
```

**Auto-Created PKG Node:**
- Creates PKG node with `type='Meeting'`
- Stores meeting metadata in `attrs`

**Auto-Indexed in RAG:**
- If `transcriptText` is provided, auto-creates RAG document via trigger
- `source_type='meeting_transcript'`, `source_id=meeting.id`
- Transcript is immediately searchable

---

### GET /api/projects/:projectId/meetings
Get all meetings for a project.

**Response (200 OK):**
```json
{
  "meetings": [
    {
      "id": 15,
      "meetingId": "MTG-00015",
      "title": "Sprint Planning - Week 45",
      ...
    }
  ]
}
```

---

## Evidence API

### POST /api/evidence
Link evidence (transcript quotes, document excerpts) to entities.

**Request Body:**
```json
{
  "entityType": "action-item",
  "entityId": 567,
  "evidenceType": "transcript_quote",
  "sourceType": "meeting",
  "sourceId": 15,
  "quoteText": "I'll create an action item to document the rollback procedure.",
  "pageNumber": null,
  "timestampSeconds": 1820,
  "context": "Discussion about database migration",
  "confidence": "high",
  "extractionMethod": "llm_extraction"
}
```

**Response (201 Created):**
```json
{
  "id": 89,
  "entityType": "action-item",
  "entityId": 567,
  "evidenceType": "transcript_quote",
  "sourceType": "meeting",
  "sourceId": 15,
  "quoteText": "I'll create an action item...",
  "confidence": "high",
  "pkgEdgeId": "uuid-here",
  "createdAt": "2025-11-20T10:10:00.000Z"
}
```

**Auto-Created PKG Edge:**
- Creates PKG edge: `type='evidence_of'`
- `from_node_id` = source PKG node (meeting)
- `to_node_id` = target PKG node (action item)
- `evidence_quote` = quote text
- Backfills `pkg_edge_id` in evidence table

---

## PKG (Project Knowledge Graph) API

### GET /api/aipm/projects/:projectId/pkg
Get complete PKG graph for a project (all nodes and edges).

**Response (200 OK):**
```json
{
  "nodes": [
    {
      "id": "uuid-1",
      "type": "Task",
      "sourceTable": "issues",
      "sourceId": 123,
      "attrs": {
        "title": "Implement authentication",
        "status": "In Progress",
        "priority": "high"
      },
      "createdByAi": false,
      "aiConfidence": null,
      "createdAt": "2025-11-20T10:00:00.000Z",
      "updatedAt": "2025-11-20T10:00:00.000Z"
    },
    {
      "id": "uuid-2",
      "type": "Decision",
      "sourceTable": "decisions",
      "sourceId": 42,
      "attrs": {
        "title": "Adopt microservices",
        "impact_level": "high",
        "status": "approved"
      },
      "createdByAi": false,
      "aiConfidence": null,
      "createdAt": "2025-11-20T11:00:00.000Z",
      "updatedAt": "2025-11-20T11:00:00.000Z"
    }
  ],
  "edges": [
    {
      "id": "uuid-edge-1",
      "type": "parent_of",
      "fromNodeId": "uuid-epic",
      "toNodeId": "uuid-task",
      "attrs": {},
      "evidenceQuote": null,
      "aiConfidence": null,
      "createdAt": "2025-11-20T10:05:00.000Z"
    },
    {
      "id": "uuid-edge-2",
      "type": "evidence_of",
      "fromNodeId": "uuid-meeting",
      "toNodeId": "uuid-action",
      "evidenceQuote": "I'll create an action item...",
      "aiConfidence": 0.92,
      "createdAt": "2025-11-20T10:10:00.000Z"
    }
  ]
}
```

**Use Cases:**
- Visualize project knowledge graph
- AI agent context gathering
- Relationship discovery
- Impact analysis

---

### GET /api/aipm/pkg/query
Query PKG nodes with filters.

**Query Parameters:**
- `project_id` (required): Project ID
- `type` (optional): Node type filter (`Task`, `Decision`, `Meeting`, `Risk`, etc.)
- `attr_filter` (optional): JSON object for JSONB attribute filtering
- `limit` (optional): Max results (default: 100)

**Example: Filter by type**
```
GET /api/aipm/pkg/query?project_id=1&type=Decision
```

**Example: Filter by attributes**
```
GET /api/aipm/pkg/query?project_id=1&type=Decision&attr_filter={"impact_level":"high"}
```

**Response (200 OK):**
```json
{
  "nodes": [
    {
      "id": "uuid-2",
      "type": "Decision",
      "sourceTable": "decisions",
      "sourceId": 42,
      "attrs": {
        "title": "Adopt microservices",
        "impact_level": "high"
      },
      ...
    }
  ]
}
```

---

## RAG (Retrieval-Augmented Generation) API

### GET /api/aipm/projects/:projectId/rag/search
Full-text search across all RAG documents in a project.

**Query Parameters:**
- `q` (required): Search query
- `source_type` (optional): Filter by source type (`meeting_transcript`, `decision_rationale`, `risk_description`, `uploaded_doc`)
- `limit` (optional): Max results (default: 20)

**Example:**
```
GET /api/aipm/projects/1/rag/search?q=database migration rollback&limit=10
```

**Response (200 OK):**
```json
{
  "query": "database migration rollback",
  "count": 3,
  "results": [
    {
      "id": "uuid-rag-1",
      "title": "Sprint Planning - Week 45",
      "sourceType": "meeting_transcript",
      "sourceId": 15,
      "snippet": "We need to complete the <b>database</b> <b>migration</b> by next Friday. I'll create an action item to document the <b>rollback</b> procedure.",
      "relevance": 0.856,
      "meta": {
        "meeting_date": "2025-11-20"
      },
      "createdAt": "2025-11-20T10:00:00.000Z"
    }
  ]
}
```

**Features:**
- PostgreSQL full-text search with stemming
- Relevance ranking via `ts_rank()`
- Highlighted snippets via `ts_headline()`
- Sub-second performance with GIN indexes

---

### POST /api/aipm/projects/:projectId/rag/docs
Manually upload a document for indexing.

**Request (multipart/form-data):**
- `file`: Document file (PDF, DOCX, TXT)
- `title` (optional): Document title
- `source_type` (optional): Source type (default: `uploaded_doc`)

**Response (201 Created):**
```json
{
  "id": "uuid-rag-2",
  "projectId": 1,
  "sourceType": "uploaded_doc",
  "sourceId": null,
  "title": "Architecture Decision Record",
  "meta": {
    "filename": "adr-001.pdf",
    "mime_type": "application/pdf",
    "file_size": 102400,
    "uploaded_by": 123
  },
  "createdAt": "2025-11-20T11:00:00.000Z",
  "updatedAt": "2025-11-20T11:00:00.000Z"
}
```

**Auto-Indexed:**
- Text extracted from file (supports PDF, DOCX, TXT)
- Immediately searchable via full-text search

---

### GET /api/aipm/rag/context
Retrieve context for LLM prompts (for AI agents).

**Query Parameters:**
- `project_id` (required): Project ID
- `query` (required): Search query for context retrieval
- `max_tokens` (optional): Max tokens to return (default: 3000)

**Example:**
```
GET /api/aipm/rag/context?project_id=1&query=authentication migration&max_tokens=2000
```

**Response (200 OK):**
```json
{
  "context": "## Source 1: Sprint Planning - Week 45\nWe discussed the authentication service migration...\n\n## Source 2: Decision: Adopt OAuth2\nRationale: OAuth2 provides better security...",
  "sources": [
    {
      "sourceType": "meeting_transcript",
      "sourceId": 15,
      "title": "Sprint Planning - Week 45"
    },
    {
      "sourceType": "decision_rationale",
      "sourceId": 42,
      "title": "Decision: Adopt OAuth2"
    }
  ],
  "estimatedTokens": 1847
}
```

**Use Cases:**
- AI agent context retrieval
- LLM prompt assembly
- Evidence-based AI recommendations

---

## PKG Node Types

The PKG overlay supports these entity types:

| Type | Source Table | Description |
|------|-------------|-------------|
| `Task` | `issues` | Project issues/tasks |
| `ActionItem` | `action_items` | Action items from meetings |
| `Risk` | `risks` | Risk register entries |
| `Decision` | `decisions` | Architectural/business decisions |
| `Meeting` | `meetings` | Meeting records |

---

## PKG Edge Types

The PKG overlay supports these relationship types:

| Type | Description | Example |
|------|-------------|---------|
| `parent_of` | Hierarchy relationship | Epic → Task |
| `depends_on` | Dependency relationship | Task A → Task B |
| `evidence_of` | Evidence linking | Meeting → Action Item |
| `sourced_from` | Source attribution | Decision → Meeting |

---

## Error Responses

All endpoints return standard HTTP status codes:

**400 Bad Request:**
```json
{
  "error": "Validation error: title is required"
}
```

**401 Unauthorized:**
```json
{
  "error": "Authentication required"
}
```

**404 Not Found:**
```json
{
  "error": "Decision not found"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Failed to create decision"
}
```

---

## Auto-Sync Behavior

The AIPM foundation maintains data consistency through automatic triggers:

1. **PKG Sync Triggers:**
   - Creating/updating issues → Auto-creates/updates PKG nodes
   - Creating/updating action items → Auto-creates/updates PKG nodes
   - Creating/updating decisions → Auto-creates/updates PKG nodes
   - Creating/updating risks → Auto-creates/updates PKG nodes
   - Creating/updating meetings → Auto-creates/updates PKG nodes

2. **RAG Auto-Indexing Triggers:**
   - Creating/updating meetings with `transcript_text` → Auto-indexes to RAG
   - Creating/updating decisions with `rationale` → Auto-indexes to RAG
   - Creating/updating risks with `description` → Auto-indexes to RAG

3. **PKG Edge Creation:**
   - Creating evidence → Auto-creates PKG edges with `type='evidence_of'`
   - Creating parent-child issues → Auto-creates PKG edges with `type='parent_of'`

---

## Performance Characteristics

Based on Story 5.1.4 performance tests:

- **PKG node queries:** < 500ms for 10k+ nodes
- **Complex graph queries:** < 1s for 50+ node JOIN queries
- **RAG full-text search:** < 300ms for 1k+ documents
- **Type filtering:** < 100ms (indexed)
- **JSONB attribute queries:** < 200ms

---

## Version History

- **v1.0.0** (2025-11-20): Initial AIPM foundation release
  - Decisions, Meetings, Evidence APIs
  - PKG overlay with auto-sync
  - RAG foundation with full-text search
