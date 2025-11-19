// Templates.js - Template library functionality

let templateCategories = [];
let currentTemplateData = null;

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
  const currentPage = window.location.pathname;
  
  // Initialize template library page
  if (currentPage.includes('templates.html')) {
    initTemplateLibrary();
    setupTemplatePageListeners();
  }
  
  // Initialize save as template functionality on checklist fill page
  if (currentPage.includes('checklist-fill.html')) {
    setupSaveAsTemplateListeners();
    loadTemplateCategories();
  }
});

// =====================================================
// TEMPLATE PAGE LISTENERS
// =====================================================

function setupTemplatePageListeners() {
  // Get project ID from URL for dropdown navigation
  const urlParams = new URLSearchParams(window.location.search);
  const currentProjectId = urlParams.get('project') || urlParams.get('projectId');
  
  // Initialize standardized back button
  const container = document.getElementById('backButtonContainer');
  if (container) {
    const backBtn = SharedBackButton.create({
      href: currentProjectId ? `index.html?project=${currentProjectId}` : 'index.html',
      text: 'Back to Projects'
    });
    container.appendChild(backBtn);
  }
  
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
  document.getElementById('view-templates-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `templates.html?project=${currentProjectId}`;
    } else {
      window.location.href = 'templates.html';
    }
  });
  document.getElementById('view-schedules-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `schedules.html?projectId=${currentProjectId}`;
    }
  });
  document.getElementById('view-ai-agent-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `ai-agent.html?projectId=${currentProjectId}`;
    }
  });
  document.getElementById('view-proposals-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `proposals.html?projectId=${currentProjectId}`;
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
  
  // View Dropdown  
  viewDropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = viewDropdownMenu?.classList.contains('hidden') === false;
    if (isOpen) {
      closeAllDropdowns();
    } else {
      openDropdown(viewDropdownBtn, viewDropdownMenu, createDropdownBtn, createDropdownMenu);
    }
  });
  
  // Create Dropdown
  createDropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = createDropdownMenu?.classList.contains('hidden') === false;
    if (isOpen) {
      closeAllDropdowns();
    } else {
      openDropdown(createDropdownBtn, createDropdownMenu, viewDropdownBtn, viewDropdownMenu);
    }
  });
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#view-dropdown-btn') && !e.target.closest('#view-dropdown-menu') &&
        !e.target.closest('#create-dropdown-btn') && !e.target.closest('#create-dropdown-menu')) {
      closeAllDropdowns();
    }
  });
  
  // Close dropdowns on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllDropdowns();
    }
  });
}

// =====================================================
// SAVE AS TEMPLATE FUNCTIONALITY
// =====================================================

async function loadTemplateCategories() {
  try {
    const response = await fetch('/api/templates/categories', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load categories');
    }
    
    templateCategories = await response.json();
    
    // Populate category dropdown
    const categorySelect = document.getElementById('templateCategory');
    if (categorySelect) {
      categorySelect.innerHTML = '<option value="">Select a category...</option>';
      templateCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.name;
        option.textContent = `${cat.icon} ${cat.name}`;
        categorySelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

function setupSaveAsTemplateListeners() {
  const saveBtn = document.getElementById('saveAsTemplateBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', showSaveAsTemplateModal);
  }
  
  const closeBtn = document.getElementById('closeSaveTemplateModalBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeSaveTemplateModal);
  }
  
  const cancelBtn = document.getElementById('cancelSaveTemplateBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeSaveTemplateModal);
  }
  
  const confirmBtn = document.getElementById('confirmSaveTemplateBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', saveChecklistAsTemplate);
  }
}

function showSaveAsTemplateModal() {
  const modal = document.getElementById('saveTemplateModal');
  if (modal) {
    // Pre-fill with checklist name if available
    const checklistTitle = document.getElementById('checklistTitle')?.textContent;
    if (checklistTitle && checklistTitle !== 'Loading...') {
      document.getElementById('templateName').value = checklistTitle;
    }
    
    modal.style.display = 'flex';
  }
}

function closeSaveTemplateModal() {
  const modal = document.getElementById('saveTemplateModal');
  if (modal) {
    modal.style.display = 'none';
    document.getElementById('saveTemplateForm').reset();
  }
}

async function saveChecklistAsTemplate() {
  const checklistId = currentChecklistId || new URLSearchParams(window.location.search).get('id');
  
  if (!checklistId) {
    alert('No checklist ID found');
    return;
  }
  
  const name = document.getElementById('templateName').value.trim();
  const description = document.getElementById('templateDescription').value.trim();
  const category = document.getElementById('templateCategory').value;
  const tagsInput = document.getElementById('templateTags').value.trim();
  const isPublic = document.getElementById('templateIsPublic').checked;
  
  if (!name) {
    alert('Please enter a template name');
    return;
  }
  
  // Parse tags
  const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
  
  const templateData = {
    checklist_id: parseInt(checklistId),
    name,
    description,
    category: category || 'General',
    tags,
    is_public: isPublic
  };
  
  try {
    const response = await fetch('/api/templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(templateData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save template');
    }
    
    const result = await response.json();
    
    // Show success message
    if (typeof showToast === 'function') {
      showToast('Template created successfully! You can now use it to create new checklists.', 'success');
    } else {
      alert('Template created successfully!');
    }
    
    closeSaveTemplateModal();
    
  } catch (error) {
    console.error('Error saving template:', error);
    alert(error.message);
  }
}

