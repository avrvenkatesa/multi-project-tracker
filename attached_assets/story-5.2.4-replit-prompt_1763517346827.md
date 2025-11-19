# Story 5.2.4: AI Agent API & Integration - Replit Implementation Guide

## 🎯 Objective
Complete the AI Agent implementation with streaming responses, comprehensive API documentation, UI integration components, and final system integration.

---

## 📋 Prerequisites

Before starting, verify Stories 5.2.1-5.2.3 are complete:
- ✅ AI agent core engine operational
- ✅ Autonomous decision making working
- ✅ Proactive risk detection functional

---

## 🏗️ Implementation Tasks

### **Task 1: Add Streaming Support for Real-Time Responses**

**File: `services/aiAgentStreaming.js`**

```javascript
const { pool } = require('../db');
const aiAgentService = require('./aiAgent');

/**
 * AI Agent Streaming Service
 * Provides real-time streaming responses for better UX
 */

class AIAgentStreaming {
  /**
   * Stream chat response in real-time
   */
  async streamChatResponse({ projectId, userId, prompt, agentType, responseStream }) {
    try {
      // 1. Create session
      const session = await aiAgentService.createSession({
        projectId,
        userId,
        agentType,
        userPrompt: prompt
      });

      // Send session ID immediately
      responseStream.write(`data: ${JSON.stringify({ type: 'session', sessionId: session.session_id })}\n\n`);

      // 2. Assemble context
      responseStream.write(`data: ${JSON.stringify({ type: 'status', message: 'Assembling context...' })}\n\n`);

      const context = await aiAgentService.assembleContext({
        projectId,
        userPrompt: prompt,
        agentType
      });

      responseStream.write(`data: ${JSON.stringify({
        type: 'context',
        pkgNodes: context.pkgNodes.length,
        ragDocs: context.ragDocuments.length
      })}\n\n`);

      // 3. Call LLM with streaming
      responseStream.write(`data: ${JSON.stringify({ type: 'status', message: 'Generating response...' })}\n\n`);

      const llmResult = await this.streamLLMResponse({
        sessionId: session.session_id,
        context,
        userPrompt: prompt,
        agentType,
        responseStream
      });

      // 4. Complete session
      await aiAgentService.completeSession({
        sessionId: session.session_id,
        response: llmResult.fullResponse,
        confidenceScore: 0.85,
        pkgNodesUsed: context.pkgNodes.map(n => n.id),
        ragDocsUsed: context.ragDocuments.map(d => d.id),
        tokensUsed: llmResult.tokensUsed,
        latency: llmResult.latency
      });

      // Send completion
      responseStream.write(`data: ${JSON.stringify({ type: 'complete', sessionId: session.session_id })}\n\n`);
      responseStream.end();

    } catch (error) {
      console.error('Streaming error:', error);
      responseStream.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      responseStream.end();
    }
  }

  /**
   * Stream LLM response with Server-Sent Events
   */
  async streamLLMResponse({ sessionId, context, userPrompt, agentType, responseStream }) {
    const startTime = Date.now();
    let fullResponse = '';
    let tokensUsed = 0;

    const systemPrompt = aiAgentService.buildSystemPrompt(agentType);
    const contextText = aiAgentService.buildContextText(context);

    try {
      // Stream from Anthropic Claude
      if (aiAgentService.defaultModel.startsWith('claude')) {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': aiAgentService.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: aiAgentService.defaultModel,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: `${contextText}\n\nUser Question: ${userPrompt}`
            }],
            stream: true
          })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);

                if (parsed.type === 'content_block_delta') {
                  const text = parsed.delta?.text || '';
                  fullResponse += text;

                  // Stream to client
                  responseStream.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
                }

                if (parsed.usage) {
                  tokensUsed = parsed.usage.input_tokens + parsed.usage.output_tokens;
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }
      // Stream from OpenAI GPT
      else if (aiAgentService.defaultModel.startsWith('gpt')) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiAgentService.apiKey}`
          },
          body: JSON.stringify({
            model: aiAgentService.defaultModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `${contextText}\n\nUser Question: ${userPrompt}` }
            ],
            max_tokens: 4096,
            stream: true
          })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const text = parsed.choices?.[0]?.delta?.content || '';

                if (text) {
                  fullResponse += text;
                  responseStream.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
                }
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      const latency = Date.now() - startTime;

      // Log to audit
      await aiAgentService.logAction({
        sessionId,
        actionType: 'llm_call_streaming',
        actionDescription: `Streamed response from ${aiAgentService.defaultModel}`,
        inputData: { userPrompt },
        outputData: { responseLength: fullResponse.length, tokensUsed },
        executionTimeMs: latency
      });

      return {
        fullResponse,
        tokensUsed,
        latency
      };

    } catch (error) {
      console.error('LLM streaming error:', error);
      throw error;
    }
  }
}

