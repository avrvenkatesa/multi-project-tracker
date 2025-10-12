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
  await loadProjects();
  setupEventListeners();
});

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
  document.getElementById('btnNewRiskEmpty').addEventListener('click', openCreateModal);
  
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
  
  // Back to Project button - add event listener as backup
  const backToProjectBtn = document.getElementById('backToProjectBtn');
  if (backToProjectBtn) {
    backToProjectBtn.addEventListener('click', function() {
      goBackToProject();
    });
  }
  
  // Back to Projects button
  const backToProjectsBtn = document.getElementById('backToProjectsBtn');
  if (backToProjectsBtn) {
    backToProjectsBtn.addEventListener('click', function() {
      window.location.href = 'index.html';
    });
  }
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
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('btnNewRisk').style.display = 'none';
    document.getElementById('backToProjectBtn').style.display = 'none';
    document.getElementById('backToProjectsBtn').style.display = 'inline-block';
    return;
  }
  
  currentProjectId = projectId;
  
  // Toggle navigation buttons - show Back to Project, hide Back to Projects
  document.getElementById('backToProjectBtn').style.display = 'flex';
  document.getElementById('backToProjectsBtn').style.display = 'none';
  
  // Check permissions
  const canCreate = canCreateRisk(currentUser);
  document.getElementById('btnNewRisk').style.display = canCreate ? 'flex' : 'none';
  document.getElementById('btnNewRiskEmpty').style.display = canCreate ? 'inline-flex' : 'none';
  
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
  card.onclick = () => showRiskDetails(risk);
  
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
      <span class="risk-id">${risk.risk_id}</span>
      <span class="risk-level-badge ${levelClass}">${risk.risk_level || 'N/A'}</span>
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
    <div class="risk-actions" onclick="event.stopPropagation()">
      <button class="btn-view-details" onclick="showRiskDetails(${JSON.stringify(risk).replace(/"/g, '&quot;')})">
        View Details
      </button>
      ${canEditRisk(currentUser, risk) ? `
        <button class="btn-edit-risk" onclick="openEditModal(${JSON.stringify(risk).replace(/"/g, '&quot;')})">
          Edit
        </button>
      ` : ''}
      ${canDeleteRisk(currentUser) ? `
        <button class="btn-delete-risk" onclick="confirmDelete(${risk.id})">
          Delete
        </button>
      ` : ''}
    </div>
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
  deleteBtn.onclick = () => deleteRisk(riskId);
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
  // You could implement a toast notification here
  alert('Error: ' + message);
}

function showSuccess(message) {
  // You could implement a toast notification here
  alert(message);
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
