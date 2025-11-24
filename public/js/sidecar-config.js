// Sidecar Bot Configuration Page
// Handles loading, editing, and saving Sidecar Bot settings

let projectId = null;
let currentConfig = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  // Get projectId from URL
  const params = new URLSearchParams(window.location.search);
  projectId = params.get('projectId');

  if (!projectId) {
    showToast('No project specified', 'error');
    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 2000);
    return;
  }

  // Load project name
  await loadProjectName();

  // Load configuration
  await loadConfiguration();

  // Setup event listeners
  setupEventListeners();
});

// Load project name for context
async function loadProjectName() {
  try {
    const response = await fetch(`/api/projects/${projectId}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (response.ok) {
      const project = await response.json();
      document.getElementById('project-name').textContent = project.name;
      document.getElementById('project-context').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading project:', error);
  }
}

// Load current configuration from API
async function loadConfiguration() {
  try {
    const response = await fetch(`/api/projects/${projectId}/sidecar/config`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      const rawConfig = data.config || data;
      // Normalize field names - backend returns snake_case from database
      currentConfig = normalizeConfig(rawConfig);
      populateForm(currentConfig);
    } else if (response.status === 404) {
      // No config exists yet, use defaults
      currentConfig = getDefaultConfig();
      populateForm(currentConfig);
    } else {
      throw new Error('Failed to load configuration');
    }

    // Hide loading, show form
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('config-form').classList.remove('hidden');
  } catch (error) {
    console.error('Error loading configuration:', error);
    showToast('Failed to load configuration', 'error');
    
    // Hide loading, show form with defaults
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('config-form').classList.remove('hidden');
    currentConfig = getDefaultConfig();
    populateForm(currentConfig);
  }
}

// Normalize config from backend (handles both snake_case and camelCase)
function normalizeConfig(config) {
  if (!config) return getDefaultConfig();
  
  return {
    enabled: config.enabled ?? false,
    auto_create_threshold: config.auto_create_threshold ?? config.autoCreateThreshold ?? 0.90,
    detection_types: config.detection_types ?? config.detectionTypes ?? ['decision', 'risk', 'action_item', 'task'],
    slack_enabled: config.slack_enabled ?? config.slackEnabled ?? false,
    teams_enabled: config.teams_enabled ?? config.teamsEnabled ?? false,
    email_imap_enabled: config.email_imap_enabled ?? config.emailImapEnabled ?? false,
    github_enabled: config.github_enabled ?? config.githubEnabled ?? false
  };
}

// Get default configuration
function getDefaultConfig() {
  return {
    enabled: false,
    auto_create_threshold: 0.90,
    detection_types: ['decision', 'risk', 'action_item', 'task'],
    slack_enabled: false,
    teams_enabled: false,
    email_imap_enabled: false,
    github_enabled: false
  };
}

// Populate form with configuration data
function populateForm(config) {
  // Master toggle
  const masterToggle = document.getElementById('master-toggle');
  masterToggle.checked = config.enabled;
  updateStatusBadge(config.enabled);

  // Confidence threshold
  const threshold = document.getElementById('confidence-threshold');
  const thresholdValue = parseFloat(config.auto_create_threshold || 0.90);
  threshold.value = thresholdValue;
  document.getElementById('threshold-value').textContent = thresholdValue.toFixed(2);

  // Entity type toggles - normalize to lowercase for comparison
  const detectionTypes = (config.detection_types || []).map(t => t.toLowerCase());
  document.getElementById('toggle-decisions').checked = detectionTypes.includes('decision');
  document.getElementById('toggle-risks').checked = detectionTypes.includes('risk');
  document.getElementById('toggle-action-items').checked = detectionTypes.includes('action_item');
  document.getElementById('toggle-tasks').checked = detectionTypes.includes('task');

  // Platform checkboxes
  document.getElementById('platform-slack').checked = config.slack_enabled || false;
  document.getElementById('platform-teams').checked = config.teams_enabled || false;
  document.getElementById('platform-email').checked = config.email_imap_enabled || false;
  document.getElementById('platform-github').checked = config.github_enabled || false;

  // Keywords and filters (placeholders for future implementation)
  document.getElementById('custom-keywords').value = '';
  document.getElementById('ignore-users').value = '';
}

// Update status badge
function updateStatusBadge(enabled) {
  const badge = document.getElementById('status-badge');
  if (enabled) {
    badge.textContent = 'Active';
    badge.className = 'px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700';
  } else {
    badge.textContent = 'Inactive';
    badge.className = 'px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-600';
  }
}

// Setup all event listeners
function setupEventListeners() {
  // Master toggle
  document.getElementById('master-toggle').addEventListener('change', (e) => {
    updateStatusBadge(e.target.checked);
  });

  // Confidence threshold slider
  const thresholdSlider = document.getElementById('confidence-threshold');
  const thresholdValue = document.getElementById('threshold-value');
  
  thresholdSlider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    thresholdValue.textContent = value.toFixed(2);
  });

  // Save button
  document.getElementById('save-config-btn').addEventListener('click', saveConfiguration);

  // Platform integrations link
  document.getElementById('platform-integrations-link').addEventListener('click', (e) => {
    e.preventDefault();
    showToast('Platform integrations coming soon', 'info');
  });

  // View dropdown toggle
  const viewDropdownBtn = document.getElementById('view-dropdown-btn');
  const viewDropdownMenu = document.getElementById('view-dropdown-menu');

  viewDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = viewDropdownBtn.getAttribute('aria-expanded') === 'true';
    viewDropdownBtn.setAttribute('aria-expanded', !isExpanded);
    viewDropdownMenu.classList.toggle('hidden');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    viewDropdownMenu.classList.add('hidden');
    viewDropdownBtn.setAttribute('aria-expanded', 'false');
  });

  // Navigation handlers
  document.getElementById('dashboard-btn').addEventListener('click', () => {
    window.location.href = `/dashboard.html?projectId=${projectId}`;
  });

  document.getElementById('view-proposals-btn').addEventListener('click', () => {
    window.location.href = `/proposals.html?projectId=${projectId}`;
  });
}

// Save configuration to API
async function saveConfiguration() {
  const saveBtn = document.getElementById('save-config-btn');
  const originalText = saveBtn.innerHTML;
  
  // Show loading state
  saveBtn.disabled = true;
  saveBtn.innerHTML = `
    <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
    Saving...
  `;

  try {
    // Collect form values
    const config = {
      enabled: document.getElementById('master-toggle').checked,
      auto_create_threshold: parseFloat(document.getElementById('confidence-threshold').value),
      detection_types: getSelectedDetectionTypes(),
      slack_enabled: document.getElementById('platform-slack').checked,
      teams_enabled: document.getElementById('platform-teams').checked,
      email_imap_enabled: document.getElementById('platform-email').checked,
      github_enabled: document.getElementById('platform-github').checked
    };

    // Send to API
    const response = await fetch(`/api/projects/${projectId}/sidecar/config`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    });

    if (response.ok) {
      const data = await response.json();
      const rawConfig = data.config || data;
      // Normalize field names - backend returns snake_case from database
      currentConfig = normalizeConfig(rawConfig);
      showToast('Configuration saved successfully', 'success');
    } else {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save configuration');
    }
  } catch (error) {
    console.error('Error saving configuration:', error);
    showToast(error.message || 'Failed to save configuration', 'error');
  } finally {
    // Restore button state
    saveBtn.disabled = false;
    saveBtn.innerHTML = originalText;
  }
}

// Get selected detection types (lowercase as stored in database)
function getSelectedDetectionTypes() {
  const types = [];
  if (document.getElementById('toggle-decisions').checked) types.push('decision');
  if (document.getElementById('toggle-risks').checked) types.push('risk');
  if (document.getElementById('toggle-action-items').checked) types.push('action_item');
  if (document.getElementById('toggle-tasks').checked) types.push('task');
  return types;
}

// Show toast notification
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastIcon = document.getElementById('toast-icon');
  const toastMessage = document.getElementById('toast-message');

  // Set message
  toastMessage.textContent = message;

  // Set icon and colors based on type
  if (type === 'success') {
    toast.className = 'fixed bottom-4 right-4 px-6 py-4 rounded-lg shadow-lg z-50 bg-green-600 text-white';
    toastIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>';
  } else if (type === 'error') {
    toast.className = 'fixed bottom-4 right-4 px-6 py-4 rounded-lg shadow-lg z-50 bg-red-600 text-white';
    toastIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';
  } else {
    toast.className = 'fixed bottom-4 right-4 px-6 py-4 rounded-lg shadow-lg z-50 bg-blue-600 text-white';
    toastIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>';
  }

  // Show toast
  toast.classList.remove('hidden');

  // Auto-hide after 3 seconds
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}
