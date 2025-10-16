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
        setupChecklistsPageListeners();
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
        setupChecklistFillPageListeners();
      }
    });
});

// =====================================================
// EVENT LISTENERS SETUP
// =====================================================

function setupChecklistsPageListeners() {
  // Create checklist button
  const createBtn = document.getElementById('createChecklistBtn');
  if (createBtn) {
    createBtn.addEventListener('click', showCreateChecklistModal);
  }
  
  // Back to Projects button
  const backBtn = document.getElementById('backToProjectsBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }
  
  // Filter selects
  const projectFilter = document.getElementById('projectFilter');
  if (projectFilter) {
    projectFilter.addEventListener('change', loadChecklists);
  }
  
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter) {
    statusFilter.addEventListener('change', loadChecklists);
  }
  
  const templateFilter = document.getElementById('templateFilter');
  if (templateFilter) {
    templateFilter.addEventListener('change', loadChecklists);
  }
  
  // Modal close buttons
  const closeModalBtn = document.getElementById('closeModalBtn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeCreateChecklistModal);
  }
  
  const cancelModalBtn = document.getElementById('cancelModalBtn');
  if (cancelModalBtn) {
    cancelModalBtn.addEventListener('click', closeCreateChecklistModal);
  }
  
  // Form submit
  const createForm = document.getElementById('createChecklistForm');
  if (createForm) {
    createForm.addEventListener('submit', createChecklist);
  }
  
  // Event delegation for dynamically created checklist cards
  const checklistsGrid = document.getElementById('checklistsGrid');
  if (checklistsGrid) {
    checklistsGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.checklist-card');
      const openBtn = e.target.closest('.open-checklist-btn');
      const deleteBtn = e.target.closest('.delete-checklist-btn');
      
      if (deleteBtn) {
        e.stopPropagation();
        const checklistId = deleteBtn.dataset.checklistId;
        deleteChecklist(checklistId);
      } else if (openBtn) {
        e.stopPropagation();
        const checklistId = openBtn.dataset.checklistId;
        openChecklist(checklistId);
      } else if (card) {
        const checklistId = card.dataset.checklistId;
        openChecklist(checklistId);
      }
    });
  }
  
  // Get project ID from URL for dropdown navigation
  const urlParams = new URLSearchParams(window.location.search);
  const currentProjectId = urlParams.get('project');
  
  // View dropdown navigation
  document.getElementById('dashboard-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `dashboard.html?projectId=${currentProjectId}`;
    }
  });
  document.getElementById('view-checklists-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `checklists.html?project=${currentProjectId}`;
    } else {
      window.location.href = 'checklists.html';
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
  
  // Create dropdown navigation
  document.getElementById('create-issue-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `index.html?project=${currentProjectId}#create-issue`;
    }
  });
  document.getElementById('create-action-item-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `index.html?project=${currentProjectId}#create-action`;
    }
  });
  
  // Dropdown menu functionality
  const viewDropdownBtn = document.getElementById('view-dropdown-btn');
  const viewDropdownMenu = document.getElementById('view-dropdown-menu');
  const createDropdownBtn = document.getElementById('create-dropdown-btn');
  const createDropdownMenu = document.getElementById('create-dropdown-menu');
  
  function openDropdown(btn, menu, otherBtn, otherMenu) {
    menu?.classList.remove('hidden');
    otherMenu?.classList.add('hidden');
    btn?.setAttribute('aria-expanded', 'true');
    otherBtn?.setAttribute('aria-expanded', 'false');
    const firstItem = menu?.querySelector('button[role="menuitem"]');
    firstItem?.focus();
  }
  
  function closeDropdown(btn, menu) {
    menu?.classList.add('hidden');
    btn?.setAttribute('aria-expanded', 'false');
  }
  
  function closeAllDropdowns() {
    closeDropdown(viewDropdownBtn, viewDropdownMenu);
    closeDropdown(createDropdownBtn, createDropdownMenu);
  }
  
  // Toggle View dropdown
  viewDropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !viewDropdownMenu?.classList.contains('hidden');
    if (isOpen) {
      closeDropdown(viewDropdownBtn, viewDropdownMenu);
    } else {
      openDropdown(viewDropdownBtn, viewDropdownMenu, createDropdownBtn, createDropdownMenu);
    }
  });
  
  // Toggle Create dropdown
  createDropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !createDropdownMenu?.classList.contains('hidden');
    if (isOpen) {
      closeDropdown(createDropdownBtn, createDropdownMenu);
    } else {
      openDropdown(createDropdownBtn, createDropdownMenu, viewDropdownBtn, viewDropdownMenu);
    }
  });
  
  // Close dropdowns on outside click
  document.addEventListener('click', closeAllDropdowns);
  
  // Keyboard navigation for dropdowns
  [viewDropdownMenu, createDropdownMenu].forEach(menu => {
    menu?.addEventListener('keydown', (e) => {
      const items = Array.from(menu.querySelectorAll('button[role="menuitem"]'));
      const currentIndex = items.indexOf(document.activeElement);
      
      switch(e.key) {
        case 'ArrowDown':
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % items.length;
          items[nextIndex]?.focus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          const prevIndex = (currentIndex - 1 + items.length) % items.length;
          items[prevIndex]?.focus();
          break;
        case 'Home':
          e.preventDefault();
          items[0]?.focus();
          break;
        case 'End':
          e.preventDefault();
          items[items.length - 1]?.focus();
          break;
        case 'Escape':
          e.preventDefault();
          const isInView = menu === viewDropdownMenu;
          closeDropdown(isInView ? viewDropdownBtn : createDropdownBtn, menu);
          (isInView ? viewDropdownBtn : createDropdownBtn)?.focus();
          break;
      }
    });
  });
}

