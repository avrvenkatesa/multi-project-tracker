// My Invitations Page
let currentUser = null;
let invitations = [];

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  console.log('My Invitations page initializing...');
  
  // Initialize auth
  await AuthManager.init();
  
  if (!AuthManager.isAuthenticated) {
    window.location.href = 'index.html';
    return;
  }
  
  currentUser = AuthManager.currentUser;
  
  // Load invitations
  await loadInvitations();
  
  // Setup event listeners
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => AuthManager.logout());
  }
}

// Load invitations
async function loadInvitations() {
  const container = document.getElementById('myInvitationsContainer');
  
  // Show loading state
  container.innerHTML = `
    <div class="bg-white rounded-lg shadow-md p-8 text-center">
      <div class="text-gray-500">Loading invitations...</div>
    </div>
  `;
  
  try {
    const response = await fetch('/api/invitations/me', {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load invitations');
    }
    
    invitations = await response.json();
    renderInvitations();
  } catch (error) {
    console.error('Error loading invitations:', error);
    container.innerHTML = `
      <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
        Failed to load invitations. Please try again.
      </div>
    `;
  }
}

// Render invitations
function renderInvitations() {
  const container = document.getElementById('myInvitationsContainer');
  
  if (invitations.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-lg shadow-md p-8 text-center">
        <div class="text-gray-500 mb-2">No pending invitations</div>
        <p class="text-sm text-gray-400">You don't have any pending project invitations at the moment.</p>
      </div>
    `;
    return;
  }
  
  const html = `
    <div class="bg-white rounded-lg shadow-md p-6">
      <h2 class="text-2xl font-semibold text-gray-800 mb-6">
        Pending Invitations (${invitations.length})
      </h2>
      
      <div class="space-y-4">
        ${invitations.map(inv => renderInvitationCard(inv)).join('')}
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Add event listeners
  invitations.forEach(inv => {
    const acceptBtn = document.getElementById(`accept-${inv.id}`);
    const declineBtn = document.getElementById(`decline-${inv.id}`);
    
    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => acceptInvitation(inv));
    }
    
    if (declineBtn) {
      declineBtn.addEventListener('click', () => declineInvitation(inv));
    }
  });
}

// Render individual invitation card
function renderInvitationCard(inv) {
  const roleColor = getRoleColor(inv.role);
  const expiresIn = getExpirationText(inv.expires_at);
  
  return `
    <div class="border border-gray-200 rounded-lg p-6 hover:shadow-lg transition">
      <div class="flex justify-between items-start mb-4">
        <div class="flex-1">
          <h3 class="text-xl font-semibold text-gray-900 mb-2">
            ${escapeHtml(inv.project_name)}
          </h3>
          ${inv.project_description ? `
            <p class="text-sm text-gray-600 mb-3">
              ${escapeHtml(inv.project_description)}
            </p>
          ` : ''}
          <div class="flex items-center space-x-2 text-sm text-gray-500">
            <span>Invited by <strong>${escapeHtml(inv.inviter_name)}</strong></span>
            <span>•</span>
            <span>${expiresIn}</span>
          </div>
        </div>
        <span class="px-3 py-1 text-sm font-semibold rounded ${roleColor}">
          ${inv.role}
        </span>
      </div>
      
      ${inv.message ? `
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
          <p class="text-sm text-gray-700 italic">"${escapeHtml(inv.message)}"</p>
        </div>
      ` : ''}
      
      <div class="flex space-x-3">
        <button 
          id="accept-${inv.id}"
          class="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium">
          ✓ Accept Invitation
        </button>
        <button 
          id="decline-${inv.id}"
          class="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 font-medium">
          ✗ Decline
        </button>
      </div>
    </div>
  `;
}

// Accept invitation
async function acceptInvitation(inv) {
  const acceptBtn = document.getElementById(`accept-${inv.id}`);
  const declineBtn = document.getElementById(`decline-${inv.id}`);
  
  // Disable buttons
  acceptBtn.disabled = true;
  declineBtn.disabled = true;
  acceptBtn.textContent = 'Accepting...';
  acceptBtn.className = 'flex-1 bg-gray-400 text-white px-4 py-2 rounded-lg font-medium cursor-not-allowed';
  
  try {
    const response = await fetch(`/api/invitations/${inv.invitation_token}/accept`, {
      method: 'POST',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showError(data.error || 'Failed to accept invitation');
      // Re-enable buttons
      acceptBtn.disabled = false;
      declineBtn.disabled = false;
      acceptBtn.textContent = '✓ Accept Invitation';
      acceptBtn.className = 'flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium';
      return;
    }
    
    // Success - show message and redirect
    showSuccess(`Invitation accepted! Redirecting to project...`);
    
    setTimeout(() => {
      window.location.href = `index.html?project=${data.projectId}`;
    }, 1500);
  } catch (error) {
    console.error('Error accepting invitation:', error);
    showError('Failed to accept invitation');
    
    // Re-enable buttons
    acceptBtn.disabled = false;
    declineBtn.disabled = false;
    acceptBtn.textContent = '✓ Accept Invitation';
    acceptBtn.className = 'flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium';
  }
}

// Decline invitation
async function declineInvitation(inv) {
  if (!confirm(`Are you sure you want to decline the invitation to ${inv.project_name}?`)) {
    return;
  }
  
  const acceptBtn = document.getElementById(`accept-${inv.id}`);
  const declineBtn = document.getElementById(`decline-${inv.id}`);
  
  // Disable buttons
  acceptBtn.disabled = true;
  declineBtn.disabled = true;
  declineBtn.textContent = 'Declining...';
  declineBtn.className = 'flex-1 bg-gray-400 text-gray-700 px-4 py-2 rounded-lg font-medium cursor-not-allowed';
  
  try {
    const response = await fetch(`/api/invitations/${inv.invitation_token}/decline`, {
      method: 'POST',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showError(data.error || 'Failed to decline invitation');
      // Re-enable buttons
      acceptBtn.disabled = false;
      declineBtn.disabled = false;
      declineBtn.textContent = '✗ Decline';
      declineBtn.className = 'flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 font-medium';
      return;
    }
    
    // Success - remove from list
    showSuccess('Invitation declined');
    
    setTimeout(() => {
      loadInvitations();
    }, 1000);
  } catch (error) {
    console.error('Error declining invitation:', error);
    showError('Failed to decline invitation');
    
    // Re-enable buttons
    acceptBtn.disabled = false;
    declineBtn.disabled = false;
    declineBtn.textContent = '✗ Decline';
    declineBtn.className = 'flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 font-medium';
  }
}

// Utility functions
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

function getExpirationText(expiresAt) {
  const date = new Date(expiresAt);
  const now = new Date();
  const diffTime = date - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return 'Expired';
  } else if (diffDays === 0) {
    return 'Expires today';
  } else if (diffDays === 1) {
    return 'Expires tomorrow';
  } else if (diffDays < 7) {
    return `Expires in ${diffDays} days`;
  } else {
    return `Expires ${date.toLocaleDateString()}`;
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showError(message) {
  const container = document.getElementById('myInvitationsContainer');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4';
  errorDiv.textContent = message;
  container.insertBefore(errorDiv, container.firstChild);
  
  setTimeout(() => errorDiv.remove(), 5000);
}

function showSuccess(message) {
  const container = document.getElementById('myInvitationsContainer');
  const successDiv = document.createElement('div');
  successDiv.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4';
  successDiv.textContent = message;
  container.insertBefore(successDiv, container.firstChild);
  
  setTimeout(() => successDiv.remove(), 3000);
}
