/**
 * Document Library Management
 * Handles document listing, viewing, downloading, and deletion
 */

class DocumentLibrary {
  constructor() {
    this.currentProjectId = null;
    this.documents = [];
    this.filters = {
      projectId: null,
      sourceType: null,
      search: ''
    };
    this.currentPage = 1;
    this.totalPages = 1;
    this.pageSize = 50;
    this.cache = new Map();  // Client-side cache
  }

  async init() {
    this.loadFiltersFromURL();
    await this.loadCurrentProject();
    await this.loadDocuments();
    this.attachEventListeners();
    this.setupKeyboardShortcuts();
    this.setupViewDropdown();
  }

  /**
   * Load filters from URL query params for bookmarking/sharing
   */
  loadFiltersFromURL() {
    const params = new URLSearchParams(window.location.search);
    this.filters.sourceType = params.get('type') || null;
    this.filters.search = params.get('search') || '';
    this.currentPage = parseInt(params.get('page')) || 1;
    
    // Update UI to reflect loaded filters
    if (this.filters.sourceType) {
      const typeFilter = document.getElementById('type-filter');
      if (typeFilter) typeFilter.value = this.filters.sourceType;
    }
    if (this.filters.search) {
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.value = this.filters.search;
    }
  }

  /**
   * Save filters to URL for bookmarking/sharing
   */
  saveFiltersToURL() {
    const params = new URLSearchParams();
    if (this.filters.sourceType) params.set('type', this.filters.sourceType);
    if (this.filters.search) params.set('search', this.filters.search);
    if (this.currentPage > 1) params.set('page', this.currentPage);
    
    const newURL = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newURL);
  }

  /**
   * Load current project from cookie or URL
   */
  async loadCurrentProject() {
    // Try URL parameter first
    const urlParams = new URLSearchParams(window.location.search);
    let projectId = urlParams.get('projectId');
    
    // Fallback to cookie
    if (!projectId) {
      projectId = this.getProjectIdFromCookie();
    }
    
    if (!projectId) {
      // No project selected - show project selector
      document.getElementById('project-name').textContent = 'No project selected - Please select a project from the main page';
      document.getElementById('documents-container').innerHTML = `
        <div class="text-center py-12">
          <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
          </svg>
          <p class="text-gray-600 text-lg mb-4">No project selected</p>
          <button onclick="window.location.href='/index.html'" class="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
            Select a Project
          </button>
        </div>
      `;
      return;
    }
    
    this.currentProjectId = projectId;

    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const project = await response.json();
        document.getElementById('project-name').textContent = project.name;
      }
    } catch (error) {
      console.error('Error loading project:', error);
      document.getElementById('project-name').textContent = 'Error loading project';
    }
  }

  /**
   * Load documents with caching and loading states
   */
  async loadDocuments() {
    // Don't load documents if no project is selected
    if (!this.currentProjectId) {
      return;
    }

    this.showLoadingState();

    // Check cache first
    const cacheKey = `docs:${this.currentProjectId}:${JSON.stringify(this.filters)}:${this.currentPage}`;
    if (this.cache.has(cacheKey)) {
      this.documents = this.cache.get(cacheKey).documents;
      this.totalPages = this.cache.get(cacheKey).totalPages;
      this.renderDocuments();
      this.renderPagination();
      this.hideLoadingState();
      return;
    }

    try {
      const params = new URLSearchParams();
      if (this.filters.sourceType) params.append('source_type', this.filters.sourceType);
      if (this.filters.search) params.append('search', this.filters.search);
      
      const offset = (this.currentPage - 1) * this.pageSize;
      params.append('limit', this.pageSize);
      params.append('offset', offset);

      const response = await fetch(`/api/projects/${this.currentProjectId}/documents?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      this.documents = data.documents;
      this.totalPages = Math.ceil(data.total / this.pageSize);

      // Cache results (1 minute TTL)
      this.cache.set(cacheKey, { documents: this.documents, totalPages: this.totalPages });
      setTimeout(() => this.cache.delete(cacheKey), 60000);

      this.renderDocuments();
      this.renderPagination();
      this.saveFiltersToURL();

    } catch (error) {
      console.error('Error loading documents:', error);
      this.showError('Failed to load documents. Please try again.');
    } finally {
      this.hideLoadingState();
    }
  }

  /**
   * Show loading state
   */
  showLoadingState() {
    const container = document.getElementById('documents-container');
    container.innerHTML = `
      <div class="flex items-center justify-center py-12">
        <div class="loading-spinner"></div>
        <span class="ml-3 text-gray-600">Loading documents...</span>
      </div>
    `;
  }

  /**
   * Hide loading state
   */
  hideLoadingState() {
    // Loading state removed when renderDocuments() is called
  }

  /**
   * Show error message
   */
  showError(message) {
    const container = document.getElementById('documents-container');
    container.innerHTML = `
      <div class="text-center py-12">
        <p class="text-red-600 text-xl mb-2">⚠️ Error</p>
        <p class="text-gray-600">${this.escapeHtml(message)}</p>
      </div>
    `;
  }

  /**
   * Render documents list
   */
  renderDocuments() {
    const container = document.getElementById('documents-container');
    
    if (this.documents.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-gray-500">
          <p class="text-xl mb-2">📄 No documents found</p>
          <p>Upload documents to get started</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.documents.map(doc => this.renderDocumentCard(doc)).join('');
  }

  /**
   * Render individual document card
   */
  renderDocumentCard(doc) {
    const icon = getDocTypeIcon(doc.sourceType);
    const label = getDocTypeLabel(doc.sourceType);
    const badgeClass = getDocTypeBadgeClass(doc.sourceType);
    
    return `
      <div class="document-card" data-doc-id="${doc.id}">
        <div class="document-card-header">
          <div class="flex-1">
            <h3 class="document-title">
              ${icon} ${this.escapeHtml(doc.title)}
            </h3>
            <div class="document-meta">
              <span class="document-type-badge ${badgeClass}">${label}</span>
              <span>📅 ${this.formatDate(doc.createdAt)}</span>
              <span>👤 ${this.escapeHtml(doc.uploadedBy.name)}</span>
              <span>📊 ${doc.wordCount ? doc.wordCount.toLocaleString() : 0} words</span>
            </div>
            ${doc.preview ? `<p class="text-gray-600 text-sm mt-2">${this.escapeHtml(doc.preview)}...</p>` : ''}
          </div>
        </div>

        ${this.renderLinkedEntities(doc.linkedEntities)}

        <div class="document-actions">
          <button onclick="documentLibrary.viewDocument('${doc.id}')" 
                  class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
            👁️ View
          </button>
          <button onclick="documentLibrary.downloadDocument('${doc.id}')" 
                  class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition">
            📥 Download
          </button>
          <button onclick="documentLibrary.deleteDocument('${doc.id}')" 
                  class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition">
            🗑️ Delete
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render linked entities
   */
  renderLinkedEntities(entities) {
    if (!entities || Object.keys(entities).length === 0) {
      return '<div class="linked-entities text-gray-500">No linked entities</div>';
    }

    const links = [];
    if (entities.meetings) links.push(`${entities.meetings} Meeting(s)`);
    if (entities.decisions) links.push(`${entities.decisions} Decision(s)`);
    if (entities.issues) links.push(`${entities.issues} Issue(s)`);
    if (entities.total) links.push(`${entities.total} Total`);

    return `
      <div class="linked-entities">
        <strong>Created from this document:</strong> ${links.join(' • ')}
      </div>
    `;
  }

  /**
   * Render pagination controls
   */
  renderPagination() {
    const container = document.getElementById('pagination-controls');
    if (!container || this.totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <button 
        class="pagination-button ${this.currentPage === 1 ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}"
        ${this.currentPage === 1 ? 'disabled' : ''}
        onclick="documentLibrary.prevPage()">
        ← Previous
      </button>
      <span class="px-4 py-2 text-gray-700">
        Page ${this.currentPage} of ${this.totalPages}
      </span>
      <button 
        class="pagination-button ${this.currentPage === this.totalPages ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}"
        ${this.currentPage === this.totalPages ? 'disabled' : ''}
        onclick="documentLibrary.nextPage()">
        Next →
      </button>
    `;
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadDocuments();
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadDocuments();
    }
  }

  /**
   * View document in modal
   */
  async viewDocument(docId) {
    try {
      const response = await fetch(`/api/documents/${docId}`);
      if (!response.ok) throw new Error('Failed to load document');
      
      const doc = await response.json();
      this.showDocumentModal(doc);
      
    } catch (error) {
      console.error('Error viewing document:', error);
      alert(`Failed to view document: ${error.message}`);
    }
  }

  /**
   * Show document modal with XSS protection
   */
  showDocumentModal(doc) {
    const modal = document.getElementById('document-modal');
    const icon = getDocTypeIcon(doc.sourceType);
    const label = getDocTypeLabel(doc.sourceType);
    
    modal.innerHTML = `
      <div class="modal-overlay" onclick="documentLibrary.closeModal()">
        <div class="modal-content" onclick="event.stopPropagation()">
          <div class="modal-header">
            <div>
              <h2 class="text-2xl font-bold">${icon} ${this.escapeHtml(doc.title)}</h2>
              <p class="text-gray-600 mt-1">
                ${label} • ${this.formatDate(doc.createdAt)} • ${doc.wordCount ? doc.wordCount.toLocaleString() : 0} words
              </p>
            </div>
            <button onclick="documentLibrary.closeModal()" class="text-gray-500 hover:text-gray-700 text-2xl">
              ✕
            </button>
          </div>
          <div class="modal-body">
            <div id="modal-content-placeholder"></div>
          </div>
        </div>
      </div>
    `;
    
    // Insert safe content using textContent (XSS protection)
    const contentDiv = document.createElement('div');
    contentDiv.className = 'document-content';
    contentDiv.textContent = doc.content;
    document.getElementById('modal-content-placeholder').appendChild(contentDiv);
    
    modal.classList.remove('hidden');
  }

  closeModal() {
    const modal = document.getElementById('document-modal');
    modal.classList.add('hidden');
  }

  /**
   * Download document with proper error handling
   */
  async downloadDocument(docId) {
    try {
      const response = await fetch(`/api/documents/${docId}/download`);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `document-${docId}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Download error:', error);
      alert(`Failed to download document: ${error.message}`);
    }
  }

  /**
   * Delete document with confirmation
   */
  async deleteDocument(docId) {
    if (!confirm('Are you sure you want to delete this document? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/documents/${docId}`, { 
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        alert('Document deleted successfully');
        // Clear cache and reload
        this.cache.clear();
        this.loadDocuments();
      } else {
        throw new Error(result.error || 'Delete failed');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert(`Failed to delete document: ${error.message}`);
    }
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Search input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.filters.search = e.target.value;
          this.currentPage = 1;
          this.cache.clear();
          this.loadDocuments();
        }, 500);
      });
    }

    // Type filter
    const typeFilter = document.getElementById('type-filter');
    if (typeFilter) {
      typeFilter.addEventListener('change', (e) => {
        this.filters.sourceType = e.target.value || null;
        this.currentPage = 1;
        this.cache.clear();
        this.loadDocuments();
      });
    }

    // Upload button
    const uploadBtn = document.getElementById('upload-btn');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', () => {
        alert('Upload functionality coming soon! For now, use the AI Analysis feature to upload and analyze documents.');
      });
    }
  }

  /**
   * Setup keyboard shortcuts
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Escape closes modal
      if (e.key === 'Escape') {
        const modal = document.getElementById('document-modal');
        if (modal && !modal.classList.contains('hidden')) {
          this.closeModal();
        }
      }

      // Ctrl+K focuses search
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        document.getElementById('search-input').focus();
      }
    });
  }

  /**
   * Setup view dropdown navigation
   */
  setupViewDropdown() {
    const viewDropdown = document.getElementById('view-dropdown');
    if (viewDropdown) {
      viewDropdown.addEventListener('change', (e) => {
        const view = e.target.value;
        const projectId = this.getProjectIdFromCookie();
        
        if (view === 'projects') {
          window.location.href = '/index.html';
        } else if (view === 'checklists') {
          window.location.href = `/checklists.html?projectId=${projectId}`;
        } else if (view === 'documents') {
          // Already on documents page
        } else if (view === 'ai-agent') {
          window.location.href = `/ai-agent.html?projectId=${projectId}`;
        } else if (view === 'proposals') {
          window.location.href = `/proposals.html?projectId=${projectId}`;
        }
      });
    }
  }

  /**
   * Helper: Get project ID from cookie
   */
  getProjectIdFromCookie() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'selectedProjectId') {
        return value;
      }
    }
    return null;
  }

  /**
   * Helper: Format date
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Helper: XSS protection
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize on page load
const documentLibrary = new DocumentLibrary();
document.addEventListener('DOMContentLoaded', () => documentLibrary.init());
