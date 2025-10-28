// schedules.js - Project Scheduling Frontend
// CSP-compliant: All event handlers using data attributes and event delegation

let currentProjectId = null;
let currentUser = null;
let allItems = [];
let filteredItems = [];
let selectedItemIds = new Set();
let projectTeamMembers = [];

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
  // Get project ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  currentProjectId = urlParams.get('projectId');

  if (!currentProjectId) {
    alert('No project specified');
    window.location.href = '/dashboard.html';
    return;
  }

  // Set the Back to Dashboard link with the correct project ID
  const backLink = document.getElementById('back-to-dashboard-link');
  if (backLink) {
    backLink.href = `/dashboard.html?projectId=${currentProjectId}`;
  }

  // Check authentication
  try {
    const response = await fetch('/api/auth/me');
    if (!response.ok) {
      window.location.href = '/login.html';
      return;
    }
    currentUser = await response.json();
    document.getElementById('user-display').textContent = currentUser.name || currentUser.username;
  } catch (error) {
    console.error('Authentication check failed:', error);
    window.location.href = '/login.html';
    return;
  }

  // Load project details
  await loadProjectDetails();
  
  // Load project team members
  await loadProjectTeam();

  // Set default start date to today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('start-date').value = today;

  // Setup event listeners
  setupEventListeners();

  // Load initial data
  await loadProjectItems();
});

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.addEventListener('click', (e) => {
      const tabName = e.currentTarget.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  // Create schedule form
  document.getElementById('create-schedule-form').addEventListener('submit', handleCreateSchedule);
  document.getElementById('cancel-create').addEventListener('click', resetCreateForm);

  // Item selection
  document.getElementById('select-all-items').addEventListener('click', selectAllItems);
  document.getElementById('deselect-all-items').addEventListener('click', deselectAllItems);
  document.getElementById('item-search').addEventListener('input', filterItems);
  document.getElementById('item-type-filter').addEventListener('change', filterItems);
  document.getElementById('tag-filter').addEventListener('change', filterItems);
  
  // Status filter checkboxes
  document.querySelectorAll('.status-filter-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', filterItems);
  });

  // AI Dependency Suggestion
  document.getElementById('suggest-dependencies-btn').addEventListener('click', suggestDependencies);
  document.getElementById('close-dependencies-modal').addEventListener('click', closeDependenciesModal);
  document.getElementById('reject-all-dependencies').addEventListener('click', rejectAllDependencies);
  document.getElementById('apply-dependencies').addEventListener('click', applyDependencies);

  // Item checkboxes (event delegation)
  document.getElementById('items-container').addEventListener('change', (e) => {
    if (e.target.classList.contains('item-checkbox')) {
      toggleItemSelection(e.target);
    }
  });

  // Schedule actions (event delegation)
  document.getElementById('schedules-container').addEventListener('click', (e) => {
    const viewBtn = e.target.closest('[data-action="view-schedule"]');
    const deleteBtn = e.target.closest('[data-action="delete-schedule"]');

    if (viewBtn) {
      const scheduleId = viewBtn.getAttribute('data-schedule-id');
      viewScheduleDetails(scheduleId);
    } else if (deleteBtn) {
      const scheduleId = deleteBtn.getAttribute('data-schedule-id');
      deleteSchedule(scheduleId);
    }
  });

  // Modal close
  document.getElementById('close-detail-modal').addEventListener('click', closeDetailModal);
  document.getElementById('schedule-detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'schedule-detail-modal') {
      closeDetailModal();
    }
  });
}

// ============================================
// TAB MANAGEMENT
// ============================================

function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-tab') === tabName) {
      btn.classList.add('active');
    }
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.add('hidden');
  });

  if (tabName === 'create') {
    document.getElementById('create-tab').classList.remove('hidden');
  } else if (tabName === 'view') {
    document.getElementById('view-tab').classList.remove('hidden');
    loadSchedules();
  }
}

// ============================================
// DATA LOADING
// ============================================

async function loadProjectDetails() {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}`);
    if (!response.ok) throw new Error('Failed to load project');
    const project = await response.json();
    document.getElementById('project-name').textContent = project.name;
  } catch (error) {
    console.error('Error loading project:', error);
    alert('Failed to load project details');
  }
}

async function loadProjectTeam() {
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/team`);
    if (!response.ok) throw new Error('Failed to load team members');
    projectTeamMembers = await response.json();
    console.log('Loaded team members:', projectTeamMembers);
  } catch (error) {
    console.error('Error loading team members:', error);
    projectTeamMembers = [];
  }
}

async function loadProjectItems() {
  try {
    document.getElementById('items-loading').classList.remove('hidden');
    document.getElementById('items-container').classList.add('hidden');

    // Load issues
    const issuesResponse = await fetch(`/api/issues?projectId=${currentProjectId}`);
    const issues = issuesResponse.ok ? await issuesResponse.json() : [];

    // Load action items
    const actionItemsResponse = await fetch(`/api/action-items?projectId=${currentProjectId}`);
    const actionItems = actionItemsResponse.ok ? await actionItemsResponse.json() : [];

    // Combine and format
    allItems = [
      ...issues.map(i => ({
        ...i,
        type: 'issue',
        estimate: getEstimate(i),
        estimateSource: i.planning_estimate_source || 'unknown',
        tags: i.tags || []
      })),
      ...actionItems.map(a => ({
        ...a,
        type: 'action-item',
        estimate: getEstimate(a),
        estimateSource: a.planning_estimate_source || 'unknown',
        tags: a.tags || []
      }))
    ];

    // Populate tag filter
    populateTagFilter();

    // Apply initial filter based on default checkbox state
    filterItems();

    document.getElementById('items-loading').classList.add('hidden');
    document.getElementById('items-container').classList.remove('hidden');

  } catch (error) {
    console.error('Error loading items:', error);
    document.getElementById('items-loading').innerHTML = '<p class="text-red-500">Failed to load items</p>';
  }
}

function getEstimate(item) {
  // Use planning estimate source to get the right estimate
  if (item.planning_estimate_source === 'manual') {
    return parseFloat(item.estimated_effort_hours) || 0;
  } else if (item.planning_estimate_source === 'ai') {
    return parseFloat(item.ai_effort_estimate_hours) || 0;
  } else if (item.planning_estimate_source === 'hybrid') {
    return parseFloat(item.hybrid_effort_estimate_hours) || 0;
  }
  // Fallback order
  return parseFloat(item.ai_effort_estimate_hours || item.estimated_effort_hours) || 0;
}

async function loadSchedules() {
  try {
    document.getElementById('schedules-loading').classList.remove('hidden');
    document.getElementById('schedules-container').classList.add('hidden');
    document.getElementById('no-schedules-message').classList.add('hidden');

    const response = await fetch(`/api/projects/${currentProjectId}/schedules`);
    if (!response.ok) throw new Error('Failed to load schedules');

    const schedules = await response.json();

    if (schedules.length === 0) {
      document.getElementById('schedules-loading').classList.add('hidden');
      document.getElementById('no-schedules-message').classList.remove('hidden');
      return;
    }

    renderSchedules(schedules);

    document.getElementById('schedules-loading').classList.add('hidden');
    document.getElementById('schedules-container').classList.remove('hidden');

  } catch (error) {
    console.error('Error loading schedules:', error);
    document.getElementById('schedules-loading').innerHTML = '<p class="text-red-500">Failed to load schedules</p>';
  }
}

// ============================================
// RENDERING
// ============================================

