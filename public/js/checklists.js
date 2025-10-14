// Checklists.js - Checklist management functionality
// Cache version: v1

let currentChecklistId = null;
let saveDebounceTimer = null;
let templates = [];
let projects = [];
let users = [];

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
  const currentPage = window.location.pathname;
  
  // Check authentication for all checklist pages
  fetch('/api/auth/me', { credentials: 'include' })
    .then(r => {
      if (r.status === 401) {
        window.location.href = 'index.html';
        return null;
      }
      return r.json();
    })
    .then(user => {
      if (!user) return;
      
      // Update user display if element exists
      const userDisplay = document.getElementById('userDisplay');
      if (userDisplay) {
        userDisplay.textContent = `${user.username} (${user.role})`;
      }
      
      // Initialize appropriate page
      if (currentPage.includes('checklists.html')) {
        initChecklistsListPage();
      } else if (currentPage.includes('checklist-fill.html')) {
        // Load checklist from URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const checklistId = urlParams.get('id');
        if (checklistId) {
          loadChecklistForFilling(checklistId);
        } else {
          alert('No checklist ID provided');
          window.location.href = 'checklists.html';
        }
      }
    });
});

async function initChecklistsListPage() {
  await Promise.all([
    loadTemplates(),
    loadProjects(),
    loadUsers(),
    loadChecklists()
  ]);
  populateFilters();
}

// =====================================================
// DATA LOADING
// =====================================================

async function loadTemplates() {
  try {
    const response = await fetch('/api/checklist-templates', { credentials: 'include' });
    if (response.status === 401) {
      window.location.href = 'index.html';
      return;
    }
    templates = await response.json();
  } catch (error) {
    console.error('Error loading templates:', error);
    showToast('Failed to load templates', 'error');
  }
}

async function loadProjects() {
  try {
    const response = await fetch('/api/projects', { credentials: 'include' });
    if (response.status === 401) {
      window.location.href = 'index.html';
      return;
    }
    projects = await response.json();
  } catch (error) {
    console.error('Error loading projects:', error);
    showToast('Failed to load projects', 'error');
  }
}

