class AIAgentDashboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentProjectId = null;
    this.eventSource = null;
  }

  async initialize(projectId) {
    this.currentProjectId = projectId;
    await this.loadProjectName();
    this.render();
  }

  async loadProjectName() {
    try {
      const response = await fetch(`/api/projects/${this.currentProjectId}`, {
        credentials: 'include'
      });
      const project = await response.json();
      const projectNameEl = document.getElementById('project-name');
      const projectContext = document.getElementById('project-context');
      if (projectNameEl && project.name) {
        projectNameEl.textContent = project.name;
        if (projectContext) {
          projectContext.classList.remove('hidden');
        }
      }
    } catch (error) {
      console.error('Failed to load project name:', error);
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="ai-agent-dashboard">
        <div class="agent-header">
          <div class="agent-controls">
            <select id="agent-type-select">
              <option value="knowledge_explorer">Knowledge Explorer</option>
              <option value="decision_assistant">Decision Assistant</option>
              <option value="risk_detector">Risk Detector</option>
              <option value="meeting_analyzer">Meeting Analyzer</option>
            </select>
            <button id="scan-risks-btn">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              Scan for Risks
            </button>
          </div>
        </div>

        <div class="chat-container">
          <div id="chat-messages" class="chat-messages"></div>

          <div class="chat-input-container">
            <textarea id="chat-input" placeholder="Ask the AI agent..." rows="3"></textarea>
            <button id="send-btn" class="send-icon-btn" title="Send message">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="agent-insights">
          <h3>Recent Insights</h3>
          <div id="recent-sessions"></div>
        </div>

        <!-- Citation Modal -->
        <div id="citation-modal" class="modal hidden">
          <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
              <h2 id="citation-modal-title">Citation Details</h2>
              <button id="close-citation-modal" class="close-btn">&times;</button>
            </div>
            <div class="modal-body" id="citation-modal-body">
              <!-- Citation details populated here -->
            </div>
          </div>
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

    // Add citation modal event listeners
    document.getElementById('close-citation-modal').addEventListener('click', () => this.closeCitationModal());
    
    // Event delegation for citation links (since they're dynamically added)
    document.getElementById('chat-messages').addEventListener('click', (e) => {
      console.log('Click detected on:', e.target);
      console.log('Has citation-link class?', e.target.classList.contains('citation-link'));
      console.log('Target classes:', e.target.className);
      
      if (e.target.classList.contains('citation-link')) {
        e.preventDefault();
        console.log('✅ Citation link clicked!');
        const citationData = e.target.dataset.citation;
        console.log('Citation data:', citationData);
        if (citationData) {
          try {
            const citation = JSON.parse(citationData);
            console.log('Parsed citation:', citation);
            this.showCitationModal(citation);
          } catch (err) {
            console.error('Failed to parse citation data:', err);
          }
        } else {
          console.error('⚠️ No citation data found on element');
        }
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
    let sessionId = null;
    let citations = [];

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'session') {
          console.log('Session ID:', data.sessionId);
          sessionId = data.sessionId;
        } else if (data.type === 'status') {
          this.updateMessage(loadingMessageId, data.message + '...');
        } else if (data.type === 'context') {
          this.updateMessage(loadingMessageId, `📊 Context: ${data.pkgNodes} nodes, ${data.ragDocs} documents`);
        } else if (data.type === 'chunk') {
          fullResponse += data.text;
          this.updateMessage(loadingMessageId, fullResponse);
        } else if (data.type === 'complete') {
          console.log('Response complete, waiting for citations...');
        } else if (data.type === 'citations') {
          // ENHANCED: Citations received as separate event
          citations = data.citations || [];
          console.log('Citations received:', citations.length);
          this.updateMessage(loadingMessageId, fullResponse, sessionId, citations);
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

  addMessage(role, content, isLoading = false, sessionId = null) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageId = 'msg-' + Date.now();

    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.className = `chat-message ${role}`;
    
    const actionButtons = role === 'assistant' && !isLoading ? `
      <div class="message-actions">
        <button class="copy-btn" data-message-id="${messageId}" title="Copy response">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
        </button>
        <button class="feedback-btn thumbs-up" data-message-id="${messageId}" data-session-id="${sessionId || ''}" data-feedback="positive" title="Helpful response">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"/>
          </svg>
        </button>
        <button class="feedback-btn thumbs-down" data-message-id="${messageId}" data-session-id="${sessionId || ''}" data-feedback="negative" title="Unhelpful response">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"/>
          </svg>
        </button>
      </div>
    ` : '';
    
    messageDiv.innerHTML = `
      <div class="message-avatar">${role === 'user' ? '👤' : '🤖'}</div>
      <div class="message-wrapper">
        <div class="message-content ${isLoading ? 'loading' : ''}">${this.formatMessage(content)}</div>
        ${actionButtons}
      </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Add event listeners for action buttons
    if (role === 'assistant' && !isLoading) {
      this.attachMessageActionListeners(messageId, sessionId);
    }

    return messageId;
  }

  updateMessage(messageId, content, sessionId = null, citations = []) {
    const messageEl = document.getElementById(messageId);
    if (messageEl) {
      const contentEl = messageEl.querySelector('.message-content');
      contentEl.innerHTML = this.formatMessage(content, citations);
      contentEl.classList.remove('loading');

      // ENHANCED: Show citation count badge if citations are present
      if (citations && citations.length > 0) {
        const wrapper = messageEl.querySelector('.message-wrapper');
        const existingBadge = wrapper.querySelector('.citation-count-badge');
        if (!existingBadge) {
          const badge = document.createElement('span');
          badge.className = 'citation-count-badge';
          badge.textContent = `${citations.length} source${citations.length > 1 ? 's' : ''} cited`;
          wrapper.insertBefore(badge, contentEl);
        }
      }

      // Add action buttons if sessionId is provided and buttons don't exist yet
      if (sessionId) {
        const wrapper = messageEl.querySelector('.message-wrapper');
        if (wrapper && !wrapper.querySelector('.message-actions')) {
          const actionButtons = `
            <div class="message-actions">
              <button class="copy-btn" data-message-id="${messageId}" title="Copy response">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
              </button>
              <button class="feedback-btn thumbs-up" data-message-id="${messageId}" data-session-id="${sessionId}" data-feedback="positive" title="Helpful response">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"/>
                </svg>
              </button>
              <button class="feedback-btn thumbs-down" data-message-id="${messageId}" data-session-id="${sessionId}" data-feedback="negative" title="Unhelpful response">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5"/>
                </svg>
              </button>
            </div>
          `;
          wrapper.insertAdjacentHTML('beforeend', actionButtons);
          this.attachMessageActionListeners(messageId, sessionId);
        }
      }

      // Auto-scroll
      const container = document.getElementById('chat-messages');
      container.scrollTop = container.scrollHeight;
    }
  }

  /**
   * ENHANCED: Format message with clickable citations
   */
  formatMessage(content, citations = []) {
    // Handle null/undefined content
    if (!content) {
      return '<em class="text-gray-500">No content available</em>';
    }
    
    // Basic markdown-like formatting
    let formatted = content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    // ENHANCED: Replace citation references with clickable links
    if (citations && citations.length > 0) {
      citations.forEach(citation => {
        const citationText = `[Source: ${citation.sourceRef}]`;
        const escapedText = this.escapeRegex(citationText);
        const citationLink = this.buildCitationLink(citation);
        formatted = formatted.replace(new RegExp(escapedText, 'g'), citationLink);
      });
    }

    return formatted;
  }

  /**
   * Build clickable citation link (URLs pre-built and validated by backend)
   */
  buildCitationLink(citation) {
    // ENHANCED: Use data attributes for modal popup instead of direct links
    const citationData = this.escapeHtml(JSON.stringify(citation));
    return `<a href="#" class="citation-link" data-citation='${citationData}' title="${this.escapeHtml(citation.tooltip)}">[Source: ${this.escapeHtml(citation.sourceRef)}]</a>`;
  }

  /**
   * Escape regex special characters
   */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Escape HTML for XSS protection
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  attachMessageActionListeners(messageId, sessionId) {
    // Copy button
    const copyBtn = document.querySelector(`[data-message-id="${messageId}"].copy-btn`);
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copyMessage(messageId));
    }

    // Feedback buttons
    const thumbsUp = document.querySelector(`[data-message-id="${messageId}"].thumbs-up`);
    const thumbsDown = document.querySelector(`[data-message-id="${messageId}"].thumbs-down`);
    
    if (thumbsUp) {
      thumbsUp.addEventListener('click', () => this.submitFeedback(sessionId, 'positive', messageId));
    }
    if (thumbsDown) {
      thumbsDown.addEventListener('click', () => this.submitFeedback(sessionId, 'negative', messageId));
    }
  }

  copyMessage(messageId) {
    const messageEl = document.getElementById(messageId);
    if (!messageEl) return;

    const contentEl = messageEl.querySelector('.message-content');
    if (!contentEl) return;

    // Get plain text (strip HTML)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = contentEl.innerHTML;
    const text = tempDiv.textContent || tempDiv.innerText || '';

    // Copy to clipboard
    navigator.clipboard.writeText(text).then(() => {
      // Visual feedback
      const copyBtn = messageEl.querySelector('.copy-btn');
      if (copyBtn) {
        copyBtn.innerHTML = `
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
        `;
        setTimeout(() => {
          copyBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          `;
        }, 2000);
      }
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  async submitFeedback(sessionId, feedbackType, messageId) {
    if (!sessionId) {
      console.warn('No session ID available for feedback');
      return;
    }

    try {
      const response = await fetch('/api/aipm/agent/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          sessionId,
          feedbackType,
          projectId: this.currentProjectId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      // Visual feedback
      const messageEl = document.getElementById(messageId);
      if (messageEl) {
        const thumbsUp = messageEl.querySelector('.thumbs-up');
        const thumbsDown = messageEl.querySelector('.thumbs-down');
        
        if (feedbackType === 'positive') {
          thumbsUp?.classList.add('active');
          thumbsDown?.classList.remove('active');
        } else {
          thumbsDown?.classList.add('active');
          thumbsUp?.classList.remove('active');
        }
      }

      console.log(`Feedback submitted: ${feedbackType}`);
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  }

  /**
   * Fetch citations for a session (for loading historical messages)
   * Citations are also delivered via SSE during streaming
   */
  async fetchSessionCitations(sessionId) {
    try {
      const response = await fetch(`/api/aipm/sessions/${sessionId}/citations`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch session citations');
      }

      const data = await response.json();
      return data.citations || [];
    } catch (error) {
      console.error('Error fetching session citations:', error);
      return [];
    }
  }

  async loadRecentSessions() {
    try {
      const response = await fetch(`/api/aipm/projects/${this.currentProjectId}/agent/sessions?limit=5`);
      const data = await response.json();

      const container = document.getElementById('recent-sessions');
      if (data.sessions.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No recent sessions</p>';
        return;
      }

      container.innerHTML = data.sessions.map(session => `
        <div class="session-card" data-session-id="${session.session_id}" data-agent-type="${session.agent_type}" style="cursor: pointer;">
          <div class="session-type">${this.formatAgentType(session.agent_type)}</div>
          <div class="session-prompt">${session.user_prompt.substring(0, 100)}...</div>
          <div class="session-meta">
            ${session.confidence_score ? `Confidence: ${(session.confidence_score * 100).toFixed(0)}%` : ''}
            <span class="text-gray-400">•</span>
            ${new Date(session.created_at).toLocaleString()}
          </div>
        </div>
      `).join('');

      // Add click handlers to session cards
      container.querySelectorAll('.session-card').forEach(card => {
        card.addEventListener('click', () => {
          const sessionId = card.dataset.sessionId;
          const agentType = card.dataset.agentType;
          this.loadSession(sessionId, agentType);
        });
      });
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  }

  formatAgentType(type) {
    const typeNames = {
      'knowledge_explorer': '💡 Knowledge Explorer',
      'decision_assistant': '🎯 Decision Assistant',
      'risk_detector': '⚠️ Risk Detector',
      'meeting_analyzer': '📊 Meeting Analyzer'
    };
    return typeNames[type] || type;
  }

  async loadSession(sessionId, agentType) {
    try {
      // Clear current chat
      const chatMessages = document.getElementById('chat-messages');
      chatMessages.innerHTML = '<div class="loading-session">Loading conversation...</div>';

      // Fetch session details and citations in parallel
      const [sessionResponse, citations] = await Promise.all([
        fetch(`/api/aipm/agent/sessions/${sessionId}`, {
          credentials: 'include'
        }),
        this.fetchSessionCitations(sessionId)
      ]);

      if (!sessionResponse.ok) {
        throw new Error('Failed to load session');
      }

      const data = await sessionResponse.json();
      const session = data.session;

      // Validate session data
      if (!session) {
        throw new Error('Session data not found');
      }

      // Clear chat and display the session
      chatMessages.innerHTML = '';

      // Set the agent type
      const agentTypeSelect = document.getElementById('agent-type-select');
      if (agentTypeSelect) {
        agentTypeSelect.value = agentType;
      }

      // Display user message
      this.addMessage('user', session.user_prompt || 'No prompt available');

      // Display AI response with citations
      const messageId = this.addMessage('assistant', session.agent_response || 'Response not available', false, sessionId);
      
      // Update message with citations if available
      if (citations && citations.length > 0) {
        this.updateMessage(messageId, session.agent_response, sessionId, citations);
      }

      // Scroll to bottom
      chatMessages.scrollTop = chatMessages.scrollHeight;

      console.log(`✅ Loaded session ${sessionId} with ${citations.length} citations`);
    } catch (error) {
      console.error('Error loading session:', error);
      const chatMessages = document.getElementById('chat-messages');
      chatMessages.innerHTML = '<div class="error-message">❌ Failed to load conversation. Please try again.</div>';
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

  /**
   * Show citation details in modal
   */
  showCitationModal(citation) {
    console.log('🎯 showCitationModal called with:', citation);
    
    const modal = document.getElementById('citation-modal');
    const modalBody = document.getElementById('citation-modal-body');
    const modalTitle = document.getElementById('citation-modal-title');

    console.log('Modal element:', modal);
    console.log('Modal body:', modalBody);
    console.log('Modal title:', modalTitle);
    console.log('Modal current classes:', modal?.className);

    // Set modal title
    modalTitle.textContent = citation.sourceRef || 'Citation Details';

    // Build modal content based on citation type
    let content = `
      <div class="citation-details">
        <div class="citation-field">
          <strong>Source:</strong>
          <span>${this.escapeHtml(citation.title || citation.sourceRef)}</span>
        </div>
    `;

    if (citation.nodeType) {
      content += `
        <div class="citation-field">
          <strong>Type:</strong>
          <span>${this.escapeHtml(citation.nodeType)}</span>
        </div>
      `;
    }

    if (citation.sourceType) {
      content += `
        <div class="citation-field">
          <strong>Document Type:</strong>
          <span>${this.escapeHtml(citation.sourceType)}</span>
        </div>
      `;
    }

    if (citation.tooltip) {
      content += `
        <div class="citation-field">
          <strong>Description:</strong>
          <span>${this.escapeHtml(citation.tooltip)}</span>
        </div>
      `;
    }

    // Add view link if URL exists and points to valid pages
    const validPages = ['/risks.html', '/documents.html', '/issues.html', '/meetings.html', '/decisions.html'];
    const isValidUrl = citation.url && citation.url.startsWith('/') && 
                       validPages.some(page => citation.url.includes(page));
    
    if (isValidUrl) {
      content += `
        <div class="citation-actions" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">
          <a href="${this.escapeHtml(citation.url)}" target="_blank" rel="noopener noreferrer" class="btn-primary">
            View Full Details →
          </a>
        </div>
      `;
    }

    content += `</div>`;
    modalBody.innerHTML = content;

    console.log('About to show modal...');
    console.log('Modal classes before remove:', modal.className);
    
    // Show modal
    modal.classList.remove('hidden');
    
    console.log('Modal classes after remove:', modal.className);
    console.log('✅ Modal should now be visible!');
  }

  /**
   * Close citation modal
   */
  closeCitationModal() {
    const modal = document.getElementById('citation-modal');
    modal.classList.add('hidden');
  }
}

// Export for global use
if (typeof window !== 'undefined') {
  window.AIAgentDashboard = AIAgentDashboard;
  window.aiDashboard = null; // Will be initialized by the page
}
