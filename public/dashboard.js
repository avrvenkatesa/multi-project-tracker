// Project Dashboard
let currentProjectId = null;
let currentUser = null;
let dashboardData = {
  stats: null,
  activity: null,
  teamMetrics: null,
  trends: null,
  aiCostStats: null
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
      if (currentProjectId) {
        window.location.href = `index.html?project=${currentProjectId}`;
      } else {
        window.location.href = 'index.html';
      }
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
    if (currentProjectId) {
      window.location.href = `templates.html?project=${currentProjectId}`;
    } else {
      window.location.href = 'templates.html';
    }
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
      loadTrends(),
      loadAICostStats()
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

// Load AI Cost Statistics
async function loadAICostStats() {
  try {
    const response = await fetch(`/api/ai-usage/stats?projectId=${currentProjectId}&timeRange=month`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.warn('AI cost stats not available');
      dashboardData.aiCostStats = {
        totalCost: 0,
        totalRequests: 0,
        byFeature: [],
        recentUsage: []
      };
      return;
    }
    
    dashboardData.aiCostStats = await response.json();
    console.log('AI cost stats loaded:', dashboardData.aiCostStats);
  } catch (error) {
    console.warn('Error loading AI cost stats:', error);
    dashboardData.aiCostStats = {
      totalCost: 0,
      totalRequests: 0,
      byFeature: [],
      recentUsage: []
    };
  }
}

// Render complete dashboard
function renderDashboard() {
  const container = document.getElementById('dashboardContent');
  
  container.innerHTML = `
    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      ${renderStatsCards()}
    </div>
    
    <!-- Charts Section -->
    <div class="mb-6">
      <h3 class="text-xl font-semibold text-gray-800 mb-4">📊 Status & Priority Distribution</h3>
      
      <!-- Issues Charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        ${renderStatusChart()}
        ${renderPriorityChart()}
      </div>
      
      <!-- Action Items Charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        ${renderActionStatusChart()}
        ${renderActionPriorityChart()}
      </div>
      
      <!-- Combined Charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        ${renderCombinedStatusChart()}
        ${renderCombinedPriorityChart()}
      </div>
    </div>
    
    <!-- Trend Charts -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <div class="bg-white rounded-lg shadow-md p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-2">Activity Trend (30 Days)</h3>
        <p class="text-sm text-gray-600 mb-4">Click legend items to toggle activity types</p>
        <canvas id="activityTrendChart" class="w-full" style="max-height: 300px;"></canvas>
      </div>
      
      <div class="bg-white rounded-lg shadow-md p-6">
        <h3 class="text-lg font-semibold text-gray-800 mb-2">Velocity Trends (30 Days)</h3>
        <p class="text-sm text-gray-600 mb-4">Status transitions over time</p>
        <canvas id="velocityTrendChart" class="w-full" style="max-height: 300px;"></canvas>
      </div>
    </div>
    
    <!-- AI Cost Tracker -->
    ${renderAICostTracker()}
    
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

// Render action items status chart
function renderActionStatusChart() {
  return `
    <div class="bg-white rounded-lg shadow-md p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Action Items by Status</h3>
      <canvas id="actionStatusChart" style="max-height: 300px;"></canvas>
    </div>
  `;
}

// Render action items priority chart
function renderActionPriorityChart() {
  return `
    <div class="bg-white rounded-lg shadow-md p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Action Items by Priority</h3>
      <canvas id="actionPriorityChart" style="max-height: 300px;"></canvas>
    </div>
  `;
}

// Render combined status chart
function renderCombinedStatusChart() {
  return `
    <div class="bg-white rounded-lg shadow-md p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Combined (Issues + Action Items) by Status</h3>
      <canvas id="combinedStatusChart" style="max-height: 300px;"></canvas>
    </div>
  `;
}

// Render combined priority chart
function renderCombinedPriorityChart() {
  return `
    <div class="bg-white rounded-lg shadow-md p-6">
      <h3 class="text-lg font-semibold text-gray-800 mb-4">Combined (Issues + Action Items) by Priority</h3>
      <canvas id="combinedPriorityChart" style="max-height: 300px;"></canvas>
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

// Render AI Cost Tracker
function renderAICostTracker() {
  const aiStats = dashboardData.aiCostStats;
  
  if (!aiStats || (aiStats.totalCost === 0 && aiStats.totalRequests === 0)) {
    return `
      <div class="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg shadow-md p-6 mb-8">
        <h3 class="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <span class="text-2xl">🤖</span>
          AI Cost Tracker
        </h3>
        <p class="text-sm text-gray-600 mb-4">Track AI feature usage and costs across your project</p>
        <div class="bg-white rounded-lg p-6 text-center">
          <p class="text-gray-500">No AI usage recorded yet for this project</p>
          <p class="text-xs text-gray-400 mt-2">AI features will appear here once you use AI Analysis, Checklist Generation, or Multi-Document Processing</p>
        </div>
      </div>
    `;
  }
  
  const byFeature = aiStats.byFeature || [];
  const featureRows = byFeature.length > 0 ? byFeature.map(feature => `
    <tr class="border-b border-gray-100 hover:bg-purple-50 transition">
      <td class="px-4 py-3 text-sm font-medium text-gray-900">${escapeHtml(feature.feature_name || feature.feature)}</td>
      <td class="px-4 py-3 text-sm text-center text-gray-700">${feature.request_count || 0}</td>
      <td class="px-4 py-3 text-sm text-center text-gray-600">${feature.total_tokens ? feature.total_tokens.toLocaleString() : '0'}</td>
      <td class="px-4 py-3 text-sm text-center font-semibold text-purple-600">$${(feature.total_cost || 0).toFixed(4)}</td>
    </tr>
  `).join('') : `
    <tr>
      <td colspan="4" class="px-4 py-8 text-center text-gray-500">No AI feature usage recorded</td>
    </tr>
  `;
  
  return `
    <div class="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg shadow-md p-6 mb-8">
      <h3 class="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
        <span class="text-2xl">🤖</span>
        AI Cost Tracker
      </h3>
      <p class="text-sm text-gray-600 mb-4">AI feature usage and costs for this project (Last 30 days)</p>
      
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded-lg p-4 shadow-sm">
          <p class="text-xs text-gray-600 uppercase tracking-wide mb-1">Total Requests</p>
          <p class="text-2xl font-bold text-blue-600">${aiStats.totalRequests || 0}</p>
        </div>
        <div class="bg-white rounded-lg p-4 shadow-sm">
          <p class="text-xs text-gray-600 uppercase tracking-wide mb-1">Total Tokens</p>
          <p class="text-2xl font-bold text-green-600">${(aiStats.totalTokens || 0).toLocaleString()}</p>
        </div>
        <div class="bg-white rounded-lg p-4 shadow-sm">
          <p class="text-xs text-gray-600 uppercase tracking-wide mb-1">Total Cost</p>
          <p class="text-2xl font-bold text-purple-600">$${(aiStats.totalCost || 0).toFixed(4)}</p>
        </div>
      </div>
      
      <!-- Feature Breakdown -->
      <div class="bg-white rounded-lg shadow-sm overflow-hidden">
        <div class="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h4 class="text-sm font-semibold text-gray-700">Usage by Feature</h4>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Feature</th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Requests</th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Tokens</th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
              </tr>
            </thead>
            <tbody class="bg-white">
              ${featureRows}
            </tbody>
          </table>
        </div>
      </div>
      
      <p class="text-xs text-gray-500 mt-4">
        💡 Tip: AI costs are tracked per project to help you monitor usage and optimize your AI feature utilization.
      </p>
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
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return `${label}: ${value} (${percentage}%)`;
                }
              }
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
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return `${label}: ${value} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    }
  }
  
  // Action Items Status pie chart
  const actionStatusCtx = document.getElementById('actionStatusChart');
  if (actionStatusCtx) {
    const actionStatusLabels = Object.keys(stats.actionItemsByStatus);
    const actionStatusData = Object.values(stats.actionItemsByStatus);
    
    if (actionStatusLabels.length === 0) {
      actionStatusCtx.parentElement.innerHTML = `
        <div class="bg-white rounded-lg shadow-md p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">Action Items by Status</h3>
          <p class="text-gray-500 text-center py-8">No action item data available</p>
        </div>
      `;
    } else {
      charts.actionStatus = new Chart(actionStatusCtx, {
        type: 'doughnut',
        data: {
          labels: actionStatusLabels,
          datasets: [{
            data: actionStatusData,
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
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return `${label}: ${value} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    }
  }
  
  // Action Items Priority pie chart
  const actionPriorityCtx = document.getElementById('actionPriorityChart');
  if (actionPriorityCtx) {
    const actionPriorityLabels = Object.keys(stats.actionItemsByPriority);
    const actionPriorityData = Object.values(stats.actionItemsByPriority);
    
    if (actionPriorityLabels.length === 0) {
      actionPriorityCtx.parentElement.innerHTML = `
        <div class="bg-white rounded-lg shadow-md p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">Action Items by Priority</h3>
          <p class="text-gray-500 text-center py-8">No action item data available</p>
        </div>
      `;
    } else {
      charts.actionPriority = new Chart(actionPriorityCtx, {
        type: 'doughnut',
        data: {
          labels: actionPriorityLabels,
          datasets: [{
            data: actionPriorityData,
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
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return `${label}: ${value} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    }
  }
  
  // Combined Status pie chart
  const combinedStatusCtx = document.getElementById('combinedStatusChart');
  if (combinedStatusCtx) {
    const combinedStatus = {};
    // Merge issues and action items by status
    Object.keys(stats.issuesByStatus).forEach(status => {
      combinedStatus[status] = (combinedStatus[status] || 0) + stats.issuesByStatus[status];
    });
    Object.keys(stats.actionItemsByStatus).forEach(status => {
      combinedStatus[status] = (combinedStatus[status] || 0) + stats.actionItemsByStatus[status];
    });
    
    const combinedStatusLabels = Object.keys(combinedStatus);
    const combinedStatusData = Object.values(combinedStatus);
    
    if (combinedStatusLabels.length === 0) {
      combinedStatusCtx.parentElement.innerHTML = `
        <div class="bg-white rounded-lg shadow-md p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">Combined by Status</h3>
          <p class="text-gray-500 text-center py-8">No data available</p>
        </div>
      `;
    } else {
      charts.combinedStatus = new Chart(combinedStatusCtx, {
        type: 'doughnut',
        data: {
          labels: combinedStatusLabels,
          datasets: [{
            data: combinedStatusData,
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
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return `${label}: ${value} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    }
  }
  
  // Combined Priority pie chart
  const combinedPriorityCtx = document.getElementById('combinedPriorityChart');
  if (combinedPriorityCtx) {
    const combinedPriority = {};
    // Merge issues and action items by priority
    Object.keys(stats.issuesByPriority).forEach(priority => {
      combinedPriority[priority] = (combinedPriority[priority] || 0) + stats.issuesByPriority[priority];
    });
    Object.keys(stats.actionItemsByPriority).forEach(priority => {
      combinedPriority[priority] = (combinedPriority[priority] || 0) + stats.actionItemsByPriority[priority];
    });
    
    const combinedPriorityLabels = Object.keys(combinedPriority);
    const combinedPriorityData = Object.values(combinedPriority);
    
    if (combinedPriorityLabels.length === 0) {
      combinedPriorityCtx.parentElement.innerHTML = `
        <div class="bg-white rounded-lg shadow-md p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">Combined by Priority</h3>
          <p class="text-gray-500 text-center py-8">No data available</p>
        </div>
      `;
    } else {
      charts.combinedPriority = new Chart(combinedPriorityCtx, {
        type: 'doughnut',
        data: {
          labels: combinedPriorityLabels,
          datasets: [{
            data: combinedPriorityData,
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
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.parsed || 0;
                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                  return `${label}: ${value} (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    }
  }
  
  // Activity trend stacked area chart with breakdown by type
  const trendCtx = document.getElementById('activityTrendChart');
  if (trendCtx && trends.activityTrend) {
    // Transform data into datasets by activity type
    const activityData = trends.activityTrend;
    const allDates = [...new Set(activityData.map(d => d.date))].sort();
    const labels = allDates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    
    // Group by activity type
    const dataByType = {
      'issue_created': {},
      'action_created': {},
      'issue_comment': {},
      'action_comment': {}
    };
    
    activityData.forEach(row => {
      if (dataByType[row.activity_type]) {
        dataByType[row.activity_type][row.date] = parseInt(row.count);
      }
    });
    
    // Create datasets for each activity type
    const datasets = [
      {
        label: 'Issues Created',
        data: allDates.map(date => dataByType['issue_created'][date] || 0),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Action Items Created',
        data: allDates.map(date => dataByType['action_created'][date] || 0),
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.5)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Issue Comments',
        data: allDates.map(date => dataByType['issue_comment'][date] || 0),
        borderColor: '#8B5CF6',
        backgroundColor: 'rgba(139, 92, 246, 0.5)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Action Comments',
        data: allDates.map(date => dataByType['action_comment'][date] || 0),
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.5)',
        fill: true,
        tension: 0.4
      }
    ];
    
    charts.activityTrend = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            onClick: (e, legendItem, legend) => {
              const index = legendItem.datasetIndex;
              const chart = legend.chart;
              const meta = chart.getDatasetMeta(index);
              meta.hidden = meta.hidden === null ? !chart.data.datasets[index].hidden : null;
              chart.update();
            }
          },
          tooltip: {
            callbacks: {
              footer: (tooltipItems) => {
                const total = tooltipItems.reduce((sum, item) => sum + item.parsed.y, 0);
                return `Total: ${total}`;
              }
            }
          }
        },
        scales: {
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          },
          x: {
            stacked: true
          }
        }
      }
    });
  }
  
  // Velocity trend chart (status transitions)
  const velocityCtx = document.getElementById('velocityTrendChart');
  if (velocityCtx && trends.velocityTrend) {
    const velocityData = trends.velocityTrend;
    const allDates = [...new Set(velocityData.map(d => d.date))].sort();
    const labels = allDates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    
    // Group by status
    const dataByStatus = {
      'To Do': {},
      'In Progress': {},
      'Done': {}
    };
    
    velocityData.forEach(row => {
      if (dataByStatus[row.to_status]) {
        dataByStatus[row.to_status][row.date] = parseInt(row.count);
      }
    });
    
    // Create datasets for each status
    const velocityDatasets = [
      {
        label: 'Moved to To Do',
        data: allDates.map(date => dataByStatus['To Do'][date] || 0),
        borderColor: '#9CA3AF',
        backgroundColor: 'rgba(156, 163, 175, 0.2)',
        fill: false,
        tension: 0.4
      },
      {
        label: 'Moved to In Progress',
        data: allDates.map(date => dataByStatus['In Progress'][date] || 0),
        borderColor: '#FCD34D',
        backgroundColor: 'rgba(252, 211, 77, 0.2)',
        fill: false,
        tension: 0.4
      },
      {
        label: 'Moved to Done',
        data: allDates.map(date => dataByStatus['Done'][date] || 0),
        borderColor: '#34D399',
        backgroundColor: 'rgba(52, 211, 153, 0.2)',
        fill: false,
        tension: 0.4
      }
    ];
    
    charts.velocityTrend = new Chart(velocityCtx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: velocityDatasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              footer: (tooltipItems) => {
                const total = tooltipItems.reduce((sum, item) => sum + item.parsed.y, 0);
                return `Total Transitions: ${total}`;
              }
            }
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