async function loadUsers() {
  try {
    const response = await fetch('/api/users', { credentials: 'include' });
    if (response.status === 401) {
      window.location.href = 'index.html';
      return;
    }
    users = await response.json();
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

async function loadChecklists() {
  try {
    showLoadingState();
    
    const projectFilter = document.getElementById('projectFilter')?.value || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const templateFilter = document.getElementById('templateFilter')?.value || '';
    
    let url = '/api/checklists?';
    if (projectFilter) url += `project_id=${projectFilter}&`;
    if (statusFilter) url += `status=${statusFilter}&`;
    if (templateFilter) url += `template_id=${templateFilter}&`;
    
    const response = await fetch(url, { credentials: 'include' });
    
    if (response.status === 401) {
      window.location.href = 'index.html';
      return;
    }
    
    const checklists = await response.json();
    displayChecklists(checklists);
    
  } catch (error) {
    console.error('Error loading checklists:', error);
    showToast('Failed to load checklists', 'error');
    hideLoadingState();
  }
}

function displayChecklists(checklists) {
  const grid = document.getElementById('checklistsGrid');
  const emptyState = document.getElementById('emptyState');
  
  if (!checklists || checklists.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';
  grid.innerHTML = checklists.map(checklist => createChecklistCard(checklist)).join('');
}

function createChecklistCard(checklist) {
  const progress = checklist.total_items > 0 
    ? Math.round((checklist.completed_items / checklist.total_items) * 100)
    : 0;
  
  const statusBadge = getStatusBadge(checklist.status);
  const dueDateDisplay = checklist.due_date 
    ? `<span class="text-sm text-gray-600">📅 Due: ${formatDate(checklist.due_date)}</span>`
    : '';
  
  return `
    <div class="checklist-card" onclick="openChecklist('${checklist.id}')">
      <div class="checklist-card-header">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2">
            <span class="text-2xl">${checklist.template_icon || '📋'}</span>
            <div>
              <h3 class="font-semibold text-gray-900">${escapeHtml(checklist.title)}</h3>
              <p class="text-sm text-gray-600">${escapeHtml(checklist.template_name)}</p>
            </div>
          </div>
          ${statusBadge}
        </div>
      </div>
      
      <div class="checklist-card-body">
        <p class="text-sm text-gray-600 mb-3">${escapeHtml(checklist.description || '')}</p>
        
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm text-gray-600">Progress</span>
          <span class="text-sm font-semibold">${checklist.completed_items} / ${checklist.total_items}</span>
        </div>
        
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${progress}%"></div>
        </div>
        
        <div class="flex items-center justify-between mt-3 text-sm text-gray-600">
          <span>📁 ${escapeHtml(checklist.project_name)}</span>
          ${dueDateDisplay}
        </div>
        
        ${checklist.assigned_to_name ? `
          <div class="text-sm text-gray-600 mt-2">
            👤 Assigned to: ${escapeHtml(checklist.assigned_to_name)}
          </div>
        ` : ''}
      </div>
      
      <div class="checklist-card-footer">
        <button onclick="event.stopPropagation(); openChecklist('${checklist.id}')" class="btn-primary btn-sm">
          Open
        </button>
        <button onclick="event.stopPropagation(); deleteChecklist('${checklist.id}')" class="btn-danger btn-sm">
          Delete
        </button>
      </div>
    </div>
  `;
}

function getStatusBadge(status) {
  const badges = {
    'not-started': '<span class="status-badge status-not-started">Not Started</span>',
    'in-progress': '<span class="status-badge status-in-progress">In Progress</span>',
    'completed': '<span class="status-badge status-completed">Completed</span>',
    'approved': '<span class="status-badge status-approved">Approved</span>'
  };
  return badges[status] || badges['not-started'];
}

// =====================================================
// CREATE CHECKLIST
// =====================================================

function showCreateChecklistModal() {
  const modal = document.getElementById('createChecklistModal');
  modal.style.display = 'flex';
  
  // Populate template select
  const templateSelect = document.getElementById('templateSelect');
  templateSelect.innerHTML = '<option value="">Select template...</option>' +
    templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  
  // Populate project select
  const projectSelect = document.getElementById('projectSelect');
  projectSelect.innerHTML = '<option value="">Select project...</option>' +
    projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  
  // Populate assigned to select
  const assignedToSelect = document.getElementById('assignedToSelect');
  assignedToSelect.innerHTML = '<option value="">Unassigned</option>' +
    users.map(u => `<option value="${u.id}">${escapeHtml(u.username)}</option>`).join('');
}

function closeCreateChecklistModal() {
  document.getElementById('createChecklistModal').style.display = 'none';
  document.getElementById('createChecklistForm').reset();
}

async function createChecklist(event) {
  event.preventDefault();
  
  const formData = {
    template_id: parseInt(document.getElementById('templateSelect').value),
    project_id: parseInt(document.getElementById('projectSelect').value),
    title: document.getElementById('checklistTitle').value,
    description: document.getElementById('checklistDescription').value || null,
    assigned_to: parseInt(document.getElementById('assignedToSelect').value) || null,
    due_date: document.getElementById('dueDate').value || null
  };
  
  try {
    const response = await fetch('/api/checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(formData)
    });
    
    if (response.status === 401 || response.status === 403) {
      showToast('Access denied', 'error');
      return;
    }
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checklist');
    }
    
    const checklist = await response.json();
    showToast('Checklist created successfully!', 'success');
    closeCreateChecklistModal();
    
    // Redirect to fill page
    window.location.href = `checklist-fill.html?id=${checklist.id}`;
    
  } catch (error) {
    console.error('Error creating checklist:', error);
    showToast(error.message, 'error');
  }
}

// =====================================================
// DELETE CHECKLIST
// =====================================================

async function deleteChecklist(checklistId) {
  if (!confirm('Are you sure you want to delete this checklist? This action cannot be undone.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/checklists/${checklistId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (response.status === 401 || response.status === 403) {
      showToast('Access denied', 'error');
      return;
    }
    
    if (!response.ok) {
      throw new Error('Failed to delete checklist');
    }
    
    showToast('Checklist deleted successfully', 'success');
    loadChecklists();
    
  } catch (error) {
    console.error('Error deleting checklist:', error);
    showToast('Failed to delete checklist', 'error');
  }
}

// =====================================================
// FILL CHECKLIST
// =====================================================

async function loadChecklistForFilling(checklistId) {
  currentChecklistId = checklistId;
  
  try {
    const response = await fetch(`/api/checklists/${checklistId}`, { credentials: 'include' });
    
    if (response.status === 401) {
      window.location.href = 'index.html';
      return;
    }
    
    if (response.status === 403) {
      showToast('Access denied to this checklist', 'error');
      setTimeout(() => window.location.href = 'checklists.html', 2000);
      return;
    }
    
    const checklist = await response.json();
    displayChecklistForFilling(checklist);
    
  } catch (error) {
    console.error('Error loading checklist:', error);
    showToast('Failed to load checklist', 'error');
  }
}

function displayChecklistForFilling(checklist) {
  // Update header
  document.getElementById('checklistTitle').textContent = checklist.title;
  document.getElementById('checklistId').textContent = `ID: ${checklist.checklist_id}`;
  document.getElementById('projectName').textContent = `📁 ${checklist.project_name}`;
  
  if (checklist.assigned_to_name) {
    document.getElementById('assignedTo').textContent = `👤 ${checklist.assigned_to_name}`;
  }
  
  // Update progress
  updateProgress(checklist);
  
  // Display due date
  if (checklist.due_date) {
    document.getElementById('dueDate').textContent = `📅 Due: ${formatDate(checklist.due_date)}`;
  }
  
  // Render sections
  const sectionsContainer = document.getElementById('checklistSections');
  sectionsContainer.innerHTML = renderSections(checklist.sections);
  
  // Display comments
  displayComments(checklist.comments || []);
}

function renderSections(sections) {
  // Organize sections hierarchically
  const topLevelSections = sections.filter(s => !s.parent_section_id);
  
  return topLevelSections.map(section => {
    const subsections = sections.filter(s => s.parent_section_id === section.id);
    return renderSection(section, subsections, sections);
  }).join('');
}

function renderSection(section, directSubsections, allSections, level = 0) {
  const sectionId = `section-${section.id}`;
  const hasItems = section.items && section.items.length > 0;
  const hasSubsections = directSubsections.length > 0;
  
  let html = `
    <div class="checklist-section" style="margin-left: ${level * 20}px">
      <div class="section-header" onclick="toggleSection('${sectionId}')">
        <div class="flex items-center gap-2">
          <span class="section-toggle" id="${sectionId}-toggle">▼</span>
          <h3 class="section-title">${section.section_number} ${escapeHtml(section.title)}</h3>
        </div>
      </div>
      
      <div id="${sectionId}" class="section-content">
        ${section.description ? `<p class="section-description">${escapeHtml(section.description)}</p>` : ''}
        
        ${hasItems ? `
          <div class="section-items">
            ${section.items.map(item => renderItem(item)).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  // Render subsections recursively
  if (hasSubsections) {
    directSubsections.forEach(subsection => {
      const subSubsections = allSections.filter(s => s.parent_section_id === subsection.id);
      html += renderSection(subsection, subSubsections, allSections, level + 1);
    });
  }
  
  return html;
}

function renderItem(item) {
  const fieldHtml = renderField(item);
  const requiredMark = item.is_required ? '<span class="text-red-500">*</span>' : '';
  
  return `
    <div class="checklist-item" data-item-id="${item.id}">
      <div class="item-label">
        ${escapeHtml(item.label)} ${requiredMark}
        ${item.help_text ? `<span class="item-help-text">${escapeHtml(item.help_text)}</span>` : ''}
      </div>
      <div class="item-field">
        ${fieldHtml}
      </div>
    </div>
  `;
}

function renderField(item) {
  const value = item.response_value || '';
  const boolValue = item.response_boolean;
  const dateValue = item.response_date || '';
  
  switch(item.field_type) {
    case 'checkbox':
      return `<input type="checkbox" ${boolValue ? 'checked' : ''} 
              onchange="saveResponse(${item.id}, this.checked, 'checkbox')" 
              class="checkbox-field">`;
    
    case 'text':
      return `<input type="text" value="${escapeHtml(value)}" 
              oninput="debouncedSave(${item.id}, this.value, 'text')" 
              class="text-field">`;
    
    case 'textarea':
      return `<textarea rows="3" 
              oninput="debouncedSave(${item.id}, this.value, 'textarea')" 
              class="textarea-field">${escapeHtml(value)}</textarea>`;
    
    case 'date':
      return `<input type="date" value="${dateValue}" 
              onchange="saveResponse(${item.id}, this.value, 'date')" 
              class="date-field">`;
    
    case 'radio':
      const radioOptions = item.field_options ? JSON.parse(item.field_options) : [];
      return radioOptions.map(opt => `
        <label class="radio-label">
          <input type="radio" name="item_${item.id}" value="${escapeHtml(opt)}" 
                 ${value === opt ? 'checked' : ''}
                 onchange="saveResponse(${item.id}, this.value, 'radio')"
                 class="radio-field">
          ${escapeHtml(opt)}
        </label>
      `).join('');
    
    case 'dropdown':
      const dropOptions = item.field_options ? JSON.parse(item.field_options) : [];
      return `<select onchange="saveResponse(${item.id}, this.value, 'dropdown')" class="select-field">
        <option value="">Select...</option>
        ${dropOptions.map(opt => 
          `<option value="${escapeHtml(opt)}" ${value === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
        ).join('')}
      </select>`;
    
    default:
      return `<input type="text" value="${escapeHtml(value)}" class="text-field">`;
  }
}

// =====================================================
// SAVE RESPONSES
// =====================================================

function debouncedSave(itemId, value, fieldType) {
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveResponse(itemId, value, fieldType);
  }, 500);
}

async function saveResponse(itemId, value, fieldType) {
  const responseData = {
    template_item_id: itemId,
    response_value: null,
    response_boolean: null,
    response_date: null
  };
  
  // Route to correct field
  if (fieldType === 'checkbox' || fieldType === 'radio') {
    responseData.response_boolean = fieldType === 'checkbox' ? value : (value ? true : false);
  } else if (fieldType === 'date') {
    responseData.response_date = value;
  } else {
    responseData.response_value = value;
  }
  
  try {
    const response = await fetch(`/api/checklists/${currentChecklistId}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ responses: [responseData] })
    });
    
    if (!response.ok) {
      throw new Error('Failed to save response');
    }
    
    const result = await response.json();
    
    // Update progress
    if (result.checklist) {
      updateProgressFromData(result.checklist);
    }
    
    // Show brief save indicator
    showSaveIndicator();
    
  } catch (error) {
    console.error('Error saving response:', error);
    showToast('Failed to save response', 'error');
  }
}

