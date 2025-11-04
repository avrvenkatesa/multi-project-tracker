// Assignee Management for Issues and Action Items

let currentItemAssignees = [];
let availableTeamMembers = [];

/**
 * Initialize assignee management UI for an item
 */
async function initializeAssigneeManagement(item, itemType) {
  if (!item || !itemType) return;
  
  // Load current assignees from item data
  currentItemAssignees = item.assignees || [];
  
  // Load available team members - use item's project_id directly
  const projectId = item.project_id || (currentProject && currentProject.id);
  if (projectId) {
    await loadTeamMembers(projectId);
  }
  
  // Render assignees list
  renderAssigneesList();
  
  // Update total percentage display
  updateTotalEffortPercentage();
  
  // Setup event listeners
  setupAssigneeEventListeners(item.id, itemType);
}

/**
 * Load team members from specified project
 */
async function loadTeamMembers(projectId) {
  try {
    const response = await axios.get(`/api/projects/${projectId}/team`, { withCredentials: true });
    availableTeamMembers = response.data.map(member => ({
      userId: member.user_id,
      username: member.username,
      email: member.email
    }));
    
    // Populate the select dropdown
    const select = document.getElementById('new-assignee-select');
    if (select) {
      select.innerHTML = '<option value="">Select member...</option>';
      availableTeamMembers.forEach(member => {
        // Skip members already assigned
        const alreadyAssigned = currentItemAssignees.some(a => a.userId === member.userId);
        if (!alreadyAssigned) {
          const option = document.createElement('option');
          option.value = member.userId;
          option.textContent = member.username;
          select.appendChild(option);
        }
      });
    }
  } catch (error) {
    console.error('Error loading team members:', error);
  }
}

/**
 * Render the list of current assignees
 */
