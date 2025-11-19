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
            <button id="send-btn">Send</button>
            <button id="scan-risks-btn">🔍 Scan Risks</button>
          </div>
        </div>

        <div class="agent-insights">
          <h3>Recent Insights</h3>
          <div id="recent-sessions"></div>
        </div>
      </div>
    `;

    this.loadRecentSessions();

    // Add event listeners using proper DOM event handlers (not inline onclick)
    document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
    document.getElementById('scan-risks-btn').addEventListener('click', () => this.scanRisks());
    
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
      try {
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
      } catch (e) {
        console.error('Failed to parse SSE message:', e);
      }
    };

    this.eventSource.addEventListener('error', (event) => {
      try {
        const data = JSON.parse(event.data);
        this.updateMessage(loadingMessageId, '❌ Error: ' + data.message);
      } catch (e) {
        this.updateMessage(loadingMessageId, '❌ Connection error occurred');
      }
      this.eventSource.close();
    });

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      this.updateMessage(loadingMessageId, '❌ Connection lost');
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

// Export for global use
if (typeof window !== 'undefined') {
  window.AIAgentDashboard = AIAgentDashboard;
  window.aiDashboard = null; // Will be initialized by the page
}
