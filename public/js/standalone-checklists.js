// ============================================
// Phase 4 Mode 3: Standalone Checklists UI
// ============================================

let currentProjectId = 1;
let currentProjectName = '';
let allChecklists = [];
let originalChecklists = [];
let generatedChecklistsData = null;
let currentChecklistForLinking = null;
let linkType = 'issue';

// ============================================
// Page Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Get project ID from URL or localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const projectIdFromUrl = urlParams.get('project_id');
  
  if (projectIdFromUrl) {
    currentProjectId = parseInt(projectIdFromUrl);
    localStorage.setItem('selectedProjectId', currentProjectId);
  } else {
    const savedProjectId = localStorage.getItem('selectedProjectId');
    if (savedProjectId) {
      currentProjectId = parseInt(savedProjectId);
    }
  }
  
  // Setup event listeners
  setupEventListeners();
  
  // Load project info and checklists
  loadProjectInfo();
  loadStandaloneChecklists();
});

// ============================================
// Event Listeners Setup
// ============================================

function setupEventListeners() {
  // Back to Projects button
  document.getElementById('backToProjectsBtn')?.addEventListener('click', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project') || urlParams.get('project_id') || currentProjectId;
    if (projectId) {
      window.location.href = `/index.html?project=${projectId}`;
    } else {
      window.location.href = '/index.html';
    }
  });
  
  // Upload buttons
  document.getElementById('content-upload-btn')?.addEventListener('click', openUploadModal);
  document.getElementById('empty-state-upload-btn')?.addEventListener('click', openUploadModal);
  
  // Upload modal controls
  document.getElementById('close-upload-modal-btn')?.addEventListener('click', closeUploadModal);
  document.getElementById('save-all-checklists-btn')?.addEventListener('click', saveStandaloneChecklists);
  document.getElementById('cancel-preview-btn')?.addEventListener('click', closeUploadModal);
  
  // File input
  document.getElementById('documentFileInput')?.addEventListener('change', handleDocumentUpload);
  
  // Search and sort
  document.getElementById('searchInput')?.addEventListener('input', filterChecklists);
  document.getElementById('sortSelect')?.addEventListener('change', sortChecklists);
  
  // Linking modal controls
  document.getElementById('close-linking-modal-btn')?.addEventListener('click', closeLinkingModal);
  document.getElementById('linkToIssueBtn')?.addEventListener('click', () => selectLinkType('issue'));
  document.getElementById('linkToActionBtn')?.addEventListener('click', () => selectLinkType('action'));
  document.getElementById('confirm-linking-btn')?.addEventListener('click', confirmLinking);
  document.getElementById('cancel-linking-btn')?.addEventListener('click', closeLinkingModal);
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
      document.getElementById('projectNameHeader').textContent = project.name;
    }
  } catch (error) {
    console.error('Error loading project info:', error);
    document.getElementById('projectNameHeader').textContent = 'Unknown Project';
  }
}

// ============================================
// Load Standalone Checklists
// ============================================

