// Template Mappings Manager - Phase 3b Feature 1
let currentProjectId = null;
let templates = [];
let categories = [];
let issueMappings = [];
let actionMappings = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadProjects();
  await loadTemplates();
  await loadCategories();
  await loadMappings();
  
  setupEventListeners();
  setupTabs();
});

// Load projects for filter
async function loadProjects() {
  try {
    const response = await fetch('/api/projects');
    const projects = await response.json();
    
    const select = document.getElementById('projectFilter');
    projects.forEach(project => {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading projects:', error);
  }
}

// Load templates
async function loadTemplates() {
  try {
    const response = await fetch('/api/templates?sort=name');
    const data = await response.json();
    templates = data.templates || [];
    
    // Populate template selects
    populateTemplateSelect('issueTemplateSelect');
    populateTemplateSelect('actionTemplateSelect');
  } catch (error) {
    console.error('Error loading templates:', error);
  }
}

function populateTemplateSelect(selectId) {
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">Select template...</option>';
  
  templates.forEach(template => {
    const option = document.createElement('option');
    option.value = template.id;
    option.textContent = `${template.name} (${template.usage_count || 0} uses)`;
    select.appendChild(option);
  });
}

// Load action item categories
async function loadCategories() {
  try {
    const response = await fetch('/api/action-item-categories');
    categories = await response.json();
    
    const select = document.getElementById('actionCategorySelect');
    select.innerHTML = '<option value="">Select category...</option>';
    
    categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// Load mappings
async function loadMappings() {
  const projectParam = currentProjectId ? `?projectId=${currentProjectId}` : '';
  
  try {
    // Load issue type mappings
    const issueResponse = await fetch(`/api/templates/issue-type-mappings${projectParam}`);
    issueMappings = await issueResponse.json();
    renderIssueMappings();
    
    // Load action category mappings
    const actionResponse = await fetch(`/api/templates/action-category-mappings${projectParam}`);
    actionMappings = await actionResponse.json();
    renderActionMappings();
  } catch (error) {
    console.error('Error loading mappings:', error);
  }
}

// Render issue type mappings
function renderIssueMappings() {
  const container = document.getElementById('issueTypeMappingsList');
  
  if (issueMappings.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">No issue type mappings configured yet.</p>';
    return;
  }
  
  container.innerHTML = issueMappings.map(mapping => `
    <div class="flex items-center justify-between p-4 border rounded hover:bg-gray-50">
      <div class="flex-1">
        <div class="font-medium text-gray-900">${mapping.issue_type}</div>
        <div class="text-sm text-gray-600">→ ${mapping.template_name}</div>
        ${mapping.project_id ? '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Project-specific</span>' : '<span class="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">Global</span>'}
      </div>
      <div class="flex gap-2">
        <button onclick="deleteIssueMapping(${mapping.id})" class="text-red-600 hover:text-red-800 px-3 py-1 text-sm">Delete</button>
      </div>
    </div>
  `).join('');
}

// Render action category mappings
function renderActionMappings() {
  const container = document.getElementById('actionCategoryMappingsList');
  
  if (actionMappings.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-8">No action category mappings configured yet.</p>';
    return;
  }
  
  container.innerHTML = actionMappings.map(mapping => `
    <div class="flex items-center justify-between p-4 border rounded hover:bg-gray-50">
      <div class="flex-1">
        <div class="font-medium text-gray-900">${mapping.category_name}</div>
        <div class="text-sm text-gray-600">→ ${mapping.template_name}</div>
        ${mapping.project_id ? '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Project-specific</span>' : '<span class="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">Global</span>'}
      </div>
      <div class="flex gap-2">
        <button onclick="deleteActionMapping(${mapping.id})" class="text-red-600 hover:text-red-800 px-3 py-1 text-sm">Delete</button>
      </div>
    </div>
  `).join('');
}

// Event listeners
function setupEventListeners() {
  // Project filter
  document.getElementById('projectFilter').addEventListener('change', (e) => {
    currentProjectId = e.target.value || null;
    loadMappings();
  });
  
  // Add mapping buttons
  document.getElementById('addIssueTypeMapping').addEventListener('click', () => {
    showModal('addIssueTypeMappingModal');
  });
  
  document.getElementById('addActionCategoryMapping').addEventListener('click', () => {
    showModal('addActionCategoryMappingModal');
  });
  
  // Forms
  document.getElementById('addIssueTypeMappingForm').addEventListener('submit', handleAddIssueMapping);
  document.getElementById('addActionCategoryMappingForm').addEventListener('submit', handleAddActionMapping);
  
  // Cancel buttons
  document.querySelectorAll('.cancel-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      hideModal(modal.id);
    });
  });
}

// Tab setup
function setupTabs() {
  document.getElementById('issueTypesTab').addEventListener('click', () => {
    showTab('issueTypes');
  });
  
  document.getElementById('actionCategoriesTab').addEventListener('click', () => {
    showTab('actionCategories');
  });
}

function showTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active', 'border-blue-500', 'text-blue-600');
    btn.classList.add('text-gray-500');
  });
  
  const activeTab = document.getElementById(`${tabName}Tab`);
  activeTab.classList.add('active', 'border-blue-500', 'text-blue-600');
  activeTab.classList.remove('text-gray-500');
  
  // Update panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.add('hidden');
  });
  
  document.getElementById(`${tabName}Panel`).classList.remove('hidden');
}

