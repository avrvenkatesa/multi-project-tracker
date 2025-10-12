// Tags Management
let currentProjectId = null;
let currentProject = null;
let allTags = [];
let filteredTags = [];
let currentFilter = 'all';
let selectedColor = '#3b82f6';
let editingTagId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  currentProjectId = params.get('projectId');
  
  if (!currentProjectId) {
    alert('No project selected');
    window.location.href = 'index.html';
    return;
  }
  
  setupEventListeners();
  await loadProject();
  await loadTags();
});

// Setup all event listeners
function setupEventListeners() {
  // Navigation buttons
  document.getElementById('backToProjectsBtn')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
  
  // Create Tag button
  document.getElementById('createTagBtn')?.addEventListener('click', () => {
    openCreateModal();
  });
  
  // Modal close buttons
  document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);
  document.getElementById('cancelBtn')?.addEventListener('click', closeModal);
  
  // Preview button
  document.getElementById('previewBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    showColorPreview();
  });
  
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      updateFilterButtons();
      applyFilter();
    });
  });
  
  // Form submit
  document.getElementById('tagForm')?.addEventListener('submit', handleTagSubmit);
}

// Update filter button styles
function updateFilterButtons() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    if (btn.dataset.filter === currentFilter) {
      btn.className = 'filter-btn px-4 py-2 rounded-lg text-sm font-medium transition-all bg-blue-600 text-white';
    } else {
      btn.className = 'filter-btn px-4 py-2 rounded-lg text-sm font-medium transition-all bg-gray-100 text-gray-700 hover:bg-gray-200';
    }
  });
}

// Apply filter
function applyFilter() {
  if (currentFilter === 'all') {
    filteredTags = [...allTags];
  } else {
    filteredTags = allTags.filter(tag => tag.tag_type === currentFilter);
  }
  renderTags();
}

// Load project details
async function loadProject() {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load project');
    }
    
    currentProject = await response.json();
    document.getElementById('project-name').textContent = currentProject.name;
  } catch (error) {
    console.error('Error loading project:', error);
    alert('Error loading project');
  }
}

// Load all tags from backend
async function loadTags() {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/tags`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load tags');
    }
    
    allTags = await response.json();
    applyFilter(); // This will set filteredTags and call renderTags()
  } catch (error) {
    console.error('Error loading tags:', error);
    alert('Error loading tags');
  }
}

// Render tags in card format
function renderTags() {
  const container = document.getElementById('tags-list');
  const emptyState = document.getElementById('empty-state');
  
  if (filteredTags.length === 0) {
    container.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  emptyState.classList.add('hidden');
  
  container.innerHTML = filteredTags.map(tag => {
    const totalCount = parseInt(tag.issue_count || 0) + parseInt(tag.action_item_count || 0);
    const tagType = tag.tag_type || 'issue_action';
    const tagTypeBadge = getTagTypeBadge(tagType);
    
    return `
    <div class="tag-card bg-white border border-gray-200 rounded-lg p-4 relative group">
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1 flex items-center gap-2">
          <span class="inline-block px-3 py-1 rounded-full text-sm font-medium text-white" 
                style="background-color: ${tag.color}">
            ${escapeHtml(tag.name)}
          </span>
          ${tagTypeBadge}
        </div>
        <div class="flex gap-2">
          <button class="edit-tag-btn text-gray-400 hover:text-blue-600" 
                  data-tag-id="${tag.id}"
                  data-tag-name="${escapeHtml(tag.name)}"
                  data-tag-description="${escapeHtml(tag.description || '')}"
                  data-tag-color="${tag.color}"
                  data-tag-type="${tagType}">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button class="delete-tag-btn text-gray-400 hover:text-red-600" 
                  data-tag-id="${tag.id}"
                  data-tag-name="${escapeHtml(tag.name)}">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
      <p class="text-gray-600 text-sm mb-3">${escapeHtml(tag.description) || 'No description'}</p>
      <div class="flex items-center justify-between text-sm text-gray-500">
        <span>Used ${totalCount} times</span>
        <span>${formatDate(tag.created_at)}</span>
      </div>
    </div>
  `}).join('');
  
  setupTagEventListeners();
}

// Get tag type badge HTML
function getTagTypeBadge(tagType) {
  const badges = {
    'issue_action': '<span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">Issues/Actions</span>',
    'risk': '<span class="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded">Risks</span>',
    'both': '<span class="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">Both</span>'
  };
  return badges[tagType] || badges['issue_action'];
}

// Setup tag event listeners
function setupTagEventListeners() {
  document.querySelectorAll('.edit-tag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.tagId;
      const name = btn.dataset.tagName;
      const description = btn.dataset.tagDescription;
      const color = btn.dataset.tagColor;
      const tagType = btn.dataset.tagType;
      openEditModal(id, name, description, color, tagType);
    });
  });
  
  document.querySelectorAll('.delete-tag-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTag(btn.dataset.tagId, btn.dataset.tagName);
    });
  });
}

// Open create modal
function openCreateModal() {
  editingTagId = null;
  document.getElementById('modalTitle').textContent = 'Create Tag';
  document.getElementById('tagForm').reset();
  document.getElementById('tagColor').value = '#3b82f6';
  selectedColor = '#3b82f6';
  document.getElementById('tagModal').classList.remove('hidden');
}

// Open edit modal
function openEditModal(id, name, description, color, tagType = 'issue_action') {
  editingTagId = id;
  document.getElementById('modalTitle').textContent = 'Edit Tag';
  document.getElementById('tagName').value = name;
  document.getElementById('tagDescription').value = description;
  document.getElementById('tagColor').value = color;
  selectedColor = color;
  
  // Set tag type radio button
  const radioBtn = document.querySelector(`input[name="tagType"][value="${tagType}"]`);
  if (radioBtn) {
    radioBtn.checked = true;
  }
  
  document.getElementById('tagModal').classList.remove('hidden');
}

// Close modal
function closeModal() {
  document.getElementById('tagModal').classList.add('hidden');
  document.getElementById('tagForm').reset();
  editingTagId = null;
}

// Show color preview
function showColorPreview() {
  const color = document.getElementById('tagColor').value;
  selectedColor = color;
  
  const name = document.getElementById('tagName').value.trim() || 'Tag Name';
  const description = document.getElementById('tagDescription').value.trim() || 'Tag description';
  
  alert(`Preview:\n\nTag: ${name}\nColor: ${color}\nDescription: ${description}`);
}

// Handle tag form submit
async function handleTagSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('tagName').value.trim();
  const description = document.getElementById('tagDescription').value.trim();
  const color = document.getElementById('tagColor').value;
  const tagType = document.querySelector('input[name="tagType"]:checked').value;
  
  if (!name) {
    alert('Tag name is required');
    return;
  }
  
  try {
    let response;
    
    if (editingTagId) {
      // Update existing tag
      response = await fetch(`/api/projects/${currentProjectId}/tags/${editingTagId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, description, color, tag_type: tagType })
      });
    } else {
      // Create new tag
      response = await fetch(`/api/projects/${currentProjectId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, description, color, tag_type: tagType })
      });
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to save tag');
    }
    
    closeModal();
    await loadTags();
  } catch (error) {
    console.error('Error saving tag:', error);
    alert(error.message);
  }
}

// Delete tag
async function deleteTag(tagId, tagName) {
  if (!confirm(`Are you sure you want to delete the tag "${tagName}"?`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/tags/${tagId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete tag');
    }
    
    await loadTags();
  } catch (error) {
    console.error('Error deleting tag:', error);
    alert(error.message);
  }
}

// Utility functions
function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