function setupChecklistFillPageListeners() {
  // Save progress button
  const saveBtn = document.getElementById('saveProgressBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveProgress);
  }
  
  // Back to list button
  const backBtn = document.getElementById('backToListBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = 'checklists.html';
    });
  }
  
  // Validate button
  const validateBtn = document.getElementById('validateBtn');
  if (validateBtn) {
    validateBtn.addEventListener('click', () => {
      const urlParams = new URLSearchParams(window.location.search);
      const checklistId = urlParams.get('id');
      if (checklistId) {
        runValidation(checklistId);
      }
    });
  }
  
  // Export PDF button
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', showExportPdfModal);
  }
  
  // Export modal close buttons
  const closeExportModalBtn = document.getElementById('closeExportModalBtn');
  if (closeExportModalBtn) {
    closeExportModalBtn.addEventListener('click', closeExportPdfModal);
  }
  
  const cancelExportBtn = document.getElementById('cancelExportBtn');
  if (cancelExportBtn) {
    cancelExportBtn.addEventListener('click', closeExportPdfModal);
  }
  
  // Confirm export button
  const confirmExportBtn = document.getElementById('confirmExportBtn');
  if (confirmExportBtn) {
    confirmExportBtn.addEventListener('click', exportChecklistAsPdf);
  }
  
  // Add comment button
  const addCommentBtn = document.getElementById('addCommentBtn');
  if (addCommentBtn) {
    addCommentBtn.addEventListener('click', addComment);
  }
  
  // Event delegation for section toggles
  const sectionsContainer = document.getElementById('checklistSections');
  if (sectionsContainer) {
    sectionsContainer.addEventListener('click', (e) => {
      const sectionHeader = e.target.closest('.section-header');
      if (sectionHeader) {
        const sectionId = sectionHeader.dataset.sectionId;
        toggleSection(sectionId);
      }
    });
    
    // Event delegation for field inputs
    sectionsContainer.addEventListener('change', (e) => {
      const checkbox = e.target.closest('.checkbox-field');
      const dateField = e.target.closest('.date-field');
      const radioField = e.target.closest('.radio-field');
      const selectField = e.target.closest('.select-field');
      
      if (checkbox) {
        const itemId = checkbox.dataset.itemId;
        saveResponse(itemId, checkbox.checked, 'checkbox');
      } else if (dateField) {
        const itemId = dateField.dataset.itemId;
        saveResponse(itemId, dateField.value, 'date');
      } else if (radioField) {
        const itemId = radioField.dataset.itemId;
        saveResponse(itemId, radioField.value, 'radio');
      } else if (selectField) {
        const itemId = selectField.dataset.itemId;
        saveResponse(itemId, selectField.value, 'dropdown');
      }
    });
    
    // Event delegation for text fields with debouncing
    sectionsContainer.addEventListener('input', (e) => {
      const textField = e.target.closest('.text-field');
      const textareaField = e.target.closest('.textarea-field');
      
      if (textField) {
        const itemId = textField.dataset.itemId;
        debouncedSave(itemId, textField.value, 'text');
      } else if (textareaField) {
        const itemId = textareaField.dataset.itemId;
        debouncedSave(itemId, textareaField.value, 'textarea');
      }
    });
  }
}