async function loadStandaloneChecklists() {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/standalone-checklists`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load checklists');
    }
    
    const data = await response.json();
    allChecklists = data.checklists || [];
    originalChecklists = [...allChecklists];
    
    updateStats();
    renderChecklists();
    
  } catch (error) {
    console.error('Error loading checklists:', error);
    showNotification('Failed to load checklists', 'error');
  }
}

function updateStats() {
  // Convert item_count to number explicitly to avoid string concatenation
  const totalItems = allChecklists.reduce((sum, c) => {
    const count = parseInt(c.item_count, 10) || 0;
    return sum + count;
  }, 0);
  const uniqueDocs = new Set(allChecklists.map(c => c.source_document)).size;
  
  document.getElementById('totalCount').textContent = allChecklists.length;
  document.getElementById('totalItems').textContent = totalItems;
  document.getElementById('documentCount').textContent = uniqueDocs;
}

function renderChecklists() {
  const container = document.getElementById('checklistsList');
  const emptyState = document.getElementById('emptyState');
  
  if (allChecklists.length === 0) {
    container.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  
  const html = allChecklists.map(checklist => `
    <div class="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6" data-checklist-id="${checklist.id}">
      <div class="flex justify-between items-start mb-4">
        <div class="flex-1">
          <h3 class="text-lg font-bold text-gray-900 mb-1">${escapeHtml(checklist.title)}</h3>
          ${checklist.description ? `<p class="text-sm text-gray-600">${escapeHtml(checklist.description)}</p>` : ''}
        </div>
        <div class="flex gap-2">
          <button 
            data-action="view"
            data-checklist-id="${checklist.id}"
            class="checklist-action-btn px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"
            title="View checklist"
          >
            👁️ View
          </button>
          <button 
            data-action="link"
            data-checklist-id="${checklist.id}"
            class="checklist-action-btn px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
            title="Link to issue or action"
          >
            🔗 Link
          </button>
          <button 
            data-action="delete"
            data-checklist-id="${checklist.id}"
            class="checklist-action-btn px-3 py-1 text-sm text-red-600 hover:text-red-800"
            title="Delete checklist"
          >
            🗑️
          </button>
        </div>
      </div>
      
      <div class="flex flex-wrap gap-4 text-sm text-gray-600">
        <div class="flex items-center gap-1">
          <span>✓</span>
          <span>${checklist.item_count || 0} items</span>
        </div>
        <div class="flex items-center gap-1">
          <span>📄</span>
          <span>${escapeHtml(checklist.source_document || 'Unknown')}</span>
        </div>
        <div class="flex items-center gap-1">
          <span>👤</span>
          <span>${escapeHtml(checklist.creator_name || 'Unknown')}</span>
        </div>
        <div class="flex items-center gap-1">
          <span>📅</span>
          <span>${formatDate(checklist.created_at)}</span>
        </div>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = html;
  
  // Add event listeners for all action buttons
  document.querySelectorAll('.checklist-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = e.currentTarget.dataset.action;
      const checklistId = parseInt(e.currentTarget.dataset.checklistId);
      
      if (action === 'view') {
        viewChecklist(checklistId);
      } else if (action === 'link') {
        openLinkingModal(checklistId);
      } else if (action === 'delete') {
        deleteChecklist(checklistId);
      }
    });
  });
}

// ============================================
// Document Upload Modal
// ============================================

function openUploadModal() {
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
    generatedChecklistsData = data.preview;
    
    displayChecklistsPreview(data.preview);
    
  } catch (error) {
    console.error('Upload error:', error);
    showNotification(`Failed to generate checklists: ${error.message}`, 'error');
    closeUploadModal();
  }
}