function renderItems() {
  const container = document.getElementById('items-container');
  
  if (filteredItems.length === 0) {
    container.classList.add('hidden');
    document.getElementById('no-items-message').classList.remove('hidden');
    return;
  }

  document.getElementById('no-items-message').classList.add('hidden');
  container.classList.remove('hidden');

  container.innerHTML = filteredItems.map(item => {
    const isSelected = selectedItemIds.has(`${item.type}:${item.id}`);
    const estimateDisplay = item.estimate > 0 ? `${item.estimate}h` : 'No estimate';
    const estimateSourceLabel = {
      'manual': 'Manual',
      'ai': 'AI',
      'hybrid': 'Hybrid',
      'unknown': 'N/A'
    }[item.estimateSource] || 'N/A';

    return `
      <div class="flex items-start p-4 hover:bg-gray-50 border-b last:border-b-0">
        <input
          type="checkbox"
          class="item-checkbox mt-1 mr-3 h-4 w-4 text-blue-600 rounded"
          data-item-type="${item.type}"
          data-item-id="${item.id}"
          ${isSelected ? 'checked' : ''}
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center space-x-2 mb-1">
            <span class="inline-flex items-center px-2 py-1 text-xs font-medium rounded ${item.type === 'issue' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
              ${item.type === 'issue' ? 'Issue' : 'Action Item'}
            </span>
            <span class="inline-flex items-center px-2 py-1 text-xs rounded ${getStatusColor(item.status)}">
              ${item.status}
            </span>
            ${item.assignee ? `<span class="text-xs text-gray-500">Assigned: ${item.assignee}</span>` : ''}
          </div>
          <p class="text-sm font-medium text-gray-900 truncate">${escapeHtml(item.title)}</p>
          <div class="flex items-center space-x-4 mt-1 text-xs text-gray-500">
            <span><i class="fas fa-clock mr-1"></i>${estimateDisplay} (${estimateSourceLabel})</span>
            ${item.due_date ? `<span><i class="fas fa-calendar mr-1"></i>Due: ${formatDate(item.due_date)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  updateSelectedCount();
}

function renderSchedules(schedules) {
  const container = document.getElementById('schedules-container');

  container.innerHTML = schedules.map(schedule => {
    const duration = calculateDuration(schedule.start_date, schedule.end_date);
    const canDelete = currentUser.id === schedule.created_by || hasPermission('Team Lead');

    return `
      <div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-xl font-bold text-gray-900">${escapeHtml(schedule.name)}</h3>
            <p class="text-sm text-gray-500 mt-1">
              Version ${schedule.version} • Created by ${escapeHtml(schedule.created_by_name || schedule.created_by_username)} on ${formatDate(schedule.created_at)}
            </p>
          </div>
          <div class="flex items-center space-x-2">
            <button
              data-action="view-schedule"
              data-schedule-id="${schedule.id}"
              class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
            >
              <i class="fas fa-eye mr-2"></i>View Details
            </button>
            ${canDelete ? `
              <button
                data-action="delete-schedule"
                data-schedule-id="${schedule.id}"
                class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
              >
                <i class="fas fa-trash mr-2"></i>Delete
              </button>
            ` : ''}
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p class="text-xs text-gray-500 uppercase">Start Date</p>
            <p class="text-sm font-semibold">${formatDate(schedule.start_date)}</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase">End Date</p>
            <p class="text-sm font-semibold">${formatDate(schedule.end_date)}</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase">Duration</p>
            <p class="text-sm font-semibold">${duration} days</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase">Total Tasks</p>
            <p class="text-sm font-semibold">${schedule.total_tasks}</p>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p class="text-xs text-gray-500 uppercase">Total Hours</p>
            <p class="text-sm font-semibold">${schedule.total_hours}h</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase">Critical Path</p>
            <p class="text-sm font-semibold">${schedule.critical_path_tasks} tasks (${schedule.critical_path_hours}h)</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase">Work Schedule</p>
            <p class="text-sm font-semibold">${schedule.hours_per_day}h/day ${schedule.include_weekends ? '(7 days)' : '(Mon-Fri)'}</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase">Risks Detected</p>
            <p class="text-sm font-semibold ${schedule.risks_count > 0 ? 'text-red-600' : 'text-green-600'}">
              ${schedule.risks_count} ${schedule.risks_count === 1 ? 'risk' : 'risks'}
            </p>
          </div>
        </div>

        ${schedule.notes ? `
          <div class="mt-4 pt-4 border-t">
            <p class="text-xs text-gray-500 uppercase mb-1">Notes</p>
            <p class="text-sm text-gray-700">${escapeHtml(schedule.notes)}</p>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

// ============================================
// ITEM SELECTION
// ============================================

function toggleItemSelection(checkbox) {
  const itemType = checkbox.getAttribute('data-item-type');
  const itemId = checkbox.getAttribute('data-item-id');
  const key = `${itemType}:${itemId}`;

  if (checkbox.checked) {
    selectedItemIds.add(key);
  } else {
    selectedItemIds.delete(key);
  }

  updateSelectedCount();
}

function selectAllItems() {
  filteredItems.forEach(item => {
    selectedItemIds.add(`${item.type}:${item.id}`);
  });
  renderItems();
}

function deselectAllItems() {
  selectedItemIds.clear();
  renderItems();
}

function updateSelectedCount() {
  const count = selectedItemIds.size;
  document.getElementById('selected-count').textContent = `${count} ${count === 1 ? 'item' : 'items'} selected`;
  
  const submitBtn = document.getElementById('create-submit');
  submitBtn.disabled = count === 0;

  // Show/hide AI dependency suggestion button
  const suggestionSection = document.getElementById('dependency-suggestion-section');
  const suggestionBtn = document.getElementById('suggest-dependencies-btn');
  
  if (count >= 2) {
    suggestionSection.classList.remove('hidden');
    suggestionBtn.disabled = false;
  } else {
    suggestionSection.classList.add('hidden');
    suggestionBtn.disabled = true;
  }
}

function populateTagFilter() {
  const tagFilter = document.getElementById('tag-filter');
  
  // Collect all unique tags from all items
  const tagsMap = new Map();
  allItems.forEach(item => {
    if (item.tags && Array.isArray(item.tags)) {
      item.tags.forEach(tag => {
        if (!tagsMap.has(tag.id)) {
          tagsMap.set(tag.id, tag);
        }
      });
    }
  });

  // Clear existing options except "All Tags"
  tagFilter.innerHTML = '<option value="all">All Tags</option>';

  // Sort tags by name and add to dropdown
  const sortedTags = Array.from(tagsMap.values()).sort((a, b) => 
    a.name.localeCompare(b.name)
  );

  sortedTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag.id;
    option.textContent = tag.name;
    option.style.color = tag.color || '#000';
    tagFilter.appendChild(option);
  });
}

function filterItems() {
  const searchTerm = document.getElementById('item-search').value.toLowerCase();
  const typeFilter = document.getElementById('item-type-filter').value;
  const tagFilter = document.getElementById('tag-filter').value;
  
  // Get selected statuses from checkboxes
  const selectedStatuses = [];
  if (document.getElementById('status-todo')?.checked) {
    selectedStatuses.push('To Do');
  }
  if (document.getElementById('status-in-progress')?.checked) {
    selectedStatuses.push('In Progress');
  }

  filteredItems = allItems.filter(item => {
    // Search filter
    const matchesSearch = item.title.toLowerCase().includes(searchTerm);

    // Type filter
    const matchesType = typeFilter === 'all' || item.type === typeFilter;

    // Tag filter
    const matchesTag = tagFilter === 'all' || 
      (item.tags && item.tags.some(tag => tag.id === parseInt(tagFilter)));

    // Status filter - always exclude Done items, only show if status is selected
    // If no checkboxes are selected, show nothing
    const matchesStatus = selectedStatuses.length > 0 && selectedStatuses.includes(item.status);

    return matchesSearch && matchesType && matchesTag && matchesStatus;
  });

  renderItems();
}

// ============================================
// AI DEPENDENCY SUGGESTION
// ============================================

let suggestedDependencies = [];
let selectedDependencies = new Set();

async function suggestDependencies() {
  try {
    const btn = document.getElementById('suggest-dependencies-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Analyzing tasks...';

    // Get selected task IDs
    const taskIds = [];
    selectedItemIds.forEach(key => {
      const [type, id] = key.split(':');
      taskIds.push({
        type: type,
        id: parseInt(id)
      });
    });

    const response = await fetch('/api/schedules/suggest-dependencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        projectId: currentProjectId,
        taskIds: taskIds 
      })
    });

    if (!response.ok) {
      throw new Error('Failed to get AI suggestions');
    }

    const result = await response.json();
    
    if (result.success) {
      suggestedDependencies = result.dependencies || [];
      selectedDependencies = new Set(suggestedDependencies.map((_, index) => index));
      displayDependencySuggestions(result);
    } else {
      throw new Error(result.message || 'Failed to generate suggestions');
    }

  } catch (error) {
    console.error('Error suggesting dependencies:', error);
    alert('Failed to generate dependency suggestions: ' + error.message);
  } finally {
    const btn = document.getElementById('suggest-dependencies-btn');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-magic mr-2"></i>Suggest Task Dependencies with AI';
  }
}

function displayDependencySuggestions(result) {
  const modal = document.getElementById('dependencies-modal');
  const content = document.getElementById('dependencies-modal-content');

  const { dependencies, overall_analysis, parallel_opportunities } = result;

  if (!dependencies || dependencies.length === 0) {
    content.innerHTML = `
      <div class="text-center py-8">
        <i class="fas fa-info-circle text-blue-500 text-4xl mb-4"></i>
        <p class="text-lg font-semibold text-gray-900">No Dependencies Suggested</p>
        <p class="text-gray-600 mt-2">AI determined that your selected tasks can all run in parallel without dependencies.</p>
        ${parallel_opportunities ? `<p class="text-sm text-gray-500 mt-4 italic">${escapeHtml(parallel_opportunities)}</p>` : ''}
      </div>
    `;
  } else {
    content.innerHTML = `
      <div class="space-y-6">
        <!-- Overall Analysis -->
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 class="font-semibold text-blue-900 mb-2">
            <i class="fas fa-lightbulb mr-2"></i>AI Analysis
          </h3>
          <p class="text-sm text-blue-800">${escapeHtml(overall_analysis)}</p>
          ${parallel_opportunities ? `
            <p class="text-sm text-blue-700 mt-2">
              <i class="fas fa-check-circle mr-2"></i>${escapeHtml(parallel_opportunities)}
            </p>
          ` : ''}
        </div>

        <!-- Suggested Dependencies -->
        <div>
          <h3 class="font-semibold text-gray-900 mb-4">
            ${dependencies.length} Suggested ${dependencies.length === 1 ? 'Dependency' : 'Dependencies'}
          </h3>
          <div class="space-y-3">
            ${dependencies.map((dep, index) => {
              const dependentTask = allItems.find(i => 
                i.type === dep.dependent_item_type && i.id === dep.dependent_item_id
              );
              const prerequisiteTask = allItems.find(i => 
                i.type === dep.prerequisite_item_type && i.id === dep.prerequisite_item_id
              );

              const typeColors = {
                'technical': 'bg-purple-100 text-purple-800',
                'workflow': 'bg-blue-100 text-blue-800',
                'prerequisite': 'bg-green-100 text-green-800',
                'risk-mitigation': 'bg-yellow-100 text-yellow-800'
              };

              return `
                <div class="border border-gray-200 rounded-lg p-4 ${selectedDependencies.has(index) ? 'bg-green-50 border-green-300' : 'bg-white'}">
                  <div class="flex items-start">
                    <input
                      type="checkbox"
                      class="dependency-checkbox mt-1 mr-3 h-5 w-5 text-green-600 rounded"
                      data-dependency-index="${index}"
                      ${selectedDependencies.has(index) ? 'checked' : ''}
                    />
                    <div class="flex-1">
                      <div class="flex items-center space-x-2 mb-2">
                        <span class="inline-flex items-center px-2 py-1 text-xs font-semibold rounded ${typeColors[dep.dependency_type] || 'bg-gray-100 text-gray-800'}">
                          ${dep.dependency_type.replace('-', ' ').toUpperCase()}
                        </span>
                      </div>
                      <div class="space-y-2">
                        <div>
                          <p class="text-sm font-semibold text-gray-900">
                            <i class="fas fa-arrow-right text-gray-400 mr-2"></i>${escapeHtml(dependentTask?.title || 'Unknown Task')}
                          </p>
                          <p class="text-xs text-gray-500 ml-6">depends on</p>
                        </div>
                        <div class="ml-6">
                          <p class="text-sm font-semibold text-green-700">
                            <i class="fas fa-check text-green-500 mr-2"></i>${escapeHtml(prerequisiteTask?.title || 'Unknown Task')}
                          </p>
                        </div>
                      </div>
                      <p class="text-sm text-gray-700 mt-3">
                        <i class="fas fa-comment-dots text-gray-400 mr-2"></i>${escapeHtml(dep.reasoning)}
                      </p>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    // Attach checkbox event listeners
    content.querySelectorAll('.dependency-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const index = parseInt(e.target.dataset.dependencyIndex);
        if (e.target.checked) {
          selectedDependencies.add(index);
        } else {
          selectedDependencies.delete(index);
        }
        // Refresh display to update visual state
        displayDependencySuggestions(result);
      });
    });
  }

  modal.classList.remove('hidden');
}

