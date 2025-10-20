// ============================================
// Unified Checklists Page - Tab Management
// ============================================

let currentTab = 'linked';
let currentProjectId = 1;
let currentProjectName = '';
let linkedChecklists = [];
let standaloneChecklists = [];
let originalStandaloneChecklists = [];
let templates = [];
let currentChecklistForLinking = null;
let linkType = 'issue';
let generatedChecklistsData = null;

// ============================================
// Page Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Get project ID from URL or localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const projectIdFromUrl = urlParams.get('project');
  
  if (projectIdFromUrl) {
    currentProjectId = parseInt(projectIdFromUrl);
    localStorage.setItem('selectedProjectId', currentProjectId);
  } else {
    const savedProjectId = localStorage.setItem('selectedProjectId');
    if (savedProjectId) {
      currentProjectId = parseInt(savedProjectId);
    }
  }
  
  // Check if URL has tab parameter
  const tab = urlParams.get('tab');
  
  // Setup event listeners
  setupEventListeners();
  
  // Load project info
  loadProjectInfo();
  
  // Load counts for all tabs immediately
  loadAllTabCounts();
  
  // Switch to requested tab or default to linked
  if (tab && ['linked', 'standalone', 'templates'].includes(tab)) {
    switchTab(tab);
  } else {
    switchTab('linked');
  }
});

// ============================================
// Event Listeners Setup
// ============================================

function setupEventListeners() {
  // Back to Projects button
  document.getElementById('backToProjectsBtn')?.addEventListener('click', () => {
    window.location.href = '/index.html';
  });
  
  // Tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.tab;
      switchTab(tab);
    });
  });
  
  // View dropdown buttons
  document.getElementById('dashboard-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `dashboard.html?projectId=${currentProjectId}`;
    }
  });
  
  document.getElementById('view-tags-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `tags.html?projectId=${currentProjectId}`;
    }
  });
  
  document.getElementById('view-risks-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `risks.html?projectId=${currentProjectId}`;
    }
  });
  
  document.getElementById('view-templates-btn')?.addEventListener('click', () => {
    window.location.href = 'templates.html';
  });
  
  // View dropdown toggle
  const viewDropdownBtn = document.getElementById('view-dropdown-btn');
  const viewDropdownMenu = document.getElementById('view-dropdown-menu');
  
  viewDropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    viewDropdownMenu?.classList.toggle('hidden');
  });
  
  document.addEventListener('click', () => {
    viewDropdownMenu?.classList.add('hidden');
  });
  
  // Action buttons
  document.getElementById('uploadDocumentBtn')?.addEventListener('click', openUploadDocumentModal);
  document.getElementById('standaloneUploadBtn')?.addEventListener('click', openUploadDocumentModal);
  document.getElementById('createChecklistBtn')?.addEventListener('click', openCreateChecklistModal);
  
  // Upload modal controls
  document.getElementById('close-upload-modal-btn')?.addEventListener('click', closeUploadModal);
  document.getElementById('save-all-checklists-btn')?.addEventListener('click', saveStandaloneChecklists);
  document.getElementById('cancel-preview-btn')?.addEventListener('click', closeUploadModal);
  document.getElementById('documentFileInput')?.addEventListener('change', handleDocumentUpload);
  
  // Search and sort for standalone
  document.getElementById('standaloneSearch')?.addEventListener('input', filterStandaloneChecklists);
  document.getElementById('standaloneSort')?.addEventListener('change', sortStandaloneChecklists);
}

// ============================================
// Load All Tab Counts (for initial display)
// ============================================

async function loadAllTabCounts() {
  // Load counts in parallel for all tabs
  await Promise.all([
    loadLinkedCount(),
    loadStandaloneCount(),
    loadTemplatesCount()
  ]);
}

