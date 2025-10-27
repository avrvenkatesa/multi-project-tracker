// schedules.js - Project Scheduling Frontend
// CSP-compliant: All event handlers using data attributes and event delegation

let currentProjectId = null;
let currentUser = null;
let allItems = [];
let filteredItems = [];
let selectedItemIds = new Set();

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
  document.getElementById('item-status-filter').addEventListener('change', filterItems);

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

async function loadProjectItems() {
  try {
    document.getElementById('items-loading').classList.remove('hidden');
    document.getElementById('items-container').classList.add('hidden');

    // Load issues
    const issuesResponse = await fetch(`/api/projects/${currentProjectId}/issues`);
    const issues = issuesResponse.ok ? await issuesResponse.json() : [];

    // Load action items
    const actionItemsResponse = await fetch(`/api/projects/${currentProjectId}/action-items`);
    const actionItems = actionItemsResponse.ok ? await actionItemsResponse.json() : [];

    // Combine and format
    allItems = [
      ...issues.map(i => ({
        ...i,
        type: 'issue',
        estimate: getEstimate(i),
        estimateSource: i.planning_estimate_source || 'unknown'
      })),
      ...actionItems.map(a => ({
        ...a,
        type: 'action-item',
        estimate: getEstimate(a),
        estimateSource: a.planning_estimate_source || 'unknown'
      }))
    ];

    filteredItems = [...allItems];
    renderItems();

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
    return parseFloat(item.manual_estimated_hours) || 0;
  } else if (item.planning_estimate_source === 'ai') {
    return parseFloat(item.ai_effort_estimate_hours) || 0;
  } else if (item.planning_estimate_source === 'hybrid_selection') {
    return parseFloat(item.hybrid_selected_hours) || 0;
  }
  // Fallback order
  return parseFloat(item.ai_effort_estimate_hours || item.manual_estimated_hours) || 0;
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
      'hybrid_selection': 'Hybrid',
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
}

function filterItems() {
  const searchTerm = document.getElementById('item-search').value.toLowerCase();
  const typeFilter = document.getElementById('item-type-filter').value;
  const statusFilter = document.getElementById('item-status-filter').value;

  filteredItems = allItems.filter(item => {
    // Search filter
    const matchesSearch = item.title.toLowerCase().includes(searchTerm);

    // Type filter
    const matchesType = typeFilter === 'all' || item.type === typeFilter;

    // Status filter
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  renderItems();
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
        return { type, id: parseInt(id) };
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

  const content = `
    <div class="space-y-6">
      <!-- Schedule Summary -->
      <div class="bg-gray-50 rounded-lg p-6">
        <h3 class="text-lg font-semibold mb-4">Schedule Summary</h3>
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

      <!-- Task Timeline by Assignee -->
      <div>
        <h3 class="text-lg font-semibold mb-4">Task Timeline</h3>
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
    </div>
  `;

  document.getElementById('schedule-detail-content').innerHTML = content;
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
          <div class="flex flex-wrap gap-2 text-xs text-gray-600">
            <span><i class="fas fa-clock mr-1"></i>${task.estimated_hours}h (${duration} ${duration === 1 ? 'day' : 'days'})</span>
            <span><i class="fas fa-calendar mr-1"></i>${formatDate(task.scheduled_start)} - ${formatDate(task.scheduled_end)}</span>
            ${task.due_date ? `<span class="${task.days_late && task.days_late > 0 ? 'text-red-600 font-semibold' : ''}"><i class="fas fa-flag mr-1"></i>Due: ${formatDate(task.due_date)}${task.days_late > 0 ? ` (${task.days_late} days late)` : ''}</span>` : ''}
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
