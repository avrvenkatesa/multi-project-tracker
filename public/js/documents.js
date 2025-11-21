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
    await this.loadAvailableProjects();
    await this.loadCurrentProject();
    await this.loadDocuments();
    this.attachEventListeners();
    this.setupKeyboardShortcuts();
    this.setupViewDropdown();
  }

  /**
   * Load available projects and populate dropdown
   */
  async loadAvailableProjects() {
    try {
      const response = await fetch('/api/projects', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) throw new Error('Failed to fetch projects');
      
      const projects = await response.json();
      const selector = document.getElementById('project-selector');
      
      if (!selector) return;
      
      // Clear existing options except the first one
      selector.innerHTML = '<option value="">Select a project...</option>';
      
      // Populate with available projects
      projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.id;
        option.textContent = project.name;
        selector.appendChild(option);
      });
      
    } catch (error) {
      console.error('Error loading projects:', error);
    }
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
    
    const selector = document.getElementById('project-selector');
    
    if (!projectId) {
      // No project selected - show helpful message
      if (selector) selector.value = '';
      document.getElementById('documents-container').innerHTML = `
        <div class="text-center py-12">
          <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
          </svg>
          <p class="text-gray-600 text-lg mb-4">No project selected</p>
          <p class="text-gray-500">Please select a project from the dropdown above</p>
        </div>
      `;
      return;
    }
    
    this.currentProjectId = projectId;
    
    // Set the dropdown value to current project
    if (selector) {
      selector.value = projectId;
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

      const response = await fetch(`/api/projects/${this.currentProjectId}/documents?${params}`, {
        credentials: 'include'
      });
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
          <button data-action="view" data-doc-id="${doc.id}"
                  class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
            👁️ View
          </button>
          <button data-action="download" data-doc-id="${doc.id}"
                  class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition">
            📥 Download
          </button>
          <button data-action="delete" data-doc-id="${doc.id}"
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
        data-action="prev-page">
        ← Previous
      </button>
      <span class="px-4 py-2 text-gray-700">
        Page ${this.currentPage} of ${this.totalPages}
      </span>
      <button 
        class="pagination-button ${this.currentPage === this.totalPages ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}"
        ${this.currentPage === this.totalPages ? 'disabled' : ''}
        data-action="next-page">
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
      const response = await fetch(`/api/documents/${docId}`, {
        credentials: 'include'
      });
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
    
    // Use inline Tailwind classes (CDN doesn't process @apply in CSS files)
    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div class="p-6 border-b flex justify-between items-start">
          <div>
            <h2 class="text-2xl font-bold">${icon} ${this.escapeHtml(doc.title)}</h2>
            <p class="text-gray-600 mt-1">
              ${label} • ${this.formatDate(doc.createdAt)} • ${doc.wordCount ? doc.wordCount.toLocaleString() : 0} words
            </p>
          </div>
          <button data-modal-action="close" class="text-gray-500 hover:text-gray-700 text-2xl">
            ✕
          </button>
        </div>
        <div class="p-6 overflow-y-auto max-h-[60vh]">
          <div id="modal-content-placeholder"></div>
        </div>
      </div>
    `;
    
    // Insert safe content using textContent (XSS protection)
    const contentDiv = document.createElement('div');
    contentDiv.className = 'whitespace-pre-wrap font-mono text-sm bg-gray-50 p-4 rounded';
    contentDiv.textContent = doc.content;
    document.getElementById('modal-content-placeholder').appendChild(contentDiv);
    
    // Add event listeners for modal actions
    const closeBtn = modal.querySelector('[data-modal-action="close"]');
    const modalContent = modal.querySelector('.bg-white');
    
    // Close on overlay click (clicking outside modal content)
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeModal();
      }
    });
    
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeModal());
    }
    
    if (modalContent) {
      modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
    
    modal.classList.remove('hidden');
  }

  closeModal() {
    const modal = document.getElementById('document-modal');
    modal.classList.add('hidden');
  }

  /**
   * Show upload modal
   */
  showUploadModal() {
    if (!this.currentProjectId) {
      alert('Please select a project first');
      return;
    }
    
    const modal = document.getElementById('upload-modal');
    const form = document.getElementById('upload-form');
    const titleInput = document.getElementById('document-title');
    const fileInput = document.getElementById('file-input');
    const progressDiv = document.getElementById('upload-progress');
    const submitBtn = document.getElementById('submit-upload-btn');
    
    // Reset form
    if (form) form.reset();
    if (titleInput) titleInput.value = '';
    if (fileInput) fileInput.value = '';
    if (progressDiv) progressDiv.classList.add('hidden');
    if (submitBtn) submitBtn.disabled = false;
    
    modal.classList.remove('hidden');
  }

  /**
   * Close upload modal
   */
  closeUploadModal() {
    const modal = document.getElementById('upload-modal');
    const form = document.getElementById('upload-form');
    modal.classList.add('hidden');
    if (form) form.reset();
  }

  /**
   * Handle file upload
   */
  async handleFileUpload() {
    const fileInput = document.getElementById('file-input');
    const titleInput = document.getElementById('document-title');
    const progressDiv = document.getElementById('upload-progress');
    const progressBar = document.getElementById('upload-progress-bar');
    const statusText = document.getElementById('upload-status');
    const submitBtn = document.getElementById('submit-upload-btn');
    
    const file = fileInput.files[0];
    if (!file) {
      alert('Please select a file');
      submitBtn.disabled = false;
      return;
    }

    // Validate file size (50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert('File size must be less than 50MB');
      submitBtn.disabled = false;
      return;
    }

    try {
      // Show progress
      progressDiv.classList.remove('hidden');
      progressBar.style.width = '0%';
      statusText.textContent = 'Uploading...';
      submitBtn.disabled = true;

      // Create FormData
      const formData = new FormData();
      formData.append('file', file);
      if (titleInput.value.trim()) {
        formData.append('title', titleInput.value.trim());
      }

      // Upload with progress tracking
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          progressBar.style.width = percentComplete + '%';
          statusText.textContent = `Uploading... ${Math.round(percentComplete)}%`;
        }
      });

      xhr.addEventListener('load', async () => {
        if (xhr.status === 200) {
          const result = JSON.parse(xhr.responseText);
          statusText.textContent = 'Processing document...';
          progressBar.style.width = '100%';
          
          // Wait a bit to show success, then reset UI and close
          setTimeout(async () => {
            progressDiv.classList.add('hidden');
            submitBtn.disabled = false;
            fileInput.value = ''; // Clear file input for next upload
            this.closeUploadModal();
            // Clear cache before reloading to ensure new document appears
            this.cache.clear();
            // Guard against navigation/project switch during delay
            if (this.currentProjectId) {
              await this.loadDocuments();
            }
            alert('✅ Document uploaded successfully!');
          }, 500);
        } else {
          // Handle error response
          let errorMessage = 'Upload failed';
          try {
            const error = JSON.parse(xhr.responseText);
            errorMessage = error.error || errorMessage;
          } catch (e) {
            errorMessage = `HTTP ${xhr.status}: ${xhr.statusText}`;
          }
          
          alert(`Failed to upload document: ${errorMessage}`);
          progressDiv.classList.add('hidden');
          submitBtn.disabled = false;
          fileInput.value = ''; // Clear file input to allow retry
        }
      });

      xhr.addEventListener('error', () => {
        alert('Network error during upload');
        progressDiv.classList.add('hidden');
        submitBtn.disabled = false;
        fileInput.value = ''; // Clear file input to allow retry
      });

      xhr.open('POST', `/api/projects/${this.currentProjectId}/documents/upload`);
      xhr.setRequestHeader('Accept', 'application/json');
      // Credentials are sent automatically with XHR
      xhr.withCredentials = true;
      xhr.send(formData);

    } catch (error) {
      console.error('Upload error:', error);
      alert(`Failed to upload document: ${error.message}`);
      if (progressDiv) progressDiv.classList.add('hidden');
      if (submitBtn) submitBtn.disabled = false;
      if (fileInput) fileInput.value = ''; // Clear file input to allow retry
    }
  }

  /**
   * Download document with proper error handling
   */
  async downloadDocument(docId) {
    try {
      const response = await fetch(`/api/documents/${docId}/download`, {
        credentials: 'include'
      });
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
        credentials: 'include',
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
    // Back to Projects button in header
    const backToProjectsBtn = document.getElementById('back-to-projects-btn');
    if (backToProjectsBtn) {
      backToProjectsBtn.addEventListener('click', () => {
        window.location.href = '/index.html';
      });
    }

    // Project selector dropdown
    const projectSelector = document.getElementById('project-selector');
    if (projectSelector) {
      projectSelector.addEventListener('change', async (e) => {
        const selectedProjectId = e.target.value;
        
        if (!selectedProjectId) {
          // Clear current project
          this.currentProjectId = null;
          this.setProjectIdCookie('');
          this.cache.clear();
          
          // Show "no project selected" message
          document.getElementById('documents-container').innerHTML = `
            <div class="text-center py-12">
              <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
              </svg>
              <p class="text-gray-600 text-lg mb-4">No project selected</p>
              <p class="text-gray-500">Please select a project from the dropdown above</p>
            </div>
          `;
          return;
        }
        
        // Update current project and reload documents
        this.currentProjectId = selectedProjectId;
        this.setProjectIdCookie(selectedProjectId);
        this.currentPage = 1;
        this.cache.clear();
        
        await this.loadDocuments();
      });
    }

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
        this.showUploadModal();
      });
    }

    // Upload modal controls
    const closeUploadModal = document.getElementById('close-upload-modal');
    const cancelUploadBtn = document.getElementById('cancel-upload-btn');
    const uploadForm = document.getElementById('upload-form');
    const uploadModal = document.getElementById('upload-modal');

    if (closeUploadModal) {
      closeUploadModal.addEventListener('click', () => this.closeUploadModal());
    }

    if (cancelUploadBtn) {
      cancelUploadBtn.addEventListener('click', () => this.closeUploadModal());
    }

    if (uploadModal) {
      uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) {
          this.closeUploadModal();
        }
      });
    }

    if (uploadForm) {
      uploadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleFileUpload();
      });
    }

    // Event delegation for dynamically created buttons (documents list and pagination)
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;
      const docId = target.dataset.docId;

      switch (action) {
        case 'view':
          this.viewDocument(docId);
          break;
        case 'download':
          this.downloadDocument(docId);
          break;
        case 'delete':
          this.deleteDocument(docId);
          break;
        case 'prev-page':
          this.prevPage();
          break;
        case 'next-page':
          this.nextPage();
          break;
      }
    });
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
    const dropdownBtn = document.getElementById('view-dropdown-btn');
    const dropdownMenu = document.getElementById('view-dropdown-menu');
    
    if (!dropdownBtn || !dropdownMenu) return;
    
    // Toggle dropdown on button click
    dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = dropdownMenu.classList.contains('hidden');
      dropdownMenu.classList.toggle('hidden');
      dropdownBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!dropdownMenu.classList.contains('hidden') && 
          !dropdownBtn.contains(e.target) && 
          !dropdownMenu.contains(e.target)) {
        dropdownMenu.classList.add('hidden');
        dropdownBtn.setAttribute('aria-expanded', 'false');
      }
    });
    
    // Get project ID for navigation
    const projectId = this.getProjectIdFromCookie();
    
    // Setup menu item click handlers
    const menuItems = {
      'dashboard-btn': '/index.html',
      'view-checklists-btn': `/checklists.html?projectId=${projectId}`,
      'view-documents-btn': null, // Current page
      'view-tags-btn': `/tags.html?projectId=${projectId}`,
      'view-risks-btn': `/risks.html?projectId=${projectId}`,
      'view-templates-btn': `/templates.html?projectId=${projectId}`,
      'view-schedules-btn': `/schedules.html?projectId=${projectId}`,
      'view-ai-agent-btn': `/ai-agent.html?projectId=${projectId}`,
      'view-proposals-btn': `/proposals.html?projectId=${projectId}`
    };
    
    Object.entries(menuItems).forEach(([btnId, url]) => {
      const btn = document.getElementById(btnId);
      if (btn && url) {
        btn.addEventListener('click', () => {
          window.location.href = url;
        });
      }
    });
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
   * Helper: Set project ID in cookie
   */
  setProjectIdCookie(projectId) {
    if (projectId) {
      document.cookie = `selectedProjectId=${projectId}; path=/; max-age=86400`;
    } else {
      // Clear cookie
      document.cookie = 'selectedProjectId=; path=/; max-age=0';
    }
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