// =====================================================
// TEMPLATE LIBRARY
// =====================================================

async function initTemplateLibrary() {
  // Wait for AuthManager to be available (it's a global, not window.AuthManager)
  const maxRetries = 50; // 5 seconds max wait
  let retries = 0;
  
  while (typeof AuthManager === 'undefined' && retries < maxRetries) {
    await new Promise(resolve => setTimeout(resolve, 100));
    retries++;
  }
  
  if (typeof AuthManager === 'undefined') {
    console.error('AuthManager not available');
    window.location.href = '/';
    return;
  }
  
  // Initialize AuthManager (check authentication status)
  await AuthManager.init();
  
  // If not authenticated, redirect to home
  if (!AuthManager.isAuthenticated) {
    window.location.href = '/';
    return;
  }
  
  // User is authenticated, load template library
  await loadTemplateLibraryCategories();
  setupTemplateLibraryListeners();
  loadTemplates();
}

async function loadTemplateLibraryCategories() {
  try {
    const response = await fetch('/api/templates/categories', {
      credentials: 'include'
    });
    
    if (response.ok) {
      templateCategories = await response.json();
      renderCategoryFilters();
    }
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

function renderCategoryFilters() {
  const container = document.getElementById('categoryFilters');
  if (!container) return;
  
  container.innerHTML = `
    <button class="category-filter-btn active" data-category="">
      ${IconFactory.renderInline('clipboard', { size: 'text-sm' })} All Templates
    </button>
    ${templateCategories.map(cat => `
      <button class="category-filter-btn" data-category="${cat.name}">
        ${cat.icon} ${cat.name}
      </button>
    `).join('')}
  `;
}

function setupTemplateLibraryListeners() {
  // Template card clicks (event delegation)
  document.getElementById('templatesGrid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.template-card');
    if (card) {
      const templateId = card.dataset.templateId;
      if (templateId) {
        showTemplateDetail(parseInt(templateId));
      }
    }
  });
  
  // Category filters
  document.getElementById('categoryFilters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-filter-btn');
    if (btn) {
      document.querySelectorAll('.category-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Clear search input when selecting a category
      const searchInput = document.getElementById('templateSearch');
      if (searchInput) searchInput.value = '';
      
      const category = btn.dataset.category;
      loadTemplates({ category: category || undefined });
    }
  });
  
  // Search
  const searchInput = document.getElementById('templateSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const search = e.target.value.trim();
      
      // Reset category filter to "All Templates" when searching
      if (search) {
        document.querySelectorAll('.category-filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.category-filter-btn[data-category=""]')?.classList.add('active');
      }
      
      loadTemplates({ search: search || undefined });
    });
  }
  
  // Sort
  const sortSelect = document.getElementById('templateSort');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      loadTemplates({ sort_by: e.target.value });
    });
  }
  
  // Tab filters
  document.getElementById('allTemplatesTab')?.addEventListener('click', () => {
    setActiveTab('all');
    loadTemplates({ is_public: true });
  });
  
  document.getElementById('myTemplatesTab')?.addEventListener('click', () => {
    setActiveTab('my');
    loadTemplates({ my_templates: true, is_public: false });
  });
  
  document.getElementById('featuredTemplatesTab')?.addEventListener('click', () => {
    setActiveTab('featured');
    loadTemplates({ featured: true });
  });
}

function setActiveTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`${tab}TemplatesTab`)?.classList.add('active');
}

async function loadTemplates(filters = {}) {
  const grid = document.getElementById('templatesGrid');
  if (!grid) return;
  
  grid.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">Loading templates...</div>';
  
  try {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, value);
    });
    
    const response = await fetch(`/api/templates?${params}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load templates');
    }
    
    const data = await response.json();
    
    if (data.templates.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-12">
          <div class="text-6xl mb-4">${IconFactory.renderInline('clipboard', { tone: 'muted', size: 'text-6xl' })}</div>
          <p class="text-gray-500">No templates found</p>
          <p class="text-sm text-gray-400 mt-2">Try a different filter or create your own template</p>
        </div>
      `;
      return;
    }
    
    grid.innerHTML = data.templates.map(template => renderTemplateCard(template)).join('');
    
  } catch (error) {
    console.error('Error loading templates:', error);
    grid.innerHTML = '<div class="col-span-full text-center py-8 text-red-500">Error loading templates</div>';
  }
}

function renderTemplateCard(template) {
  const avgRating = template.avg_rating ? Math.round(template.avg_rating * 10) / 10 : 0;
  const stars = IconFactory.renderStarRating(avgRating, { size: 'text-xs' });
  
  return `
    <div class="template-card bg-white rounded-lg border border-gray-200 p-5 hover:shadow-lg transition-all cursor-pointer"
         data-template-id="${template.id}">
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1">
          <h3 class="font-semibold text-gray-900 mb-1">${template.name}</h3>
          <p class="text-xs text-gray-500">${template.category}</p>
        </div>
        ${template.is_featured ? `<span class="text-xl">${IconFactory.renderInline('star', { tone: 'warning', size: 'text-xl', assistiveText: 'Featured template' })}</span>` : ''}
      </div>
      
      <p class="text-sm text-gray-600 mb-3 line-clamp-2">${template.description || 'No description'}</p>
      
      ${template.tags && template.tags.length > 0 ? `
        <div class="flex flex-wrap gap-1 mb-3">
          ${template.tags.slice(0, 3).map(tag => `
            <span class="px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full">${tag}</span>
          `).join('')}
          ${template.tags.length > 3 ? `<span class="text-xs text-gray-400">+${template.tags.length - 3} more</span>` : ''}
        </div>
      ` : ''}
      
      <div class="flex items-center justify-between text-xs text-gray-500 mb-3">
        <span>${IconFactory.renderInline('chart', { tone: 'muted', size: 'text-xs' })} ${template.section_count} sections</span>
        <span>${IconFactory.renderInline('check', { tone: 'success', size: 'text-xs' })} ${template.item_count} items</span>
        <span>${IconFactory.renderInline('user', { tone: 'muted', size: 'text-xs' })} ${template.usage_count} uses</span>
      </div>
      
      <div class="flex items-center justify-between">
        <span class="text-xs text-gray-500">${stars} ${template.rating_count ? `(${template.rating_count})` : ''}</span>
        <span class="text-xs text-gray-400">by ${template.creator_name}</span>
      </div>
    </div>
  `;
}