function renderAssigneesList() {
  const container = document.getElementById('assignees-list');
  if (!container) return;
  
  if (currentItemAssignees.length === 0) {
    container.innerHTML = '<p class="text-sm text-gray-500 italic">No assignees yet</p>';
    return;
  }
  
  // Sort: primary first, then by assigned date
  const sorted = [...currentItemAssignees].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return new Date(a.assignedAt) - new Date(b.assignedAt);
  });
  
  container.innerHTML = sorted.map(assignee => `
    <div class="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
      <div class="flex items-center gap-2 flex-1">
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-gray-900">${assignee.username}</span>
            ${assignee.isPrimary ? '<span class="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded font-semibold">PRIMARY</span>' : ''}
          </div>
          <span class="text-xs text-gray-500">${assignee.email}</span>
        </div>
        <div class="flex items-center gap-2">
          <input 
            type="number" 
            value="${assignee.effortPercentage}" 
            min="0" 
            max="100"
            data-user-id="${assignee.userId}"
            class="assignee-effort-input w-16 text-sm border border-gray-300 rounded px-2 py-1 text-center"
          >
          <span class="text-sm text-gray-600">%</span>
        </div>
      </div>
      <div class="flex items-center gap-2 ml-3">
        ${!assignee.isPrimary ? `
          <button 
            class="set-primary-btn text-xs text-blue-600 hover:text-blue-800"
            data-user-id="${assignee.userId}"
            title="Set as primary"
          >
            ⭐
          </button>
        ` : ''}
        <button 
          class="remove-assignee-btn text-xs text-red-600 hover:text-red-800"
          data-user-id="${assignee.userId}"
          title="Remove assignee"
        >
          ✕
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Setup event listeners for assignee management
 */
function setupAssigneeEventListeners(itemId, itemType) {
  // Add assignee button
  document.getElementById('add-assignee-btn')?.addEventListener('click', () => {
    document.getElementById('add-assignee-form').classList.remove('hidden');
    loadTeamMembers(); // Refresh available members
  });
  
  // Cancel add assignee
  document.getElementById('cancel-add-assignee-btn')?.addEventListener('click', () => {
    document.getElementById('add-assignee-form').classList.add('hidden');
    resetAddAssigneeForm();
  });
  
  // Confirm add assignee
  document.getElementById('confirm-add-assignee-btn')?.addEventListener('click', async () => {
    await addNewAssignee(itemId, itemType);
  });
  
  // Handle effort percentage changes (with debounce)
  let debounceTimer;
  document.getElementById('assignees-list')?.addEventListener('input', (e) => {
    if (e.target.classList.contains('assignee-effort-input')) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const userId = parseInt(e.target.dataset.userId);
        const newPercentage = parseInt(e.target.value);
        await updateAssigneeEffort(itemId, itemType, userId, newPercentage);
      }, 500);
    }
  });
  
  // Handle remove assignee (event delegation)
  document.getElementById('assignees-list')?.addEventListener('click', async (e) => {
    if (e.target.classList.contains('remove-assignee-btn')) {
      const userId = parseInt(e.target.dataset.userId);
      await removeAssignee(itemId, itemType, userId);
    } else if (e.target.classList.contains('set-primary-btn')) {
      const userId = parseInt(e.target.dataset.userId);
      await setPrimaryAssignee(itemId, itemType, userId);
    }
  });
}

/**
 * Add a new assignee
 */
async function addNewAssignee(itemId, itemType) {
  const userId = parseInt(document.getElementById('new-assignee-select').value);
  const effortPercentage = parseInt(document.getElementById('new-assignee-effort').value);
  const isPrimary = document.getElementById('new-assignee-primary').checked;
  
  if (!userId) {
    showToast('Please select a team member', 'error');
    return;
  }
  
  // Validate total percentage won't exceed 100
  const currentTotal = currentItemAssignees.reduce((sum, a) => sum + a.effortPercentage, 0);
  if (currentTotal + effortPercentage > 100) {
    showToast(`Cannot add assignee: total effort would exceed 100% (currently ${currentTotal}%)`, 'error');
    return;
  }
  
  try {
    const endpoint = itemType === 'issue' 
      ? `/api/issues/${itemId}/assignees`
      : `/api/action-items/${itemId}/assignees`;
    
    await axios.post(endpoint, {
      userId,
      isPrimary,
      effortPercentage
    }, { withCredentials: true });
    
    // Refresh assignees
    await refreshAssignees(itemId, itemType);
    
    // Hide form and reset
    document.getElementById('add-assignee-form').classList.add('hidden');
    resetAddAssigneeForm();
    
    showToast('Assignee added successfully', 'success');
    
    // Reload project data to refresh Kanban
    await loadProjectData(currentProject.id);
  } catch (error) {
    console.error('Error adding assignee:', error);
    showToast(error.response?.data?.error || 'Failed to add assignee', 'error');
  }
}

/**
 * Remove an assignee
 */
async function removeAssignee(itemId, itemType, userId) {
  if (!confirm('Remove this assignee?')) return;
  
  try {
    const endpoint = itemType === 'issue' 
      ? `/api/issues/${itemId}/assignees/${userId}`
      : `/api/action-items/${itemId}/assignees/${userId}`;
    
    await axios.delete(endpoint, { withCredentials: true });
    
    // Refresh assignees
    await refreshAssignees(itemId, itemType);
    
    showToast('Assignee removed successfully', 'success');
    
    // Reload project data to refresh Kanban
    await loadProjectData(currentProject.id);
  } catch (error) {
    console.error('Error removing assignee:', error);
    showToast(error.response?.data?.error || 'Failed to remove assignee', 'error');
  }
}

/**
 * Update assignee effort percentage
 */
async function updateAssigneeEffort(itemId, itemType, userId, newPercentage) {
  // Find the assignee
  const assignee = currentItemAssignees.find(a => a.userId === userId);
  if (!assignee) return;
  
  // Validate total percentage
  const otherTotal = currentItemAssignees
    .filter(a => a.userId !== userId)
    .reduce((sum, a) => sum + a.effortPercentage, 0);
  
  if (otherTotal + newPercentage > 100) {
    showToast(`Total effort cannot exceed 100% (other assignees: ${otherTotal}%)`, 'error');
    renderAssigneesList(); // Reset to previous value
    return;
  }
  
  // Update via batch update
  const updatedAssignees = currentItemAssignees.map(a => 
    a.userId === userId 
      ? { ...a, effortPercentage: newPercentage }
      : a
  );
  
  await saveAllAssignees(itemId, itemType, updatedAssignees);
}

/**
 * Set an assignee as primary
 */
async function setPrimaryAssignee(itemId, itemType, userId) {
  // Update all assignees: set new primary, unset others
  const updatedAssignees = currentItemAssignees.map(a => ({
    ...a,
    isPrimary: a.userId === userId
  }));
  
  await saveAllAssignees(itemId, itemType, updatedAssignees);
}

/**
 * Save all assignees (batch update)
 */
async function saveAllAssignees(itemId, itemType, assignees) {
  try {
    const endpoint = itemType === 'issue' 
      ? `/api/issues/${itemId}/assignees`
      : `/api/action-items/${itemId}/assignees`;
    
    const payload = assignees.map(a => ({
      userId: a.userId,
      isPrimary: a.isPrimary,
      effortPercentage: a.effortPercentage
    }));
    
    await axios.patch(endpoint, { assignees: payload }, { withCredentials: true });
    
    // Refresh assignees
    await refreshAssignees(itemId, itemType);
    
    showToast('Assignees updated successfully', 'success');
    
    // Reload project data to refresh Kanban
    await loadProjectData(currentProject.id);
  } catch (error) {
    console.error('Error updating assignees:', error);
    showToast(error.response?.data?.error || 'Failed to update assignees', 'error');
    // Revert to previous state
    renderAssigneesList();
  }
}

/**
 * Refresh assignees from server
 */
async function refreshAssignees(itemId, itemType) {
  try {
    const endpoint = itemType === 'issue' 
      ? `/api/issues/${itemId}`
      : `/api/action-items/${itemId}`;
    
    const response = await axios.get(endpoint, { withCredentials: true });
    currentItemAssignees = response.data.assignees || [];
    
    renderAssigneesList();
    updateTotalEffortPercentage();
    loadTeamMembers(); // Refresh available members
  } catch (error) {
    console.error('Error refreshing assignees:', error);
  }
}

/**
 * Update total effort percentage display
 */
function updateTotalEffortPercentage() {
  const total = currentItemAssignees.reduce((sum, a) => sum + (a.effortPercentage || 0), 0);
  const display = document.getElementById('total-effort-percentage');
  
  if (display) {
    display.textContent = `${total}%`;
    
    // Color code based on total
    if (total > 100) {
      display.classList.add('text-red-600');
      display.classList.remove('text-gray-900', 'text-green-600');
    } else if (total === 100) {
      display.classList.add('text-green-600');
      display.classList.remove('text-gray-900', 'text-red-600');
    } else {
      display.classList.add('text-gray-900');
      display.classList.remove('text-red-600', 'text-green-600');
    }
  }
}

/**
 * Reset the add assignee form
 */
function resetAddAssigneeForm() {
  document.getElementById('new-assignee-select').value = '';
  document.getElementById('new-assignee-effort').value = '100';
  document.getElementById('new-assignee-primary').checked = false;
}

/**
 * Get primary assignee display for Kanban cards
 */
function getPrimaryAssigneeDisplay(assignees) {
  if (!assignees || assignees.length === 0) {
    return 'Unassigned';
  }
  
  const primary = assignees.find(a => a.isPrimary);
  const displayName = primary ? primary.username : assignees[0].username;
  
  if (assignees.length > 1) {
    return `${displayName} +${assignees.length - 1}`;
  }
  
  return displayName;
}

// Make functions globally accessible
window.initializeAssigneeManagement = initializeAssigneeManagement;
window.getPrimaryAssigneeDisplay = getPrimaryAssigneeDisplay;