module.exports = new AIAgentStreaming();
```

---

### **Task 2: Create Streaming API Endpoint**

**File: `routes/aiAgentStreaming.js`**

```javascript
const express = require('express');
const router = express.Router();
const aiAgentStreaming = require('../services/aiAgentStreaming');
const { authenticateToken } = require('../middleware/auth');

/**
 * GET /api/aipm/projects/:projectId/agent/chat/stream
 * Stream AI agent response in real-time (Server-Sent Events)
 */
router.get('/projects/:projectId/agent/chat/stream', authenticateToken, async (req, res) => {
  const { projectId } = req.params;
  const { prompt, agentType = 'knowledge_explorer' } = req.query;
  const userId = req.user.id;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Stream response
  await aiAgentStreaming.streamChatResponse({
    projectId: parseInt(projectId),
    userId,
    prompt,
    agentType,
    responseStream: res
  });
});

module.exports = router;
```

---

### **Task 3: Create AI Agent Dashboard UI Component**

**File: `public/js/components/AIAgentDashboard.js`**

```javascript
class AIAgentDashboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentProjectId = null;
    this.eventSource = null;
  }

  async initialize(projectId) {
    this.currentProjectId = projectId;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="ai-agent-dashboard">
        <div class="agent-header">
          <h2>🤖 AI Project Manager</h2>
          <select id="agent-type-select">
            <option value="knowledge_explorer">Knowledge Explorer</option>
            <option value="decision_assistant">Decision Assistant</option>
            <option value="risk_detector">Risk Detector</option>
            <option value="meeting_analyzer">Meeting Analyzer</option>
          </select>
        </div>

        <div class="chat-container">
          <div id="chat-messages" class="chat-messages"></div>

          <div class="chat-input-container">
            <textarea id="chat-input" placeholder="Ask the AI agent..." rows="3"></textarea>
            <button id="send-btn" onclick="aiDashboard.sendMessage()">Send</button>
            <button id="scan-risks-btn" onclick="aiDashboard.scanRisks()">🔍 Scan Risks</button>
          </div>
        </div>

        <div class="agent-insights">
          <h3>Recent Insights</h3>
          <div id="recent-sessions"></div>
        </div>
      </div>
    `;

    this.loadRecentSessions();

    // Add enter key handler
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }

  async sendMessage() {
    const input = document.getElementById('chat-input');
    const prompt = input.value.trim();

    if (!prompt) return;

    const agentType = document.getElementById('agent-type-select').value;

    // Clear input
    input.value = '';

    // Add user message to chat
    this.addMessage('user', prompt);

    // Add loading indicator
    const loadingId = this.addMessage('assistant', '...', true);

    try {
      // Use streaming endpoint
      await this.streamResponse(prompt, agentType, loadingId);
    } catch (error) {
      console.error('Chat error:', error);
      this.updateMessage(loadingId, 'Error: ' + error.message);
    }
  }

  async streamResponse(prompt, agentType, loadingMessageId) {
    const url = `/api/aipm/projects/${this.currentProjectId}/agent/chat/stream?prompt=${encodeURIComponent(prompt)}&agentType=${agentType}`;

    this.eventSource = new EventSource(url);
    let fullResponse = '';

    this.eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'session') {
        console.log('Session ID:', data.sessionId);
      } else if (data.type === 'status') {
        this.updateMessage(loadingMessageId, data.message + '...');
      } else if (data.type === 'context') {
        this.updateMessage(loadingMessageId, `📊 Context: ${data.pkgNodes} nodes, ${data.ragDocs} documents`);
      } else if (data.type === 'chunk') {
        fullResponse += data.text;
        this.updateMessage(loadingMessageId, fullResponse);
      } else if (data.type === 'complete') {
        this.eventSource.close();
        this.loadRecentSessions(); // Refresh
      } else if (data.type === 'error') {
        this.updateMessage(loadingMessageId, '❌ Error: ' + data.message);
        this.eventSource.close();
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      this.eventSource.close();
    };
  }

  addMessage(role, content, isLoading = false) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageId = 'msg-' + Date.now();

    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.className = `chat-message ${role}`;
    messageDiv.innerHTML = `
      <div class="message-avatar">${role === 'user' ? '👤' : '🤖'}</div>
      <div class="message-content ${isLoading ? 'loading' : ''}">${this.formatMessage(content)}</div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return messageId;
  }

  updateMessage(messageId, content) {
    const messageEl = document.getElementById(messageId);
    if (messageEl) {
      const contentEl = messageEl.querySelector('.message-content');
      contentEl.innerHTML = this.formatMessage(content);
      contentEl.classList.remove('loading');

      // Auto-scroll
      const container = document.getElementById('chat-messages');
      container.scrollTop = container.scrollHeight;
    }
  }

  formatMessage(content) {
    // Basic markdown-like formatting
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  async loadRecentSessions() {
    try {
      const response = await fetch(`/api/aipm/projects/${this.currentProjectId}/agent/sessions?limit=5`);
      const data = await response.json();

      const container = document.getElementById('recent-sessions');
      if (data.sessions.length === 0) {
        container.innerHTML = '<p>No recent sessions</p>';
        return;
      }

      container.innerHTML = data.sessions.map(session => `
        <div class="session-card">
          <div class="session-type">${session.agent_type}</div>
          <div class="session-prompt">${session.user_prompt.substring(0, 100)}...</div>
          <div class="session-meta">
            ${session.confidence_score ? `Confidence: ${(session.confidence_score * 100).toFixed(0)}%` : ''}
            ${new Date(session.created_at).toLocaleString()}
          </div>
        </div>
      `).join('');
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  }

  async scanRisks() {
    const btn = document.getElementById('scan-risks-btn');
    btn.disabled = true;
    btn.textContent = '🔍 Scanning...';

    try {
      const response = await fetch(`/api/aipm/projects/${this.currentProjectId}/agent/scan-risks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoCreateHighConfidence: true })
      });

      const data = await response.json();

      this.addMessage('assistant', `
        ✅ Risk scan complete!\n
        Detected: ${data.detected.length} risks\n
        Auto-created: ${data.autoCreated.length} high-confidence risks\n
        Proposals: ${data.proposals.length} awaiting review
      `);

      this.loadRecentSessions();
    } catch (error) {
      console.error('Risk scan error:', error);
      this.addMessage('assistant', '❌ Risk scan failed: ' + error.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 Scan Risks';
    }
  }
}

// Global instance
const aiDashboard = new AIAgentDashboard('ai-agent-container');
```

---

### **Task 4: Create AI Agent Page**

**File: `public/ai-agent.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Agent - Multi-Project Tracker</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/ai-agent.css">
</head>
<body>
  <nav class="navbar">
    <h1>🤖 AI Project Manager</h1>
    <div class="nav-links">
      <a href="/dashboard.html">Dashboard</a>
      <a href="/decisions.html">Decisions</a>
      <a href="/meetings.html">Meetings</a>
      <a href="/ai-agent.html" class="active">AI Agent</a>
    </div>
  </nav>

  <div class="container">
    <div id="ai-agent-container"></div>
  </div>

  <script src="/js/components/AIAgentDashboard.js"></script>
  <script>
    // Initialize on page load
    document.addEventListener('DOMContentLoaded', () => {
      const projectId = new URLSearchParams(window.location.search).get('projectId') || 1;
      aiDashboard.initialize(projectId);
    });
  </script>
</body>
</html>
```

---

### **Task 5: Create AI Agent CSS**

**File: `public/css/ai-agent.css`**

```css
.ai-agent-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.agent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.agent-header h2 {
  margin: 0;
  font-size: 24px;
}

#agent-type-select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.chat-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 20px;
  margin-bottom: 20px;
}

.chat-messages {
  max-height: 500px;
  overflow-y: auto;
  margin-bottom: 20px;
  padding: 10px;
  border: 1px solid #eee;
  border-radius: 4px;
}

.chat-message {
  display: flex;
  margin-bottom: 15px;
  gap: 10px;
}

.chat-message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  border-radius: 50%;
  flex-shrink: 0;
}

.message-content {
  background: #f9f9f9;
  padding: 12px 16px;
  border-radius: 12px;
  max-width: 70%;
  line-height: 1.5;
}

.chat-message.user .message-content {
  background: #007bff;
  color: white;
}

.message-content.loading {
  font-style: italic;
  color: #888;
}

.chat-input-container {
  display: flex;
  gap: 10px;
}

#chat-input {
  flex: 1;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
}

#send-btn, #scan-risks-btn {
  padding: 12px 24px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

#send-btn:hover, #scan-risks-btn:hover {
  background: #0056b3;
}

#scan-risks-btn {
  background: #28a745;
}

#scan-risks-btn:hover {
  background: #218838;
}

.agent-insights {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  padding: 20px;
}

.agent-insights h3 {
  margin-top: 0;
  font-size: 18px;
}

.session-card {
  padding: 12px;
  border: 1px solid #eee;
  border-radius: 4px;
  margin-bottom: 10px;
  transition: background 0.2s;
}

.session-card:hover {
  background: #f9f9f9;
  cursor: pointer;
}

.session-type {
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
  margin-bottom: 5px;
}

.session-prompt {
  font-size: 14px;
  margin-bottom: 5px;
}

.session-meta {
  font-size: 12px;
  color: #888;
}

.confidence-badge {
  background: #28a745;
  color: white;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
}
```

---

### **Task 6: Register Streaming Routes**

**File: `server.js`**

```javascript
const aiAgentStreamingRoutes = require('./routes/aiAgentStreaming');

app.use('/api/aipm', aiAgentStreamingRoutes);
```

---

### **Task 7: Create Complete API Documentation**

**File: `docs/AI-AGENT-API.md`**

```markdown
# AI Agent API Documentation

Complete reference for AI-powered project management features.

## Base URL

```
http://localhost:3000/api/aipm
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
    "impact_level": "medium"  // Optional
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
  "autoCreateHighConfidence": true  // Auto-create risks with confidence >= 0.9
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
```

---

### **Task 8: Create Integration Tests**

**File: `__tests__/integration/ai-agent.test.js`**

```javascript
const request = require('supertest');
const app = require('../../server');
const { pool } = require('../../db');

describe('AI Agent Integration Tests', () => {
  let authCookie;
  let testProjectId = 1;

  beforeAll(async () => {
    // Login
    const loginResponse = await request(app)
      .post('/api/login')
      .send({ username: 'test-user', password: 'test-password' });

    authCookie = loginResponse.headers['set-cookie'];
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Agent Chat', () => {
    test('POST /api/aipm/projects/:id/agent/chat - sends message', async () => {
      const response = await request(app)
        .post(`/api/aipm/projects/${testProjectId}/agent/chat`)
        .set('Cookie', authCookie)
        .send({
          prompt: 'What are the current risks?',
          agentType: 'risk_detector'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('response');
    }, 30000); // 30s timeout for LLM call
  });

  describe('Decision Making', () => {
    test('POST /api/aipm/projects/:id/agent/propose-decision', async () => {
      const response = await request(app)
        .post(`/api/aipm/projects/${testProjectId}/agent/propose-decision`)
        .set('Cookie', authCookie)
        .send({
          title: 'Test AI Decision',
          description: 'Test description',
          decision_type: 'technical',
          impact_level: 'medium'
        });

      expect(response.status).toBe(200);
      expect(response.body.proposal).toHaveProperty('proposalId');
    }, 30000);
  });

  describe('Risk Detection', () => {
    test('POST /api/aipm/projects/:id/agent/scan-risks', async () => {
      const response = await request(app)
        .post(`/api/aipm/projects/${testProjectId}/agent/scan-risks`)
        .set('Cookie', authCookie)
        .send({ autoCreateHighConfidence: false });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('detected');
      expect(Array.isArray(response.body.detected)).toBe(true);
    }, 30000);
  });
});
```

---

## ✅ Acceptance Criteria

**Streaming:**
- [ ] SSE streaming endpoint working
- [ ] Real-time chunk delivery
- [ ] Error handling in streams

**UI:**
- [ ] AI Agent dashboard page
- [ ] Chat interface with streaming
- [ ] Recent sessions display
- [ ] Risk scan button

**API:**
- [ ] All endpoints documented
- [ ] Health check endpoint
- [ ] Error responses standardized

**Testing:**
- [ ] Integration tests passing
- [ ] Streaming tested
- [ ] End-to-end workflow tested

---

## 🧪 Testing

```bash
# Run integration tests
npm test -- __tests__/integration/ai-agent.test.js

# Test streaming manually
# Open browser console and run:
const es = new EventSource('/api/aipm/projects/1/agent/chat/stream?prompt=test&agentType=knowledge_explorer');
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

---

## 🚀 Story 5.2 Complete!

After Task 8, Story 5.2 is complete:
- ✅ AI agent core engine
- ✅ Autonomous decision making
- ✅ Proactive risk detection
- ✅ Streaming responses
- ✅ Full UI integration

Run automated tests and commit!
