# AI Agent API Documentation

Complete reference for AI-powered project management features.

## Base URL

```
http://localhost:5000/api/aipm
```

## Authentication

All endpoints require authentication via cookie-based session:
```
Cookie: token=your-jwt-token
```

---

## Agent Chat

### POST /projects/:projectId/agent/chat

Send a message to the AI agent (non-streaming).

**Request:**
```json
{
  "prompt": "What are the highest priority tasks?",
  "agentType": "knowledge_explorer"
}
```

**Agent Types:**
- `knowledge_explorer` - General Q&A
- `decision_assistant` - Decision support
- `risk_detector` - Risk analysis
- `meeting_analyzer` - Meeting analysis

**Response:**
```json
{
  "sessionId": "uuid",
  "response": "Based on analysis...",
  "confidence": 0.85,
  "context": {
    "pkgNodesUsed": 15,
    "ragDocsUsed": 8
  },
  "metadata": {
    "tokensUsed": 1250,
    "latencyMs": 3500,
    "model": "claude-3-sonnet-20240229"
  }
}
```

### GET /projects/:projectId/agent/chat/stream

Stream AI agent response in real-time (Server-Sent Events).

**Query Parameters:**
- `prompt` (required) - User question
- `agentType` (optional) - Agent type (default: knowledge_explorer)

**Event Types:**
```javascript
// Session created
{ "type": "session", "sessionId": "uuid" }

// Status update
{ "type": "status", "message": "Assembling context..." }

// Context assembled
{ "type": "context", "pkgNodes": 15, "ragDocs": 8 }

// Response chunk (streaming)
{ "type": "chunk", "text": "Based on" }

// Completion
{ "type": "complete", "sessionId": "uuid" }

// Error
{ "type": "error", "message": "Error message" }
```

---

## Decision Making

### POST /projects/:projectId/agent/propose-decision

AI proposes a decision with impact analysis.

**Request:**
```json
{
  "title": "Migrate to microservices",
  "description": "Break monolith into services",
  "decision_type": "architectural",
  "impact_level": "high",
  "rationale": "Improve scalability"
}
```

**Response:**
```json
{
  "proposal": {
    "proposalId": "PROP-00001",
    "title": "Migrate to microservices",
    "status": "pending_review",
    "confidence": 0.82,
    "createdAt": "2025-11-18T10:00:00Z"
  },
  "analysis": {
    "relatedDecisions": 3,
    "impactedNodes": 15,
    "relatedRisks": 2,
    "potentialConflicts": 0
  },
  "alternatives": [
    {
      "description": "Modular monolith",
      "pros": ["Simpler deployment", "Lower complexity"],
      "cons": ["Less scalable"],
      "complexity": "Low",
      "riskLevel": "Low"
    }
  ]
}
```

### GET /projects/:projectId/agent/proposals

Get AI proposals for a project.

**Query Parameters:**
- `status` - Filter by status (pending_review, approved, rejected)
- `type` - Filter by type (decision, risk, action_item)
- `limit` - Max results (default: 50)

### POST /agent/proposals/:proposalId/approve

Approve a proposal (HITL workflow).

**Request:**
```json
{
  "reviewNotes": "Looks good",
  "modifications": {
    "impact_level": "medium"
  }
}
```

### POST /agent/proposals/:proposalId/reject

Reject a proposal.

**Request:**
```json
{
  "reviewNotes": "Not aligned with strategy"
}
```

---

## Risk Detection

### POST /projects/:projectId/agent/scan-risks

Scan project for potential risks.

**Request:**
```json
{
  "autoCreateHighConfidence": true
}
```

**Response:**
```json
{
  "sessionId": "uuid",
  "detected": [
    {
      "type": "dependency_bottleneck",
      "title": "High dependency count for: API Gateway",
      "description": "Task has 8 dependencies",
      "probability": 4,
      "impact": 4,
      "severity": 16,
      "confidence": 0.85,
      "source": {
        "type": "task",
        "id": 123,
        "title": "API Gateway"
      }
    }
  ],
  "metadata": {
    "totalDetected": 5,
    "highSeverity": 2,
    "mediumSeverity": 2,
    "lowSeverity": 1
  },
  "autoCreated": [
    { "id": 456, "title": "Critical risk title" }
  ],
  "proposals": [
    { "proposalId": "PROP-00002", "title": "Medium risk title" }
  ]
}
```

