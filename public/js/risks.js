// Risk Register JavaScript

let currentUser = null;
let currentProjectId = null;
let allRisks = [];
let categories = [];
let users = [];
let editingRiskId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  initializeBackButtons();
  await loadProjects();
  setupEventListeners();
});

// Initialize standardized back buttons
function initializeBackButtons() {
  const container = document.getElementById('backButtonsContainer');
  if (!container) return;
  
  // Back to Project button (shown only when viewing a specific project)
  const backToProjectBtn = SharedBackButton.create({
    href: 'dashboard.html',
    text: 'Back to Project',
    onClick: goBackToProject
  });
  backToProjectBtn.id = 'backToProjectBtn';
  backToProjectBtn.classList.add('hidden');
  
  // Back to Projects button (always visible)
  const backToProjectsBtn = SharedBackButton.create({
    href: 'index.html',
    text: 'Back to Projects'
  });
  backToProjectsBtn.id = 'backToProjectsBtn';
  
  container.appendChild(backToProjectBtn);
  container.appendChild(backToProjectsBtn);
}

// Check authentication
async function checkAuth() {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      window.location.href = '/index.html';
      return;
    }
    
    currentUser = await response.json();
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = '/index.html';
  }
}

// Load projects for selector
async function loadProjects() {
  try {
    const response = await fetch('/api/projects', {
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to load projects');
    
    const projects = await response.json();
    const selector = document.getElementById('projectSelector');
    
    selector.innerHTML = '<option value="">Select a project...</option>';
    projects.forEach(project => {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      selector.appendChild(option);
    });
    
    // Get projectId from URL if available
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('projectId');
    if (projectId) {
      selector.value = projectId;
      
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
      
      await onProjectChange();
    }
  } catch (error) {
    console.error('Error loading projects:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Project selector
  document.getElementById('projectSelector').addEventListener('change', onProjectChange);
  
  // New risk buttons
  document.getElementById('btnNewRisk').addEventListener('click', openCreateModal);
  
  // Empty state button (if exists - may be replaced by SharedEmptyState)
  const btnNewRiskEmpty = document.getElementById('btnNewRiskEmpty');
  if (btnNewRiskEmpty) {
    btnNewRiskEmpty.addEventListener('click', openCreateModal);
  }
  
  // Filters
  document.getElementById('filterStatus').addEventListener('change', applyFilters);
  document.getElementById('filterCategory').addEventListener('change', applyFilters);
  document.getElementById('filterLevel').addEventListener('change', applyFilters);
  document.getElementById('filterOwner').addEventListener('change', applyFilters);
  document.getElementById('sortBy').addEventListener('change', applyFilters);
  document.getElementById('btnClearFilters').addEventListener('click', clearFilters);
  
  // Risk form
  document.getElementById('riskForm').addEventListener('submit', handleRiskSubmit);
  
  // Real-time score calculation
  document.querySelectorAll('input[name="probability"]').forEach(input => {
    input.addEventListener('change', updateRiskScore);
  });
  document.querySelectorAll('input[name="impact"]').forEach(input => {
    input.addEventListener('change', updateRiskScore);
  });
  
  // Modal close buttons - add event listeners for all close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const modalId = this.closest('.modal').id;
      if (modalId === 'riskModal') closeRiskModal();
      else if (modalId === 'detailModal') closeDetailModal();
      else if (modalId === 'deleteModal') closeDeleteModal();
    });
  });
  
  // Cancel buttons in modals
  document.querySelectorAll('.btn-secondary').forEach(btn => {
    if (btn.textContent.includes('Cancel') || btn.textContent.includes('Close')) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const modalId = this.closest('.modal').id;
        if (modalId === 'riskModal') closeRiskModal();
        else if (modalId === 'detailModal') closeDetailModal();
        else if (modalId === 'deleteModal') closeDeleteModal();
      });
    }
  });
  
  // Back buttons are now initialized by initializeBackButtons() function
  
  // View dropdown navigation
  document.getElementById('dashboard-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `dashboard.html?projectId=${currentProjectId}`;
    }
  });
  document.getElementById('view-checklists-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `checklists.html?project=${currentProjectId}`;
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
    } else {
      window.location.href = 'risks.html';
    }
  });
  document.getElementById('view-templates-btn')?.addEventListener('click', () => {
    if (currentProjectId) {
      window.location.href = `templates.html?project=${currentProjectId}`;
    } else {
      window.location.href = 'templates.html';
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
  
  // Event delegation for risk cards and action icons
  document.getElementById('risksList').addEventListener('click', function(e) {
    // Check if an icon button with data-action was clicked
    const button = e.target.closest('[data-action]');
    if (button) {
      e.stopPropagation();
      e.preventDefault();
      const action = button.dataset.action;
      
      if (action === 'edit') {
        const riskData = JSON.parse(button.dataset.risk);
        openEditModal(riskData);
      } else if (action === 'delete') {
        const riskId = parseInt(button.dataset.riskId);
        confirmDelete(riskId);
      }
      return;
    }
    
    // Otherwise, check if the card itself was clicked (for showing details)
    const card = e.target.closest('.risk-card');
    if (card && card.dataset.risk) {
      // Don't trigger if clicking on the icon buttons area
      if (!e.target.closest('.risk-card-actions')) {
        const riskData = JSON.parse(card.dataset.risk);
        showRiskDetails(riskData);
      }
    }
  });
}

// Go back to project
function goBackToProject() {
  console.log('goBackToProject called, currentProjectId:', currentProjectId);
  if (currentProjectId) {
    window.location.href = `index.html?project=${currentProjectId}`;
  } else {
    console.warn('No currentProjectId set, cannot navigate back to project');
  }
}

// Expose to global scope for onclick handlers
window.goBackToProject = goBackToProject;

// Project change handler
async function onProjectChange() {
  const projectId = document.getElementById('projectSelector').value;
  
  if (!projectId) {
    currentProjectId = null;
    document.getElementById('risksList').innerHTML = '';
    document.getElementById('emptyState')?.classList.add('hidden');
    document.getElementById('btnNewRisk')?.classList.add('hidden');
    document.getElementById('backToProjectBtn')?.classList.add('hidden');
    document.getElementById('backToProjectsBtn')?.classList.remove('hidden');
    return;
  }
  
  currentProjectId = projectId;
  
  // Toggle navigation buttons - show Back to Project, hide Back to Projects
  document.getElementById('backToProjectBtn')?.classList.remove('hidden');
  document.getElementById('backToProjectsBtn')?.classList.add('hidden');
  
  // Check permissions
  const canCreate = canCreateRisk(currentUser);
  if (canCreate) {
    document.getElementById('btnNewRisk')?.classList.remove('hidden');
    document.getElementById('btnNewRiskEmpty')?.classList.remove('hidden');
  } else {
    document.getElementById('btnNewRisk')?.classList.add('hidden');
    document.getElementById('btnNewRiskEmpty')?.classList.add('hidden');
  }
  
  // Load data
  await Promise.all([
    loadCategories(),
    loadUsers(),
    loadRisks()
  ]);
}

// Load risk categories
async function loadCategories() {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/risk-categories`, {
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to load categories');
    
    categories = await response.json();
    
    // Update category selectors
    const categorySelects = [
      document.getElementById('riskCategory'),
      document.getElementById('filterCategory')
    ];
    
    categorySelects.forEach(select => {
      const currentValue = select.value;
      select.innerHTML = select.id === 'filterCategory' 
        ? '<option value="">All Categories</option>' 
        : '<option value="">Select category...</option>';
      
      categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.name;
        option.textContent = `${cat.icon} ${cat.name}`;
        select.appendChild(option);
      });
      
      if (currentValue) select.value = currentValue;
    });
  } catch (error) {
    console.error('Error loading categories:', error);
  }
}

// Load users for owner dropdown
async function loadUsers() {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/members`, {
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to load users');
    
    users = await response.json();
    
    // Update owner selectors
    const ownerSelects = [
      document.getElementById('riskOwner'),
      document.getElementById('filterOwner')
    ];
    
    ownerSelects.forEach(select => {
      const currentValue = select.value;
      select.innerHTML = select.id === 'filterOwner'
        ? '<option value="">All Owners</option>'
        : '<option value="">Select owner...</option>';
      
      users.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.username || user.email;
        select.appendChild(option);
      });
      
      if (currentValue) select.value = currentValue;
    });
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

// Load risks
async function loadRisks() {
  const loadingState = document.getElementById('loadingState');
  const risksList = document.getElementById('risksList');
  const emptyState = document.getElementById('emptyState');
  
  // Show loading with SharedLoadingSpinner
  if (typeof window.SharedLoadingSpinner !== 'undefined') {
    loadingState.innerHTML = '';
    new window.SharedLoadingSpinner(loadingState, {
      message: 'Loading risks...',
      size: 'large'
    });
  }
  loadingState.style.display = 'block';
  risksList.innerHTML = '';
  emptyState.style.display = 'none';
  
  try {
    // Build query params
    const params = new URLSearchParams();
    const status = document.getElementById('filterStatus').value;
    const category = document.getElementById('filterCategory').value;
    const level = document.getElementById('filterLevel').value;
    const owner = document.getElementById('filterOwner').value;
    const sort = document.getElementById('sortBy').value;
    
    if (status) params.append('status', status);
    if (category) params.append('category', category);
    if (level) params.append('level', level);
    if (owner) params.append('owner', owner);
    if (sort) params.append('sort', sort);
    
    const response = await fetch(`/api/projects/${currentProjectId}/risks?${params}`, {
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to load risks');
    
    allRisks = await response.json();
    
    loadingState.style.display = 'none';
    
    if (allRisks.length === 0) {
      // Show empty state with SharedEmptyState
      if (typeof window.SharedEmptyState !== 'undefined') {
        emptyState.innerHTML = '';
        new window.SharedEmptyState(emptyState, {
          icon: 'clipboard',
          title: 'No Risks Found',
          message: 'There are no risks matching your filters. Try adjusting your search criteria.',
          actionText: null
        });
      }
      emptyState.style.display = 'block';
    } else {
      displayRisks(allRisks);
    }
  } catch (error) {
    console.error('Error loading risks:', error);
    loadingState.style.display = 'none';
    showError('Failed to load risks');
  }
}

// Display risks
function displayRisks(risks) {
  const risksList = document.getElementById('risksList');
  risksList.innerHTML = '';
  
  risks.forEach(risk => {
    const card = createRiskCard(risk);
    risksList.appendChild(card);
  });
}

// Create risk card
function createRiskCard(risk) {
  const card = document.createElement('div');
  card.className = 'risk-card';
  card.dataset.risk = JSON.stringify(risk);
  
  const levelClass = `risk-level-${risk.risk_level?.toLowerCase() || 'low'}`;
  const statusClass = `status-${risk.status?.toLowerCase() || 'identified'}`;
  
  // Get category emoji
  const category = categories.find(c => c.name === risk.category);
  const categoryEmoji = category?.icon || '📋';
  
  // Format dates
  const targetDate = risk.target_resolution_date 
    ? new Date(risk.target_resolution_date).toLocaleDateString() 
    : 'Not set';
  
  card.innerHTML = `
    <div class="risk-card-header">
      <div class="flex items-center gap-2">
        <span class="risk-id">${risk.risk_id}</span>
        <span class="risk-level-badge ${levelClass}">${risk.risk_level || 'N/A'}</span>
      </div>
      <div class="risk-card-actions flex items-center gap-2">
        ${canEditRisk(currentUser, risk) ? `
          <button class="risk-icon-btn" data-action="edit" data-risk='${JSON.stringify(risk).replace(/'/g, "&#39;")}' aria-label="Edit risk" title="Edit risk">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
        ` : ''}
        ${canDeleteRisk(currentUser) ? `
          <button class="risk-icon-btn risk-icon-btn-delete" data-action="delete" data-risk-id="${risk.id}" aria-label="Delete risk" title="Delete risk">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        ` : ''}
      </div>
    </div>
    <h3 class="risk-title">${escapeHtml(risk.title)}</h3>
    <div class="risk-meta">
      <div class="risk-meta-row">
        <span class="risk-meta-item">
          <span class="risk-meta-label">Category:</span>
          ${categoryEmoji} ${risk.category}
        </span>
      </div>
      <div class="risk-meta-row">
        <span class="risk-meta-item">
          <span class="risk-meta-label">P:</span>${risk.probability || 'N/A'}
        </span>
        <span class="risk-meta-item">
          <span class="risk-meta-label">I:</span>${risk.impact || 'N/A'}
        </span>
        <span class="risk-meta-item risk-score-display">
          <span class="risk-meta-label">Score:</span>${risk.risk_score || 'N/A'}
        </span>
        <span class="risk-meta-item">
          <span class="risk-meta-label">Owner:</span>
          ${risk.owner_name || 'Unassigned'}
        </span>
      </div>
      <div class="risk-meta-row">
        <span class="status-badge ${statusClass}">${formatStatus(risk.status)}</span>
        <span class="risk-meta-item">
          <span class="risk-meta-label">Due:</span>${targetDate}
        </span>
      </div>
    </div>
    ${risk.mitigation_plan ? `
      <div class="risk-description">
        <strong>Mitigation:</strong> ${escapeHtml(risk.mitigation_plan).substring(0, 100)}${risk.mitigation_plan.length > 100 ? '...' : ''}
      </div>
    ` : ''}
  `;
  
  return card;
}

// Apply filters
function applyFilters() {
  loadRisks();
}

// Clear filters
function clearFilters() {
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterCategory').value = '';
  document.getElementById('filterLevel').value = '';
  document.getElementById('filterOwner').value = '';
  document.getElementById('sortBy').value = 'score_desc';
  loadRisks();
}

// Open create modal
function openCreateModal() {
  editingRiskId = null;
  document.getElementById('modalTitle').textContent = 'Create New Risk';
  document.getElementById('saveButtonText').textContent = 'Create Risk';
  document.getElementById('riskForm').reset();
  document.getElementById('modalError').style.display = 'none';
  
  // Reset score display
  document.getElementById('riskScoreValue').textContent = '0';
  document.getElementById('riskLevelValue').textContent = 'Not Assessed';
  document.getElementById('riskLevelBadge').style.backgroundColor = '#9ca3af';
  
  // Load tags for risks (tag_type: 'risk' or 'both')
  loadTagsForRisks();
  
  document.getElementById('riskModal').classList.add('active');
}

// Open edit modal
async function openEditModal(risk) {
  editingRiskId = risk.id;
  document.getElementById('modalTitle').textContent = 'Edit Risk';
  document.getElementById('saveButtonText').textContent = 'Update Risk';
  document.getElementById('modalError').style.display = 'none';
  
  // Fill form
  document.getElementById('riskTitle').value = risk.title || '';
  document.getElementById('riskDescription').value = risk.description || '';
  document.getElementById('riskCategory').value = risk.category || '';
  document.getElementById('riskSource').value = risk.risk_source || '';
  
  // Load tags and pre-select current ones
  await loadTagsForEditRisk(risk.id);
  
  // Set probability and impact
  if (risk.probability) {
    document.getElementById(`prob${risk.probability}`).checked = true;
  }
  if (risk.impact) {
    document.getElementById(`impact${risk.impact}`).checked = true;
  }
  
  document.getElementById('riskResponseStrategy').value = risk.response_strategy || '';
  document.getElementById('riskStatus').value = risk.status || 'identified';
  document.getElementById('riskMitigationPlan').value = risk.mitigation_plan || '';
  document.getElementById('riskContingencyPlan').value = risk.contingency_plan || '';
  document.getElementById('riskCostCurrency').value = risk.cost_currency || 'USD';
  document.getElementById('riskMitigationCost').value = risk.mitigation_cost || '';
  document.getElementById('riskMitigationEffort').value = risk.mitigation_effort_hours || '';
  document.getElementById('riskOwner').value = risk.risk_owner_id || '';
  document.getElementById('riskTargetDate').value = risk.target_resolution_date?.split('T')[0] || '';
  document.getElementById('riskReviewDate').value = risk.review_date?.split('T')[0] || '';
  
  // Update score display
  updateRiskScore();
  
  document.getElementById('riskModal').classList.add('active');
}

// Close risk modal
function closeRiskModal() {
  document.getElementById('riskModal').classList.remove('active');
  editingRiskId = null;
}

// Expose to global scope for onclick handlers
window.closeRiskModal = closeRiskModal;

// Update risk score in real-time
function updateRiskScore() {
  const probability = parseInt(document.querySelector('input[name="probability"]:checked')?.value) || 0;
  const impact = parseInt(document.querySelector('input[name="impact"]:checked')?.value) || 0;
  const score = probability * impact;
  
  let level, color;
  if (score === 0) {
    level = 'Not Assessed';
    color = '#9ca3af';
  } else if (score <= 6) {
    level = 'Low';
    color = '#10b981';
  } else if (score <= 12) {
    level = 'Medium';
    color = '#f59e0b';
  } else if (score <= 20) {
    level = 'High';
    color = '#f97316';
  } else {
    level = 'Critical';
    color = '#ef4444';
  }
  
  document.getElementById('riskScoreValue').textContent = score;
  document.getElementById('riskLevelValue').textContent = level;
  document.getElementById('riskLevelBadge').style.backgroundColor = color;
}

// Handle risk form submission
async function handleRiskSubmit(e) {
  e.preventDefault();
  
  const modalError = document.getElementById('modalError');
  modalError.style.display = 'none';
  
  // Get form data
  const title = document.getElementById('riskTitle').value.trim();
  const description = document.getElementById('riskDescription').value.trim();
  const category = document.getElementById('riskCategory').value;
  const riskSource = document.getElementById('riskSource').value.trim();
  
  // Get selected tag IDs from multi-select
  const tagSelect = document.getElementById('riskTags');
  const selectedTagIds = Array.from(tagSelect.selectedOptions).map(option => parseInt(option.value));
  
  const probability = parseInt(document.querySelector('input[name="probability"]:checked')?.value) || null;
  const impact = parseInt(document.querySelector('input[name="impact"]:checked')?.value) || null;
  const responseStrategy = document.getElementById('riskResponseStrategy').value;
  const status = document.getElementById('riskStatus').value;
  const mitigationPlan = document.getElementById('riskMitigationPlan').value.trim();
  const contingencyPlan = document.getElementById('riskContingencyPlan').value.trim();
  const costCurrency = document.getElementById('riskCostCurrency').value;
  const mitigationCost = parseFloat(document.getElementById('riskMitigationCost').value) || null;
  const mitigationEffort = parseFloat(document.getElementById('riskMitigationEffort').value) || null;
  const riskOwnerId = parseInt(document.getElementById('riskOwner').value) || null;
  const targetDate = document.getElementById('riskTargetDate').value || null;
  const reviewDate = document.getElementById('riskReviewDate').value || null;
  
  // Validate
  if (!title || !category) {
    modalError.textContent = 'Title and category are required';
    modalError.style.display = 'block';
    return;
  }
  
  const riskData = {
    title,
    description,
    category,
    risk_source: riskSource || null,
    probability,
    impact,
    response_strategy: responseStrategy || null,
    status,
    mitigation_plan: mitigationPlan || null,
    contingency_plan: contingencyPlan || null,
    cost_currency: costCurrency,
    mitigation_cost: mitigationCost,
    mitigation_effort_hours: mitigationEffort,
    risk_owner_id: riskOwnerId,
    target_resolution_date: targetDate,
    review_date: reviewDate
  };
  
  try {
    const saveButton = document.getElementById('btnSaveRisk');
    saveButton.disabled = true;
    saveButton.innerHTML = '<span class="loading-spinner"></span> Saving...';
    
    const url = editingRiskId 
      ? `/api/risks/${editingRiskId}`
      : `/api/projects/${currentProjectId}/risks`;
    
    const method = editingRiskId ? 'PATCH' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(riskData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save risk');
    }
    
    const savedRisk = await response.json();
    const riskId = editingRiskId || savedRisk.id;
    
    // Save tags
    await fetch(`/api/risks/${riskId}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tagIds: selectedTagIds })
    });
    
    closeRiskModal();
    await loadRisks();
    showSuccess(editingRiskId ? 'Risk updated successfully' : 'Risk created successfully');
  } catch (error) {
    console.error('Error saving risk:', error);
    modalError.textContent = error.message;
    modalError.style.display = 'block';
  } finally {
    const saveButton = document.getElementById('btnSaveRisk');
    saveButton.disabled = false;
    saveButton.innerHTML = `<span id="saveButtonText">${editingRiskId ? 'Update Risk' : 'Create Risk'}</span>`;
  }
}

// Show risk details
function showRiskDetails(risk) {
  const detailContent = document.getElementById('detailContent');
  const category = categories.find(c => c.name === risk.category);
  const owner = users.find(u => u.id === risk.risk_owner_id);
  
  const levelClass = `risk-level-${risk.risk_level?.toLowerCase() || 'low'}`;
  const statusClass = `status-${risk.status?.toLowerCase() || 'identified'}`;
  
  detailContent.innerHTML = `
    <div class="detail-section">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
        <div>
          <div class="risk-id" style="margin-bottom: 8px;">${risk.risk_id}</div>
          <h3 style="font-size: 24px; margin-bottom: 8px;">${escapeHtml(risk.title)}</h3>
          <span class="risk-level-badge ${levelClass}">${risk.risk_level || 'N/A'}</span>
          <span class="status-badge ${statusClass}" style="margin-left: 8px;">${formatStatus(risk.status)}</span>
        </div>
      </div>
    </div>

    ${risk.description ? `
      <div class="detail-section">
        <h3>Description</h3>
        <p>${escapeHtml(risk.description)}</p>
      </div>
    ` : ''}

    <div class="detail-section">
      <h3>Risk Assessment</h3>
      <div class="detail-grid">
        <span class="detail-label">Category</span>
        <span class="detail-value">${category?.icon || ''} ${risk.category}</span>
        
        <span class="detail-label">Probability</span>
        <span class="detail-value">${risk.probability || 'N/A'} / 5</span>
        
        <span class="detail-label">Impact</span>
        <span class="detail-value">${risk.impact || 'N/A'} / 5</span>
        
        <span class="detail-label">Risk Score</span>
        <span class="detail-value" style="font-weight: 600;">${risk.risk_score || 'N/A'}</span>
        
        <span class="detail-label">Risk Level</span>
        <span class="detail-value"><span class="risk-level-badge ${levelClass}">${risk.risk_level || 'N/A'}</span></span>
        
        ${risk.risk_source ? `
          <span class="detail-label">Risk Source</span>
          <span class="detail-value">${escapeHtml(risk.risk_source)}</span>
        ` : ''}
      </div>
    </div>

    ${risk.mitigation_plan || risk.contingency_plan || risk.response_strategy ? `
      <div class="detail-section">
        <h3>Response & Mitigation</h3>
        <div class="detail-grid">
          ${risk.response_strategy ? `
            <span class="detail-label">Response Strategy</span>
            <span class="detail-value">${risk.response_strategy}</span>
          ` : ''}
          
          ${risk.mitigation_plan ? `
            <span class="detail-label">Mitigation Plan</span>
            <span class="detail-value">${escapeHtml(risk.mitigation_plan)}</span>
          ` : ''}
          
          ${risk.contingency_plan ? `
            <span class="detail-label">Contingency Plan</span>
            <span class="detail-value">${escapeHtml(risk.contingency_plan)}</span>
          ` : ''}
          
          ${risk.mitigation_cost ? `
            <span class="detail-label">Mitigation Cost</span>
            <span class="detail-value">${getCurrencySymbol(risk.cost_currency || 'USD')}${risk.mitigation_cost.toLocaleString()}</span>
          ` : ''}
          
          ${risk.mitigation_effort_hours ? `
            <span class="detail-label">Effort Required</span>
            <span class="detail-value">${risk.mitigation_effort_hours} hours</span>
          ` : ''}
        </div>
      </div>
    ` : ''}

    <div class="detail-section">
      <h3>Management</h3>
      <div class="detail-grid">
        <span class="detail-label">Status</span>
        <span class="detail-value"><span class="status-badge ${statusClass}">${formatStatus(risk.status)}</span></span>
        
        <span class="detail-label">Risk Owner</span>
        <span class="detail-value">${owner?.username || 'Unassigned'}</span>
        
        ${risk.target_resolution_date ? `
          <span class="detail-label">Target Resolution</span>
          <span class="detail-value">${new Date(risk.target_resolution_date).toLocaleDateString()}</span>
        ` : ''}
        
        ${risk.review_date ? `
          <span class="detail-label">Review Date</span>
          <span class="detail-value">${new Date(risk.review_date).toLocaleDateString()}</span>
        ` : ''}
        
        ${risk.tags && risk.tags.length > 0 ? `
          <span class="detail-label">Tags</span>
          <span class="detail-value">${risk.tags.join(', ')}</span>
        ` : ''}
      </div>
    </div>

    <div class="detail-section">
      <h3>Timeline</h3>
      <div class="detail-grid">
        <span class="detail-label">Created</span>
        <span class="detail-value">${new Date(risk.created_at).toLocaleString()}</span>
        
        ${risk.updated_at ? `
          <span class="detail-label">Last Updated</span>
          <span class="detail-value">${new Date(risk.updated_at).toLocaleString()}</span>
        ` : ''}
        
        ${risk.created_by_name ? `
          <span class="detail-label">Created By</span>
          <span class="detail-value">${risk.created_by_name}</span>
        ` : ''}
      </div>
    </div>
  `;
  
  document.getElementById('detailModalTitle').textContent = `Risk Details: ${risk.risk_id}`;
  document.getElementById('detailModal').classList.add('active');
}

// Close detail modal
function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('active');
}

// Expose to global scope for onclick handlers
window.closeDetailModal = closeDetailModal;

// Confirm delete
function confirmDelete(riskId) {
  const deleteBtn = document.getElementById('btnConfirmDelete');
  
  // Remove any existing event listeners by cloning the button
  const newDeleteBtn = deleteBtn.cloneNode(true);
  deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
  
  // Add new event listener
  newDeleteBtn.addEventListener('click', () => deleteRisk(riskId));
  
  document.getElementById('deleteModal').classList.add('active');
}

// Close delete modal
function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('active');
}

// Expose to global scope for onclick handlers
window.closeDeleteModal = closeDeleteModal;

// Delete risk
async function deleteRisk(riskId) {
  try {
    const response = await fetch(`/api/risks/${riskId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete risk');
    }
    
    closeDeleteModal();
    await loadRisks();
    showSuccess('Risk deleted successfully');
  } catch (error) {
    console.error('Error deleting risk:', error);
    showError(error.message);
  }
}

// Permission checks
// Note: These check global roles. Project access is validated server-side.
// Users can only select projects they're members of, so if a project is selected,
// the user has access (or is a System Administrator who has access to all projects).
function canCreateRisk(user) {
  if (!user || !currentProjectId) return false;
  return ['System Administrator', 'Project Manager', 'Team Lead'].includes(user.role);
}

function canEditRisk(user, risk) {
  if (!user || !currentProjectId) return false;
  if (['System Administrator', 'Project Manager'].includes(user.role)) return true;
  return user.id === risk.risk_owner_id;
}

function canDeleteRisk(user) {
  if (!user || !currentProjectId) return false;
  return ['System Administrator', 'Project Manager'].includes(user.role);
}

// Utility functions
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatStatus(status) {
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function getCurrencySymbol(currency) {
  const symbols = {
    'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'CNY': '¥', 
    'INR': '₹', 'AUD': '$', 'CAD': '$', 'CHF': '₣', 'SEK': 'kr',
    'NZD': '$', 'SGD': '$', 'HKD': '$', 'NOK': 'kr', 'KRW': '₩',
    'MXN': '$', 'BRL': 'R$', 'ZAR': 'R'
  };
  return symbols[currency] || currency + ' ';
}

function showError(message) {
  showToast(message, 'error');
}

function showSuccess(message) {
  showToast(message, 'success');
}

// Toast notification helper
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 ${
    type === 'success' ? 'bg-green-500' : 
    type === 'error' ? 'bg-red-500' : 
    'bg-blue-500'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Load tags for risks (tag_type: 'risk' or 'both')
async function loadTagsForRisks() {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/tags`, {
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to fetch tags');
    
    const allTags = await response.json();
    
    // Filter tags for risks: 'risk' or 'both'
    const filteredTags = allTags.filter(tag => 
      tag.tag_type === 'risk' || tag.tag_type === 'both'
    );
    
    const tagSelect = document.getElementById('riskTags');
    if (filteredTags.length === 0) {
      tagSelect.innerHTML = '<option value="" disabled>No tags available</option>';
    } else {
      tagSelect.innerHTML = filteredTags.map(tag => 
        `<option value="${tag.id}" style="background-color: ${tag.color}20; color: #000;">
          ${tag.name}
        </option>`
      ).join('');
    }
  } catch (error) {
    console.error('Error loading tags:', error);
    const tagSelect = document.getElementById('riskTags');
    tagSelect.innerHTML = '<option value="" disabled>Error loading tags</option>';
  }
}

// Load tags for edit risk modal
async function loadTagsForEditRisk(riskId) {
  try {
    // Get all available tags for risks
    const tagsResponse = await fetch(`/api/projects/${currentProjectId}/tags`, {
      credentials: 'include'
    });
    const allTags = await tagsResponse.json();
    
    // Filter tags for risks: 'risk' or 'both'
    const filteredTags = allTags.filter(tag => 
      tag.tag_type === 'risk' || tag.tag_type === 'both'
    );
    
    // Get current tags for this risk
    const currentTagsResponse = await fetch(`/api/risks/${riskId}/tags`, {
      credentials: 'include'
    });
    const currentTags = await currentTagsResponse.json();
    const currentTagIds = currentTags.map(t => t.id);
    
    // Populate dropdown
    const tagSelect = document.getElementById('riskTags');
    if (filteredTags.length === 0) {
      tagSelect.innerHTML = '<option value="" disabled>No tags available</option>';
    } else {
      tagSelect.innerHTML = filteredTags.map(tag => 
        `<option value="${tag.id}" style="background-color: ${tag.color}20; color: #000;" ${currentTagIds.includes(tag.id) ? 'selected' : ''}>
          ${tag.name}
        </option>`
      ).join('');
    }
  } catch (error) {
    console.error('Error loading tags for edit:', error);
    const tagSelect = document.getElementById('riskTags');
    tagSelect.innerHTML = '<option value="" disabled>Error loading tags</option>';
  }
}