function closeDependenciesModal() {
  document.getElementById('dependencies-modal').classList.add('hidden');
}

function rejectAllDependencies() {
  if (confirm('Are you sure you want to reject all AI suggestions?')) {
    closeDependenciesModal();
    suggestedDependencies = [];
    selectedDependencies.clear();
  }
}

async function applyDependencies() {
  try {
    const selectedDeps = Array.from(selectedDependencies).map(index => suggestedDependencies[index]);

    if (selectedDeps.length === 0) {
      alert('Please select at least one dependency to apply.');
      return;
    }

    const applyBtn = document.getElementById('apply-dependencies');
    applyBtn.disabled = true;
    applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Applying...';

    const response = await fetch('/api/schedules/save-dependencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        projectId: currentProjectId,
        dependencies: selectedDeps 
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      
      // Handle circular dependency errors with detailed message
      if (errorData.error === 'Circular dependency detected') {
        alert('❌ ' + errorData.message + '\n\nPlease deselect some of the suggested dependencies and try again.');
      } else {
        throw new Error(errorData.message || 'Failed to save dependencies');
      }
      
      applyBtn.disabled = false;
      applyBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Apply Dependencies';
      return;
    }

    const result = await response.json();

    closeDependenciesModal();
    alert(`Success! ${result.saved} dependencies applied. Now create your schedule to see the sequencing.`);

  } catch (error) {
    console.error('Error applying dependencies:', error);
    alert('Failed to apply dependencies: ' + error.message);
  } finally {
    const applyBtn = document.getElementById('apply-dependencies');
    applyBtn.disabled = false;
    applyBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Apply Selected Dependencies';
  }
}

// ============================================
// PHASE 2: ESTIMATE VALIDATION
// ============================================

function getItemsWithoutEstimates() {
  const itemsWithoutEstimates = [];
  
  selectedItemIds.forEach(key => {
    const [type, id] = key.split(':');
    const item = allItems.find(i => i.type === type && i.id === parseInt(id));
    
    if (item && (!item.estimate || item.estimate === 0)) {
      itemsWithoutEstimates.push(item);
    }
  });
  
  return itemsWithoutEstimates;
}

function showMissingEstimatesModal(items) {
  const count = items.length;
  const itemsList = items.map((item, index) => 
    `<li class="flex items-start space-x-3 py-2 hover:bg-gray-100 px-2 rounded">
      <input 
        type="checkbox" 
        data-item-index="${index}"
        class="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 missing-estimate-checkbox"
        checked
      >
      <div class="flex-1">
        <p class="text-sm font-medium text-gray-900">${escapeHtml(item.title)}</p>
        <p class="text-xs text-gray-500">${item.type === 'issue' ? 'Issue' : 'Action Item'} #${item.id}</p>
      </div>
    </li>`
  ).join('');
  
  const modalHtml = `
    <div id="missing-estimates-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-bold text-gray-900">
              <i class="fas fa-exclamation-triangle text-yellow-500 mr-2"></i>
              Missing Effort Estimates
            </h3>
          </div>
          
          <div class="mb-6">
            <p class="text-gray-700 mb-4">
              <strong>${count}</strong> ${count === 1 ? 'item has' : 'items have'} no effort estimate. 
              Select which items you'd like to add estimates for:
            </p>
            
            <div class="mb-2 flex justify-between items-center">
              <div class="space-x-2">
                <button data-action="select-all-estimates" class="text-sm text-blue-600 hover:text-blue-800">
                  <i class="fas fa-check-square mr-1"></i>Select All
                </button>
                <button data-action="deselect-all-estimates" class="text-sm text-gray-600 hover:text-gray-800">
                  <i class="fas fa-square mr-1"></i>Deselect All
                </button>
              </div>
              <span id="selected-estimate-count" class="text-sm text-gray-600">${count} selected</span>
            </div>
            
            <ul class="bg-gray-50 p-3 rounded border border-gray-200 max-h-64 overflow-y-auto">
              ${itemsList}
            </ul>
          </div>
          
          <div class="flex justify-end space-x-3">
            <button
              data-action="exclude-selected"
              class="px-6 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
            >
              <i class="fas fa-times mr-2"></i>Exclude Selected
            </button>
            <button
              data-action="add-estimates"
              class="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              <i class="fas fa-calculator mr-2"></i>Add Estimates to Selected
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Store items for later use
  window.itemsNeedingEstimates = items;
  
  // Attach event listeners
  document.querySelector('[data-action="exclude-selected"]').addEventListener('click', handleExcludeSelectedItems);
  document.querySelector('[data-action="add-estimates"]').addEventListener('click', handleStartEstimationWorkflow);
  document.querySelector('[data-action="select-all-estimates"]').addEventListener('click', selectAllEstimateItems);
  document.querySelector('[data-action="deselect-all-estimates"]').addEventListener('click', deselectAllEstimateItems);
  
  // Add change listeners to checkboxes
  document.querySelectorAll('.missing-estimate-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateSelectedEstimateCount);
  });
}

function closeMissingEstimatesModal() {
  const modal = document.getElementById('missing-estimates-modal');
  if (modal) {
    modal.remove();
  }
  window.itemsNeedingEstimates = null;
}

function selectAllEstimateItems() {
  document.querySelectorAll('.missing-estimate-checkbox').forEach(checkbox => {
    checkbox.checked = true;
  });
  updateSelectedEstimateCount();
}

function deselectAllEstimateItems() {
  document.querySelectorAll('.missing-estimate-checkbox').forEach(checkbox => {
    checkbox.checked = false;
  });
  updateSelectedEstimateCount();
}

function updateSelectedEstimateCount() {
  const checked = document.querySelectorAll('.missing-estimate-checkbox:checked').length;
  const countEl = document.getElementById('selected-estimate-count');
  if (countEl) {
    countEl.textContent = `${checked} selected`;
  }
}

function getSelectedEstimateItems() {
  const selectedItems = [];
  const checkboxes = document.querySelectorAll('.missing-estimate-checkbox:checked');
  
  checkboxes.forEach(checkbox => {
    const index = parseInt(checkbox.getAttribute('data-item-index'));
    if (window.itemsNeedingEstimates && window.itemsNeedingEstimates[index]) {
      selectedItems.push(window.itemsNeedingEstimates[index]);
    }
  });
  
  return selectedItems;
}

function getUnselectedEstimateItems() {
  const unselectedItems = [];
  const checkboxes = document.querySelectorAll('.missing-estimate-checkbox:not(:checked)');
  
  checkboxes.forEach(checkbox => {
    const index = parseInt(checkbox.getAttribute('data-item-index'));
    if (window.itemsNeedingEstimates && window.itemsNeedingEstimates[index]) {
      unselectedItems.push(window.itemsNeedingEstimates[index]);
    }
  });
  
  return unselectedItems;
}

function handleExcludeSelectedItems() {
  const itemsToExclude = getSelectedEstimateItems();
  
  if (itemsToExclude.length === 0) {
    alert('No items selected to exclude');
    return;
  }
  
  // Remove selected items from selection
  itemsToExclude.forEach(item => {
    const key = `${item.type}:${item.id}`;
    selectedItemIds.delete(key);
  });
  
  closeMissingEstimatesModal();
  renderItems();
  
  // Try to create schedule again
  if (selectedItemIds.size > 0) {
    document.getElementById('create-schedule-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  } else {
    alert('No items remaining after exclusion. Please select items with estimates.');
  }
}

async function handleStartEstimationWorkflow() {
  const selectedItems = getSelectedEstimateItems();
  
  if (selectedItems.length === 0) {
    alert('Please select at least one item to add estimates for');
    return;
  }
  
  // Exclude unselected items from schedule
  const unselectedItems = getUnselectedEstimateItems();
  unselectedItems.forEach(item => {
    const key = `${item.type}:${item.id}`;
    selectedItemIds.delete(key);
  });
  
  closeMissingEstimatesModal();
  
  // Start workflow with selected items only
  window.estimationQueue = [...selectedItems];
  window.estimationQueueIndex = 0;
  
  await showEstimationModal(selectedItems[0]);
}

// ============================================
// RESOURCE ASSIGNMENT VALIDATION
// ============================================

function getItemsWithoutAssignees() {
  const itemsWithoutAssignees = [];
  
  selectedItemIds.forEach(key => {
    const [type, id] = key.split(':');
    const item = allItems.find(i => i.type === type && i.id === parseInt(id));
    
    if (item && (!item.assignee || item.assignee === 'Unassigned' || item.assignee.trim() === '')) {
      itemsWithoutAssignees.push(item);
    }
  });
  
  return itemsWithoutAssignees;
}

function showMissingAssigneesModal(items) {
  const count = items.length;
  
  // Build assignee dropdown options
  const assigneeOptions = projectTeamMembers.map(member => 
    `<option value="${escapeHtml(member.name)}">${escapeHtml(member.name)}</option>`
  ).join('');
  
  const itemsList = items.map((item, index) => 
    `<li class="flex items-center space-x-3 py-3 px-2 rounded border-b border-gray-200 last:border-0" data-item-key="${item.type}:${item.id}">
      <div class="flex-1">
        <p class="text-sm font-medium text-gray-900">${escapeHtml(item.title)}</p>
        <p class="text-xs text-gray-500">${item.type === 'issue' ? 'Issue' : 'Action Item'} #${item.id}</p>
      </div>
      <div class="flex items-center space-x-2">
        <select 
          class="assignee-dropdown px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          data-item-type="${item.type}"
          data-item-id="${item.id}"
          data-index="${index}"
        >
          <option value="">Select assignee...</option>
          ${assigneeOptions}
        </select>
        <button
          class="assign-btn px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          data-item-type="${item.type}"
          data-item-id="${item.id}"
          data-index="${index}"
          disabled
        >
          <i class="fas fa-check mr-1"></i>Assign
        </button>
      </div>
    </li>`
  ).join('');
  
  const modalHtml = `
    <div id="missing-assignees-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-bold text-gray-900">
              <i class="fas fa-exclamation-triangle text-red-500 mr-2"></i>
              Missing Resource Assignments
            </h3>
          </div>
          
          <div class="mb-6">
            <p class="text-gray-700 mb-4">
              <strong>${count}</strong> ${count === 1 ? 'item has' : 'items have'} no assignee. 
              In <strong>Strict Mode</strong>, all tasks must have assigned resources for accurate workload calculations.
            </p>
            
            <p class="text-sm text-gray-600 mb-3">
              <strong>Assign resources directly below:</strong>
            </p>
            
            <ul id="assignee-list" class="bg-gray-50 p-3 rounded border border-gray-200 max-h-96 overflow-y-auto mb-4">
              ${itemsList}
            </ul>
            
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p class="text-sm text-blue-900">
                <i class="fas fa-lightbulb mr-2"></i>
                <strong>Tip:</strong> Select an assignee for each task and click "Assign", or disable Strict Mode to proceed with unassigned tasks (they'll be flagged as risks).
              </p>
            </div>
          </div>
          
          <div class="flex justify-between items-center">
            <button
              data-action="retry-validation"
              class="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              <i class="fas fa-sync mr-2"></i>Continue with Assigned Tasks
            </button>
            <div class="flex space-x-3">
              <button
                data-action="cancel-schedule"
                class="px-6 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
              >
                <i class="fas fa-times mr-2"></i>Cancel
              </button>
              <button
                data-action="disable-strict-mode"
                class="px-6 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
              >
                <i class="fas fa-toggle-off mr-2"></i>Disable Strict Mode
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Attach event listeners for modal buttons
  document.querySelector('[data-action="cancel-schedule"]').addEventListener('click', closeMissingAssigneesModal);
  document.querySelector('[data-action="disable-strict-mode"]').addEventListener('click', handleDisableStrictMode);
  document.querySelector('[data-action="retry-validation"]').addEventListener('click', handleRetryValidation);
  
  // Attach event listeners for dropdown changes (enable/disable assign button)
  document.querySelectorAll('.assignee-dropdown').forEach(dropdown => {
    dropdown.addEventListener('change', (e) => {
      const index = e.target.dataset.index;
      const assignBtn = document.querySelector(`.assign-btn[data-index="${index}"]`);
      assignBtn.disabled = !e.target.value;
    });
  });
  
  // Attach event listeners for assign buttons
  document.querySelectorAll('.assign-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const itemType = e.currentTarget.dataset.itemType;
      const itemId = e.currentTarget.dataset.itemId;
      const index = e.currentTarget.dataset.index;
      const dropdown = document.querySelector(`.assignee-dropdown[data-index="${index}"]`);
      const assignee = dropdown.value;
      
      if (assignee) {
        await assignResourceToItem(itemType, itemId, assignee, e.currentTarget, dropdown);
      }
    });
  });
}