async function showTemplateDetail(templateId) {
  try {
    const response = await fetch(`/api/templates/${templateId}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load template details');
    }
    
    currentTemplateData = await response.json();
    renderTemplateDetailModal();
    
  } catch (error) {
    console.error('Error loading template details:', error);
    alert('Failed to load template details');
  }
}

function renderTemplateDetailModal() {
  if (!currentTemplateData) return;
  
  const modal = document.getElementById('templateDetailModal');
  if (!modal) {
    // Create modal if it doesn't exist
    createTemplateDetailModal();
  }
  
  const template = currentTemplateData;
  const avgRating = template.avg_rating ? Math.round(template.avg_rating * 10) / 10 : 0;
  
  document.getElementById('templateDetailContent').innerHTML = `
    <div class="space-y-4">
      <div>
        <div class="flex items-start justify-between mb-2">
          <h3 class="text-2xl font-bold text-gray-900">${template.name}</h3>
          ${template.is_featured ? `<span class="text-2xl">${IconFactory.renderInline('star', { tone: 'warning', size: 'text-2xl', assistiveText: 'Featured template' })}</span>` : ''}
        </div>
        <p class="text-sm text-gray-500">${template.category} • by ${template.creator_name}</p>
      </div>
      
      <p class="text-gray-700">${template.description || 'No description provided'}</p>
      
      <div class="flex items-center gap-4 text-sm">
        <span class="flex items-center gap-1">
          ${IconFactory.renderStarRating(avgRating)}
          <span class="text-gray-600">${avgRating.toFixed(1)} (${template.rating_count || 0} ratings)</span>
        </span>
        <span class="text-gray-600">${IconFactory.renderInline('user', { customClass: 'mr-1' })} ${template.usage_count} uses</span>
      </div>
      
      ${template.tags && template.tags.length > 0 ? `
        <div class="flex flex-wrap gap-2">
          ${template.tags.map(tag => `
            <span class="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">${tag}</span>
          `).join('')}
        </div>
      ` : ''}
      
      <div class="border-t pt-4">
        <h4 class="font-semibold text-gray-900 mb-3">Template Structure</h4>
        <div class="space-y-3 max-h-96 overflow-y-auto">
          ${template.sections.map((section, idx) => `
            <details class="border rounded-lg p-3">
              <summary class="cursor-pointer font-medium text-gray-800">
                ${idx + 1}. ${section.title} (${section.items.length} items)
              </summary>
              <div class="mt-3 space-y-1 pl-4">
                ${section.items.map((item, itemIdx) => `
                  <div class="text-sm text-gray-600 flex items-start gap-2">
                    <span class="text-gray-400">${itemIdx + 1}.</span>
                    <span>${item.item_text}${item.is_required ? ' <span class="text-red-500">*</span>' : ''}</span>
                  </div>
                `).join('')}
              </div>
            </details>
          `).join('')}
        </div>
      </div>
      
      <div class="border-t pt-4 flex gap-3">
        <button id="applyTemplateBtn" data-template-id="${template.id}" class="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-all">
          Use This Template
        </button>
        <button id="rateTemplateBtn" data-template-id="${template.id}" class="bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300 transition-all">
          Rate Template
        </button>
      </div>
    </div>
  `;
  
  document.getElementById('templateDetailModal').style.display = 'flex';
  
  // Add event listeners for action buttons
  document.getElementById('applyTemplateBtn')?.addEventListener('click', () => {
    applyTemplate(template.id);
  });
  
  document.getElementById('rateTemplateBtn')?.addEventListener('click', () => {
    rateTemplateModal(template.id);
  });
}

function createTemplateDetailModal() {
  const modal = document.createElement('div');
  modal.id = 'templateDetailModal';
  modal.className = 'modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-content max-w-3xl">
      <div class="modal-header">
        <h3 class="text-xl font-bold">Template Details</h3>
        <button id="closeTemplateDetailBtn" class="close-btn">&times;</button>
      </div>
      <div id="templateDetailContent" class="p-6"></div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Add event listeners for modal buttons
  document.getElementById('closeTemplateDetailBtn').addEventListener('click', closeTemplateDetailModal);
  
  // Close modal when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeTemplateDetailModal();
    }
  });
}

function closeTemplateDetailModal() {
  const modal = document.getElementById('templateDetailModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function applyTemplate(templateId) {
  // Get available projects
  try {
    const projectsResponse = await fetch('/api/projects', {
      credentials: 'include'
    });
    
    if (!projectsResponse.ok) {
      throw new Error('Failed to load projects');
    }
    
    const projects = await projectsResponse.json();
    
    if (projects.length === 0) {
      alert('No projects available. Please create a project first.');
      return;
    }
    
    // Show project selection modal
    const projectId = await selectProject(projects);
    if (!projectId) return;
    
    const response = await fetch(`/api/templates/${templateId}/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ project_id: projectId })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checklist');
    }
    
    const result = await response.json();
    
    if (typeof showToast === 'function') {
      showToast('Checklist created successfully!', 'success');
    } else {
      alert('Checklist created successfully!');
    }
    
    closeTemplateDetailModal();
    
    // Redirect to checklist
    window.location.href = `checklist-fill.html?id=${result.checklist.id}`;
    
  } catch (error) {
    console.error('Error applying template:', error);
    alert(error.message);
  }
}

