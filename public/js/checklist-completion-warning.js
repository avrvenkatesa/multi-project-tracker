/**
 * Checklist Completion Warning System
 * Shows warnings when moving items to "Done" with incomplete checklists
 */

/**
 * Get checklist status for an item
 * @param {string} itemId - The item ID
 * @param {string} itemType - Either 'issue' or 'action-item'
 * @returns {Promise<Object>} - { hasChecklist, total, completed, percentage, error }
 */
async function getChecklistStatus(itemId, itemType) {
  try {
    const endpoint = itemType === 'action-item' 
      ? `/api/action-items/${itemId}/checklist-status`
      : `/api/issues/${itemId}/checklist-status`;
    
    const response = await fetch(endpoint, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.error('Failed to get checklist status:', response.status);
      return { hasChecklist: false, total: 0, completed: 0, percentage: 0, error: true };
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting checklist status:', error);
    return { hasChecklist: false, total: 0, completed: 0, percentage: 0, error: true };
  }
}

/**
 * Get incomplete checklist items for an item
 * @param {string} itemId - The item ID
 * @param {string} itemType - Either 'issue' or 'action-item'
 * @returns {Promise<Array>} - Array of { text } objects
 */
async function getIncompleteChecklistItems(itemId, itemType) {
  try {
    const endpoint = itemType === 'action-item'
      ? `/api/action-items/${itemId}/incomplete-checklist-items`
      : `/api/issues/${itemId}/incomplete-checklist-items`;
    
    const response = await fetch(endpoint, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      return [];
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting incomplete items:', error);
    return [];
  }
}

/**
 * Show warning modal for incomplete checklist
 * @param {string} itemId - The item ID
 * @param {string} itemType - Either 'issue' or 'action-item'
 * @param {Object} checklistInfo - The checklist status info
 * @returns {Promise<boolean>} - true if user proceeds, false if cancelled
 */
async function showChecklistWarningModal(itemId, itemType, checklistInfo) {
  return new Promise(async (resolve) => {
    const percentage = checklistInfo.percentage;
    const remaining = checklistInfo.total - checklistInfo.completed;
    
    // Get incomplete items
    let incompleteItems = [];
    try {
      incompleteItems = await getIncompleteChecklistItems(itemId, itemType);
    } catch (error) {
      console.error('Error getting incomplete items:', error);
    }
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.style.zIndex = '99999';
    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4 animate-fadeIn">
        <div class="flex items-center gap-3 mb-4">
          <span class="text-3xl">⚠️</span>
          <h3 class="text-xl font-bold text-gray-900">Incomplete Checklist</h3>
        </div>
        
        <p class="text-gray-700 mb-4">
          This ${itemType === 'action-item' ? 'action item' : 'issue'} has an incomplete checklist:
        </p>
        
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div class="font-medium text-gray-900 mb-2">
            ${checklistInfo.completed} of ${checklistInfo.total} items completed (${percentage}%)
          </div>
          
          ${incompleteItems.length > 0 ? `
            <div class="text-sm text-gray-600 mb-3">
              ${remaining} item${remaining !== 1 ? 's' : ''} remaining:
            </div>
            <ul class="text-sm text-gray-700 space-y-1 max-h-32 overflow-y-auto">
              ${incompleteItems.slice(0, 5).map(item => `
                <li class="flex items-start gap-2">
                  <span class="text-yellow-600 flex-shrink-0">☐</span>
                  <span>${escapeHtml(item.text)}</span>
                </li>
              `).join('')}
              ${incompleteItems.length > 5 ? `
                <li class="text-gray-500 italic">... and ${incompleteItems.length - 5} more</li>
              ` : ''}
            </ul>
          ` : ''}
        </div>
        
        <p class="text-sm text-gray-600 mb-6">
          Are you sure you want to mark this ${itemType === 'action-item' ? 'action item' : 'issue'} as Done?
        </p>
        
        <div class="flex flex-col sm:flex-row gap-2">
          <button 
            id="cancelChecklistBtn"
            class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            id="viewChecklistBtn"
            class="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
          >
            View Checklist
          </button>
          <button 
            id="proceedChecklistBtn"
            class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
            Mark as Done Anyway
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add event listeners
    const cancelBtn = modal.querySelector('#cancelChecklistBtn');
    const viewChecklistBtn = modal.querySelector('#viewChecklistBtn');
    const proceedBtn = modal.querySelector('#proceedChecklistBtn');
    
    cancelBtn.addEventListener('click', () => {
      modal.remove();
      resolve(false);
    });
    
    viewChecklistBtn.addEventListener('click', () => {
      modal.remove();
      // Navigate to unified checklists page with filter
      const filterParam = itemType === 'action-item' ? `action=${itemId}` : `issue=${itemId}`;
      window.location.href = `/checklists.html?${filterParam}&tab=linked`;
      resolve(false);
    });
    
    proceedBtn.addEventListener('click', () => {
      modal.remove();
      resolve(true);
    });
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
        resolve(false);
      }
    });
  });
}

/**
 * Validate status change and show warning if needed
 * @param {string} itemId - The item ID
 * @param {string} itemType - Either 'issue' or 'action-item'
 * @param {string} newStatus - The new status
 * @returns {Promise<boolean>} - true if change should proceed, false otherwise
 */
async function validateStatusChange(itemId, itemType, newStatus) {
  // Only validate when moving to "Done"
  if (newStatus !== 'Done') {
    return true;
  }
  
  // Get checklist status
  const checklistInfo = await getChecklistStatus(itemId, itemType);
  
  // If API error, block the move and show error
  if (checklistInfo.error) {
    if (typeof showErrorMessage === 'function') {
      showErrorMessage('Unable to verify checklist status. Please try again.');
    } else {
      alert('Unable to verify checklist status. Please refresh and try again.');
    }
    return false;
  }
  
  // If no checklist or checklist is complete, allow change
  if (!checklistInfo.hasChecklist || checklistInfo.completed >= checklistInfo.total) {
    return true;
  }
  
  // Show warning modal and wait for user decision
  const proceed = await showChecklistWarningModal(itemId, itemType, checklistInfo);
  return proceed;
}

/**
 * Generate checklist status badge HTML
 * @param {Object} checklistInfo - The checklist status info
 * @returns {string} - HTML string for badge
 */
function generateChecklistBadge(checklistInfo) {
  // Show error badge if API failed
  if (checklistInfo && checklistInfo.error) {
    return `
      <div class="text-xs bg-gray-100 text-gray-600 border border-gray-300 px-2 py-1 rounded flex items-center gap-1 mt-2">
        <span>⚠️</span>
        <span>Checklist status unavailable</span>
      </div>
    `;
  }
  
  if (!checklistInfo || !checklistInfo.hasChecklist || checklistInfo.total === 0) {
    return '';
  }
  
  const { completed, total, percentage } = checklistInfo;
  
  // Determine badge color based on completion
  let badgeClass, icon;
  if (percentage === 100) {
    badgeClass = 'bg-green-100 text-green-700 border-green-300';
    icon = '✓';
  } else if (percentage >= 50) {
    badgeClass = 'bg-yellow-100 text-yellow-700 border-yellow-300';
    icon = '📋';
  } else {
    badgeClass = 'bg-red-100 text-red-700 border-red-300';
    icon = '⚠️';
  }
  
  return `
    <div class="text-xs ${badgeClass} border px-2 py-1 rounded flex items-center gap-1 mt-2">
      <span>${icon}</span>
      <span>Checklist: ${completed}/${total} (${percentage}%)</span>
    </div>
  `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