// Add issue type mapping
async function handleAddIssueMapping(e) {
  e.preventDefault();
  
  const issueType = document.getElementById('issueTypeInput').value.trim();
  const templateId = document.getElementById('issueTemplateSelect').value;
  
  try {
    const response = await fetch('/api/templates/issue-type-mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issueType,
        templateId: parseInt(templateId),
        projectId: currentProjectId ? parseInt(currentProjectId) : null
      })
    });
    
    if (!response.ok) throw new Error('Failed to save mapping');
    
    hideModal('addIssueTypeMappingModal');
    e.target.reset();
    await loadMappings();
    showNotification('Issue type mapping saved successfully', 'success');
  } catch (error) {
    console.error('Error saving mapping:', error);
    showNotification('Failed to save mapping', 'error');
  }
}

// Add action category mapping
async function handleAddActionMapping(e) {
  e.preventDefault();
  
  const categoryId = document.getElementById('actionCategorySelect').value;
  const templateId = document.getElementById('actionTemplateSelect').value;
  
  try {
    const response = await fetch('/api/templates/action-category-mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryId: parseInt(categoryId),
        templateId: parseInt(templateId),
        projectId: currentProjectId ? parseInt(currentProjectId) : null
      })
    });
    
    if (!response.ok) throw new Error('Failed to save mapping');
    
    hideModal('addActionCategoryMappingModal');
    e.target.reset();
    await loadMappings();
    showNotification('Action category mapping saved successfully', 'success');
  } catch (error) {
    console.error('Error saving mapping:', error);
    showNotification('Failed to save mapping', 'error');
  }
}

// Delete mappings
async function deleteIssueMapping(id) {
  if (!confirm('Delete this mapping?')) return;
  
  try {
    const response = await fetch(`/api/templates/issue-type-mappings/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) throw new Error('Failed to delete mapping');
    
    await loadMappings();
    showNotification('Mapping deleted', 'success');
  } catch (error) {
    console.error('Error deleting mapping:', error);
    showNotification('Failed to delete mapping', 'error');
  }
}

async function deleteActionMapping(id) {
  if (!confirm('Delete this mapping?')) return;
  
  try {
    const response = await fetch(`/api/templates/action-category-mappings/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) throw new Error('Failed to delete mapping');
    
    await loadMappings();
    showNotification('Mapping deleted', 'success');
  } catch (error) {
    console.error('Error deleting mapping:', error);
    showNotification('Failed to delete mapping', 'error');
  }
}

// Modal helpers
function showModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
}

function hideModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

// Notification helper
function showNotification(message, type = 'info') {
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  };
  
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded shadow-lg z-50`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.remove(), 3000);
}