async function loadLinkedCount() {
  try {
    const response = await fetch(`/api/checklists?project_id=${currentProjectId}`, {
      credentials: 'include'
    });
    if (response.ok) {
      const data = await response.json();
      const count = (Array.isArray(data) ? data : []).filter(c => !c.is_standalone).length;
      document.getElementById('linkedCount').textContent = count;
    }
  } catch (error) {
    console.error('Error loading linked count:', error);
  }
}

async function loadStandaloneCount() {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/standalone-checklists`, {
      credentials: 'include'
    });
    if (response.ok) {
      const data = await response.json();
      const count = (data.checklists || []).length;
      document.getElementById('standaloneCount').textContent = count;
    }
  } catch (error) {
    console.error('Error loading standalone count:', error);
  }
}

async function loadTemplatesCount() {
  try {
    const response = await fetch('/api/templates', {
      credentials: 'include'
    });
    if (response.ok) {
      const data = await response.json();
      const templates = Array.isArray(data) ? data : (data.templates || []);
      document.getElementById('templatesCount').textContent = templates.length;
    }
  } catch (error) {
    console.error('Error loading templates count:', error);
  }
}

// ============================================
// Load Project Info
// ============================================

async function loadProjectInfo() {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}`, {
      credentials: 'include'
    });
    
    if (response.ok) {
      const project = await response.json();
      currentProjectName = project.name;
      document.getElementById('project-name').textContent = project.name;
      document.getElementById('project-context').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading project info:', error);
    document.getElementById('project-name').textContent = 'Unknown Project';
  }
}

// ============================================
// Tab Management
// ============================================

function switchTab(tabName) {
  currentTab = tabName;
  
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.className = 'tab-button px-4 py-3 border-b-2 border-transparent font-medium text-gray-600 hover:text-gray-900';
  });
  
  const activeBtn = document.getElementById(`${tabName}Tab`);
  if (activeBtn) {
    activeBtn.className = 'tab-button px-4 py-3 border-b-2 border-blue-600 font-medium text-blue-600';
  }
  
  // Update content visibility
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });
  
  const activeContent = document.getElementById(`${tabName}Content`);
  if (activeContent) {
    activeContent.classList.remove('hidden');
  }
  
  // Load data for active tab
  loadTabData(tabName);
  
  // Update URL without reload
  const url = new URL(window.location);
  url.searchParams.set('tab', tabName);
  window.history.pushState({}, '', url);
}

async function loadTabData(tabName) {
  switch(tabName) {
    case 'linked':
      await loadLinkedChecklists();
      break;
    case 'standalone':
      await loadStandaloneChecklists();
      break;
    case 'templates':
      await loadTemplates();
      break;
  }
}

// ============================================
// Linked Checklists Tab
// ============================================