function selectProject(projects) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-content max-w-md">
        <div class="modal-header">
          <h3 class="text-xl font-bold">Select Project</h3>
        </div>
        <div class="p-6">
          <p class="text-sm text-gray-600 mb-4">Choose which project to create the checklist in:</p>
          <select id="projectSelect" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary">Cancel</button>
          <button class="btn-primary">Create Checklist</button>
        </div>
      </div>
    `;
    
    // Closure to access resolve
    const confirmBtn = modal.querySelector('.btn-primary');
    const cancelBtn = modal.querySelector('.btn-secondary');
    
    confirmBtn.onclick = () => {
      const pid = document.getElementById('projectSelect').value;
      modal.remove();
      resolve(parseInt(pid));
    };
    
    cancelBtn.onclick = () => {
      modal.remove();
      resolve(null);
    };
    
    document.body.appendChild(modal);
  });
}

async function rateTemplateModal(templateId) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content max-w-md">
      <div class="modal-header">
        <h3 class="text-xl font-bold">Rate Template</h3>
        <button id="closeRatingModal" class="close-btn">&times;</button>
      </div>
      <div class="p-6">
        <p class="text-sm text-gray-600 mb-4">How would you rate this template?</p>
        <div id="ratingStarsContainer" class="flex justify-center gap-2 mb-4">
          ${[1,2,3,4,5].map(n => `
            <button data-rating="${n}" class="rating-star text-3xl hover:scale-110 transition-transform">☆</button>
          `).join('')}
        </div>
        <textarea id="ratingReview" placeholder="Optional: Share your thoughts..." rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-lg"></textarea>
      </div>
      <div class="modal-actions">
        <button id="cancelRatingBtn" class="btn-secondary">Cancel</button>
        <button id="submitRatingBtn" class="btn-primary">Submit Rating</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // Add event listeners
  document.getElementById('closeRatingModal').addEventListener('click', () => modal.remove());
  document.getElementById('cancelRatingBtn').addEventListener('click', () => modal.remove());
  
  // Rating stars
  document.querySelectorAll('.rating-star').forEach((star) => {
    star.addEventListener('click', () => {
      const rating = parseInt(star.dataset.rating);
      selectRating(rating);
    });
  });
  
  // Submit rating
  document.getElementById('submitRatingBtn').addEventListener('click', () => {
    submitRating(templateId, modal);
  });
}

function selectRating(rating) {
  document.querySelectorAll('.rating-star').forEach((star, idx) => {
    if (idx < rating) {
      star.innerHTML = IconFactory.renderInline('star', { tone: 'warning', style: 'solid' });
      star.dataset.selected = 'true';
    } else {
      star.innerHTML = IconFactory.renderInline('starOutline', { tone: 'muted', style: 'regular' });
      star.dataset.selected = 'false';
    }
  });
}

async function submitRating(templateId, modal) {
  const selectedStars = document.querySelectorAll('.rating-star[data-selected="true"]');
  const rating = selectedStars.length;
  const review = document.getElementById('ratingReview').value.trim();
  
  if (rating === 0) {
    alert('Please select a rating');
    return;
  }
  
  try {
    const response = await fetch(`/api/templates/${templateId}/rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ rating, review })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit rating');
    }
    
    if (typeof showToast === 'function') {
      showToast('Thank you for your rating!', 'success');
    } else {
      alert('Thank you for your rating!');
    }
    
    modal.remove();
    
    // Reload template details
    if (currentTemplateData && currentTemplateData.id === templateId) {
      await showTemplateDetail(templateId);
    }
    
  } catch (error) {
    console.error('Error submitting rating:', error);
    alert(error.message);
  }
}

// Make functions globally accessible
window.showTemplateDetail = showTemplateDetail;
window.closeTemplateDetailModal = closeTemplateDetailModal;
window.applyTemplate = applyTemplate;
window.rateTemplateModal = rateTemplateModal;
window.selectRating = selectRating;
window.submitRating = submitRating;