function closeMissingAssigneesModal() {
  const modal = document.getElementById('missing-assignees-modal');
  if (modal) {
    modal.remove();
  }
}

function handleDisableStrictMode() {
  document.getElementById('require-assignee').checked = false;
  closeMissingAssigneesModal();
  
  // Automatically proceed with schedule creation
  document.getElementById('create-schedule-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

async function assignResourceToItem(itemType, itemId, assignee, button, dropdown) {
  const originalBtnHtml = button.innerHTML;
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Assigning...';
  dropdown.disabled = true;
  
  try {
    const endpoint = itemType === 'issue' ? `/api/issues/${itemId}` : `/api/action-items/${itemId}`;
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignee })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to assign resource');
    }
    
    // Update the item in allItems array
    const item = allItems.find(i => i.type === itemType && i.id === parseInt(itemId));
    if (item) {
      item.assignee = assignee;
    }
    
    // Update UI to show success
    button.innerHTML = '<i class="fas fa-check-circle text-green-600 mr-1"></i>Assigned';
    button.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    button.classList.add('bg-green-100', 'text-green-800');
    dropdown.classList.add('bg-green-50');
    
    // Remove the item from the list after a brief delay
    setTimeout(() => {
      const listItem = document.querySelector(`li[data-item-key="${itemType}:${itemId}"]`);
      if (listItem) {
        listItem.style.opacity = '0';
        listItem.style.transition = 'opacity 0.3s';
        setTimeout(() => listItem.remove(), 300);
      }
    }, 500);
    
  } catch (error) {
    console.error('Error assigning resource:', error);
    alert(`Failed to assign resource: ${error.message}`);
    button.disabled = false;
    button.innerHTML = originalBtnHtml;
    dropdown.disabled = false;
  }
}