async function loadLinkedChecklists() {
  try {
    const response = await fetch(`/api/checklists?project_id=${currentProjectId}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load linked checklists');
    }
    
    const data = await response.json();
    // Filter out standalone checklists (is_standalone = true)
    linkedChecklists = (Array.isArray(data) ? data : []).filter(c => !c.is_standalone);
    
    document.getElementById('linkedCount').textContent = linkedChecklists.length;
    renderLinkedChecklists();
    
  } catch (error) {
    console.error('Error loading linked checklists:', error);
    showNotification('Failed to load linked checklists', 'error');
  }
}

function renderLinkedChecklists() {
  const container = document.getElementById('linkedChecklistsList');
  const emptyState = document.getElementById('linkedEmptyState');
  
  if (linkedChecklists.length === 0) {
    container.innerHTML = '';
    emptyState?.classList.remove('hidden');
    return;
  }
  
  emptyState?.classList.add('hidden');
  
  container.innerHTML = linkedChecklists.map(checklist => `
    <div class="bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
      <div class="flex justify-between items-start mb-4">
        <div class="flex-1">
          <h3 class="text-lg font-bold text-gray-900 mb-1">${escapeHtml(checklist.title)}</h3>
          ${checklist.description ? `<p class="text-sm text-gray-600">${escapeHtml(checklist.description)}</p>` : ''}
        </div>
        <div class="flex gap-2">
          <button 
            onclick="viewChecklist(${checklist.id})"
            class="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"
            title="View checklist"
          >
            👁️ View
          </button>
          <button 
            onclick="deleteChecklist(${checklist.id})"
            class="px-3 py-1 text-sm text-red-600 hover:text-red-800"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
      
      <div class="flex flex-wrap gap-4 text-sm text-gray-600">
        ${checklist.completion_percentage ? `
          <div class="flex items-center gap-1">
            <span>✓</span>
            <span>${checklist.completion_percentage}% complete</span>
          </div>
        ` : ''}
        ${checklist.related_issue_title ? `
          <div class="flex items-center gap-1">
            <span>🎯</span>
            <span>Issue: ${escapeHtml(checklist.related_issue_title)}</span>
          </div>
        ` : ''}
        ${checklist.related_action_title ? `
          <div class="flex items-center gap-1">
            <span>📌</span>
            <span>Action: ${escapeHtml(checklist.related_action_title)}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

// ============================================
// Standalone Checklists Tab
// ============================================

async function loadStandaloneChecklists() {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/standalone-checklists`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load standalone checklists');
    }
    
    const data = await response.json();
    standaloneChecklists = data.checklists || [];
    originalStandaloneChecklists = [...standaloneChecklists];
    
    document.getElementById('standaloneCount').textContent = standaloneChecklists.length;
    updateStandaloneStats();
    renderStandaloneChecklists();
    
  } catch (error) {
    console.error('Error loading standalone checklists:', error);
    showNotification('Failed to load standalone checklists', 'error');
  }
}

function updateStandaloneStats() {
  const totalItems = standaloneChecklists.reduce((sum, c) => {
    const count = parseInt(c.item_count, 10) || 0;
    return sum + count;
  }, 0);
  const uniqueDocs = new Set(standaloneChecklists.map(c => c.source_document)).size;
  
  document.getElementById('standaloneStatsCount').textContent = standaloneChecklists.length;
  document.getElementById('standaloneStatsItems').textContent = totalItems;
  document.getElementById('standaloneStatsDocs').textContent = uniqueDocs;
}

function renderStandaloneChecklists() {
  const container = document.getElementById('standaloneChecklistsList');
  const emptyState = document.getElementById('standaloneEmptyState');
  
  if (standaloneChecklists.length === 0) {
    container.innerHTML = '';
    emptyState?.classList.remove('hidden');
    return;
  }
  
  emptyState?.classList.add('hidden');
  
  container.innerHTML = standaloneChecklists.map(checklist => `
    <div class="bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
      <div class="flex justify-between items-start mb-4">
        <div class="flex-1">
          <h3 class="text-lg font-bold text-gray-900 mb-1">${escapeHtml(checklist.title)}</h3>
          ${checklist.description ? `<p class="text-sm text-gray-600">${escapeHtml(checklist.description)}</p>` : ''}
        </div>
        <div class="flex gap-2">
          <button 
            onclick="viewChecklist(${checklist.id})"
            class="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"
            title="View checklist"
          >
            👁️ View
          </button>
          <button 
            onclick="quickLinkStandalone(${checklist.id})"
            class="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
            title="Link to issue or action"
          >
            🔗 Link
          </button>
          <button 
            onclick="deleteStandaloneChecklist(${checklist.id})"
            class="px-3 py-1 text-sm text-red-600 hover:text-red-800"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
      
      <div class="flex flex-wrap gap-4 text-sm text-gray-600">
        <div class="flex items-center gap-1">
          <span>📋</span>
          <span>${checklist.item_count || 0} items</span>
        </div>
        <div class="flex items-center gap-1">
          <span>📄</span>
          <span>${escapeHtml(checklist.source_document || 'No document')}</span>
        </div>
        <div class="flex items-center gap-1">
          <span>📅</span>
          <span>${new Date(checklist.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function filterStandaloneChecklists() {
  const search = document.getElementById('standaloneSearch').value.toLowerCase();
  
  if (!search) {
    standaloneChecklists = [...originalStandaloneChecklists];
  } else {
    standaloneChecklists = originalStandaloneChecklists.filter(checklist => {
      return checklist.title.toLowerCase().includes(search) ||
             checklist.description?.toLowerCase().includes(search) ||
             checklist.source_document?.toLowerCase().includes(search);
    });
  }
  
  updateStandaloneStats();
  renderStandaloneChecklists();
}

function sortStandaloneChecklists() {
  const sortType = document.getElementById('standaloneSort').value;
  
  switch(sortType) {
    case 'date-desc':
      standaloneChecklists.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
    case 'date-asc':
      standaloneChecklists.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      break;
    case 'title':
      standaloneChecklists.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'items':
      standaloneChecklists.sort((a, b) => (b.item_count || 0) - (a.item_count || 0));
      break;
  }
  
  renderStandaloneChecklists();
}

// ============================================
// Templates Tab
// ============================================

async function loadTemplates() {
  try {
    const response = await fetch('/api/templates', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load templates');
    }
    
    const data = await response.json();
    // Handle both array and object with templates property
    templates = Array.isArray(data) ? data : (data.templates || []);
    
    document.getElementById('templatesCount').textContent = templates.length;
    renderTemplates();
    
  } catch (error) {
    console.error('Error loading templates:', error);
    showNotification('Failed to load templates', 'error');
  }
}

function renderTemplates() {
  const container = document.getElementById('templatesList');
  const emptyState = document.getElementById('templatesEmptyState');
  
  if (templates.length === 0) {
    container.innerHTML = '';
    emptyState?.classList.remove('hidden');
    return;
  }
  
  emptyState?.classList.add('hidden');
  
  container.innerHTML = templates.map(template => `
    <div class="bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow p-6">
      <div class="flex justify-between items-start mb-4">
        <div class="flex-1">
          <h3 class="text-lg font-bold text-gray-900 mb-1">${escapeHtml(template.name)}</h3>
          ${template.description ? `<p class="text-sm text-gray-600">${escapeHtml(template.description)}</p>` : ''}
        </div>
        <div class="flex gap-2">
          <button 
            onclick="viewTemplate(${template.id})"
            class="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"
            title="View template"
          >
            👁️ View
          </button>
          <button 
            onclick="useTemplate(${template.id})"
            class="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
            title="Use template"
          >
            ✨ Use
          </button>
        </div>
      </div>
      
      <div class="flex flex-wrap gap-4 text-sm text-gray-600">
        ${template.section_count ? `
          <div class="flex items-center gap-1">
            <span>📂</span>
            <span>${template.section_count} sections</span>
          </div>
        ` : ''}
        ${template.usage_count ? `
          <div class="flex items-center gap-1">
            <span>📊</span>
            <span>Used ${template.usage_count} times</span>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

// ============================================
// Actions
// ============================================

function viewChecklist(checklistId) {
  window.location.href = `/checklist-fill.html?id=${checklistId}`;
}

function viewTemplate(templateId) {
  window.location.href = `/templates.html?id=${templateId}`;
}

function useTemplate(templateId) {
  // Redirect to templates page with use action
  window.location.href = `/templates.html?use=${templateId}`;
}

async function deleteChecklist(checklistId) {
  if (!confirm('Delete this checklist?\n\nThis action cannot be undone.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/checklists/${checklistId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete checklist');
    }
    
    showNotification('✅ Checklist deleted', 'success');
    loadLinkedChecklists();
    
  } catch (error) {
    console.error('Delete error:', error);
    showNotification(`Failed to delete checklist: ${error.message}`, 'error');
  }
}

async function deleteStandaloneChecklist(checklistId) {
  if (!confirm('Delete this standalone checklist?\n\nThis action cannot be undone.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/checklists/${checklistId}/standalone`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete checklist');
    }
    
    showNotification('✅ Checklist deleted', 'success');
    loadStandaloneChecklists();
    
  } catch (error) {
    console.error('Delete error:', error);
    showNotification(`Failed to delete checklist: ${error.message}`, 'error');
  }
}

function quickLinkStandalone(checklistId) {
  alert('Quick link feature coming soon! Use the standalone checklists page for now.');
}

// ============================================
// Upload Document Modal
// ============================================

function openUploadDocumentModal() {
  document.getElementById('uploadModal').classList.remove('hidden');
  document.getElementById('uploadView').classList.remove('hidden');
  document.getElementById('processingView').classList.add('hidden');
  document.getElementById('previewView').classList.add('hidden');
  document.getElementById('documentFileInput').value = '';
  generatedChecklistsData = null;
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.add('hidden');
}

async function handleDocumentUpload() {
  const fileInput = document.getElementById('documentFileInput');
  const file = fileInput.files[0];
  
  if (!file) return;
  
  // Show processing
  document.getElementById('uploadView').classList.add('hidden');
  document.getElementById('processingView').classList.remove('hidden');
  document.getElementById('processingStatus').textContent = 'Extracting text from document...';
  
  try {
    const formData = new FormData();
    formData.append('document', file);
    
    setTimeout(() => {
      document.getElementById('processingStatus').textContent = 'Analyzing with AI...';
    }, 1000);
    
    const response = await fetch(`/api/projects/${currentProjectId}/upload-and-generate-standalone`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to generate checklists');
    }
    
    const data = await response.json();
    // API returns: { success: true, preview: { checklists: [], sourceDocument: '', uploadId: '', metadata: {} } }
    const checklists = data.preview?.checklists || data.preview || [];
    generatedChecklistsData = checklists;
    
    displayChecklistsPreview(checklists);
    
  } catch (error) {
    console.error('Upload error:', error);
    showNotification(`Failed to process document: ${error.message}`, 'error');
    closeUploadModal();
  }
}

function displayChecklistsPreview(checklists) {
  document.getElementById('processingView').classList.add('hidden');
  document.getElementById('previewView').classList.remove('hidden');
  
  // Ensure checklists is an array
  const checklistsArray = Array.isArray(checklists) ? checklists : [];
  
  const metadata = `${checklistsArray.length} checklist${checklistsArray.length !== 1 ? 's' : ''} generated`;
  document.getElementById('previewMetadata').textContent = metadata;
  
  const container = document.getElementById('checklistsPreview');
  container.innerHTML = checklistsArray.map((checklist, index) => `
    <div class="border rounded-lg p-4">
      <h4 class="font-bold text-gray-900 mb-2">${escapeHtml(checklist.title)}</h4>
      ${checklist.description ? `<p class="text-sm text-gray-600 mb-3">${escapeHtml(checklist.description)}</p>` : ''}
      <div class="text-sm text-gray-600">
        ${checklist.sections?.length || 0} sections, 
        ${checklist.sections?.reduce((sum, s) => sum + (s.items?.length || 0), 0) || 0} items
      </div>
    </div>
  `).join('');
}

async function saveStandaloneChecklists() {
  if (!generatedChecklistsData) return;
  
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/save-standalone-checklists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        checklists: generatedChecklistsData
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to save checklists');
    }
    
    showNotification('✅ Checklists saved successfully!', 'success');
    closeUploadModal();
    
    // Switch to standalone tab and reload
    switchTab('standalone');
    
  } catch (error) {
    console.error('Save error:', error);
    showNotification(`Failed to save checklists: ${error.message}`, 'error');
  }
}

// ============================================
// Create Checklist - Redirect to Templates
// ============================================

function openCreateChecklistModal() {
  // Redirect to templates page to create checklist from template
  window.location.href = '/templates.html';
}

// ============================================
// Utility Functions
// ============================================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'info') {
  // Simple notification - could be enhanced with a proper toast library
  const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
  
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-50`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}