async function saveProgress() {
  showToast('All responses saved', 'success');
}

function updateProgress(checklist) {
  updateProgressFromData(checklist);
}

function updateProgressFromData(checklist) {
  const progress = checklist.total_items > 0 
    ? Math.round((checklist.completed_items / checklist.total_items) * 100)
    : 0;
  
  document.getElementById('progressPercentage').textContent = `${progress}%`;
  document.getElementById('completedItems').textContent = checklist.completed_items;
  document.getElementById('totalItems').textContent = checklist.total_items;
  document.getElementById('progressBarFill').style.width = `${progress}%`;
}

// =====================================================
// COMMENTS
// =====================================================

function displayComments(comments) {
  const commentsList = document.getElementById('commentsList');
  if (!commentsList) return;
  
  if (comments.length === 0) {
    commentsList.innerHTML = '<p class="text-gray-500 text-sm">No comments yet</p>';
    return;
  }
  
  commentsList.innerHTML = comments.map(comment => `
    <div class="comment">
      <div class="comment-header">
        <strong>${escapeHtml(comment.commenter_name || 'Unknown')}</strong>
        <span class="text-sm text-gray-500">${formatDateTime(comment.created_at)}</span>
      </div>
      <div class="comment-body">${escapeHtml(comment.comment)}</div>
    </div>
  `).join('');
}