async function initChecklistsListPage() {
  await Promise.all([
    loadTemplates(),
    loadProjects(),
    loadUsers()
  ]);
  populateFilters();
  
  // Check for project parameter in URL
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('project');
  
  if (projectId) {
    // Pre-select the project in filter
    const projectFilter = document.getElementById('projectFilter');
    if (projectFilter) {
      projectFilter.value = projectId;
    }
    
    // Display project name
    const project = projects.find(p => p.id === parseInt(projectId));
    if (project) {
      const projectContext = document.getElementById('project-context');
      const projectNameEl = document.getElementById('project-name');
      if (projectContext && projectNameEl) {
        projectNameEl.textContent = project.name;
        projectContext.classList.remove('hidden');
      }
    }
  }
  
  // Now load checklists (after filters are set)
  await loadChecklists();
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
    <div class="checklist-card" data-checklist-id="${checklist.id}">
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
        <button class="open-checklist-btn btn-primary btn-sm" data-checklist-id="${checklist.id}">
          Open
        </button>
        <button class="delete-checklist-btn btn-danger btn-sm" data-checklist-id="${checklist.id}">
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
  
  // Check for project parameter in URL
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('project');
  
  // Populate project select
  const projectSelect = document.getElementById('projectSelect');
  projectSelect.innerHTML = '<option value="">Select project...</option>' +
    projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  
  // Pre-select project if available
  if (projectId) {
    projectSelect.value = projectId;
  }
  
  // Populate template select - show all templates (templates are global)
  const templateSelect = document.getElementById('templateSelect');
  templateSelect.innerHTML = '<option value="">Select template...</option>' +
    templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  
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
      <div class="section-header" data-section-id="${sectionId}">
        <div class="flex items-center gap-2">
          <span class="section-toggle" id="${sectionId}-toggle">▼</span>
          <h3 class="section-title">${section.section_number ? section.section_number + ' ' : ''}${escapeHtml(section.title)}</h3>
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
    <div class="checklist-item" data-item-id="${item.item_id}" data-template-item-id="${item.template_item_id}">
      <div class="item-label">
        ${escapeHtml(item.item_text)} ${requiredMark}
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
              data-item-id="${item.item_id}"
              class="checkbox-field">`;
    
    case 'text':
      return `<input type="text" value="${escapeHtml(value)}" 
              data-item-id="${item.item_id}"
              class="text-field">`;
    
    case 'textarea':
      return `<textarea rows="3" 
              data-item-id="${item.item_id}"
              class="textarea-field">${escapeHtml(value)}</textarea>`;
    
    case 'date':
      return `<input type="date" value="${dateValue}" 
              data-item-id="${item.item_id}"
              class="date-field">`;
    
    case 'radio':
      const radioOptions = item.field_options ? JSON.parse(item.field_options) : [];
      return radioOptions.map(opt => `
        <label class="radio-label">
          <input type="radio" name="item_${item.item_id}" value="${escapeHtml(opt)}" 
                 ${value === opt ? 'checked' : ''}
                 data-item-id="${item.item_id}"
                 class="radio-field">
          ${escapeHtml(opt)}
        </label>
      `).join('');
    
    case 'dropdown':
      const dropOptions = item.field_options ? JSON.parse(item.field_options) : [];
      return `<select data-item-id="${item.item_id}" class="select-field">
        <option value="">Select...</option>
        ${dropOptions.map(opt => 
          `<option value="${escapeHtml(opt)}" ${value === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
        ).join('')}
      </select>`;
    
    default:
      return `<input type="text" value="${escapeHtml(value)}" data-item-id="${item.item_id}" class="text-field">`;
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
  // Determine if item is completed based on field type and value
  let isCompleted = false;
  if (fieldType === 'checkbox') {
    isCompleted = value === true;
  } else if (fieldType === 'text' || fieldType === 'textarea') {
    isCompleted = value && value.trim().length > 0;
  } else if (fieldType === 'date') {
    isCompleted = value && value.length > 0;
  } else if (fieldType === 'radio' || fieldType === 'dropdown') {
    isCompleted = value && value.length > 0;
  }
  
  const responseData = {
    template_item_id: itemId,
    value: value,
    type: fieldType,
    is_completed: isCompleted
  };
  
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
  
  // Update circular progress color based on percentage
  const progressCircle = document.querySelector('.progress-circle');
  if (progressCircle) {
    const degrees = (progress / 100) * 360;
    let color = '#3b82f6'; // Blue default
    
    // Color based on progress: 0-30% red, 31-70% yellow, 71-100% green
    if (progress <= 30) {
      color = '#ef4444'; // Red
    } else if (progress <= 70) {
      color = '#f59e0b'; // Yellow
    } else {
      color = '#10b981'; // Green
    }
    
    progressCircle.style.background = `conic-gradient(${color} ${degrees}deg, #e5e7eb ${degrees}deg)`;
  }
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
  
  // Template filter - show all templates (templates are global)
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
// PDF EXPORT FUNCTIONS
// =====================================================

function showExportPdfModal() {
  const modal = document.getElementById('exportPdfModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeExportPdfModal() {
  const modal = document.getElementById('exportPdfModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function exportChecklistAsPdf() {
  const confirmBtn = document.getElementById('confirmExportBtn');
  const originalText = confirmBtn.innerHTML;
  
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const checklistId = urlParams.get('id');
    
    if (!checklistId) {
      showToast('No checklist ID found', 'error');
      return;
    }
    
    // Get export options
    const formatRadios = document.getElementsByName('pdfFormat');
    let format = 'full';
    for (const radio of formatRadios) {
      if (radio.checked) {
        format = radio.value;
        break;
      }
    }
    
    const includeComments = document.getElementById('includeComments').checked;
    const includeCharts = document.getElementById('includeCharts').checked;
    const includeMetadata = document.getElementById('includeMetadata').checked;
    
    // Build query string
    const queryParams = new URLSearchParams({
      format,
      include_comments: includeComments,
      include_charts: includeCharts,
      include_metadata: includeMetadata
    });
    
    // Show loading state on button
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `
      <svg class="w-5 h-5 inline-block mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
      Generating...
    `;
    
    // Request PDF
    const response = await fetch(`/api/checklists/${checklistId}/export/pdf?${queryParams}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to export PDF');
    }
    
    // Get PDF blob
    const blob = await response.blob();
    
    // Get filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'checklist.pdf';
    if (contentDisposition) {
      const matches = /filename="?([^"]+)"?/.exec(contentDisposition);
      if (matches && matches[1]) {
        filename = matches[1];
      }
    }
    
    // Create download link with better browser support
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    
    // Add to DOM, click, and remove
    document.body.appendChild(a);
    
    // Try to trigger download
    try {
      a.click();
      
      // Show success toast
      showToast('PDF downloaded successfully! Check your Downloads folder.', 'success');
      
    } catch (err) {
      // Fallback: open in new tab if download fails
      console.error('Download failed, opening in new tab:', err);
      window.open(url, '_blank');
      showToast('PDF opened in new tab. Right-click to save it.', 'info');
    }
    
    // Clean up after a delay
    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      window.URL.revokeObjectURL(url);
    }, 1000);
    
    // Reset button
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalText;
    
    // Close modal
    closeExportPdfModal();
    
  } catch (error) {
    console.error('Export error:', error);
    
    // Reset button
    const confirmBtn = document.getElementById('confirmExportBtn');
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalText;
    
    showToast(error.message || 'Failed to export PDF', 'error');
  }
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