function displayChecklistsPreview(preview) {
  document.getElementById('processingView').classList.add('hidden');
  document.getElementById('previewView').classList.remove('hidden');
  
  document.getElementById('previewMetadata').textContent = 
    `${preview.metadata.sectionCount} checklists, ${preview.metadata.itemCount} total items | Source: ${preview.sourceDocument}`;
  
  const container = document.getElementById('checklistsPreview');
  
  // Handle both array of checklists and sections format
  const checklists = Array.isArray(preview.checklists) ? preview.checklists : (preview.checklists.sections || []);
  
  container.innerHTML = checklists.map((checklist, index) => {
    // Count items across all sections
    const allItems = [];
    if (checklist.sections && Array.isArray(checklist.sections)) {
      for (const section of checklist.sections) {
        if (section.items && Array.isArray(section.items)) {
          allItems.push(...section.items);
        }
      }
    }
    const itemCount = allItems.length;
    
    return `
    <div class="border rounded-lg p-4 bg-gray-50">
      <div class="flex items-start gap-3">
        <input 
          type="checkbox" 
          id="checklist-${index}"
          checked
          class="mt-1"
        />
        <div class="flex-1">
          <label for="checklist-${index}" class="font-semibold text-gray-900 cursor-pointer">
            ${escapeHtml(checklist.title)}
          </label>
          <div class="flex items-center gap-2 mt-1">
            <p class="text-sm text-gray-600">${itemCount} items</p>
            <span class="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">Can link to Issues</span>
            <span class="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Can link to Actions</span>
          </div>
          ${checklist.description ? `<p class="text-xs text-gray-500 mt-1">${escapeHtml(checklist.description)}</p>` : ''}
          <details class="mt-2">
            <summary class="text-sm text-purple-600 cursor-pointer hover:text-purple-800">
              Preview items
            </summary>
            <ul class="mt-2 space-y-1 text-sm text-gray-700">
              ${allItems.slice(0, 5).map(item => `
                <li class="flex items-start gap-2">
                  <span class="text-purple-600">•</span>
                  <span>${escapeHtml(item.text || item.item_text || item.description || '')}</span>
                </li>
              `).join('')}
              ${itemCount > 5 ? `<li class="text-gray-500">... and ${itemCount - 5} more</li>` : ''}
            </ul>
          </details>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

async function saveStandaloneChecklists() {
  if (!generatedChecklistsData) return;
  
  try {
    // Get selected checklists
    const checklists = Array.isArray(generatedChecklistsData.checklists) 
      ? generatedChecklistsData.checklists 
      : (generatedChecklistsData.checklists.sections || []);
    
    const selected = checklists.filter((_, index) => {
      return document.getElementById(`checklist-${index}`)?.checked;
    });
    
    if (selected.length === 0) {
      showNotification('Please select at least one checklist', 'error');
      return;
    }
    
    const response = await fetch(`/api/projects/${currentProjectId}/save-standalone-checklists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        checklists: selected,
        sourceDocument: generatedChecklistsData.sourceDocument
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save checklists');
    }
    
    showNotification(`✅ ${selected.length} checklist(s) saved successfully!`, 'success');
    closeUploadModal();
    loadStandaloneChecklists();
    
  } catch (error) {
    console.error('Save error:', error);
    showNotification('Failed to save checklists', 'error');
  }
}

// ============================================
// Linking Modal
// ============================================

async function openLinkingModal(checklistId) {
  currentChecklistForLinking = allChecklists.find(c => c.id === checklistId);
  
  if (!currentChecklistForLinking) return;
  
  document.getElementById('linkChecklistTitle').textContent = currentChecklistForLinking.title;
  document.getElementById('linkChecklistInfo').textContent = 
    `${currentChecklistForLinking.item_count} items from ${currentChecklistForLinking.source_document}`;
  
  // Load issues
  await loadIssuesForLinking();
  
  document.getElementById('linkingModal').classList.remove('hidden');
}

function closeLinkingModal() {
  document.getElementById('linkingModal').classList.add('hidden');
  currentChecklistForLinking = null;
}

function selectLinkType(type) {
  linkType = type;
  
  const issueBtn = document.getElementById('linkToIssueBtn');
  const actionBtn = document.getElementById('linkToActionBtn');
  
  if (type === 'issue') {
    issueBtn.className = 'flex-1 px-3 py-2 border-2 border-blue-500 bg-blue-50 text-blue-700 rounded font-medium';
    actionBtn.className = 'flex-1 px-3 py-2 border-2 border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50';
    loadIssuesForLinking();
  } else {
    issueBtn.className = 'flex-1 px-3 py-2 border-2 border-gray-300 text-gray-700 rounded font-medium hover:bg-gray-50';
    actionBtn.className = 'flex-1 px-3 py-2 border-2 border-blue-500 bg-blue-50 text-blue-700 rounded font-medium';
    loadActionsForLinking();
  }
}

async function loadIssuesForLinking() {
  try {
    // Use the checklist's project_id, not the current page's project
    const checklistProjectId = currentChecklistForLinking?.project_id || currentProjectId;
    
    const response = await fetch(`/api/issues?projectId=${checklistProjectId}`, {
      credentials: 'include'
    });
    
    const issues = await response.json();
    
    const select = document.getElementById('linkTargetSelect');
    select.innerHTML = '<option value="">Select an issue...</option>' +
      issues.map(issue => `<option value="${issue.id}">${escapeHtml(issue.title)}</option>`).join('');
    
  } catch (error) {
    console.error('Error loading issues:', error);
  }
}