async function addComment() {
  const commentText = document.getElementById('newComment').value.trim();
  if (!commentText) return;
  
  try {
    const response = await fetch(`/api/checklists/${currentChecklistId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ comment: commentText })
    });
    
    if (!response.ok) {
      throw new Error('Failed to add comment');
    }
    
    document.getElementById('newComment').value = '';
    
    // Reload checklist to get updated comments
    loadChecklistForFilling(currentChecklistId);
    showToast('Comment added', 'success');
    
  } catch (error) {
    console.error('Error adding comment:', error);
    showToast('Failed to add comment', 'error');
  }
}

// =====================================================
// UI HELPERS
// =====================================================

function toggleSection(sectionId) {
  const content = document.getElementById(sectionId);
  const toggle = document.getElementById(`${sectionId}-toggle`);
  
  if (content.style.display === 'none') {
    content.style.display = 'block';
    toggle.textContent = '▼';
  } else {
    content.style.display = 'none';
    toggle.textContent = '▶';
  }
}

function openChecklist(checklistId) {
  window.location.href = `checklist-fill.html?id=${checklistId}`;
}

function populateFilters() {
  // Project filter
  const projectFilter = document.getElementById('projectFilter');
  if (projectFilter) {
    projectFilter.innerHTML = '<option value="">All Projects</option>' +
      projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  }
  
  // Template filter
  const templateFilter = document.getElementById('templateFilter');
  if (templateFilter) {
    templateFilter.innerHTML = '<option value="">All Templates</option>' +
      templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  }
}

function showLoadingState() {
  const grid = document.getElementById('checklistsGrid');
  if (grid) {
    grid.innerHTML = '<div class="loading-spinner">Loading checklists...</div>';
  }
}

function hideLoadingState() {
  // Grid will be updated with content
}

function showSaveIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'save-indicator';
  indicator.textContent = '✓ Saved';
  document.body.appendChild(indicator);
  
  setTimeout(() => {
    indicator.remove();
  }, 2000);
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
  }, 100);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Auth helper
function logout() {
  fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include'
  }).then(() => {
    window.location.href = 'index.html';
  });
}
