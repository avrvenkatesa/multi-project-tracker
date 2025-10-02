// Team Management Page
let currentProjectId = null;
let currentUser = null;
let isManager = false;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Team Management page initializing...');
  
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
  
  // Load project info and team
  await loadProjectInfo();
  await loadTeamMembers();
  await loadPendingInvitations();
  
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

// Load project information
async function loadProjectInfo() {
  try {
    const response = await fetch('/api/projects', {
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to load projects');
    
    const projects = await response.json();
    const project = projects.find(p => p.id === parseInt(currentProjectId));
    
    if (project) {
      document.getElementById('projectNameHeader').textContent = project.name;
    }
  } catch (error) {
    console.error('Error loading project info:', error);
  }
}

// Load team members
async function loadTeamMembers() {
  const container = document.getElementById('teamManagementContainer');
  
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/team`, {
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to load team members');
    
    const members = await response.json();
    
    // Check if current user is Manager+
    const currentUserMember = members.find(m => m.user_id === currentUser.id);
    isManager = currentUserMember && (currentUserMember.role === 'Admin' || currentUserMember.role === 'Manager');
    
    renderTeamMembers(members);
  } catch (error) {
    console.error('Error loading team members:', error);
    showError('Failed to load team members');
  }
}

// Render team members
function renderTeamMembers(members) {
  const container = document.getElementById('teamManagementContainer');
  
  const html = `
    <div class="bg-white rounded-lg shadow-md p-6 mb-6">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-semibold text-gray-800">Team Members</h2>
        ${isManager ? `
          <button id="invite-member-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            + Invite Member
          </button>
        ` : ''}
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${members.map(member => renderMemberCard(member)).join('')}
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Add event listeners
  if (isManager) {
    const inviteBtn = document.getElementById('invite-member-btn');
    if (inviteBtn) {
      inviteBtn.addEventListener('click', showInviteModal);
    }
    
    // Add event listeners for member actions
    members.forEach(member => {
      const changeRoleBtn = document.getElementById(`change-role-${member.id}`);
      const removeMemberBtn = document.getElementById(`remove-member-${member.id}`);
      
      if (changeRoleBtn) {
        changeRoleBtn.addEventListener('click', () => showChangeRoleModal(member));
      }
      
      if (removeMemberBtn) {
        removeMemberBtn.addEventListener('click', () => removeMember(member));
      }
    });
  }
}

// Render individual member card
function renderMemberCard(member) {
  const isCurrentUser = member.user_id === currentUser.id;
  const roleColor = getRoleColor(member.role);
  
  return `
    <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
      <div class="flex justify-between items-start mb-3">
        <div class="flex-1">
          <h3 class="font-semibold text-gray-900">${escapeHtml(member.name)}</h3>
          <p class="text-sm text-gray-500">${escapeHtml(member.email)}</p>
        </div>
        <span class="px-2 py-1 text-xs font-semibold rounded ${roleColor}">
          ${member.role}
        </span>
      </div>
      
      <div class="text-xs text-gray-500 mb-3">
        Joined ${formatDate(member.joined_at)}
      </div>
      
      ${isManager && !isCurrentUser ? `
        <div class="flex space-x-2">
          <button 
            id="change-role-${member.id}"
            class="flex-1 bg-blue-100 text-blue-700 px-3 py-1 rounded text-sm hover:bg-blue-200">
            Change Role
          </button>
          <button 
            id="remove-member-${member.id}"
            class="flex-1 bg-red-100 text-red-700 px-3 py-1 rounded text-sm hover:bg-red-200">
            Remove
          </button>
        </div>
      ` : ''}
      
      ${isCurrentUser ? `
        <div class="text-xs text-gray-500 italic">You</div>
      ` : ''}
    </div>
  `;
}

// Get role badge color
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

// Show invite modal
function showInviteModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-xl font-semibold mb-4">Invite Team Member</h3>
      
      <form id="invite-form">
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <input 
            type="email" 
            id="invite-email"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="member@example.com"
          />
        </div>
        
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Role
          </label>
          <select 
            id="invite-role"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="Member">Member</option>
            <option value="Manager">Manager</option>
            <option value="Admin">Admin</option>
            <option value="Viewer">Viewer</option>
          </select>
        </div>
        
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Message (Optional)
          </label>
          <textarea 
            id="invite-message"
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Welcome to the team!"
          ></textarea>
        </div>
        
        <div class="flex space-x-3">
          <button 
            type="submit"
            class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            Send Invitation
          </button>
          <button 
            type="button"
            id="cancel-invite-btn"
            class="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300">
            Cancel
          </button>
        </div>
      </form>
      
      <div id="invite-error" class="hidden mt-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm"></div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Event listeners
  const form = modal.querySelector('#invite-form');
  const cancelBtn = modal.querySelector('#cancel-invite-btn');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await sendInvitation(modal);
  });
  
  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// Send invitation
async function sendInvitation(modal) {
  const email = document.getElementById('invite-email').value;
  const role = document.getElementById('invite-role').value;
  const message = document.getElementById('invite-message').value;
  const errorDiv = document.getElementById('invite-error');
  
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/team/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, role, message })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      errorDiv.textContent = data.error || 'Failed to send invitation';
      errorDiv.classList.remove('hidden');
      return;
    }
    
    // Success - close modal and reload
    document.body.removeChild(modal);
    showSuccess('Invitation sent successfully!');
    await loadPendingInvitations();
  } catch (error) {
    console.error('Error sending invitation:', error);
    errorDiv.textContent = 'Failed to send invitation';
    errorDiv.classList.remove('hidden');
  }
}

