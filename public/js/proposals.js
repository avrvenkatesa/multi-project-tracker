/**
 * AI Proposals Dashboard
 * Allows users to review and approve/reject AI-generated proposals
 */

let projectId = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  // Get project ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  projectId = urlParams.get('projectId');

  if (!projectId) {
    showError('No project selected. Redirecting to dashboard...');
    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 2000);
    return;
  }

  // Initialize dropdown handlers
  initializeDropdowns();

  // Fetch and display proposals
  await loadProposals();
});

/**
 * Initialize dropdown menus
 */
function initializeDropdowns() {
  const viewDropdownBtn = document.getElementById('view-dropdown-btn');
  const viewDropdownMenu = document.getElementById('view-dropdown-menu');

  // Toggle dropdown
  viewDropdownBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    viewDropdownMenu.classList.toggle('hidden');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    viewDropdownMenu?.classList.add('hidden');
  });

  // Dropdown navigation handlers
  document.getElementById('dashboard-btn')?.addEventListener('click', () => {
    window.location.href = `/dashboard.html?projectId=${projectId}`;
  });

  document.getElementById('view-risks-btn')?.addEventListener('click', () => {
    window.location.href = `/risks.html?projectId=${projectId}`;
  });

  document.getElementById('view-ai-agent-btn')?.addEventListener('click', () => {
    window.location.href = `/ai-agent.html?projectId=${projectId}`;
  });
}

/**
 * Load proposals from API
 */
async function loadProposals() {
  try {
    const response = await fetch(`/api/aipm/projects/${projectId}/agent/proposals`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Failed to fetch proposals');
    }

    const data = await response.json();
    displayProposals(data.proposals || []);
    updateStats(data.proposals || []);

  } catch (error) {
    console.error('Error loading proposals:', error);
    showError('Failed to load proposals');
  }
}

/**
 * Display proposals in the UI
 */
function displayProposals(proposals) {
  const loadingState = document.getElementById('loading-state');
  const emptyState = document.getElementById('empty-state');
  const proposalsList = document.getElementById('proposals-list');
  const statsSection = document.getElementById('stats-section');
  const projectContext = document.getElementById('project-context');

  // Hide loading state
  loadingState.classList.add('hidden');
  statsSection.classList.remove('hidden');
  projectContext.classList.remove('hidden');

  // Filter pending proposals
  const pendingProposals = proposals.filter(p => p.status === 'pending_review' || p.status === 'pending');

  if (pendingProposals.length === 0) {
    emptyState.classList.remove('hidden');
    proposalsList.innerHTML = '';
    return;
  }

  emptyState.classList.add('hidden');

  // Render each proposal
  proposalsList.innerHTML = pendingProposals.map(proposal => renderProposal(proposal)).join('');

  // Add event listeners for approve/reject buttons
  pendingProposals.forEach(proposal => {
    document.getElementById(`approve-${proposal.id}`)?.addEventListener('click', () => approveProposal(proposal.id));
    document.getElementById(`reject-${proposal.id}`)?.addEventListener('click', () => rejectProposal(proposal.id));
  });
}

/**
 * Render a single proposal card
 */
function renderProposal(proposal) {
  const typeIcon = proposal.proposal_type === 'risk' ? 
    '<svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>' :
    '<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

  const confidenceColor = proposal.confidence_score >= 0.9 ? 'bg-green-100 text-green-800' :
                          proposal.confidence_score >= 0.7 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-orange-100 text-orange-800';

  const confidencePercent = Math.round(proposal.confidence_score * 100);

  return `
    <div class="bg-white rounded-lg shadow-md p-6 border-l-4 border-orange-500">
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-start gap-4 flex-1">
          <div class="mt-1">${typeIcon}</div>
          <div class="flex-1">
            <h3 class="text-lg font-semibold text-gray-800 mb-2">${escapeHtml(proposal.title)}</h3>
            ${proposal.description ? `<p class="text-gray-600 mb-3">${escapeHtml(proposal.description)}</p>` : ''}
            
            <div class="flex items-center gap-4 text-sm">
              <span class="text-gray-500">
                <i class="fas fa-tag mr-1"></i>
                Type: <span class="font-medium">${proposal.proposal_type}</span>
              </span>
              <span class="${confidenceColor} px-2 py-1 rounded-full font-medium text-xs">
                ${confidencePercent}% confidence
              </span>
              <span class="text-gray-500">
                <i class="far fa-clock mr-1"></i>
                ${formatDate(proposal.created_at)}
              </span>
            </div>

            ${proposal.rationale ? `
              <div class="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p class="text-sm text-gray-700"><strong>AI Rationale:</strong> ${escapeHtml(proposal.rationale)}</p>
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3 pt-4 border-t border-gray-200">
        <button 
          id="approve-${proposal.id}"
          class="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 transition-all"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          Approve & Create Risk
        </button>
        
        <button 
          id="reject-${proposal.id}"
          class="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 flex items-center gap-2 transition-all"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
          Reject
        </button>
      </div>
    </div>
  `;
}

/**
 * Update statistics
 */
function updateStats(proposals) {
  const pending = proposals.filter(p => p.status === 'pending_review' || p.status === 'pending').length;
  const approved = proposals.filter(p => p.status === 'approved').length;
  const rejected = proposals.filter(p => p.status === 'rejected').length;

  document.getElementById('pending-count').textContent = pending;
  document.getElementById('approved-count').textContent = approved;
  document.getElementById('rejected-count').textContent = rejected;
}

/**
 * Approve a proposal
 */
async function approveProposal(proposalId) {
  if (!confirm('Are you sure you want to approve this proposal? It will be created as a new risk.')) {
    return;
  }

  try {
    const response = await fetch(`/api/aipm/agent/proposals/${proposalId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ userId: 1 }) // TODO: Get from auth context
    });

    if (!response.ok) {
      throw new Error('Failed to approve proposal');
    }

    showSuccess('Proposal approved successfully! Risk has been created.');
    
    // Reload proposals
    setTimeout(() => loadProposals(), 1000);

  } catch (error) {
    console.error('Error approving proposal:', error);
    showError('Failed to approve proposal');
  }
}

/**
 * Reject a proposal
 */
async function rejectProposal(proposalId) {
  if (!confirm('Are you sure you want to reject this proposal?')) {
    return;
  }

  try {
    const response = await fetch(`/api/aipm/agent/proposals/${proposalId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ 
        userId: 1, // TODO: Get from auth context
        reason: 'Reviewed and determined not a risk'
      })
    });

    if (!response.ok) {
      throw new Error('Failed to reject proposal');
    }

    showSuccess('Proposal rejected successfully');
    
    // Reload proposals
    setTimeout(() => loadProposals(), 1000);

  } catch (error) {
    console.error('Error rejecting proposal:', error);
    showError('Failed to reject proposal');
  }
}

/**
 * Utility: Escape HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Utility: Format date
 */
function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}

/**
 * Show success message
 */
function showSuccess(message) {
  const alert = document.createElement('div');
  alert.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
  alert.innerHTML = `
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
      ${message}
    </div>
  `;
  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 3000);
}

/**
 * Show error message
 */
function showError(message) {
  const alert = document.createElement('div');
  alert.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
  alert.innerHTML = `
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
      </svg>
      ${message}
    </div>
  `;
  document.body.appendChild(alert);
  setTimeout(() => alert.remove(), 3000);
}
