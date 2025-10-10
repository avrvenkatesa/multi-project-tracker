// Global state
let currentProjectId = null;
let currentEditingTagId = null;
let projects = [];
let tags = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication
  if (!await AuthManager.checkAuth()) {
    window.location.href = 'index.html';
    return;
  }
  
  // Check for project ID in URL
  const urlParams = new URLSearchParams(window.location.search);
  const projectIdFromUrl = urlParams.get('projectId');
  
  await loadProjects();
  setupEventListeners();
  
  // Auto-select project if provided in URL
  if (projectIdFromUrl) {
    currentProjectId = projectIdFromUrl;
    
    // Hide project selector, show project header
    document.getElementById('projectSelector').classList.add('hidden');
    document.getElementById('projectHeader').classList.remove('hidden');
    
    // Find and display project name
    const project = projects.find(p => p.id == projectIdFromUrl);
    if (project) {
      document.getElementById('projectName').textContent = project.name;
    }
    
    // Show tags section and load tags
    document.getElementById('tagsSection').classList.remove('hidden');
    await loadTags();
  }
});

// Setup event listeners
function setupEventListeners() {
  document.getElementById('projectSelect').addEventListener('change', handleProjectChange);
  document.getElementById('createTagBtn').addEventListener('click', () => showTagModal());
  document.getElementById('emptyCreateTagBtn').addEventListener('click', () => showTagModal());
  document.getElementById('cancelBtn').addEventListener('click', hideTagModal);
  document.getElementById('tagForm').addEventListener('submit', handleTagSubmit);
  
  // Color preview
  document.getElementById('tagColor').addEventListener('input', (e) => {
    const preview = document.getElementById('colorPreview');
    preview.style.backgroundColor = e.target.value;
  });
}

// Load user's projects
async function loadProjects() {
  try {
    const response = await axios.get('/api/projects', { withCredentials: true });
    projects = response.data;
    
    const select = document.getElementById('projectSelect');
    select.innerHTML = '<option value="">Select a project...</option>';
    
    projects.forEach(project => {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading projects:', error);
    showNotification('Failed to load projects', 'error');
  }
}

// Handle project selection change
async function handleProjectChange(e) {
  currentProjectId = e.target.value;
  
  if (currentProjectId) {
    document.getElementById('tagsSection').classList.remove('hidden');
    await loadTags();
  } else {
    document.getElementById('tagsSection').classList.add('hidden');
  }
}

// Load tags for current project
async function loadTags() {
  try {
    const response = await axios.get(`/api/projects/${currentProjectId}/tags`, {
      withCredentials: true
    });
    tags = response.data;
    
    renderTags();
  } catch (error) {
    console.error('Error loading tags:', error);
    showNotification('Failed to load tags', 'error');
  }
}

// Render tags
function renderTags() {
  const grid = document.getElementById('tagsGrid');
  const emptyState = document.getElementById('emptyState');
  
  if (tags.length === 0) {
    grid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }
  
  grid.classList.remove('hidden');
  emptyState.classList.add('hidden');
  
  grid.innerHTML = tags.map(tag => `
    <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition">
      <div class="flex justify-between items-start mb-3">
        <div class="flex items-center gap-2">
          <span class="px-3 py-1 rounded-full text-sm font-medium" 
                style="background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}">
            ${escapeHtml(tag.name)}
          </span>
        </div>
        <div class="flex gap-1">
          <button data-action="edit" data-tag-id="${tag.id}"
                  class="p-1 text-gray-600 hover:text-blue-600 rounded" 
                  title="Edit tag">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
            </svg>
          </button>
          <button data-action="delete" data-tag-id="${tag.id}" data-tag-name="${escapeHtml(tag.name)}" data-usage-count="${tag.usage_count}"
                  class="p-1 text-gray-600 hover:text-red-600 rounded" 
                  title="Delete tag">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
      </div>
      
      ${tag.description ? `<p class="text-sm text-gray-600 mb-3">${escapeHtml(tag.description)}</p>` : ''}
      
      <div class="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100">
        <span>Used ${tag.usage_count} time${tag.usage_count !== 1 ? 's' : ''}</span>
        <span>${new Date(tag.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  `).join('');
  
  // Add event delegation for edit and delete buttons
  setupTagActionListeners();
}

// Setup event listeners for tag actions (edit/delete)
function setupTagActionListeners() {
  const grid = document.getElementById('tagsGrid');
  
  // Remove old listener if exists
  const oldGrid = grid.cloneNode(true);
  grid.replaceWith(oldGrid);
  const newGrid = document.getElementById('tagsGrid');
  
  newGrid.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    
    const action = button.dataset.action;
    const tagId = parseInt(button.dataset.tagId);
    
    if (action === 'edit') {
      editTag(tagId);
    } else if (action === 'delete') {
      const tagName = button.dataset.tagName;
      const usageCount = parseInt(button.dataset.usageCount);
      deleteTag(tagId, tagName, usageCount);
    }
  });
}

