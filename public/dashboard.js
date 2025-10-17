// Project Dashboard
let currentProjectId = null;
let currentUser = null;
let dashboardData = {
  stats: null,
  activity: null,
  teamMetrics: null,
  trends: null
};
let charts = {};

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Dashboard page initializing...');
  
  // Get project ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  currentProjectId = urlParams.get('projectId');
  
  if (!currentProjectId) {
    showError('No project ID specified');
    return;
  }
  
  // Initialize auth
  await AuthManager.init();
  
  if (!AuthManager.isAuthenticated) {
    window.location.href = 'index.html';
    return;
  }
  
  currentUser = AuthManager.currentUser;
  
  // Display user info
  const userDisplay = document.getElementById('userDisplay');
  if (userDisplay && currentUser) {
    userDisplay.textContent = `${currentUser.username} (${currentUser.role})`;
  }
  
  // Setup event listeners
  setupEventListeners();
  
  // Load dashboard data
  await loadDashboard();
});

// Setup event listeners
function setupEventListeners() {
  const retryBtn = document.getElementById('retryBtn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => loadDashboard());
  }
  
  // Back to Projects button
  const backToProjectsBtn = document.getElementById('backToProjectsBtn');
  if (backToProjectsBtn) {
    backToProjectsBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }
  
  // View dropdown navigation
  document.getElementById('dashboard-btn')?.addEventListener('click', () => {
    window.location.href = `dashboard.html?projectId=${currentProjectId}`;
  });
  document.getElementById('view-checklists-btn')?.addEventListener('click', () => {
    window.location.href = `checklists.html?project=${currentProjectId}`;
  });
  document.getElementById('view-tags-btn')?.addEventListener('click', () => {
    window.location.href = `tags.html?projectId=${currentProjectId}`;
  });
  document.getElementById('view-risks-btn')?.addEventListener('click', () => {
    window.location.href = `risks.html?projectId=${currentProjectId}`;
  });
  document.getElementById('view-templates-btn')?.addEventListener('click', () => {
    window.location.href = 'templates.html';
  });
  
  // Create dropdown navigation
  document.getElementById('create-issue-btn')?.addEventListener('click', () => {
    window.location.href = `index.html?project=${currentProjectId}#create-issue`;
  });
  document.getElementById('create-action-item-btn')?.addEventListener('click', () => {
    window.location.href = `index.html?project=${currentProjectId}#create-action`;
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

// Load all dashboard data
async function loadDashboard() {
  try {
    showLoading();
    
    // Load project info first
    await loadProjectInfo();
    
    // Load all dashboard data in parallel
    await Promise.all([
      loadStats(),
      loadActivity(),
      loadTeamMetrics(),
      loadTrends()
    ]);
    
    // Render the dashboard
    renderDashboard();
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
    showError(error.message || 'Failed to load dashboard');
  }
}

// Load project information
async function loadProjectInfo() {
  try {
    const response = await fetch('/api/projects', {
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to load project info');
    
    const projects = await response.json();
    const project = projects.find(p => p.id === parseInt(currentProjectId));
    
    if (project) {
      document.getElementById('projectNameHeader').textContent = project.name;
    }
  } catch (error) {
    console.error('Error loading project info:', error);
  }
}

// Load dashboard statistics
async function loadStats() {
  const response = await fetch(`/api/projects/${currentProjectId}/dashboard/stats`, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to load statistics');
  }
  
  dashboardData.stats = await response.json();
  console.log('Stats loaded:', dashboardData.stats);
}

// Load activity feed
async function loadActivity() {
  const response = await fetch(`/api/projects/${currentProjectId}/dashboard/activity?limit=10`, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to load activity');
  }
  
  dashboardData.activity = await response.json();
  console.log('Activity loaded:', dashboardData.activity.length, 'items');
}

// Load team metrics
async function loadTeamMetrics() {
  const response = await fetch(`/api/projects/${currentProjectId}/dashboard/team-metrics`, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to load team metrics');
  }
  
  dashboardData.teamMetrics = await response.json();
  console.log('Team metrics loaded:', dashboardData.teamMetrics.length, 'members');
}

// Load trends data
async function loadTrends() {
  const response = await fetch(`/api/projects/${currentProjectId}/dashboard/trends?days=30`, {
    credentials: 'include'
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to load trends');
  }
  
  dashboardData.trends = await response.json();
  console.log('Trends loaded:', dashboardData.trends);
}

// Render complete dashboard
function renderDashboard() {
  const container = document.getElementById('dashboardContent');
  
  container.innerHTML = `
    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      ${renderStatsCards()}
    </div>
    
    <!-- Charts Row -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      ${renderStatusChart()}
      ${renderPriorityChart()}
    </div>
    
    <!-- Trend Chart -->
    <div class="bg-white rounded-lg shadow-md p-6 mb-8">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Activity Trend (30 Days)</h3>
      <canvas id="activityTrendChart" class="w-full" style="max-height: 300px;"></canvas>
    </div>
    
    <!-- Activity Feed and Team Metrics -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      ${renderActivityFeed()}
      ${renderTeamMetrics()}
    </div>
    
    <!-- Reports Section -->
    <div class="bg-white rounded-lg shadow-md p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">📊 Reports</h3>
      
      <!-- PDF Reports -->
      <div class="border border-gray-200 rounded-lg p-4">
        <h4 class="font-medium text-gray-700 mb-3">PDF Reports</h4>
        <div class="space-y-2">
          <button data-report-type="executive" class="report-btn w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 flex items-center justify-center">
            <span class="mr-2">📄</span> Executive Summary
          </button>
          <button data-report-type="detailed" class="report-btn w-full bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 flex items-center justify-center">
            <span class="mr-2">📋</span> Detailed Report
          </button>
          <button data-report-type="team" class="report-btn w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 flex items-center justify-center">
            <span class="mr-2">👥</span> Team Performance
          </button>
        </div>
        <p class="text-xs text-gray-500 mt-3">Generate comprehensive PDF reports with charts and analytics.</p>
      </div>
      
      <!-- Status message for report generation -->
      <div id="reportStatus" class="mt-4 hidden">
        <div class="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded-lg">
          <p id="reportStatusMessage">Generating report...</p>
        </div>
      </div>
    </div>
  `;
  
  // Setup report button handlers
  setupReportHandlers();
  
  // Initialize charts after DOM is ready
  setTimeout(() => {
    if (typeof Chart !== 'undefined') {
      initializeCharts();
    } else {
      console.error('Chart.js not loaded yet, retrying...');
      setTimeout(() => {
        if (typeof Chart !== 'undefined') {
          initializeCharts();
        } else {
          console.error('Chart.js failed to load');
          // Show error message in chart areas
          const statusChart = document.getElementById('statusChart');
          const priorityChart = document.getElementById('priorityChart');
          if (statusChart) {
            statusChart.parentElement.innerHTML = '<div class="bg-white rounded-lg shadow-md p-6"><h3 class="text-lg font-semibold text-gray-800 mb-4">Issues by Status</h3><p class="text-red-500 text-center py-8">Chart library failed to load</p></div>';
          }
          if (priorityChart) {
            priorityChart.parentElement.innerHTML = '<div class="bg-white rounded-lg shadow-md p-6"><h3 class="text-lg font-semibold text-gray-800 mb-4">Issues by Priority</h3><p class="text-red-500 text-center py-8">Chart library failed to load</p></div>';
          }
        }
      }, 500);
    }
  }, 100);
  
  // Show content, hide loading
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('dashboardContent').classList.remove('hidden');
}

// Render stats cards
function renderStatsCards() {
  const stats = dashboardData.stats;
  
  return `
    <!-- Total Issues -->
    <div class="bg-white rounded-lg shadow-md p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600">Total Issues</p>
          <p class="text-3xl font-bold text-blue-600 mt-2">${stats.totalIssues}</p>
        </div>
        <div class="text-blue-600 text-4xl">📋</div>
      </div>
    </div>
    
    <!-- Total Action Items -->
    <div class="bg-white rounded-lg shadow-md p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600">Action Items</p>
          <p class="text-3xl font-bold text-green-600 mt-2">${stats.totalActionItems}</p>
        </div>
        <div class="text-green-600 text-4xl">✅</div>
      </div>
    </div>
    
    <!-- Completion Rate -->
    <div class="bg-white rounded-lg shadow-md p-6">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <p class="text-sm font-medium text-gray-600">Completion Rate</p>
          <p class="text-3xl font-bold text-purple-600 mt-2">${Math.round(stats.completionRate * 100)}%</p>
          <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
            <div class="bg-purple-600 h-2 rounded-full" style="width: ${stats.completionRate * 100}%"></div>
          </div>
        </div>
        <div class="text-purple-600 text-4xl">📊</div>
      </div>
    </div>
    
    <!-- Overdue Items -->
    <div class="bg-white rounded-lg shadow-md p-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-600">Overdue Items</p>
          <p class="text-3xl font-bold ${stats.overdueCount > 0 ? 'text-red-600' : 'text-gray-400'} mt-2">${stats.overdueCount}</p>
        </div>
        <div class="${stats.overdueCount > 0 ? 'text-red-600' : 'text-gray-400'} text-4xl">⚠️</div>
      </div>
    </div>
  `;
}

// Render status chart
function renderStatusChart() {
  return `
    <div class="bg-white rounded-lg shadow-md p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Issues by Status</h3>
      <canvas id="statusChart" style="max-height: 300px;"></canvas>
    </div>
  `;
}

// Render priority chart
function renderPriorityChart() {
  return `
    <div class="bg-white rounded-lg shadow-md p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Issues by Priority</h3>
      <canvas id="priorityChart" style="max-height: 300px;"></canvas>
    </div>
  `;
}

// Render activity feed
function renderActivityFeed() {
  const activities = dashboardData.activity;
  
  const feedHtml = activities.length > 0 ? activities.map(activity => `
    <div class="border-l-4 ${getActivityColor(activity.type)} bg-gray-50 p-3 mb-3 hover:bg-gray-100 transition">
      <div class="flex items-start">
        <span class="text-2xl mr-3">${getActivityIcon(activity.type)}</span>
        <div class="flex-1">
          <p class="text-sm text-gray-900">
            <strong>${escapeHtml(activity.user_name)}</strong> ${activity.details}
          </p>
          <p class="text-xs text-gray-600 mt-1">${escapeHtml(activity.item_title)}</p>
          <p class="text-xs text-gray-500 mt-1">${formatRelativeTime(activity.timestamp)}</p>
        </div>
      </div>
    </div>
  `).join('') : '<p class="text-gray-500 text-center py-8">No recent activity</p>';
  
  return `
    <div class="bg-white rounded-lg shadow-md p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Recent Activity</h3>
      <div class="space-y-2" style="max-height: 500px; overflow-y: auto;">
        ${feedHtml}
      </div>
    </div>
  `;
}

// Render team metrics table
function renderTeamMetrics() {
  const metrics = dashboardData.teamMetrics;
  
  const tableHtml = metrics.length > 0 ? `
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50 sticky top-0">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Member</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Completed</th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Comments</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${metrics.map((member, index) => `
            <tr class="${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}">
              <td class="px-4 py-3 whitespace-nowrap">
                <div class="text-sm font-medium text-gray-900">${escapeHtml(member.user_name)}</div>
                <div class="text-xs text-gray-500">${escapeHtml(member.user_email)}</div>
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded ${getRoleColor(member.role)}">
                  ${member.role}
                </span>
              </td>
              <td class="px-4 py-3 text-center text-sm text-gray-900">
                ${parseInt(member.issues_assigned) + parseInt(member.action_items_assigned)}
              </td>
              <td class="px-4 py-3 text-center text-sm text-green-600 font-semibold">
                ${parseInt(member.issues_completed) + parseInt(member.action_items_completed)}
              </td>
              <td class="px-4 py-3 text-center text-sm text-gray-900">
                ${parseInt(member.comments_count)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '<p class="text-gray-500 text-center py-8">No team members</p>';
  
  return `
    <div class="bg-white rounded-lg shadow-md p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Team Metrics</h3>
      <div style="max-height: 500px; overflow-y: auto;">
        ${tableHtml}
      </div>
    </div>
  `;
}

// Initialize all charts
function initializeCharts() {
  const stats = dashboardData.stats;
  const trends = dashboardData.trends;
  
  // Status pie chart
  const statusCtx = document.getElementById('statusChart');
  if (statusCtx) {
    const statusLabels = Object.keys(stats.issuesByStatus);
    const statusData = Object.values(stats.issuesByStatus);
    
    if (statusLabels.length === 0) {
      statusCtx.parentElement.innerHTML = `
        <div class="bg-white rounded-lg shadow-md p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">Issues by Status</h3>
          <p class="text-gray-500 text-center py-8">No issue data available</p>
        </div>
      `;
    } else {
      charts.status = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
          labels: statusLabels,
          datasets: [{
            data: statusData,
            backgroundColor: ['#9CA3AF', '#FCD34D', '#34D399'],
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    }
  }
  
  // Priority pie chart
  const priorityCtx = document.getElementById('priorityChart');
  if (priorityCtx) {
    const priorityLabels = Object.keys(stats.issuesByPriority);
    const priorityData = Object.values(stats.issuesByPriority);
    
    if (priorityLabels.length === 0) {
      priorityCtx.parentElement.innerHTML = `
        <div class="bg-white rounded-lg shadow-md p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">Issues by Priority</h3>
          <p class="text-gray-500 text-center py-8">No issue data available</p>
        </div>
      `;
    } else {
      charts.priority = new Chart(priorityCtx, {
        type: 'doughnut',
        data: {
          labels: priorityLabels,
          datasets: [{
            data: priorityData,
            backgroundColor: ['#EF4444', '#F97316', '#3B82F6'],
            borderWidth: 2,
            borderColor: '#fff'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom'
            }
          }
        }
      });
    }
  }
  
  // Activity trend line chart
  const trendCtx = document.getElementById('activityTrendChart');
  if (trendCtx && trends.activityTrend) {
    const dates = trends.activityTrend.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const counts = trends.activityTrend.map(d => parseInt(d.count));
    
    charts.activityTrend = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [{
          label: 'Activity Count',
          data: counts,
          borderColor: '#8B5CF6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          }
        }
      }
    });
  }
}

// Helper: Get activity color
function getActivityColor(type) {
  const colors = {
    'issue_created': 'border-blue-500',
    'action_item_created': 'border-green-500',
    'comment_added': 'border-purple-500',
    'status_changed': 'border-yellow-500',
    'transcript_uploaded': 'border-indigo-500'
  };
  return colors[type] || 'border-gray-500';
}

// Helper: Get activity icon
function getActivityIcon(type) {
  const icons = {
    'issue_created': '📋',
    'action_item_created': '✅',
    'comment_added': '💬',
    'status_changed': '🔄',
    'transcript_uploaded': '📄'
  };
  return icons[type] || '•';
}

// Helper: Get role color
function getRoleColor(role) {
  switch (role) {
    case 'Admin':
      return 'bg-red-100 text-red-800';
    case 'Manager':
      return 'bg-blue-100 text-blue-800';
    case 'Member':
      return 'bg-green-100 text-green-800';
    case 'Viewer':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

// Helper: Format relative time
function formatRelativeTime(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return then.toLocaleDateString();
}

// Helper: Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Show loading state
function showLoading() {
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('dashboardContent').classList.add('hidden');
  document.getElementById('errorState').classList.add('hidden');
}

// Show error state
function showError(message) {
  document.getElementById('loadingState').classList.add('hidden');
  document.getElementById('dashboardContent').classList.add('hidden');
  document.getElementById('errorState').classList.remove('hidden');
  document.getElementById('errorMessage').textContent = message;
}

// ============= REPORTS & EXPORT FUNCTIONS =============

// Setup report handlers
function setupReportHandlers() {
  // Add event listeners to report buttons
  const reportButtons = document.querySelectorAll('.report-btn');
  reportButtons.forEach(button => {
    button.addEventListener('click', () => {
      const reportType = button.getAttribute('data-report-type');
      generateReport(reportType);
    });
  });
  
  console.log('Report handlers initialized');
}

// Generate PDF report
async function generateReport(reportType) {
  const statusDiv = document.getElementById('reportStatus');
  const statusMsg = document.getElementById('reportStatusMessage');
  
  try {
    // Show loading status
    statusDiv.classList.remove('hidden');
    statusDiv.querySelector('div').className = 'bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded-lg';
    statusMsg.textContent = 'Generating report... This may take a moment.';
    
    const response = await fetch(`/api/projects/${currentProjectId}/reports/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        reportType: reportType,
        dateRange: 'all'
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate report');
    }
    
    // Get the PDF blob
    const blob = await response.blob();
    console.log(`[REPORT] Received blob for ${reportType}:`, blob.size, 'bytes, type:', blob.type);
    
    // Validate blob
    if (blob.size === 0) {
      throw new Error('Received empty PDF file');
    }
    
    if (!blob.type.includes('pdf') && !blob.type.includes('application/octet-stream')) {
      console.error('[REPORT] Invalid blob type:', blob.type);
      throw new Error('Invalid file type received');
    }
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}-report-${currentProjectId}-${Date.now()}.pdf`;
    document.body.appendChild(a);
    console.log(`[REPORT] Triggering download for ${reportType}`);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    console.log(`[REPORT] Download triggered successfully for ${reportType}`);
    
    // Show success
    statusDiv.querySelector('div').className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg';
    statusMsg.textContent = '✓ Report generated successfully!';
    
    // Hide status after 3 seconds
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 3000);
    
  } catch (error) {
    console.error('Error generating report:', error);
    statusDiv.querySelector('div').className = 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg';
    statusMsg.textContent = `Error: ${error.message}`;
    
    // Hide error after 5 seconds
    setTimeout(() => {
      statusDiv.classList.add('hidden');
    }, 5000);
  }
}