// Show change role modal
function showChangeRoleModal(member) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-xl font-semibold mb-4">Change Role</h3>
      
      <p class="text-gray-600 mb-4">
        Change role for <strong>${escapeHtml(member.name)}</strong>
      </p>
      
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">
          New Role
        </label>
        <select 
          id="new-role"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="Member" ${member.role === 'Member' ? 'selected' : ''}>Member</option>
          <option value="Manager" ${member.role === 'Manager' ? 'selected' : ''}>Manager</option>
          <option value="Admin" ${member.role === 'Admin' ? 'selected' : ''}>Admin</option>
          <option value="Viewer" ${member.role === 'Viewer' ? 'selected' : ''}>Viewer</option>
        </select>
      </div>
      
      <div class="flex space-x-3">
        <button 
          id="confirm-change-role-btn"
          class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Update Role
        </button>
        <button 
          id="cancel-change-role-btn"
          class="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300">
          Cancel
        </button>
      </div>
      
      <div id="change-role-error" class="hidden mt-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm"></div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Event listeners
  const confirmBtn = modal.querySelector('#confirm-change-role-btn');
  const cancelBtn = modal.querySelector('#cancel-change-role-btn');
  
  confirmBtn.addEventListener('click', async () => {
    await changeRole(member, modal);
  });
  
  cancelBtn.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
}

// Change member role
async function changeRole(member, modal) {
  const newRole = document.getElementById('new-role').value;
  const errorDiv = document.getElementById('change-role-error');
  
  if (newRole === member.role) {
    document.body.removeChild(modal);
    return;
  }
  
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/team/${member.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role: newRole })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      errorDiv.textContent = data.error || 'Failed to update role';
      errorDiv.classList.remove('hidden');
      return;
    }
    
    // Success - close modal and reload
    document.body.removeChild(modal);
    showSuccess(`Role updated to ${newRole}`);
    await loadTeamMembers();
  } catch (error) {
    console.error('Error changing role:', error);
    errorDiv.textContent = 'Failed to update role';
    errorDiv.classList.remove('hidden');
  }
}

// Remove member
async function removeMember(member) {
  if (!confirm(`Are you sure you want to remove ${member.name} from this project?`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/team/${member.id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showError(data.error || 'Failed to remove member');
      return;
    }
    
    showSuccess(`${member.name} has been removed from the project`);
    await loadTeamMembers();
  } catch (error) {
    console.error('Error removing member:', error);
    showError('Failed to remove member');
  }
}

// Load pending invitations
async function loadPendingInvitations() {
  if (!isManager) return;
  
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/invitations`, {
      credentials: 'include'
    });
    
    if (!response.ok) return;
    
    const invitations = await response.json();
    
    if (invitations.length > 0) {
      renderPendingInvitations(invitations);
    }
  } catch (error) {
    console.error('Error loading pending invitations:', error);
  }
}

// Cancel pending invitation
async function cancelInvitation(invitationId, inviteeEmail) {
  if (!confirm(`Are you sure you want to cancel the invitation to ${inviteeEmail}?`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/projects/${currentProjectId}/invitations/${invitationId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      showError(data.error || 'Failed to cancel invitation');
      return;
    }
    
    showSuccess(`Invitation to ${inviteeEmail} has been canceled`);
    
    // Reload both team members and pending invitations to refresh the UI
    await loadTeamMembers();
    await loadPendingInvitations();
  } catch (error) {
    console.error('Error canceling invitation:', error);
    showError('Failed to cancel invitation');
  }
}

// Render pending invitations
function renderPendingInvitations(invitations) {
  const container = document.getElementById('teamManagementContainer');
  
  const invitationsHtml = `
    <div class="bg-white rounded-lg shadow-md p-6">
      <h2 class="text-xl font-semibold text-gray-800 mb-4">Pending Invitations</h2>
      
      <div class="space-y-3">
        ${invitations.map(inv => `
          <div class="border border-gray-200 rounded-lg p-4 flex justify-between items-center">
            <div class="flex-1">
              <div class="font-medium text-gray-900">${escapeHtml(inv.invitee_email)}</div>
              <div class="text-sm text-gray-500">
                Role: <span class="font-medium">${inv.role}</span> • 
                Invited by ${escapeHtml(inv.inviter_name)} • 
                Expires ${formatDate(inv.expires_at)}
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="px-3 py-1 text-sm font-medium rounded ${getRoleColor(inv.role)}">
                ${inv.role}
              </span>
              <button 
                class="cancel-invitation-btn px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                data-invitation-id="${inv.id}"
                data-invitee-email="${escapeHtml(inv.invitee_email)}">
                Cancel
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  container.insertAdjacentHTML('beforeend', invitationsHtml);
  
  // Attach event listeners to cancel buttons
  document.querySelectorAll('.cancel-invitation-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const invitationId = btn.getAttribute('data-invitation-id');
      const inviteeEmail = btn.getAttribute('data-invitee-email');
      cancelInvitation(invitationId, inviteeEmail);
    });
  });
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = date - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return 'Expired';
  } else if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Tomorrow';
  } else if (diffDays < 7) {
    return `in ${diffDays} days`;
  } else {
    return date.toLocaleDateString();
  }
}

function showError(message) {
  const container = document.getElementById('teamManagementContainer');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4';
  errorDiv.textContent = message;
  container.insertBefore(errorDiv, container.firstChild);
  
  setTimeout(() => errorDiv.remove(), 5000);
}

function showSuccess(message) {
  const container = document.getElementById('teamManagementContainer');
  const successDiv = document.createElement('div');
  successDiv.className = 'bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4';
  successDiv.textContent = message;
  container.insertBefore(successDiv, container.firstChild);
  
  setTimeout(() => successDiv.remove(), 3000);
}