// Show tag modal (create or edit)
function showTagModal(tagId = null) {
  const modal = document.getElementById('tagModal');
  const title = document.getElementById('modalTitle');
  const form = document.getElementById('tagForm');
  
  currentEditingTagId = tagId;
  
  if (tagId) {
    const tag = tags.find(t => t.id === tagId);
    if (tag) {
      title.textContent = 'Edit Tag';
      document.getElementById('tagName').value = tag.name;
      document.getElementById('tagColor').value = tag.color;
      document.getElementById('tagDescription').value = tag.description || '';
      document.getElementById('colorPreview').style.backgroundColor = tag.color;
    }
  } else {
    title.textContent = 'Create Tag';
    form.reset();
    document.getElementById('tagColor').value = '#3b82f6';
    document.getElementById('colorPreview').style.backgroundColor = '#3b82f6';
  }
  
  modal.classList.remove('hidden');
}

// Hide tag modal
function hideTagModal() {
  document.getElementById('tagModal').classList.add('hidden');
  document.getElementById('tagForm').reset();
  currentEditingTagId = null;
}

// Handle tag form submission
async function handleTagSubmit(e) {
  e.preventDefault();
  
  const name = document.getElementById('tagName').value.trim();
  const color = document.getElementById('tagColor').value;
  const description = document.getElementById('tagDescription').value.trim();
  
  try {
    if (currentEditingTagId) {
      // Update existing tag
      await axios.patch(`/api/tags/${currentEditingTagId}`, {
        name,
        color,
        description
      }, { withCredentials: true });
      
      showNotification('Tag updated successfully', 'success');
    } else {
      // Create new tag
      await axios.post(`/api/projects/${currentProjectId}/tags`, {
        name,
        color,
        description
      }, { withCredentials: true });
      
      showNotification('Tag created successfully', 'success');
    }
    
    hideTagModal();
    await loadTags();
  } catch (error) {
    console.error('Error saving tag:', error);
    if (error.response?.status === 409) {
      showNotification('A tag with this name already exists in this project', 'error');
    } else {
      showNotification('Failed to save tag', 'error');
    }
  }
}

// Edit tag
function editTag(tagId) {
  showTagModal(tagId);
}

// Delete tag
async function deleteTag(tagId, tagName, usageCount) {
  if (usageCount > 0) {
    showNotification(`Cannot delete "${tagName}". It is used by ${usageCount} item(s).`, 'error');
    return;
  }
  
  if (!confirm(`Are you sure you want to delete the tag "${tagName}"?`)) {
    return;
  }
  
  try {
    await axios.delete(`/api/tags/${tagId}`, { withCredentials: true });
    showNotification('Tag deleted successfully', 'success');
    await loadTags();
  } catch (error) {
    console.error('Error deleting tag:', error);
    if (error.response?.data?.usageCount > 0) {
      showNotification(error.response.data.error, 'error');
    } else {
      showNotification('Failed to delete tag', 'error');
    }
  }
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 ${
    type === 'success' ? 'bg-green-500' :
    type === 'error' ? 'bg-red-500' :
    'bg-blue-500'
  }`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