function handleRetryValidation() {
  closeMissingAssigneesModal();
  // Re-trigger validation
  document.getElementById('create-schedule-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

// ============================================
// ESTIMATION WORKFLOW
// ============================================

async function showEstimationModal(item) {
  const queueIndex = window.estimationQueueIndex + 1;
  const queueTotal = window.estimationQueue.length;
  
  const modalHtml = `
    <div id="estimation-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h3 class="text-xl font-bold text-gray-900">Add Effort Estimate</h3>
              <p class="text-sm text-gray-500 mt-1">Item ${queueIndex} of ${queueTotal}</p>
            </div>
            <button data-action="close-estimation" class="text-gray-400 hover:text-gray-600">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>
          
          <!-- Item Details -->
          <div class="bg-gray-50 rounded-lg p-4 mb-6">
            <div class="flex items-center space-x-2 mb-2">
              <span class="inline-flex items-center px-2 py-1 text-xs font-medium rounded ${item.type === 'issue' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
                ${item.type === 'issue' ? 'Issue' : 'Action Item'}
              </span>
              <span class="text-sm text-gray-500">#${item.id}</span>
            </div>
            <h4 class="text-lg font-semibold text-gray-900 mb-2">${escapeHtml(item.title)}</h4>
            ${item.description ? `<p class="text-sm text-gray-600 line-clamp-3">${escapeHtml(item.description)}</p>` : ''}
          </div>
          
          <!-- AI Estimate Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-700 mb-3">AI-Generated Estimate</h5>
            <div id="ai-estimate-section" class="space-y-3">
              ${item.ai_estimate ? `
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="text-2xl font-bold text-blue-900">${item.ai_estimate}h</p>
                      <p class="text-xs text-blue-600 mt-1">Confidence: ${item.ai_confidence || 'N/A'}</p>
                    </div>
                    <button data-action="regenerate-ai" class="text-sm text-blue-600 hover:text-blue-800">
                      <i class="fas fa-sync mr-1"></i>Regenerate
                    </button>
                  </div>
                  ${item.ai_reasoning ? `
                    <div class="mt-3 pt-3 border-t border-blue-200">
                      <p class="text-xs text-gray-600 mb-1">AI Reasoning:</p>
                      <p class="text-sm text-gray-700">${escapeHtml(item.ai_reasoning)}</p>
                    </div>
                  ` : ''}
                </div>
              ` : `
                <button data-action="generate-ai" class="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <i class="fas fa-magic mr-2"></i>Generate AI Estimate
                </button>
              `}
            </div>
          </div>
          
          <!-- Hybrid Estimate Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-700 mb-3">Hybrid Estimate (Optional)</h5>
            <div id="hybrid-estimate-section" class="space-y-3">
              ${item.hybrid_estimate ? `
                <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <p class="text-2xl font-bold text-purple-900">${item.hybrid_estimate}h</p>
                  <p class="text-xs text-purple-600 mt-1">AI + Manual Adjustments</p>
                  <button data-action="edit-hybrid" class="mt-2 text-sm text-purple-600 hover:text-purple-800">
                    <i class="fas fa-edit mr-1"></i>Edit Selection
                  </button>
                </div>
              ` : !item.ai_estimate ? `
                <div class="text-center p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <p class="text-sm text-gray-500">Generate AI estimate first, then adjust items to create a hybrid estimate</p>
                </div>
              ` : `
                <div id="hybrid-workflow-container">
                  <button data-action="start-hybrid" class="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                    <i class="fas fa-layer-group mr-2"></i>View Breakdown & Create Hybrid
                  </button>
                </div>
              `}
            </div>
          </div>
          
          <!-- Manual Estimate Section -->
          <div class="mb-6">
            <h5 class="text-sm font-semibold text-gray-700 mb-3">Manual Estimate (Optional)</h5>
            <div class="flex items-center space-x-3">
              <input 
                type="number" 
                id="manual-estimate-input"
                min="0" 
                step="0.5" 
                placeholder="Enter hours" 
                value="${item.estimated_effort_hours || ''}"
                class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
              <span class="text-gray-600">hours</span>
            </div>
          </div>
          
          <!-- Planning Estimate Source -->
          <div class="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h5 class="text-sm font-semibold text-gray-700 mb-3">
              <i class="fas fa-star text-yellow-500 mr-2"></i>Planning Estimate Source
            </h5>
            <p class="text-xs text-gray-600 mb-3">Select which estimate to use for scheduling</p>
            <div class="space-y-2">
              <label class="flex items-center cursor-pointer">
                <input type="radio" name="planning-source" value="manual" class="mr-3" ${item.planning_estimate_source === 'manual' ? 'checked' : ''}>
                <span class="text-sm">Manual Estimate</span>
              </label>
              <label class="flex items-center cursor-pointer">
                <input type="radio" name="planning-source" value="ai" class="mr-3" ${item.planning_estimate_source === 'ai' || (!item.planning_estimate_source && item.ai_estimate) ? 'checked' : ''}>
                <span class="text-sm">AI Estimate</span>
              </label>
              <label class="flex items-center cursor-pointer">
                <input type="radio" name="planning-source" value="hybrid" class="mr-3" ${item.planning_estimate_source === 'hybrid' ? 'checked' : ''}>
                <span class="text-sm">Hybrid Estimate</span>
              </label>
            </div>
          </div>
          
          <!-- Action Buttons -->
          <div class="flex justify-between">
            <button 
              data-action="skip-item" 
              class="px-6 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
            >
              <i class="fas fa-forward mr-2"></i>Skip This Item
            </button>
            <button 
              data-action="save-and-next" 
              class="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              <i class="fas fa-save mr-2"></i>${queueIndex < queueTotal ? 'Save & Next' : 'Save & Complete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  // Store current item
  window.currentEstimationItem = item;
  
  // Attach event listeners
  document.querySelector('[data-action="close-estimation"]').addEventListener('click', closeEstimationModal);
  document.querySelector('[data-action="save-and-next"]').addEventListener('click', handleSaveAndNext);
  document.querySelector('[data-action="skip-item"]').addEventListener('click', handleSkipItem);
  
  const generateAiBtn = document.querySelector('[data-action="generate-ai"]');
  if (generateAiBtn) {
    generateAiBtn.addEventListener('click', () => handleGenerateAIEstimate(item));
  }
  
  const regenerateAiBtn = document.querySelector('[data-action="regenerate-ai"]');
  if (regenerateAiBtn) {
    regenerateAiBtn.addEventListener('click', () => handleGenerateAIEstimate(item));
  }
  
  const startHybridBtn = document.querySelector('[data-action="start-hybrid"]');
  if (startHybridBtn) {
    startHybridBtn.addEventListener('click', () => showHybridBreakdown(item));
  }
  
  const editHybridBtn = document.querySelector('[data-action="edit-hybrid"]');
  if (editHybridBtn) {
    editHybridBtn.addEventListener('click', () => showHybridBreakdown(item));
  }
}

function closeEstimationModal() {
  const modal = document.getElementById('estimation-modal');
  if (modal) {
    modal.remove();
  }
  window.currentEstimationItem = null;
}

async function handleGenerateAIEstimate(item) {
  const btn = document.querySelector('[data-action="generate-ai"]') || document.querySelector('[data-action="regenerate-ai"]');
  if (!btn) return;
  
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...';
  
  try {
    const endpoint = item.type === 'issue' ? `/api/issues/${item.id}/effort-estimate` : `/api/action-items/${item.id}/effort-estimate`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o' })
    });
    
    if (!response.ok) throw new Error('Failed to generate AI estimate');
    
    const data = await response.json();
    
    // Update item in memory
    item.ai_estimate = data.hours;
    item.ai_confidence = data.confidence;
    item.ai_reasoning = data.reasoning;
    
    // Reload the modal
    closeEstimationModal();
    await showEstimationModal(item);
    
  } catch (error) {
    console.error('Error generating AI estimate:', error);
    alert('Failed to generate AI estimate');
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

function showHybridBreakdown(item) {
  // Create a simple breakdown based on AI reasoning
  const baseHours = item.ai_estimate || 0;
  
  // Create breakdown items (for now, simple breakdown by task type)
  const breakdownItems = [
    { label: 'Core Implementation', hours: Math.round(baseHours * 0.5 * 10) / 10, selected: true },
    { label: 'Testing & Validation', hours: Math.round(baseHours * 0.2 * 10) / 10, selected: true },
    { label: 'Documentation', hours: Math.round(baseHours * 0.15 * 10) / 10, selected: true },
    { label: 'Review & Refinement', hours: Math.round(baseHours * 0.15 * 10) / 10, selected: true }
  ];
  
  const breakdownHtml = `
    <div class="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
      <div class="flex items-center justify-between mb-3">
        <p class="text-sm font-semibold text-gray-700">AI Breakdown - Select & Adjust</p>
        <button data-action="select-all-breakdown" class="text-xs text-purple-600 hover:text-purple-800">
          <i class="fas fa-check-square mr-1"></i>Select All
        </button>
      </div>
      ${breakdownItems.map((breakdown, idx) => `
        <div class="flex items-center space-x-3 py-2">
          <input 
            type="checkbox" 
            id="breakdown-${idx}" 
            data-breakdown-idx="${idx}"
            ${breakdown.selected ? 'checked' : ''}
            class="w-4 h-4 text-purple-600 rounded"
          >
          <label for="breakdown-${idx}" class="flex-1 text-sm text-gray-700 cursor-pointer">
            ${breakdown.label}
          </label>
          <input 
            type="number" 
            data-breakdown-hours="${idx}"
            value="${breakdown.hours}" 
            min="0" 
            step="0.5"
            class="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
          >
          <span class="text-xs text-gray-500">h</span>
        </div>
      `).join('')}
      <div class="pt-3 border-t border-purple-200 flex items-center justify-between">
        <span class="text-sm font-semibold text-gray-700">Total Selected:</span>
        <span id="hybrid-total" class="text-lg font-bold text-purple-900">${baseHours}h</span>
      </div>
      <button data-action="calculate-hybrid" class="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
        <i class="fas fa-calculator mr-2"></i>Generate Hybrid Estimate
      </button>
    </div>
  `;
  
  const container = document.getElementById('hybrid-workflow-container') || document.getElementById('hybrid-estimate-section');
  if (container) {
    container.innerHTML = breakdownHtml;
    
    // Store breakdown data
    item.hybridBreakdown = breakdownItems;
    
    // Attach event listeners
    const selectAllBtn = document.querySelector('[data-action="select-all-breakdown"]');
    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => toggleAllBreakdownItems(item));
    }
    
    const calculateBtn = document.querySelector('[data-action="calculate-hybrid"]');
    if (calculateBtn) {
      calculateBtn.addEventListener('click', () => calculateHybridEstimate(item));
    }
    
    // Listen for checkbox/input changes
    document.querySelectorAll('[data-breakdown-idx]').forEach(checkbox => {
      checkbox.addEventListener('change', () => updateHybridTotal(item));
    });
    
    document.querySelectorAll('[data-breakdown-hours]').forEach(input => {
      input.addEventListener('input', () => updateHybridTotal(item));
    });
  }
}

function toggleAllBreakdownItems(item) {
  const checkboxes = document.querySelectorAll('[data-breakdown-idx]');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  
  checkboxes.forEach(cb => {
    cb.checked = !allChecked;
  });
  
  const btn = document.querySelector('[data-action="select-all-breakdown"]');
  if (btn) {
    btn.innerHTML = allChecked 
      ? '<i class="fas fa-check-square mr-1"></i>Select All'
      : '<i class="fas fa-square mr-1"></i>Deselect All';
  }
  
  updateHybridTotal(item);
}

function updateHybridTotal(item) {
  let total = 0;
  
  document.querySelectorAll('[data-breakdown-idx]').forEach(checkbox => {
    if (checkbox.checked) {
      const idx = checkbox.dataset.breakdownIdx;
      const hoursInput = document.querySelector(`[data-breakdown-hours="${idx}"]`);
      if (hoursInput) {
        total += parseFloat(hoursInput.value) || 0;
      }
    }
  });
  
  const totalElement = document.getElementById('hybrid-total');
  if (totalElement) {
    totalElement.textContent = `${Math.round(total * 10) / 10}h`;
  }
}

async function calculateHybridEstimate(item) {
  const btn = document.querySelector('[data-action="calculate-hybrid"]');
  if (!btn) return;
  
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Calculating...';
  
  try {
    // Calculate total from selected items
    let total = 0;
    const selectedItems = [];
    
    document.querySelectorAll('[data-breakdown-idx]').forEach(checkbox => {
      if (checkbox.checked) {
        const idx = checkbox.dataset.breakdownIdx;
        const hoursInput = document.querySelector(`[data-breakdown-hours="${idx}"]`);
        const hours = parseFloat(hoursInput.value) || 0;
        total += hours;
        selectedItems.push({
          label: item.hybridBreakdown[idx].label,
          hours: hours
        });
      }
    });
    
    // Update item in memory
    item.hybrid_estimate = Math.round(total * 10) / 10;
    item.hybrid_selected_items = selectedItems;
    
    // Save to backend
    const endpoint = item.type === 'issue' ? `/api/issues/${item.id}` : `/api/action-items/${item.id}`;
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        hybrid_effort_estimate_hours: item.hybrid_estimate
      })
    });
    
    if (!response.ok) throw new Error('Failed to save hybrid estimate');
    
    // Reload the modal
    closeEstimationModal();
    await showEstimationModal(item);
    
  } catch (error) {
    console.error('Error calculating hybrid estimate:', error);
    alert('Failed to calculate hybrid estimate');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-calculator mr-2"></i>Generate Hybrid Estimate';
  }
}

async function handleSaveAndNext() {
  const item = window.currentEstimationItem;
  if (!item) return;
  
  const manualEstimate = document.getElementById('manual-estimate-input').value;
  const planningSource = document.querySelector('input[name="planning-source"]:checked')?.value;
  
  if (!planningSource) {
    alert('Please select a planning estimate source');
    return;
  }
  
  const btn = document.querySelector('[data-action="save-and-next"]');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...';
  
  try {
    const endpoint = item.type === 'issue' ? `/api/issues/${item.id}` : `/api/action-items/${item.id}`;
    const payload = {
      planning_estimate_source: planningSource
    };
    
    if (manualEstimate) {
      payload.estimated_effort_hours = parseFloat(manualEstimate);
    }
    
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) throw new Error('Failed to save estimate');
    
    // Update item in allItems array
    const itemIndex = allItems.findIndex(i => i.type === item.type && i.id === item.id);
    if (itemIndex !== -1) {
      allItems[itemIndex].estimated_effort_hours = manualEstimate ? parseFloat(manualEstimate) : allItems[itemIndex].estimated_effort_hours;
      allItems[itemIndex].planning_estimate_source = planningSource;
      allItems[itemIndex].estimate = getEstimateForItem(allItems[itemIndex]);
    }
    
    // Move to next item or complete
    window.estimationQueueIndex++;
    closeEstimationModal();
    
    if (window.estimationQueueIndex < window.estimationQueue.length) {
      await showEstimationModal(window.estimationQueue[window.estimationQueueIndex]);
    } else {
      // All estimates complete, reload items and submit schedule
      await loadProjectItems();
      document.getElementById('create-schedule-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
    
  } catch (error) {
    console.error('Error saving estimate:', error);
    alert('Failed to save estimate');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save mr-2"></i>Save & Next';
  }
}

function handleSkipItem() {
  const item = window.currentEstimationItem;
  if (!item) return;
  
  // Remove from selection
  const key = `${item.type}:${item.id}`;
  selectedItemIds.delete(key);
  
  // Move to next or complete
  window.estimationQueueIndex++;
  closeEstimationModal();
  
  if (window.estimationQueueIndex < window.estimationQueue.length) {
    showEstimationModal(window.estimationQueue[window.estimationQueueIndex]);
  } else {
    // All done
    renderItems();
    if (selectedItemIds.size > 0) {
      document.getElementById('create-schedule-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    } else {
      alert('No items remaining. Please select items to schedule.');
    }
  }
}

function getEstimateForItem(item) {
  if (item.planning_estimate_source === 'manual' && item.estimated_effort_hours) {
    return item.estimated_effort_hours;
  } else if (item.planning_estimate_source === 'ai' && item.ai_effort_estimate_hours) {
    return item.ai_effort_estimate_hours;
  } else if (item.planning_estimate_source === 'hybrid' && item.hybrid_effort_estimate_hours) {
    return item.hybrid_effort_estimate_hours;
  }
  return item.ai_effort_estimate_hours || item.estimated_effort_hours || 0;
}

// ============================================
// ESTIMATE SELECTION REVIEW
// ============================================

function showEstimateSelectionModal() {
  // Gather selected items with their estimates
  const selectedTasks = [];
  selectedItemIds.forEach(key => {
    const [type, id] = key.split(':');
    const item = allItems.find(i => i.type === type && i.id === parseInt(id));
    if (item) {
      selectedTasks.push({
        ...item,
        key
      });
    }
  });

  // Build task rows
  const taskRows = selectedTasks.map((task, index) => {
    const estimates = {
      planning: task.planning_estimate_source === 'manual' ? task.estimated_effort_hours :
                task.planning_estimate_source === 'ai' ? task.ai_effort_estimate_hours :
                task.planning_estimate_source === 'hybrid' ? task.hybrid_effort_estimate_hours : null,
      ai: task.ai_effort_estimate_hours,
      manual: task.estimated_effort_hours,
      hybrid: task.hybrid_effort_estimate_hours
    };

    const planningLabel = task.planning_estimate_source || 'none';
    const planningValue = estimates.planning;

    return `
      <tr class="border-b border-gray-200 hover:bg-gray-50" data-task-key="${task.key}">
        <td class="py-3 px-4">
          <div class="flex flex-col">
            <span class="font-medium text-gray-900 text-sm">${escapeHtml(task.title)}</span>
            <span class="text-xs text-gray-500">${task.type === 'issue' ? 'Issue' : 'Action Item'} #${task.id}</span>
          </div>
        </td>
        <td class="py-3 px-4">
          <select class="estimate-selector w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" data-task-key="${task.key}">
            <option value="planning" selected>${planningLabel.toUpperCase()} (${planningValue || 0}h)</option>
            ${estimates.ai ? `<option value="ai">AI (${estimates.ai}h)</option>` : ''}
            ${estimates.manual ? `<option value="manual">Manual (${estimates.manual}h)</option>` : ''}
            ${estimates.hybrid ? `<option value="hybrid">Hybrid (${estimates.hybrid}h)</option>` : ''}
          </select>
        </td>
        <td class="py-3 px-4 text-right">
          <span class="estimate-hours font-semibold text-gray-900">${planningValue || 0}h</span>
        </td>
      </tr>
    `;
  }).join('');

  const totalHours = selectedTasks.reduce((sum, task) => {
    return sum + (getEstimate(task) || 0);
  }, 0);

  const modalHtml = `
    <div id="estimate-selection-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div class="p-6 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-2xl font-bold text-gray-900">Review & Select Estimates</h3>
              <p class="text-sm text-gray-600 mt-1">Choose which estimate to use for each task in this schedule scenario</p>
            </div>
            <button data-action="close-estimate-selection" class="text-gray-400 hover:text-gray-600">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-6">
          <!-- Bulk Actions -->
          <div class="mb-4 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-4">
            <span class="text-sm font-medium text-gray-700">Quick Actions:</span>
            <div class="flex space-x-2">
              <button data-action="use-all-planning" class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors text-sm">
                <i class="fas fa-star mr-1"></i>Use Planning Source
              </button>
              <button data-action="use-all-ai" class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors text-sm">
                <i class="fas fa-robot mr-1"></i>Use All AI
              </button>
              <button data-action="use-all-manual" class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors text-sm">
                <i class="fas fa-user mr-1"></i>Use All Manual
              </button>
              <button data-action="use-all-hybrid" class="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors text-sm">
                <i class="fas fa-balance-scale mr-1"></i>Use All Hybrid
              </button>
            </div>
          </div>

          <!-- Tasks Table -->
          <div class="border border-gray-200 rounded-lg overflow-hidden">
            <table class="w-full">
              <thead class="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th class="text-left py-3 px-4 text-sm font-semibold text-gray-700">Task</th>
                  <th class="text-left py-3 px-4 text-sm font-semibold text-gray-700">Estimate Source</th>
                  <th class="text-right py-3 px-4 text-sm font-semibold text-gray-700">Hours</th>
                </tr>
              </thead>
              <tbody id="estimate-selection-tbody">
                ${taskRows}
              </tbody>
              <tfoot class="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colspan="2" class="py-3 px-4 text-right font-bold text-gray-900">Total Estimated Hours:</td>
                  <td class="py-3 px-4 text-right">
                    <span id="total-estimate-hours" class="text-xl font-bold text-blue-600">${totalHours}h</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div class="p-6 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
          <button
            data-action="cancel-estimate-selection"
            class="px-6 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
          >
            <i class="fas fa-times mr-2"></i>Cancel
          </button>
          <button
            data-action="confirm-estimate-selection"
            class="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            <i class="fas fa-check mr-2"></i>Create Schedule
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Attach event listeners
  document.querySelector('[data-action="close-estimate-selection"]').addEventListener('click', closeEstimateSelectionModal);
  document.querySelector('[data-action="cancel-estimate-selection"]').addEventListener('click', closeEstimateSelectionModal);
  document.querySelector('[data-action="confirm-estimate-selection"]').addEventListener('click', handleConfirmEstimateSelection);
  
  // Bulk actions
  document.querySelector('[data-action="use-all-planning"]').addEventListener('click', () => applyBulkEstimateSource('planning'));
  document.querySelector('[data-action="use-all-ai"]').addEventListener('click', () => applyBulkEstimateSource('ai'));
  document.querySelector('[data-action="use-all-manual"]').addEventListener('click', () => applyBulkEstimateSource('manual'));
  document.querySelector('[data-action="use-all-hybrid"]').addEventListener('click', () => applyBulkEstimateSource('hybrid'));

  // Change listeners for dropdowns
  document.querySelectorAll('.estimate-selector').forEach(select => {
    select.addEventListener('change', updateEstimateDisplay);
  });
}

function closeEstimateSelectionModal() {
  const modal = document.getElementById('estimate-selection-modal');
  if (modal) {
    modal.remove();
  }
}

function applyBulkEstimateSource(source) {
  document.querySelectorAll('.estimate-selector').forEach(select => {
    const option = Array.from(select.options).find(opt => opt.value === source);
    if (option) {
      select.value = source;
      updateEstimateDisplay({ target: select });
    }
  });
}

function updateEstimateDisplay(e) {
  const select = e.target;
  const row = select.closest('tr');
  const hoursDisplay = row.querySelector('.estimate-hours');
  const selectedOption = select.options[select.selectedIndex];
  const hours = selectedOption.text.match(/\((\d+(?:\.\d+)?)h\)/)?.[1] || '0';
  
  hoursDisplay.textContent = `${hours}h`;
  
  // Update total
  let total = 0;
  document.querySelectorAll('.estimate-hours').forEach(el => {
    const value = parseFloat(el.textContent) || 0;
    total += value;
  });
  
  document.getElementById('total-estimate-hours').textContent = `${total}h`;
}

async function handleConfirmEstimateSelection() {
  const estimateSelections = {};
  
  document.querySelectorAll('.estimate-selector').forEach(select => {
    const taskKey = select.getAttribute('data-task-key');
    estimateSelections[taskKey] = select.value;
  });
  
  closeEstimateSelectionModal();
  await submitScheduleWithEstimates(estimateSelections);
}

// ============================================
// SCHEDULE CREATION
// ============================================

async function handleCreateSchedule(e) {
  e.preventDefault();

  if (selectedItemIds.size === 0) {
    alert('Please select at least one item to schedule');
    return;
  }

  // Phase 2: Check for items without estimates
  const itemsWithoutEstimates = getItemsWithoutEstimates();
  if (itemsWithoutEstimates.length > 0) {
    showMissingEstimatesModal(itemsWithoutEstimates);
    return;
  }

  // Check if strict resource requirement is enabled
  const requireAssignee = document.getElementById('require-assignee').checked;
  if (requireAssignee) {
    const itemsWithoutAssignees = getItemsWithoutAssignees();
    if (itemsWithoutAssignees.length > 0) {
      console.log('Strict mode: Blocking schedule creation due to unassigned tasks:', itemsWithoutAssignees.length);
      showMissingAssigneesModal(itemsWithoutAssignees);
      return; // Stop schedule creation - strict mode requires all tasks have assignees
    }
  }

  // Show estimate selection review modal
  showEstimateSelectionModal();
}

async function submitScheduleWithEstimates(estimateSelections) {
  const submitBtn = document.getElementById('create-submit');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creating Schedule...';

  try {
    const formData = {
      name: document.getElementById('schedule-name').value.trim(),
      startDate: document.getElementById('start-date').value,
      hoursPerDay: parseInt(document.getElementById('hours-per-day').value),
      includeWeekends: document.querySelector('input[name="work-days"]:checked').value === 'all',
      notes: document.getElementById('schedule-notes').value.trim() || undefined,
      selectedItems: Array.from(selectedItemIds).map(key => {
        const [type, id] = key.split(':');
        return { 
          type, 
          id: parseInt(id),
          estimateSource: estimateSelections[`${type}:${id}`] || 'planning'
        };
      })
    };

    const response = await fetch(`/api/projects/${currentProjectId}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create schedule');
    }

    const result = await response.json();

    alert(`Schedule created successfully!\n\nTotal Tasks: ${result.totalTasks}\nDuration: ${calculateDuration(result.startDate, result.endDate)} days\nCritical Path: ${result.criticalPathTasks} tasks\nRisks: ${result.risksCount}`);

    resetCreateForm();
    switchTab('view');

  } catch (error) {
    console.error('Error creating schedule:', error);
    alert(`Failed to create schedule: ${error.message}`);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-calendar-plus mr-2"></i>Create Schedule';
  }
}

function resetCreateForm() {
  document.getElementById('create-schedule-form').reset();
  selectedItemIds.clear();
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('start-date').value = today;
  document.getElementById('hours-per-day').value = 8;
  renderItems();
}

// ============================================
// SCHEDULE VIEWING
// ============================================

async function viewScheduleDetails(scheduleId) {
  try {
    const response = await fetch(`/api/schedules/${scheduleId}`);
    if (!response.ok) throw new Error('Failed to load schedule details');

    const data = await response.json();
    renderScheduleDetail(data);

    document.getElementById('schedule-detail-modal').classList.remove('hidden');

  } catch (error) {
    console.error('Error loading schedule details:', error);
    alert('Failed to load schedule details');
  }
}

function renderScheduleDetail(data) {
  const { schedule, tasks } = data;

  document.getElementById('modal-schedule-name').textContent = schedule.name;

  // Group tasks by assignee
  const tasksByAssignee = {};
  tasks.forEach(task => {
    const assignee = task.assignee || 'Unassigned';
    if (!tasksByAssignee[assignee]) {
      tasksByAssignee[assignee] = [];
    }
    tasksByAssignee[assignee].push(task);
  });

  // Calculate resource workload
  const resourceWorkload = calculateResourceWorkload(tasks, schedule);

  const content = `
    <div class="space-y-4">
      <!-- Schedule Summary -->
      <div class="bg-gray-50 rounded-lg p-6">
        <div class="flex justify-between items-start mb-4">
          <h3 class="text-lg font-semibold">Schedule Summary</h3>
          <button 
            onclick="exportScheduleCSV(${schedule.id})" 
            class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center text-sm"
          >
            <i class="fas fa-file-csv mr-2"></i>Export CSV
          </button>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p class="text-xs text-gray-500 uppercase">Duration</p>
            <p class="text-lg font-bold">${calculateDuration(schedule.start_date, schedule.end_date)} days</p>
            <p class="text-xs text-gray-500">${formatDate(schedule.start_date)} - ${formatDate(schedule.end_date)}</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase">Total Tasks</p>
            <p class="text-lg font-bold">${schedule.total_tasks}</p>
            <p class="text-xs text-gray-500">${schedule.total_hours} hours total</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase">Critical Path</p>
            <p class="text-lg font-bold text-red-600">${schedule.critical_path_tasks} tasks</p>
            <p class="text-xs text-gray-500">${schedule.critical_path_hours} hours</p>
          </div>
          <div>
            <p class="text-xs text-gray-500 uppercase">Risks</p>
            <p class="text-lg font-bold ${schedule.risks_count > 0 ? 'text-red-600' : 'text-green-600'}">${schedule.risks_count}</p>
            <p class="text-xs text-gray-500">${schedule.risks_count > 0 ? 'Attention needed' : 'No risks detected'}</p>
          </div>
        </div>
        <div class="mt-4 pt-4 border-t">
          <p class="text-sm text-gray-700">
            <strong>Work Schedule:</strong> ${schedule.hours_per_day} hours/day, 
            ${schedule.include_weekends ? '7 days/week (including weekends)' : 'Monday-Friday (business days only)'}
          </p>
          ${schedule.notes ? `<p class="text-sm text-gray-700 mt-2"><strong>Notes:</strong> ${escapeHtml(schedule.notes)}</p>` : ''}
        </div>
      </div>

      <!-- Tabs -->
      <div class="border-b border-gray-200">
        <nav class="flex space-x-4">
          <button class="detail-tab-button active" data-detail-tab="timeline">
            <i class="fas fa-list mr-2"></i>Timeline
          </button>
          <button class="detail-tab-button" data-detail-tab="gantt">
            <i class="fas fa-chart-bar mr-2"></i>Gantt Chart
          </button>
          <button class="detail-tab-button" data-detail-tab="resources">
            <i class="fas fa-users mr-2"></i>Resources
          </button>
        </nav>
      </div>

      <!-- Timeline Tab -->
      <div id="timeline-tab" class="detail-tab-content active">
        <div class="space-y-6">
          ${Object.entries(tasksByAssignee).map(([assignee, assigneeTasks]) => `
            <div>
              <h4 class="text-md font-semibold text-gray-700 mb-3 flex items-center">
                <i class="fas fa-user mr-2"></i>${escapeHtml(assignee)} 
                <span class="ml-2 text-sm font-normal text-gray-500">(${assigneeTasks.length} ${assigneeTasks.length === 1 ? 'task' : 'tasks'})</span>
              </h4>
              <div class="space-y-2">
                ${assigneeTasks.map(task => renderTaskCard(task)).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Gantt Chart Tab -->
      <div id="gantt-tab" class="detail-tab-content">
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <div id="gantt-container" class="gantt-container"></div>
        </div>
      </div>

      <!-- Resources Tab -->
      <div id="resources-tab" class="detail-tab-content">
        ${renderResourceWorkload(resourceWorkload, schedule.hours_per_day)}
      </div>
    </div>
  `;

  document.getElementById('schedule-detail-content').innerHTML = content;

  // Attach tab click handlers
  document.querySelectorAll('.detail-tab-button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = e.currentTarget.dataset.detailTab;
      switchDetailTab(tabName, tasks, schedule);
    });
  });

  // Store schedule data for later use
  window.currentScheduleData = { schedule, tasks };
}

function renderTaskCard(task) {
  const duration = calculateDuration(task.scheduled_start, task.scheduled_end) + 1;
  const riskBadges = task.risk_reason ? task.risk_reason.split('; ').map(risk => 
    `<span class="risk-badge risk-high"><i class="fas fa-exclamation-triangle mr-1"></i>${escapeHtml(risk)}</span>`
  ).join('') : '';

  return `
    <div class="border border-gray-200 rounded-lg p-4 ${task.is_critical_path ? 'bg-red-50 border-red-200' : 'bg-white'}">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center space-x-2 mb-2">
            ${task.is_critical_path ? '<span class="critical-path-badge"><i class="fas fa-route mr-1"></i>Critical Path</span>' : ''}
            <span class="inline-flex items-center px-2 py-1 text-xs font-medium rounded ${task.item_type === 'issue' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">
              ${task.item_type === 'issue' ? 'Issue' : 'Action Item'}
            </span>
            <span class="inline-flex items-center px-2 py-1 text-xs rounded ${getStatusColor(task.status)}">
              ${task.status}
            </span>
          </div>
          <p class="text-sm font-semibold text-gray-900 mb-2">${escapeHtml(task.title)}</p>
          <div class="flex flex-wrap gap-2 text-xs text-gray-600 mb-1">
            <span><i class="fas fa-clock mr-1"></i>${task.estimated_hours}h (${duration} ${duration === 1 ? 'day' : 'days'})</span>
            <span><i class="fas fa-calendar mr-1"></i>${formatDate(task.scheduled_start)} - ${formatDate(task.scheduled_end)}</span>
            ${task.due_date ? `<span class="${task.days_late && task.days_late > 0 ? 'text-red-600 font-semibold' : ''}"><i class="fas fa-flag mr-1"></i>Due: ${formatDate(task.due_date)}${task.days_late > 0 ? ` (${task.days_late} days late)` : ''}</span>` : ''}
          </div>
          <div class="text-xs ${task.assignee ? 'text-gray-600' : 'text-gray-400 italic'}">
            <i class="fas fa-user mr-1"></i>Assignee: ${task.assignee ? escapeHtml(task.assignee) : 'Unassigned'}
          </div>
          ${task.dependencies && task.dependencies.length > 0 ? `
            <div class="mt-2 text-xs text-gray-500">
              <i class="fas fa-link mr-1"></i>Depends on ${task.dependencies.length} ${task.dependencies.length === 1 ? 'task' : 'tasks'}
            </div>
          ` : ''}
          ${riskBadges ? `<div class="mt-2 flex flex-wrap gap-2">${riskBadges}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function closeDetailModal() {
  document.getElementById('schedule-detail-modal').classList.add('hidden');
}

function switchDetailTab(tabName, tasks, schedule) {
  // Update tab buttons
  document.querySelectorAll('.detail-tab-button').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-detail-tab="${tabName}"]`).classList.add('active');

  // Update tab content
  document.querySelectorAll('.detail-tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`${tabName}-tab`).classList.add('active');

  // If switching to Gantt tab, render the Gantt chart
  if (tabName === 'gantt') {
    renderGanttChart(tasks, schedule);
  }
}

function renderGanttChart(tasks, schedule) {
  const ganttContainer = document.getElementById('gantt-container');
  ganttContainer.innerHTML = ''; // Clear previous chart

  // Prepare Gantt data
  const ganttTasks = tasks.map(task => {
    return {
      id: `${task.item_type}-${task.item_id}`,
      name: task.title,
      start: task.scheduled_start,
      end: task.scheduled_end,
      progress: task.status === 'Done' ? 100 : task.status === 'In Progress' ? 50 : 0,
      dependencies: task.dependencies && task.dependencies.length > 0 
        ? task.dependencies.map(dep => `${dep.item_type}-${dep.item_id}`).join(',') 
        : '',
      custom_class: task.is_critical_path ? 'bar-critical' : ''
    };
  });

  if (ganttTasks.length === 0) {
    ganttContainer.innerHTML = '<p class="text-gray-500 text-center py-8">No tasks to display</p>';
    return;
  }

  // Create Gantt chart
  try {
    const gantt = new Gantt(ganttContainer, ganttTasks, {
      view_mode: 'Day',
      bar_height: 30,
      padding: 18,
      date_format: 'YYYY-MM-DD',
      language: 'en',
      custom_popup_html: function(task) {
        const taskData = tasks.find(t => `${t.item_type}-${t.item_id}` === task.id);
        return `
          <div class="details-container">
            <h5>${task.name}</h5>
            <p><strong>Duration:</strong> ${task.progress}% complete</p>
            <p><strong>Dates:</strong> ${formatDate(task._start)} - ${formatDate(task._end)}</p>
            ${taskData.assignee ? `<p><strong>Assignee:</strong> ${taskData.assignee}</p>` : ''}
            ${taskData.is_critical_path ? '<p class="text-red-600"><strong>Critical Path</strong></p>' : ''}
          </div>
        `;
      }
    });

    // Add view mode buttons
    const viewModesHtml = `
      <div class="flex space-x-2 mt-4 justify-center">
        <button onclick="changeGanttView('Quarter Day')" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">Quarter Day</button>
        <button onclick="changeGanttView('Half Day')" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">Half Day</button>
        <button onclick="changeGanttView('Day')" class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">Day</button>
        <button onclick="changeGanttView('Week')" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">Week</button>
        <button onclick="changeGanttView('Month')" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 text-sm">Month</button>
      </div>
    `;
    ganttContainer.insertAdjacentHTML('afterend', viewModesHtml);

    // Store gantt instance
    window.currentGanttInstance = gantt;

  } catch (error) {
    console.error('Error rendering Gantt chart:', error);
    ganttContainer.innerHTML = '<p class="text-red-500 text-center py-8">Error rendering Gantt chart</p>';
  }
}

function changeGanttView(viewMode) {
  if (window.currentGanttInstance) {
    window.currentGanttInstance.change_view_mode(viewMode);
  }
}

function calculateResourceWorkload(tasks, schedule) {
  const workload = {};
  const hoursPerDay = schedule.hours_per_day || 8;

  tasks.forEach(task => {
    const assignee = task.assignee || 'Unassigned';
    if (!workload[assignee]) {
      workload[assignee] = {
        totalHours: 0,
        tasks: [],
        dailyLoad: {},
        maxDailyHours: 0
      };
    }

    workload[assignee].totalHours += parseFloat(task.estimated_hours) || 0;
    workload[assignee].tasks.push(task);

    // Calculate daily workload
    const start = new Date(task.scheduled_start);
    const end = new Date(task.scheduled_end);
    const duration = calculateDuration(task.scheduled_start, task.scheduled_end) + 1;
    const hoursPerTaskDay = (parseFloat(task.estimated_hours) || 0) / duration;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      if (!workload[assignee].dailyLoad[dateKey]) {
        workload[assignee].dailyLoad[dateKey] = 0;
      }
      workload[assignee].dailyLoad[dateKey] += hoursPerTaskDay;
      workload[assignee].maxDailyHours = Math.max(
        workload[assignee].maxDailyHours,
        workload[assignee].dailyLoad[dateKey]
      );
    }
  });

  // Calculate overloading
  Object.keys(workload).forEach(assignee => {
    const resource = workload[assignee];
    resource.isOverloaded = resource.maxDailyHours > hoursPerDay;
    resource.overloadedDays = Object.entries(resource.dailyLoad)
      .filter(([date, hours]) => hours > hoursPerDay)
      .length;
    resource.utilizationPercent = Math.round((resource.maxDailyHours / hoursPerDay) * 100);
  });

  return workload;
}

function renderResourceWorkload(workload, hoursPerDay) {
  const sortedResources = Object.entries(workload).sort((a, b) => {
    // Sort overloaded resources first
    if (a[1].isOverloaded && !b[1].isOverloaded) return -1;
    if (!a[1].isOverloaded && b[1].isOverloaded) return 1;
    return b[1].totalHours - a[1].totalHours;
  });

  return `
    <div class="space-y-4">
      ${Object.keys(workload).some(k => workload[k].isOverloaded) ? `
        <div class="bg-red-50 border border-red-200 rounded-lg p-4">
          <div class="flex items-center">
            <i class="fas fa-exclamation-triangle text-red-600 mr-2"></i>
            <span class="font-semibold text-red-900">Resource Overloading Detected!</span>
          </div>
          <p class="text-sm text-red-700 mt-2">
            Some team members are assigned more than ${hoursPerDay} hours per day. Consider redistributing tasks or extending the timeline.
          </p>
        </div>
      ` : `
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <div class="flex items-center">
            <i class="fas fa-check-circle text-green-600 mr-2"></i>
            <span class="font-semibold text-green-900">No Resource Overloading</span>
          </div>
          <p class="text-sm text-green-700 mt-2">
            All team members have workloads within the ${hoursPerDay} hours/day limit.
          </p>
        </div>
      `}

      <div class="grid gap-4">
        ${sortedResources.map(([assignee, resource]) => `
          <div class="border ${resource.isOverloaded ? 'border-red-300 overloaded' : 'border-gray-200'} rounded-lg p-4">
            <div class="flex justify-between items-start mb-3">
              <div>
                <h4 class="text-lg font-semibold ${resource.isOverloaded ? 'text-red-900' : 'text-gray-900'}">
                  <i class="fas fa-user mr-2"></i>${escapeHtml(assignee)}
                  ${resource.isOverloaded ? '<i class="fas fa-exclamation-triangle text-red-600 ml-2"></i>' : ''}
                </h4>
                <p class="text-sm text-gray-600 mt-1">${resource.tasks.length} task${resource.tasks.length !== 1 ? 's' : ''} assigned</p>
              </div>
              <div class="text-right">
                <p class="text-2xl font-bold ${resource.isOverloaded ? 'text-red-600' : 'text-gray-900'}">
                  ${resource.totalHours.toFixed(1)}h
                </p>
                <p class="text-xs text-gray-500">Total hours</p>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-4 mb-3 p-3 bg-gray-50 rounded">
              <div>
                <p class="text-xs text-gray-500 uppercase">Peak Daily Load</p>
                <p class="text-lg font-bold ${resource.maxDailyHours > hoursPerDay ? 'text-red-600' : 'text-gray-900'}">
                  ${resource.maxDailyHours.toFixed(1)}h
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-500 uppercase">Utilization</p>
                <p class="text-lg font-bold ${resource.utilizationPercent > 100 ? 'text-red-600' : 'text-gray-900'}">
                  ${resource.utilizationPercent}%
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-500 uppercase">Overloaded Days</p>
                <p class="text-lg font-bold ${resource.overloadedDays > 0 ? 'text-red-600' : 'text-green-600'}">
                  ${resource.overloadedDays}
                </p>
              </div>
            </div>

            ${resource.isOverloaded ? `
              <div class="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">
                <i class="fas fa-exclamation-circle mr-1"></i>
                <strong>Warning:</strong> This resource exceeds ${hoursPerDay}h/day capacity on ${resource.overloadedDays} day${resource.overloadedDays !== 1 ? 's' : ''}.
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function exportScheduleCSV(scheduleId) {
  const { schedule, tasks } = window.currentScheduleData;
  
  if (!tasks || tasks.length === 0) {
    alert('No tasks to export');
    return;
  }

  // Prepare CSV headers
  const headers = [
    'Task ID',
    'Type',
    'Title',
    'Status',
    'Assignee',
    'Estimated Hours',
    'Scheduled Start',
    'Scheduled End',
    'Due Date',
    'Days Late',
    'Critical Path',
    'Dependencies',
    'Risk Reasons'
  ];

  // Prepare CSV rows
  const rows = tasks.map(task => [
    `${task.item_type}-${task.item_id}`,
    task.item_type === 'issue' ? 'Issue' : 'Action Item',
    `"${(task.title || '').replace(/"/g, '""')}"`, // Escape quotes
    task.status || '',
    task.assignee || 'Unassigned',
    task.estimated_hours || 0,
    formatDate(task.scheduled_start),
    formatDate(task.scheduled_end),
    task.due_date ? formatDate(task.due_date) : '',
    task.days_late || 0,
    task.is_critical_path ? 'Yes' : 'No',
    task.dependencies && task.dependencies.length > 0 
      ? task.dependencies.map(d => `${d.item_type}-${d.item_id}`).join('; ')
      : '',
    task.risk_reason ? `"${task.risk_reason.replace(/"/g, '""')}"` : ''
  ]);

  // Build CSV content
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  // Download CSV
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `schedule-${schedule.name.replace(/[^a-z0-9]/gi, '-')}-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================
// SCHEDULE DELETION
// ============================================

async function deleteSchedule(scheduleId) {
  if (!confirm('Are you sure you want to delete this schedule? This action cannot be undone.')) {
    return;
  }

  try {
    const response = await fetch(`/api/schedules/${scheduleId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete schedule');
    }

    alert('Schedule deleted successfully');
    loadSchedules();

  } catch (error) {
    console.error('Error deleting schedule:', error);
    alert(`Failed to delete schedule: ${error.message}`);
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function calculateDuration(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getStatusColor(status) {
  const statusLower = status.toLowerCase();
  if (statusLower === 'done') return 'bg-green-100 text-green-800';
  if (statusLower === 'in progress') return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-800';
}

function hasPermission(requiredRole) {
  const roleHierarchy = {
    'Viewer': 1,
    'Commenter': 2,
    'Team Member': 3,
    'Team Lead': 4,
    'Project Manager': 5,
    'Administrator': 6
  };
  
  const userRoleLevel = roleHierarchy[currentUser.role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 999;
  
  return userRoleLevel >= requiredLevel;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