### GET /projects/:projectId/risks/ai-detected

Get risks detected by AI.

---

## Session Management

### GET /projects/:projectId/agent/sessions

Get agent session history.

**Query Parameters:**
- `limit` - Max sessions (default: 20)

### GET /agent/sessions/:sessionId

Get session details and audit log.

---

## Health & Status

### GET /agent/health

Check AI agent service health.

**Response:**
```json
{
  "status": "operational",
  "model": "claude-3-sonnet-20240229",
  "apiKeyConfigured": true
}
```

---

## Error Responses

All errors return:
```json
{
  "error": "Error message",
  "details": "Additional details (optional)"
}
```

**Status Codes:**
- 200 - Success
- 400 - Bad request
- 401 - Unauthorized
- 404 - Not found
- 500 - Server error

---

## Performance Characteristics

- **Context Assembly:** < 500ms
- **LLM Response:** 2-5s (streaming: real-time chunks)
- **Risk Scan:** 1-3s per project
- **Proposal Creation:** < 1s

---

## Rate Limits

- Chat: 20 requests/minute per user
- Risk Scan: 5 requests/hour per project
- Proposals: 10 requests/minute per user

---

## Implementation Details

### Streaming Architecture

The streaming endpoint uses Server-Sent Events (SSE) for real-time responses:

1. **Session Creation** - Immediate session ID returned
2. **Context Assembly** - PKG and RAG context gathered
3. **LLM Streaming** - Responses streamed token-by-token
4. **Session Completion** - Final audit log and cost tracking

### Context Assembly Strategy

The AI agent assembles context from multiple sources:

- **PKG (Project Knowledge Graph)** - Tasks, dependencies, risks, decisions
- **RAG (Retrieval-Augmented Generation)** - Documents, meeting transcripts, evidence
- **Historical Data** - Previous sessions, patterns, trends

### AI Provenance Tracking

All AI-generated content tracks:
- Source model and version
- Confidence scores
- Input tokens and context
- Session audit trail
- Cost attribution

---

## Example Usage

### JavaScript/TypeScript Client

```javascript
// Streaming chat
const eventSource = new EventSource(
  `/api/aipm/projects/1/agent/chat/stream?prompt=${encodeURIComponent('What are the risks?')}`
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'chunk':
      console.log(data.text); // Stream response
      break;
    case 'complete':
      eventSource.close();
      break;
    case 'error':
      console.error(data.message);
      eventSource.close();
      break;
  }
};

// Non-streaming chat
const response = await fetch('/api/aipm/projects/1/agent/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: 'What are the highest priority tasks?',
    agentType: 'knowledge_explorer'
  })
});

const data = await response.json();
console.log(data.response);
```

### Risk Scanning

```javascript
// Scan for risks with auto-create
const response = await fetch('/api/aipm/projects/1/agent/scan-risks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ autoCreateHighConfidence: true })
});

const { detected, autoCreated, proposals } = await response.json();
console.log(`Detected ${detected.length} risks`);
console.log(`Auto-created ${autoCreated.length} high-confidence risks`);
console.log(`Created ${proposals.length} proposals for review`);
```

### Decision Proposals

```javascript
// Propose a decision
const response = await fetch('/api/aipm/projects/1/agent/propose-decision', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Adopt GraphQL for API layer',
    description: 'Replace REST with GraphQL',
    decision_type: 'architectural',
    impact_level: 'high',
    rationale: 'Better client flexibility'
  })
});

const { proposal, analysis, alternatives } = await response.json();

// Approve or reject
await fetch(`/api/aipm/agent/proposals/${proposal.proposalId}/approve`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ reviewNotes: 'Approved with modifications' })
});
```

---

## Security Considerations

- All endpoints require JWT authentication
- Rate limiting prevents abuse
- AI responses are audited
- Sensitive data is not logged
- API keys are never exposed in responses

---

## Cost Tracking

All AI operations track costs:
- Input/output tokens
- Model pricing
- Session attribution
- User/project rollup

Query cost analytics:
```sql
SELECT 
  model_used,
  SUM(tokens_used) as total_tokens,
  SUM(cost_usd) as total_cost
FROM ai_cost_tracking
WHERE project_id = 1
GROUP BY model_used;
```