async function loadActionsForLinking() {
  try {
    // Use the checklist's project_id, not the current page's project
    const checklistProjectId = currentChecklistForLinking?.project_id || currentProjectId;
    
    console.log('🔍 Loading actions for linking:');
    console.log('  Current checklist:', currentChecklistForLinking);
    console.log('  Checklist project_id:', currentChecklistForLinking?.project_id);
    console.log('  Current page project_id:', currentProjectId);
    console.log('  Using project_id:', checklistProjectId);
    
    const response = await fetch(`/api/action-items?projectId=${checklistProjectId}`, {
      credentials: 'include'
    });
    
    const actions = await response.json();
    
    console.log('  Loaded actions:', actions.length, 'items');
    console.log('  Action project_ids:', actions.map(a => a.project_id));
    
    const select = document.getElementById('linkTargetSelect');
    select.innerHTML = '<option value="">Select an action item...</option>' +
      actions.map(action => `<option value="${action.id}">${escapeHtml(action.title)} (Project: ${action.project_id})</option>`).join('');
    
  } catch (error) {
    console.error('Error loading actions:', error);
  }
}

async function confirmLinking() {
  const targetId = document.getElementById('linkTargetSelect').value;
  const keepStandalone = document.getElementById('keepStandaloneCheckbox').checked;
  
  if (!targetId) {
    showNotification(`Please select ${linkType === 'issue' ? 'an issue' : 'an action item'}`, 'error');
    return;
  }
  
  try {
    console.log('🔗 Linking checklist:');
    console.log('  Checklist ID:', currentChecklistForLinking.id);
    console.log('  Checklist project_id:', currentChecklistForLinking.project_id);
    console.log('  Target ID:', targetId);
    console.log('  Link type:', linkType);
    console.log('  Keep standalone:', keepStandalone);
    
    const endpoint = linkType === 'issue' 
      ? `/api/checklists/${currentChecklistForLinking.id}/link-to-issue`
      : `/api/checklists/${currentChecklistForLinking.id}/link-to-action`;
    
    const body = linkType === 'issue'
      ? { issueId: parseInt(targetId), keepStandalone }
      : { actionId: parseInt(targetId), keepStandalone };
    
    console.log('  Request body:', body);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to link checklist');
    }
    
    // Dispatch checklist update event for real-time badge refresh
    if (window.dispatchChecklistUpdate) {
      const itemType = linkType === 'issue' ? 'issue' : 'action-item';
      window.dispatchChecklistUpdate(itemType, parseInt(targetId));
    }
    
    const copyMode = keepStandalone ? ' (copy created)' : '';
    showNotification(`✅ Checklist linked successfully${copyMode}!`, 'success');
    closeLinkingModal();
    loadStandaloneChecklists();
    
  } catch (error) {
    console.error('Linking error:', error);
    showNotification(`Failed to link checklist: ${error.message}`, 'error');
  }
}

// ============================================
// Actions
// ============================================

function viewChecklist(checklistId) {
  window.location.href = `/checklist-fill.html?id=${checklistId}`;
}

async function deleteChecklist(checklistId) {
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

// ============================================
// Filtering & Sorting
// ============================================

function filterChecklists() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  
  if (!search) {
    allChecklists = [...originalChecklists];
  } else {
    allChecklists = originalChecklists.filter(checklist => {
      return checklist.title.toLowerCase().includes(search) ||
             checklist.description?.toLowerCase().includes(search) ||
             checklist.source_document?.toLowerCase().includes(search);
    });
  }
  
  updateStats();
  renderChecklists();
}

function sortChecklists() {
  const sortBy = document.getElementById('sortSelect').value;
  
  switch(sortBy) {
    case 'date-desc':
      allChecklists.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
    case 'date-asc':
      allChecklists.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      break;
    case 'title':
      allChecklists.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'items':
      allChecklists.sort((a, b) => (b.item_count || 0) - (a.item_count || 0));
      break;
  }
  
  renderChecklists();
}

// ============================================
// Utilities
// ============================================

function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  
  return date.toLocaleDateString();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'info') {
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  };
  
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50 transition-all`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
