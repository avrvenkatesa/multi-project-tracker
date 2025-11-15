// Global state
let currentProject = null;
let currentDetailItem = null; // Stores current issue/action item being viewed
let projects = [];
let issues = [];
let actionItems = [];
let teamMembers = [];

// Expose currentProject to window so it can be updated from project-management.js
Object.defineProperty(window, 'currentProject', {
  get: () => currentProject,
  set: (value) => { 
    currentProject = value;
  }
});

// Filter state
let currentFilters = {
  search: '',
  type: '',
  status: '',
  hasCircularDependency: false,
  priority: '',
  assignee: '',
  category: '',
  tag: '',
  hasPlanning: false
};

// ==================== CHECKLIST UPDATE SYSTEM ====================

/**
 * Dispatch checklist update event to refresh badges in real-time
 * Call this after creating, linking, or updating a checklist
 * @param {string} itemType - 'issue' or 'action-item'
 * @param {number} itemId - The ID of the issue or action item
 */
window.dispatchChecklistUpdate = function(itemType, itemId) {
  const event = new CustomEvent('checklist:updated', {
    detail: { itemType, itemId }
  });
  window.dispatchEvent(event);
  console.log(`[Checklist Update] Dispatched event for ${itemType} ${itemId}`);
};

/**
 * Listen for checklist updates and refresh badges in real-time
 */
window.addEventListener('checklist:updated', async function(event) {
  const { itemType, itemId } = event.detail;
  console.log(`[Checklist Update] Received event for ${itemType} ${itemId}`);
  
  try {
    // Fetch updated checklist status
    const checklistStatus = await getChecklistStatus(itemId, itemType);
    
    // Find the card in the kanban board
    const cardType = itemType === 'issue' ? 'issue' : 'action-item';
    const card = document.querySelector(`.kanban-card[data-item-id="${itemId}"][data-item-type="${cardType}"]`);
    
    if (card) {
      // Find existing badge or create placeholder
      let badgeContainer = card.querySelector('.checklist-badge-container');
      
      if (!badgeContainer) {
        // Create container after tags if badge doesn't exist
        const tagsContainer = card.querySelector('.flex.flex-wrap.gap-1.mb-2');
        badgeContainer = document.createElement('div');
        badgeContainer.className = 'checklist-badge-container';
        
        if (tagsContainer) {
          tagsContainer.insertAdjacentElement('afterend', badgeContainer);
        } else {
          // Insert before action buttons
          const cardContent = card.querySelector('.flex-1');
          cardContent.appendChild(badgeContainer);
        }
      }
      
      // Update badge HTML
      badgeContainer.innerHTML = generateChecklistBadge(checklistStatus);
      console.log(`[Checklist Update] Updated badge for ${itemType} ${itemId}`, checklistStatus);
    } else {
      console.warn(`[Checklist Update] Card not found for ${itemType} ${itemId}`);
    }
  } catch (error) {
    console.error('[Checklist Update] Error refreshing badge:', error);
  }
});

// ==================== AI BADGE HELPERS ====================

/**
 * Generate HTML for AI source badge
 * @param {Object} item - Issue or action item object
 * @returns {string} HTML for badge
 */
function getAISourceBadge(item) {
  if (!item.created_by_ai) {
    return `
      <span class="inline-flex items-center px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-md">
        <span class="mr-1">👤</span> Manual
      </span>
    `;
  }
  
  const confidence = item.ai_confidence ? Math.round(item.ai_confidence) : 0;
  const confidenceColor = getConfidenceColor(confidence);
  
  return `
    <span class="inline-flex items-center px-2 py-1 text-xs font-medium ${confidenceColor} rounded-md gap-1">
      <span>⚡</span>
      <span>AI</span>
      <span class="font-bold">${confidence}%</span>
    </span>
  `;
}

/**
 * Get Tailwind color classes based on confidence score
 * @param {number} confidence - Confidence score (0-100)
 * @returns {string} Tailwind CSS classes
 */
function getConfidenceColor(confidence) {
  if (confidence >= 90) return 'bg-green-100 text-green-800 border border-green-300';
  if (confidence >= 75) return 'bg-blue-100 text-blue-800 border border-blue-300';
  if (confidence >= 60) return 'bg-yellow-100 text-yellow-800 border border-yellow-300';
  return 'bg-orange-100 text-orange-800 border border-orange-300';
}

/**
 * Get border styling for AI-generated cards
 * @param {Object} item - Issue or action item object
 * @returns {string} Tailwind CSS border classes
 */
function getAICardBorderClass(item) {
  if (!item.created_by_ai) {
    return 'border-gray-200';
  }
  
  const confidence = item.ai_confidence ? Math.round(item.ai_confidence) : 0;
  if (confidence >= 90) return 'border-l-4 border-l-indigo-500';
  if (confidence >= 75) return 'border-l-4 border-l-indigo-400';
  return 'border-l-4 border-l-indigo-300';
}

/**
 * Get background styling for AI-generated cards
 * @param {Object} item - Issue or action item object
 * @returns {string} Tailwind CSS background classes
 */
function getAICardBackgroundClass(item) {
  return item.created_by_ai ? 'bg-indigo-50' : 'bg-white';
}

// Debounce function for search
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============= KANBAN SORTING FUNCTIONS =============

// Sort items by due date (overdue → today → upcoming → no date)
function sortByDueDate(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const overdue = [];
  const dueToday = [];
  const upcoming = [];
  const noDate = [];
  
  items.forEach(item => {
    if (!item.due_date) {
      noDate.push(item);
    } else {
      const dueDate = new Date(item.due_date);
      dueDate.setHours(0, 0, 0, 0);
      
      if (dueDate < today) {
        overdue.push(item);
      } else if (dueDate.getTime() === today.getTime()) {
        dueToday.push(item);
      } else {
        upcoming.push(item);
      }
    }
  });
  
  // Sort within groups: earliest first
  const sortByDate = (a, b) => new Date(a.due_date) - new Date(b.due_date);
  overdue.sort(sortByDate);
  upcoming.sort(sortByDate);
  
  return [...overdue, ...dueToday, ...upcoming, ...noDate];
}

// Sort by Priority + Due Date (primary: priority, secondary: due date earliest)
function sortByPriorityAndDueDate(items) {
  const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
  
  return items.sort((a, b) => {
    // Primary: Priority
    const priorityA = priorityOrder[a.priority?.toLowerCase()] ?? 4;
    const priorityB = priorityOrder[b.priority?.toLowerCase()] ?? 4;
    
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    
    // Secondary: Due Date (earliest first)
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return new Date(a.due_date) - new Date(b.due_date);
  });
}

// Sort by Overdue + Priority (primary: overdue status, secondary: priority)
function sortByOverdueAndPriority(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
  
  return items.sort((a, b) => {
    const dueDateA = a.due_date ? new Date(a.due_date) : null;
    const dueDateB = b.due_date ? new Date(b.due_date) : null;
    
    const isOverdueA = dueDateA && dueDateA < today;
    const isOverdueB = dueDateB && dueDateB < today;
    
    // Primary: Overdue status (overdue items first)
    if (isOverdueA && !isOverdueB) return -1;
    if (!isOverdueA && isOverdueB) return 1;
    
    // Secondary: Priority within overdue/not overdue groups
    const priorityA = priorityOrder[a.priority?.toLowerCase()] ?? 4;
    const priorityB = priorityOrder[b.priority?.toLowerCase()] ?? 4;
    
    return priorityA - priorityB;
  });
}

// Calculate smart score for weighted sorting
function calculateSmartScore(item, today, priorityWeight) {
  let score = 0;
  
  // Priority component (0-8 points)
  score += priorityWeight[item.priority?.toLowerCase()] || 0;
  
  // Overdue component (up to 30 points)
  if (item.due_date) {
    const dueDate = new Date(item.due_date);
    dueDate.setHours(0, 0, 0, 0);
    const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
    
    if (daysOverdue > 0) {
      score += Math.min(daysOverdue * 3, 30); // 3 points per day overdue, max 30
    } else if (daysOverdue === 0) {
      score += 5; // Bonus for due today
    }
  }
  
  return score;
}

// Sort by Smart Score (weighted algorithm combining priority and due date urgency)
function sortBySmartScore(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const priorityWeight = { 'critical': 8, 'high': 6, 'medium': 4, 'low': 2 };
  
  return items.sort((a, b) => {
    const scoreA = calculateSmartScore(a, today, priorityWeight);
    const scoreB = calculateSmartScore(b, today, priorityWeight);
    
    return scoreB - scoreA; // Higher scores first
  });
}

// ============= SORT PREFERENCES & MANUAL ORDER =============
const SORT_PREFERENCES_KEY = 'kanban-sort-preferences';
const MANUAL_ORDER_KEY = 'kanban-manual-order';

function getSortPreferences() {
  const stored = localStorage.getItem(SORT_PREFERENCES_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return {};
}

function getSortPreference(columnId) {
  const prefs = getSortPreferences();
  return prefs[columnId] || 'due-overdue-first'; // Default sorting mode
}

function saveSortPreference(columnId, sortMode) {
  const prefs = getSortPreferences();
  prefs[columnId] = sortMode;
  localStorage.setItem(SORT_PREFERENCES_KEY, JSON.stringify(prefs));
}

function saveManualOrder(columnId, itemIds) {
  const stored = localStorage.getItem(MANUAL_ORDER_KEY);
  const orders = stored ? JSON.parse(stored) : {};
  orders[columnId] = itemIds;
  localStorage.setItem(MANUAL_ORDER_KEY, JSON.stringify(orders));
}

function loadManualOrder(items, columnId) {
  const stored = localStorage.getItem(MANUAL_ORDER_KEY);
  if (!stored) return items;
  
  const orders = JSON.parse(stored);
  const savedOrder = orders[columnId];
  if (!savedOrder) return items;
  
  // Sort items based on saved order
  const orderedItems = [];
  const itemsMap = new Map(items.map(item => [`${item.type}-${item.id}`, item]));
  
  savedOrder.forEach(key => {
    if (itemsMap.has(key)) {
      orderedItems.push(itemsMap.get(key));
      itemsMap.delete(key);
    }
  });
  
  // Append any new items not in saved order
  itemsMap.forEach(item => orderedItems.push(item));
  
  return orderedItems;
}

// Save manual order from current DOM state
function saveManualOrderFromDOM(columnId) {
  const domId = `${columnId}-column`;
  const container = document.getElementById(domId);
  
  if (!container) {
    console.warn(`Cannot save manual order: column container "${domId}" not found`);
    return;
  }
  
  const cards = container.querySelectorAll('.kanban-card');
  const itemKeys = Array.from(cards).map(card => {
    const itemId = card.getAttribute('data-item-id');
    const itemType = card.getAttribute('data-item-type');
    return `${itemType}-${itemId}`;
  });
  
  saveManualOrder(columnId, itemKeys);
}

// Comprehensive sort function with multiple modes
function sortItems(items, sortMode, columnId) {
  // Make a copy to avoid mutating original array
  const itemsCopy = [...items];
  
  switch(sortMode) {
    case 'due-overdue-first':
      return sortByDueDate(itemsCopy);
      
    case 'due-earliest':
      return itemsCopy.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date) - new Date(b.due_date);
      });
      
    case 'due-latest':
      return itemsCopy.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(b.due_date) - new Date(a.due_date);
      });
      
    case 'priority':
      const priorityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'low': 3 };
      return itemsCopy.sort((a, b) => {
        const priorityA = priorityOrder[a.priority?.toLowerCase()] ?? 4;
        const priorityB = priorityOrder[b.priority?.toLowerCase()] ?? 4;
        return priorityA - priorityB;
      });
      
    case 'created-desc':
      return itemsCopy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
    case 'updated-desc':
      return itemsCopy.sort((a, b) => {
        const aDate = a.updated_at || a.created_at;
        const bDate = b.updated_at || b.created_at;
        return new Date(bDate) - new Date(aDate);
      });
      
    case 'manual':
      return loadManualOrder(itemsCopy, columnId);
      
    case 'priority-due-date':
      return sortByPriorityAndDueDate(itemsCopy);
      
    case 'overdue-priority':
      return sortByOverdueAndPriority(itemsCopy);
      
    case 'smart-sort':
      return sortBySmartScore(itemsCopy);
      
    default:
      return sortByDueDate(itemsCopy);
  }
}

// Handle sort change from dropdown
function handleSortChange(selectElement) {
  const columnId = selectElement.dataset.column;
  const sortMode = selectElement.value;
  
  // Save preference
  saveSortPreference(columnId, sortMode);
  
  // If switching to manual mode, save current order as baseline
  if (sortMode === 'manual') {
    setTimeout(() => {
      saveManualOrderFromDOM(columnId);
    }, 10);
  }
  
  // Re-render board
  renderKanbanBoard();
}

// ============= COPY LINK FEATURE =============

/**
 * Copy a shareable link to an issue or action item
 * @param {number} itemId - The ID of the item
 * @param {string} itemType - 'issue' or 'action-item'
 */
function copyItemLink(itemId, itemType) {
  if (!currentProject) {
    showToast('❌ No project selected', 'error');
    return;
  }
  
  // Construct the URL with project and item parameters
  const baseUrl = window.location.origin;
  const url = `${baseUrl}/?project=${currentProject.id}&itemId=${itemId}&itemType=${itemType}`;
  
  // Copy to clipboard using Clipboard API
  navigator.clipboard.writeText(url)
    .then(() => {
      showToast('✅ Link copied to clipboard!', 'success');
    })
    .catch(err => {
      console.error('Failed to copy link:', err);
      // Fallback for older browsers
      fallbackCopyToClipboard(url);
    });
}

/**
 * Fallback copy method for older browsers
 * @param {string} text - The text to copy
 */
function fallbackCopyToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  document.body.appendChild(textArea);
  textArea.select();
  
  try {
    document.execCommand('copy');
    showToast('✅ Link copied to clipboard!', 'success');
  } catch (err) {
    console.error('Fallback copy failed:', err);
    showToast('❌ Failed to copy link', 'error');
  }
  
  document.body.removeChild(textArea);
}

// Initialize app
document.addEventListener("DOMContentLoaded", async function () {
    console.log("Multi-Project Tracker initialized");
    await AuthManager.init();
    await loadProjects();
    
    // Check if there's a project parameter in URL (from email links)
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get('project');
    if (projectId && projects.length > 0) {
        await selectProject(parseInt(projectId));
    }
    
    // Toggle review queue button
    const toggleQueueBtn = document.getElementById('toggle-review-queue-btn');
    if (toggleQueueBtn) {
        toggleQueueBtn.addEventListener('click', window.toggleReviewQueue);
    }
    setupEventListeners();
    initializeFilters();
    initBulkActions();
    initializeTableView();
});

// Set AI Analysis mode with proper accessibility
function setAIAnalysisMode(mode) {
    const meetingTranscriptContent = document.getElementById('meeting-transcript-content');
    const multiDocumentContent = document.getElementById('multi-document-content');
    const transcriptModeRadio = document.getElementById('ai-mode-meeting-transcript');
    const multiDocumentModeRadio = document.getElementById('ai-mode-multi-document');

    if (!meetingTranscriptContent || !multiDocumentContent) {
        return;
    }

    const showTranscript = mode !== 'multi-doc';

    meetingTranscriptContent.classList.toggle('hidden', !showTranscript);
    meetingTranscriptContent.setAttribute('aria-hidden', (!showTranscript).toString());

    multiDocumentContent.classList.toggle('hidden', showTranscript);
    multiDocumentContent.setAttribute('aria-hidden', showTranscript.toString());

    if (transcriptModeRadio) {
        transcriptModeRadio.checked = showTranscript;
    }

    if (multiDocumentModeRadio) {
        multiDocumentModeRadio.checked = !showTranscript;
    }
}

// Initialize AI Analysis mode toggle between Meeting Transcript and Multi-Document Processing
function initializeAIAnalysisModeToggle() {
    const modeRadios = document.querySelectorAll('input[name="ai-analysis-mode"]');

    if (!modeRadios.length) {
        return;
    }

    modeRadios.forEach((radio) => {
        radio.addEventListener('change', (event) => {
            const selectedMode = event.target.value === 'multi-doc' ? 'multi-doc' : 'transcript';
            setAIAnalysisMode(selectedMode);
        });
    });

    const checkedRadio = document.querySelector('input[name="ai-analysis-mode"]:checked');
    const initialMode = checkedRadio?.value === 'multi-doc' ? 'multi-doc' : 'transcript';
    setAIAnalysisMode(initialMode);
}

// Setup event listeners (replaces inline onclick handlers)
function setupEventListeners() {
    // Auth button listeners
    document.getElementById('login-btn')?.addEventListener('click', showLogin);
    document.getElementById('register-btn')?.addEventListener('click', showRegister);
    document.getElementById('logout-btn')?.addEventListener('click', () => AuthManager.logout());
    document.getElementById('user-management-link')?.addEventListener('click', showUserManagement);
    
    // Project and item creation buttons
    document.getElementById('create-project-btn')?.addEventListener('click', showCreateProject);
    document.getElementById('viewArchivedBtn')?.addEventListener('click', () => window.viewArchivedProjects());
    document.getElementById('create-issue-btn')?.addEventListener('click', showCreateIssue);
    document.getElementById('create-action-item-btn')?.addEventListener('click', showCreateActionItem);
    document.getElementById('dashboard-btn')?.addEventListener('click', () => {
        if (currentProject) {
            window.location.href = `dashboard.html?projectId=${currentProject.id}`;
        }
    });
    document.getElementById('view-tags-btn')?.addEventListener('click', () => {
        if (currentProject) {
            window.location.href = `tags.html?projectId=${currentProject.id}`;
        }
    });
    document.getElementById('view-risks-btn')?.addEventListener('click', () => {
        if (currentProject) {
            window.location.href = `risks.html?projectId=${currentProject.id}`;
        }
    });
    document.getElementById('view-schedules-btn')?.addEventListener('click', () => {
        if (currentProject) {
            window.location.href = `schedules.html?projectId=${currentProject.id}`;
        }
    });
    document.getElementById('view-checklists-btn')?.addEventListener('click', () => {
        if (currentProject) {
            window.location.href = `checklists.html?project=${currentProject.id}`;
        } else {
            window.location.href = 'checklists.html';
        }
    });
    document.getElementById('view-templates-btn')?.addEventListener('click', () => {
        if (currentProject) {
            window.location.href = `templates.html?project=${currentProject.id}`;
        } else {
            window.location.href = 'templates.html';
        }
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
        // Focus first menu item
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
    
    // Keyboard navigation for dropdown buttons
    [viewDropdownBtn, createDropdownBtn].forEach(btn => {
        btn?.addEventListener('keydown', (e) => {
            const menu = btn === viewDropdownBtn ? viewDropdownMenu : createDropdownMenu;
            const otherBtn = btn === viewDropdownBtn ? createDropdownBtn : viewDropdownBtn;
            const otherMenu = btn === viewDropdownBtn ? createDropdownMenu : viewDropdownMenu;
            
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const isOpen = !menu?.classList.contains('hidden');
                if (isOpen) {
                    closeDropdown(btn, menu);
                } else {
                    openDropdown(btn, menu, otherBtn, otherMenu);
                }
            } else if (e.key === 'Escape') {
                closeDropdown(btn, menu);
                btn?.focus();
            }
        });
    });
    
    // Keyboard navigation within menus
    [viewDropdownMenu, createDropdownMenu].forEach(menu => {
        menu?.addEventListener('keydown', (e) => {
            const items = Array.from(menu.querySelectorAll('button[role="menuitem"]'));
            const currentIndex = items.indexOf(document.activeElement);
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIndex = (currentIndex + 1) % items.length;
                items[nextIndex]?.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
                items[prevIndex]?.focus();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                const btn = menu === viewDropdownMenu ? viewDropdownBtn : createDropdownBtn;
                closeDropdown(btn, menu);
                btn?.focus();
            } else if (e.key === 'Home') {
                e.preventDefault();
                items[0]?.focus();
            } else if (e.key === 'End') {
                e.preventDefault();
                items[items.length - 1]?.focus();
            }
        });
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!viewDropdownBtn?.contains(e.target) && !viewDropdownMenu?.contains(e.target)) {
            closeDropdown(viewDropdownBtn, viewDropdownMenu);
        }
        if (!createDropdownBtn?.contains(e.target) && !createDropdownMenu?.contains(e.target)) {
            closeDropdown(createDropdownBtn, createDropdownMenu);
        }
    });
    
    // AI Analysis and Transcripts buttons (CSP-compliant event delegation)
    document.getElementById('ai-analysis-btn')?.addEventListener('click', showAIAnalysisModal);
    document.getElementById('transcripts-btn')?.addEventListener('click', openTranscriptsModal);

    initializeAIAnalysisModeToggle();
    
    // Export button
    document.getElementById('copy-clipboard-btn')?.addEventListener('click', copyToClipboard);
    
    // Close dropdowns when a menu item is clicked
    viewDropdownMenu?.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            closeDropdown(viewDropdownBtn, viewDropdownMenu);
        });
    });
    
    createDropdownMenu?.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            closeDropdown(createDropdownBtn, createDropdownMenu);
        });
    });
    
    // Relationship modal buttons
    document.getElementById('close-relationship-modal-btn')?.addEventListener('click', closeRelationshipModal);
    document.getElementById('add-relationship-btn')?.addEventListener('click', addRelationship);
    
    // Relationship target type change listener (bind once)
    document.getElementById('relationship-target-type')?.addEventListener('change', populateTargetDropdown);
    
    // Add event listeners after DOM is loaded
    document.addEventListener("click", function (e) {
        // Handle modal overlay clicks (to close modal)
        if (e.target.id === "modal-overlay") {
            hideModal();
        }
        
        // Handle modal cancel buttons
        if (e.target.classList.contains('modal-cancel-btn')) {
            hideModal();
        }
        
        // Handle update role buttons
        if (e.target.classList.contains('update-role-btn')) {
            const userId = e.target.getAttribute('data-user-id');
            if (userId) {
                updateUserRole(parseInt(userId));
            }
        }
        
        // Handle add relationship buttons
        const relationshipBtn = e.target.closest('[data-action="add-relationship"]');
        if (relationshipBtn) {
            const relationshipType = relationshipBtn.getAttribute('data-type');
            if (relationshipType && currentDetailItem) {
                // Pre-fill the relationship type in the modal
                document.getElementById('relationship-type').value = relationshipType;
                showRelationshipModal(currentDetailItem.id, currentDetailItem.type, currentDetailItem.title);
            }
        }
    });

    // Handle form submissions
    document.addEventListener("submit", function (e) {
        if (e.target.onsubmit) {
            e.preventDefault();
            if (e.target.querySelector("#project-name")) {
                createProject(e);
            }
        }
    });
}

// Rest of your JavaScript functions remain the same...
// (Keep all the other functions: loadProjects, renderProjects, etc.)

// Load projects
async function loadProjects() {
    try {
        const response = await axios.get("/api/projects");
        projects = response.data;
        renderProjects();

        if (projects.length === 0) {
            showWelcomeMessage();
        }
    } catch (error) {
        console.error("Error loading projects:", error);
        showErrorMessage("Failed to load projects");
    }
}

// Helper function to determine if description is long (more than ~5 lines of text)
function isLongDescription(text) {
    if (!text) return false;
    return text.length > 280;
}

// Render projects
function renderProjects() {
    const container = document.getElementById("projects-list");

    if (projects.length === 0) {
        container.innerHTML = `
            <div class="col-span-3 text-center py-8">
                <p class="text-gray-500 mb-4">No projects yet. Create your first project to get started!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = projects
        .map(
            (project) => {
                const isLong = isLongDescription(project.description);
                return `
        <div class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
             data-project-id="${project.id}">
            <div class="flex justify-between items-start mb-2">
                <div data-project-click="${project.id}" class="cursor-pointer flex-1">
                    <h3 class="text-lg font-semibold mb-2">${project.name}</h3>
                </div>
                <div class="flex gap-2">
                    <button class="edit-project-btn text-blue-600 hover:text-blue-800 p-1" data-project-id="${project.id}" title="Edit Project">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                        </svg>
                    </button>
                    <button class="archive-project-btn text-gray-600 hover:text-gray-800 p-1" data-project-id="${project.id}" title="Archive Project">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div data-project-click="${project.id}" class="cursor-pointer">
                <div class="mb-3">
                    <p class="text-gray-600 text-sm ${isLong ? 'line-clamp-5' : ''}" data-description-text="${project.id}">
                        ${project.description}
                    </p>
                    ${isLong ? `
                        <button class="text-blue-600 hover:text-blue-800 text-xs mt-1 font-medium" 
                                data-toggle-description="${project.id}">
                            More
                        </button>
                    ` : ''}
                </div>
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <div class="flex gap-2">
                        <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                            ${project.template}
                        </span>
                        <span class="px-2 py-1 ${project.complexity_level === 'enterprise' ? 'bg-purple-100 text-purple-800' : project.complexity_level === 'complex' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'} rounded text-xs font-medium">
                            ${project.complexity_level === 'enterprise' ? '⭐ Enterprise (20)' : project.complexity_level === 'complex' ? '📦 Complex (10)' : '📁 Standard (5)'}
                        </span>
                    </div>
                    <span class="text-xs text-gray-500">
                        ${new Date(project.created_at).toLocaleDateString()}
                    </span>
                </div>
            </div>
            <div class="mt-4 pt-4 border-t border-gray-200 flex space-x-2">
                <a href="dashboard.html?projectId=${project.id}" 
                   class="flex-1 text-center bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700"
                   data-dashboard-link>
                    Dashboard
                </a>
                <a href="team.html?projectId=${project.id}" 
                   class="flex-1 text-center bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                   data-team-link>
                    Team
                </a>
            </div>
        </div>
    `;
            }
        )
        .join("");

    // Add click listeners to project cards (not the team link)
    document.querySelectorAll("[data-project-click]").forEach((card) => {
        card.addEventListener("click", function () {
            selectProject(parseInt(this.dataset.projectClick));
        });
    });

    // Add toggle listeners for long descriptions
    document.querySelectorAll("[data-toggle-description]").forEach((button) => {
        button.addEventListener("click", function (e) {
            e.stopPropagation(); // Prevent project card click
            const projectId = this.dataset.toggleDescription;
            const descriptionEl = document.querySelector(`[data-description-text="${projectId}"]`);
            const isExpanded = !descriptionEl.classList.contains('line-clamp-5');
            
            if (isExpanded) {
                descriptionEl.classList.add('line-clamp-5');
                this.textContent = 'More';
            } else {
                descriptionEl.classList.remove('line-clamp-5');
                this.textContent = 'Less';
            }
        });
    });
}

// Select project
async function selectProject(projectId) {
    currentProject = projects.find((p) => p.id === projectId);
    if (!currentProject) return;

    document.getElementById("current-project-name").textContent =
        currentProject.name;
    document.getElementById("project-view").classList.remove("hidden");

    await loadProjectData(projectId);
    
    // Check for deep-link parameters (itemId and itemType from email notifications)
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get('itemId');
    const itemType = params.get('itemType');
    
    if (itemId && itemType) {
        // Auto-open the item detail modal
        setTimeout(() => {
            openItemDetailModal(parseInt(itemId), itemType);
        }, 500); // Small delay to ensure kanban board is rendered
        
        // Clean up URL (remove itemId and itemType params)
        params.delete('itemId');
        params.delete('itemType');
        const newURL = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname;
        window.history.replaceState({}, '', newURL);
    }
}

// Load project data with filters
async function loadProjectData(projectId) {
    try {
        const startTime = performance.now();
        
        // Build query params with filters
        const params = new URLSearchParams({ projectId: projectId.toString() });
        
        if (currentFilters.status) params.append('status', currentFilters.status);
        if (currentFilters.priority) params.append('priority', currentFilters.priority);
        if (currentFilters.assignee) params.append('assignee', currentFilters.assignee);
        if (currentFilters.category) params.append('category', currentFilters.category);
        if (currentFilters.search) params.append('search', currentFilters.search);
        if (currentFilters.tag) params.append('tag', currentFilters.tag);
        
        const [issuesResponse, actionItemsResponse] = await Promise.all([
            axios.get(`/api/issues?${params.toString()}`),
            axios.get(`/api/action-items?${params.toString()}`),
            loadTeamMembers(projectId),
        ]);

        issues = issuesResponse.data;
        actionItems = actionItemsResponse.data;

        await renderKanbanBoard();
        displayResultsCount();
        populateAssigneeFilter();
        populateTagFilter();
        
        // Sync dropdowns AFTER populating them to preserve filter values
        syncFilterDropdowns();
        displayActiveFilters();
        
        // Render table view if active
        if (currentView === 'table') {
          renderTableView();
        }
        
        // Load review queue (non-blocking)
        loadReviewQueue(projectId).catch(err => console.error('Review queue error:', err));
        
        const endTime = performance.now();
        console.log(`✅ Page loaded in ${(endTime - startTime).toFixed(0)}ms`);
    } catch (error) {
        console.error("Error loading project data:", error);
        hideLoadingIndicator();
    }
}

// Load team members for the current project
async function loadTeamMembers(projectId) {
    try {
        const response = await axios.get(`/api/projects/${projectId}/team`, {
            withCredentials: true
        });
        teamMembers = response.data;
    } catch (error) {
        console.error("Error loading team members:", error);
        teamMembers = [];
    }
}

// Create effort estimation badge (Phase 1)
function createEffortEstimateBadge(item) {
  if (!item.estimated_hours && !item.ai_estimated_hours) {
    return '';
  }
  
  const estimate = item.estimated_hours || item.ai_estimated_hours;
  const actual = item.actual_hours;
  const isAI = item.ai_estimated_hours && !item.estimated_hours;
  
  let badgeContent = '';
  
  if (actual && item.status === 'Done') {
    const variance = actual - estimate;
    const variancePercent = Math.round((variance / estimate) * 100);
    
    let varClass = 'bg-gray-100 text-gray-700';
    let icon = '⏱️';
    
    if (Math.abs(variancePercent) <= 10) {
      varClass = 'bg-green-100 text-green-700';
      icon = '✓';
    } else if (variancePercent > 10) {
      varClass = 'bg-red-100 text-red-700';
      icon = '⚠️';
    }
    
    badgeContent = `
      <div class="flex items-center gap-1 px-2 py-1 rounded text-xs ${varClass}">
        <span>${icon}</span>
        <span>${estimate}h est / ${actual}h actual</span>
      </div>
    `;
  } else {
    const aiIndicator = isAI ? '🤖' : '⏱️';
    badgeContent = `
      <div class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-50 text-blue-700">
        <span>${aiIndicator}</span>
        <span>${estimate}h estimated</span>
      </div>
    `;
  }
  
  return `<div class="mb-2">${badgeContent}</div>`;
}

// Create planning estimate indicator badge
function createPlanningEstimateBadge(item) {
  if (!item.planning_estimate_source) {
    return ''; // No planning estimate set
  }
  
  const source = item.planning_estimate_source;
  let hours = 0;
  let badgeColor = '';
  let icon = '';
  let label = '';
  
  if (source === 'manual') {
    hours = item.estimated_effort_hours || 0;
    badgeColor = 'bg-gray-100 text-gray-700 border border-gray-300';
    icon = '✏️';
    label = 'M';
  } else if (source === 'ai') {
    hours = item.ai_effort_estimate_hours || 0;
    badgeColor = 'bg-purple-100 text-purple-700 border border-purple-300';
    icon = '🤖';
    label = 'AI';
  } else if (source === 'hybrid') {
    hours = item.hybrid_effort_estimate_hours || 0;
    badgeColor = 'bg-blue-100 text-blue-700 border border-blue-300';
    icon = '⚡';
    label = 'H';
  }
  
  const hoursDisplay = parseFloat(hours).toFixed(1);
  
  return `
    <div class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${badgeColor}" title="Planning Estimate: ${label === 'M' ? 'Manual' : label === 'AI' ? 'AI Generated' : 'Hybrid'} (${hoursDisplay}h)">
      <span>${icon}</span>
      <span>${label}</span>
      <span class="font-semibold">${hoursDisplay}h</span>
    </div>
  `;
}

// Create due date badge with color coding
function createDueDateBadge(dueDate, status, completedAt) {
  // For Done items, show delivery performance
  if (status === 'Done' && completedAt && dueDate) {
    const completed = new Date(completedAt);
    completed.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    
    const diffTime = due - completed;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let badgeClass, icon, text;
    
    if (diffDays > 0) {
      // Completed early
      badgeClass = 'early';
      icon = 'fa-check-circle';
      text = diffDays === 1 ? '1 day early' : `${diffDays} days early`;
    } else if (diffDays === 0) {
      // Completed on time
      badgeClass = 'on-time';
      icon = 'fa-check';
      text = 'On time';
    } else {
      // Completed late
      badgeClass = 'late';
      icon = 'fa-exclamation-triangle';
      text = Math.abs(diffDays) === 1 ? '1 day late' : `${Math.abs(diffDays)} days late`;
    }
    
    return `<div class="due-date-badge ${badgeClass}">
      <i class="fas ${icon}"></i>
      <span>${text}</span>
    </div>`;
  }
  
  // For Done items without due date or completed_at
  if (status === 'Done') {
    return `<div class="due-date-badge completed">
      <i class="fas fa-check-circle"></i>
      <span>Completed</span>
    </div>`;
  }
  
  // For non-Done items, show urgency (existing logic)
  if (!dueDate) {
    return `<div class="due-date-badge none">
      <i class="fas fa-calendar-times"></i>
      <span>No due date</span>
    </div>`;
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  
  const diffTime = due - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  let badgeClass, icon, text;
  
  if (diffDays < 0) {
    // Overdue
    badgeClass = 'overdue';
    icon = 'fa-exclamation-circle';
    text = Math.abs(diffDays) === 1 ? '1 day overdue' : `${Math.abs(diffDays)} days overdue`;
  } else if (diffDays === 0) {
    // Due today
    badgeClass = 'today';
    icon = 'fa-calendar-day';
    text = 'Due today';
  } else if (diffDays === 1) {
    // Due tomorrow
    badgeClass = 'soon';
    icon = 'fa-clock';
    text = 'Due tomorrow';
  } else if (diffDays <= 3) {
    // Due soon (2-3 days)
    badgeClass = 'soon';
    icon = 'fa-clock';
    text = `Due in ${diffDays} days`;
  } else {
    // Future
    badgeClass = 'future';
    icon = 'fa-calendar';
    text = `Due in ${diffDays} days`;
  }
  
  return `<div class="due-date-badge ${badgeClass}">
    <i class="fas ${icon}"></i>
    <span>${text}</span>
  </div>`;
}

/**
 * Create circular dependency badge for Kanban cards
 */
function createCircularDependencyBadge(item, cycleWith) {
  if (!cycleWith || cycleWith.length === 0) return '';
  
  // Get the first item in the cycle for display
  const firstDep = cycleWith[0];
  const depDisplay = cycleWith.length > 1 
    ? `${firstDep.title.substring(0, 30)}... +${cycleWith.length - 1} more`
    : firstDep.title.substring(0, 40);
  
  return `<div class="mb-2 p-2 bg-red-50 border border-red-300 rounded-lg">
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>
      <div class="flex-1 text-xs">
        <div class="font-semibold text-red-800">Circular Dependency</div>
        <div class="text-red-700">
          Cycle with: 
          <button class="cycle-dep-link font-medium underline hover:text-red-900" 
                  data-item-type="${firstDep.type}" 
                  data-item-id="${firstDep.id}">
            ${escapeHtml(depDisplay)}
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

// Create timesheet requirement badge
function createTimesheetRequiredBadge(item, project) {
  console.log('[BADGE] Creating badge for item:', item.id, {
    itemOverride: item.timesheet_required_override,
    projectSetting: project?.timesheet_entry_required,
    projectId: project?.id
  });
  
  // Override = true: always required
  if (item.timesheet_required_override === true) {
    console.log('[BADGE] Showing badge - item override is TRUE');
    return `<div class="mt-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 flex items-center gap-1">
      ⏱️ <span>Timesheet required</span>
    </div>`;
  }
  
  // Override = false: never required
  if (item.timesheet_required_override === false) {
    console.log('[BADGE] Hiding badge - item override is FALSE');
    return '';
  }
  
  // Override = null/undefined: inherit from project setting
  if (project?.timesheet_entry_required) {
    console.log('[BADGE] Showing badge - project setting is TRUE');
    return `<div class="mt-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 flex items-center gap-1">
      ⏱️ <span>Timesheet required</span>
    </div>`;
  }
  
  console.log('[BADGE] Hiding badge - no requirement');
  return '';
}

// Helper function: Render a single Kanban card with hierarchy support
function renderKanbanCardWithHierarchy(item, metadata, indentLevel = 0) {
    const { relationshipCounts, commentCounts, checklistStatuses, circularDependencies } = metadata;
    
    const relCount = relationshipCounts[`${item.type}-${item.id}`] || 0;
    const commentCount = commentCounts[`${item.type}-${item.id}`] || 0;
    const checklistStatus = checklistStatuses[`${item.type}-${item.id}`] || { hasChecklist: false, total: 0, completed: 0, percentage: 0 };
    const planningBadge = createPlanningEstimateBadge(item);
    const circularDeps = circularDependencies[`${item.type}-${item.id}`] || null;
    
    const hasChildren = item.children && item.children.length > 0;
    const indentPx = indentLevel * 16;
    const isExpanded = getExpandedState(item.id);
    
    // Check permissions for edit/delete
    const currentUser = AuthManager.currentUser;
    const isOwner = currentUser && parseInt(item.created_by, 10) === parseInt(currentUser.id, 10);
    const isAssignee = currentUser && item.assignee === currentUser.username;
    
    const roleHierarchy = {
        'System Administrator': 5,
        'Project Manager': 4,
        'Team Lead': 3,
        'Team Member': 2,
        'Stakeholder': 1,
        'External Viewer': 0
    };
    const userRoleLevel = currentUser ? (roleHierarchy[currentUser.role] || 0) : 0;
    const isTeamLeadOrAbove = userRoleLevel >= roleHierarchy['Team Lead'];
    
    const canEdit = isOwner || isAssignee || isTeamLeadOrAbove;
    const canDelete = isTeamLeadOrAbove;
    
    // Epic badge and border
    const epicClass = item.is_epic ? 'kanban-card-epic' : '';
    const epicBorderClass = item.is_epic ? 'border-indigo-500' : '';
    
    let cardHtml = `
        <div class="kanban-card ${epicClass} ${getAICardBackgroundClass(item)} rounded p-3 shadow-sm ${getAICardBorderClass(item)} border-l-4 ${!item.created_by_ai ? getBorderColor(item.priority || "medium") : ''} ${epicBorderClass} cursor-pointer hover:shadow-md transition-shadow relative"
             draggable="true"
             data-item-id="${item.id}"
             data-item-type="${item.type || 'issue'}"
             style="margin-left: ${indentPx}px">
            
            <div class="flex items-start gap-2 mb-2">
                ${hasChildren ? `
                    <button class="hierarchy-chevron mt-1 text-gray-500 hover:text-gray-700 w-4 h-4 flex-shrink-0" 
                            data-item-id="${item.id}"
                            aria-label="${isExpanded ? 'Collapse' : 'Expand'} children">
                        <i class="fas fa-chevron-${isExpanded ? 'down' : 'right'}"></i>
                    </button>
                ` : `
                    <span class="w-4 h-4 flex-shrink-0"></span>
                `}
                
                <input type="checkbox" 
                       class="item-checkbox mt-1 cursor-pointer w-4 h-4 flex-shrink-0" 
                       data-item-id="${item.id}"
                       data-item-type="${item.type || 'issue'}" />
                <div class="flex-1">
                    <div class="flex justify-between items-start mb-2 gap-2">
                        <div class="flex items-center gap-1">
                            ${item.is_epic ? '<span class="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">EPIC</span>' : ''}
                            <span class="text-xs font-medium ${getTextColor(item.type || "issue")}">${item.type || "Issue"}</span>
                            <span class="text-xs text-gray-500">·</span>
                            <span class="text-xs text-gray-500">${item.priority || "Medium"}</span>
                        </div>
                        ${getAISourceBadge(item)}
                    </div>
                    <h5 class="font-medium text-sm mb-1">${item.title}</h5>
                    <p class="text-xs text-gray-600 mb-2">${(item.description || "").substring(0, 80)}...</p>
                    ${
                        item.completion_percentage !== undefined && item.completion_percentage !== null
                            ? `<div class="mb-2">
                                <div class="w-full bg-gray-200 rounded-full h-1.5">
                                    <div class="bg-blue-600 h-1.5 rounded-full transition-all" style="width: ${item.completion_percentage}%"></div>
                                </div>
                                <div class="text-xs text-gray-600 mt-0.5">${item.completion_percentage}%</div>
                            </div>`
                            : ""
                    }
                    <div class="flex justify-between items-center text-xs text-gray-500 mb-2">
                        <span>${item.assignee || "Unassigned"}</span>
                    </div>
                    ${createDueDateBadge(item.due_date, item.status, item.completed_at)}
                    ${createEffortEstimateBadge(item)}
                    ${planningBadge ? `<div class="mb-2">${planningBadge}</div>` : ''}
                    ${circularDeps ? createCircularDependencyBadge(item, circularDeps) : ''}
                    ${item.tags && item.tags.length > 0 ? `
                        <div class="flex flex-wrap gap-1 mb-2">
                            ${item.tags.map(tag => `
                                <span class="px-2 py-0.5 text-xs rounded-full font-medium" style="background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}40;">
                                    ${tag.name}
                                </span>
                            `).join('')}
                        </div>
                    ` : ''}
                    <div class="flex items-center justify-between gap-2">
                        <div class="checklist-badge-container flex-1">${generateChecklistBadge(checklistStatus)}</div>
                        ${userRoleLevel >= roleHierarchy['Team Member'] ? `
                            <button 
                                class="quick-log-btn text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1 flex-shrink-0"
                                data-action="quick-log"
                                data-item-id="${item.id}"
                                data-item-type="${item.type}"
                                title="Quick Log Time"
                            >
                                ⏱️ Log
                            </button>
                        ` : ''}
                    </div>
                    ${createTimesheetRequiredBadge(item, currentProject)}
                </div>
            </div>
        </div>
    `;
    
    // Recursively render children if they exist and card is expanded
    if (hasChildren && isExpanded) {
        item.children.forEach(child => {
            cardHtml += renderKanbanCardWithHierarchy(child, metadata, indentLevel + 1);
        });
    }
    
    return cardHtml;
}

// Render Kanban board
async function renderKanbanBoard() {
    console.log('[KANBAN] renderKanbanBoard called, currentProject:', {
      id: currentProject?.id,
      name: currentProject?.name,
      timesheet_entry_required: currentProject?.timesheet_entry_required
    });
    
    // Filter by type if selected
    let itemsToDisplay = [];
    if (currentFilters.type === 'issue') {
        itemsToDisplay = [...issues];
    } else if (currentFilters.type === 'action') {
        itemsToDisplay = [...actionItems];
    } else {
        itemsToDisplay = [...issues, ...actionItems];
    }
    
    // Filter by planning estimate if selected
    if (currentFilters.hasPlanning) {
        itemsToDisplay = itemsToDisplay.filter(item => item.planning_estimate_source);
    }
    
    const allItems = itemsToDisplay;
    
    // HIERARCHY: Fetch hierarchy data for issues to enable parent-child relationships
    let hierarchyData = [];
    let hierarchyMap = new Map(); // Map of issue ID to hierarchy info
    
    if (currentProject && currentProject.id && currentFilters.type !== 'action') {
        try {
            const hierarchyResponse = await axios.get(
                `/api/projects/${currentProject.id}/hierarchy`,
                { withCredentials: true }
            );
            hierarchyData = hierarchyResponse.data || [];
            
            // Build hierarchy map for quick lookup
            hierarchyData.forEach(item => {
                hierarchyMap.set(item.id, {
                    parent_issue_id: item.parent_issue_id,
                    is_epic: item.is_epic,
                    hierarchy_level: item.hierarchy_level || 0
                });
            });
            
            console.log(`[KANBAN HIERARCHY] Loaded ${hierarchyData.length} hierarchy items`);
        } catch (error) {
            console.warn('[KANBAN HIERARCHY] Failed to load hierarchy data:', error);
            // Continue without hierarchy data - will render flat
        }
    }
    
    // Enrich items with hierarchy info
    allItems.forEach(item => {
        if (item.type === 'issue' && hierarchyMap.has(item.id)) {
            const hierarchyInfo = hierarchyMap.get(item.id);
            item.parent_issue_id = hierarchyInfo.parent_issue_id;
            item.is_epic = hierarchyInfo.is_epic;
            item.hierarchy_level = hierarchyInfo.hierarchy_level;
        }
    });
    
    // PERFORMANCE OPTIMIZATION: Use bulk metadata endpoint instead of individual API calls
    // This replaces 150+ individual API calls with a single bulk request
    let relationshipCounts = {};
    let commentCounts = {};
    let checklistStatuses = {};
    let circularDependencies = {};
    
    if (currentProject && currentProject.id) {
        try {
            // Load metadata and circular dependencies in parallel
            const [metadataResponse, circularDepsResponse] = await Promise.all([
                axios.get(
                    `/api/projects/${currentProject.id}/items-metadata`,
                    { withCredentials: true }
                ),
                axios.get(
                    `/api/projects/${currentProject.id}/circular-dependencies`,
                    { withCredentials: true }
                ).catch(err => {
                    console.warn('Failed to load circular dependencies:', err);
                    return { data: { circularDependencies: [] } };
                })
            ]);
            
            const metadata = metadataResponse.data;
            
            // Extract metadata from bulk response
            relationshipCounts = metadata.relationships || {};
            commentCounts = metadata.comments || {};
            
            // Process checklist metadata - add default values for items without checklists
            allItems.forEach(item => {
                const key = `${item.type}-${item.id}`;
                if (metadata.checklists[key]) {
                    checklistStatuses[key] = metadata.checklists[key];
                } else {
                    checklistStatuses[key] = { 
                        hasChecklist: false, 
                        total: 0, 
                        completed: 0, 
                        percentage: 0 
                    };
                }
            });
            
            // Build circular dependencies map
            if (circularDepsResponse.data.circularDependencies) {
                circularDepsResponse.data.circularDependencies.forEach(cd => {
                    circularDependencies[`${cd.item_type}-${cd.item_id}`] = cd.cycle_with;
                });
            }
            
            // Apply circular dependency filter after loading the data
            if (currentFilters.hasCircularDependency) {
                const filteredItems = allItems.filter(item => {
                    const key = `${item.type}-${item.id}`;
                    return circularDependencies && circularDependencies[key];
                });
                // Update allItems reference for rendering
                itemsToDisplay.splice(0, itemsToDisplay.length, ...filteredItems);
            }
        } catch (error) {
            console.error('Error loading bulk metadata:', error);
            // Fallback: initialize with empty values
            allItems.forEach(item => {
                const key = `${item.type}-${item.id}`;
                relationshipCounts[key] = 0;
                commentCounts[key] = 0;
                checklistStatuses[key] = { 
                    hasChecklist: false, 
                    total: 0, 
                    completed: 0, 
                    percentage: 0 
                };
            });
        }
    }
    
    const columns = ["To Do", "In Progress", "Blocked", "Done"];

    columns.forEach((status) => {
        const unsortedItems = allItems.filter((item) => item.status === status);
        const columnId = status.toLowerCase().replace(/ /g, "");
        
        // Get user's sort preference for this column and apply sorting
        const sortMode = getSortPreference(columnId);
        const columnItems = sortItems(unsortedItems, sortMode, columnId);
        
        // Update item count in header
        const countElement = document.getElementById(`${columnId}-count`);
        if (countElement) {
            countElement.textContent = `(${columnItems.length})`;
        }
        
        // Set dropdown to saved preference
        const selectElement = document.querySelector(`.column-sort-select[data-column="${columnId}"]`);
        if (selectElement) {
            selectElement.value = sortMode;
        }
        
        const container = document.getElementById(`${columnId}-column`);

        if (container) {
            // Set minimum height for empty columns
            if (columnItems.length === 0) {
                container.innerHTML = '<div class="text-gray-400 text-sm text-center py-8">Drop items here</div>';
                container.style.minHeight = '100px';
            } else {
                // HIERARCHY: Build tree structure for issues in this column
                let rootItems = columnItems;
                
                // Only build hierarchy for issues (not action items)
                if (currentFilters.type !== 'action' && typeof HierarchyUtils !== 'undefined') {
                    try {
                        // Build tree from items in this column
                        const tree = HierarchyUtils.buildHierarchyTree(columnItems);
                        
                        // Only render root-level items (children are rendered recursively)
                        rootItems = tree.filter(item => !item.parent_issue_id);
                        
                        console.log(`[KANBAN HIERARCHY] Column "${status}": ${columnItems.length} items, ${rootItems.length} roots`);
                    } catch (error) {
                        console.warn('[KANBAN HIERARCHY] Failed to build tree:', error);
                        // Fallback: render all items flat
                        rootItems = columnItems;
                    }
                } else {
                    // No hierarchy for action items, render all
                    rootItems = columnItems;
                }
                
                // Prepare metadata object for rendering
                const metadata = {
                    relationshipCounts,
                    commentCounts,
                    checklistStatuses,
                    circularDependencies
                };
                
                // Render cards with hierarchy support
                container.innerHTML = rootItems
                    .map((item) => renderKanbanCardWithHierarchy(item, metadata, 0))
                    .join("");
                    
                container.style.minHeight = 'auto';
            }
            
            // Add drag and drop event listeners to cards (works for hierarchy cards too)
            container.querySelectorAll('.kanban-card').forEach(card => {
                card.addEventListener('dragstart', handleDragStart);
                card.addEventListener('dragend', handleDragEnd);
                
                // HIERARCHY: Add chevron click handler for expand/collapse
                const chevron = card.querySelector('.hierarchy-chevron');
                if (chevron) {
                    chevron.addEventListener('click', async function(e) {
                        e.stopPropagation();
                        const itemId = parseInt(this.getAttribute('data-item-id'));
                        
                        // Toggle expanded state
                        const currentState = getExpandedState(itemId);
                        saveExpandedState(itemId, !currentState);
                        
                        // Re-render the Kanban board to show/hide children
                        await renderKanbanBoard();
                    });
                }
                
                // Add click handler to open item detail modal
                card.addEventListener('click', async function(e) {
                    // Don't open modal if we just finished dragging
                    if (isDragging) return;
                    
                    // HIERARCHY: Check if clicked on chevron (already handled above)
                    if (e.target.closest('.hierarchy-chevron')) {
                        return;
                    }
                    
                    // Check if clicked on circular dependency link
                    if (e.target.classList.contains('cycle-dep-link')) {
                        e.stopPropagation();
                        const itemType = e.target.dataset.itemType;
                        const itemId = e.target.dataset.itemId;
                        
                        // First open the detail modal to set currentDetailItem
                        await openItemDetailModal(itemId, itemType);
                        
                        // Then immediately open the Dependencies modal
                        setTimeout(() => {
                            showScheduleDependencies();
                        }, 100);
                        
                        return;
                    }
                    
                    // Only open modal if not clicking on the checkbox
                    if (!e.target.classList.contains('item-checkbox')) {
                        const itemId = parseInt(this.getAttribute('data-item-id'));
                        const itemType = this.getAttribute('data-item-type');
                        openItemDetailModal(itemId, itemType);
                    }
                });
            });
            
            // Add drop zone listeners to column (always, even if empty)
            container.addEventListener('dragover', handleDragOver);
            container.addEventListener('drop', handleDrop);
        }
    });
    
    if (currentView === 'table') {
        renderTableView();
    }
    
    if (pendingViewSwitch === 'table') {
        pendingViewSwitch = null;
        switchToTableView();
    }
}

// Drag and drop handlers
let draggedItem = null;
let isDragging = false;

function handleDragStart(e) {
    // Prevent drag from button regions
    if (e.target.closest('button')) {
        e.preventDefault();
        return;
    }
    
    isDragging = true;
    const itemType = e.target.dataset.itemType;
    // Normalize type: 'action' -> 'action-item' for consistency with API endpoints
    const normalizedType = itemType === 'action' ? 'action-item' : itemType;
    
    draggedItem = {
        id: e.target.dataset.itemId,
        type: normalizedType
    };
    e.target.style.opacity = '0.5';
}

function handleDragEnd(e) {
    e.target.style.opacity = '1';
    // Reset dragging flag after a short delay to prevent immediate click
    setTimeout(() => {
        isDragging = false;
    }, 50);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

// Time Tracking Functions
function doesStatusChangeRequireTime(fromStatus, toStatus, item, project) {
    // NEW LOGIC: Only require time for transitions to Done when project/item settings dictate
    // Note: To Do → In Progress no longer requires timesheet entry
    
    // Only check timesheet requirement for transitions to Done
    if (toStatus.toLowerCase() !== 'done') {
        return false;
    }
    
    // Check if timesheet is required based on project setting + item override
    // Override = true: always required
    if (item?.timesheet_required_override === true) {
        return true;
    }
    
    // Override = false: never required
    if (item?.timesheet_required_override === false) {
        return false;
    }
    
    // Override = null/undefined: inherit from project setting
    return project?.timesheet_entry_required || false;
}

async function showTimeEntryModal(item, fromStatus, toStatus) {
    return new Promise((resolve) => {
        const itemName = item.title || 'Item';
        const planningEstimate = item.hybrid_effort_estimate_hours || 
                                item.estimated_effort_hours || 
                                item.ai_effort_estimate_hours || 
                                0;
        const currentActualHours = item.actual_effort_hours || 0;
        
        const modalContent = `
            <h3 class="text-lg font-semibold mb-4">⏱️ Log Time for Status Change</h3>
            <div class="mb-4">
                <p class="text-sm text-gray-600 mb-2">
                    <strong>${itemName}</strong>
                </p>
                <p class="text-sm text-gray-500">
                    Status: <span class="font-medium">${fromStatus}</span> → 
                    <span class="font-medium text-blue-600">${toStatus}</span>
                </p>
            </div>
            
            ${planningEstimate > 0 ? `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <div class="text-sm text-gray-700">
                    <div class="flex justify-between mb-1">
                        <span>Planning Estimate:</span>
                        <span class="font-semibold">${planningEstimate}h</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Actual Hours So Far:</span>
                        <span class="font-semibold">${currentActualHours}h</span>
                    </div>
                    <div class="flex justify-between mt-2 pt-2 border-t border-blue-200">
                        <span>Remaining:</span>
                        <span class="font-semibold text-blue-600">${Math.max(0, planningEstimate - currentActualHours).toFixed(1)}h</span>
                    </div>
                </div>
            </div>
            ` : ''}
            
            <form id="time-entry-form">
                <div class="mb-4">
                    <label class="block text-sm font-medium mb-2">
                        Hours Spent <span class="text-red-500">*</span>
                    </label>
                    <input type="number" 
                           id="hours-input" 
                           step="any" 
                           min="0.01"
                           required 
                           placeholder="Enter hours (e.g., 2, 3.5, 10)..."
                           class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                    <p class="text-xs text-gray-500 mt-1">
                        How many hours did you spend on this work?
                    </p>
                </div>
                
                <div class="mb-6">
                    <label class="block text-sm font-medium mb-2">
                        Notes (optional)
                    </label>
                    <textarea id="time-notes-input" 
                              rows="2"
                              placeholder="What did you work on?"
                              class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"></textarea>
                </div>
                
                <div class="flex justify-end space-x-3">
                    <button type="button" 
                            id="cancel-time-btn" 
                            class="px-4 py-2 text-gray-600 border rounded hover:bg-gray-50">
                        Cancel
                    </button>
                    <button type="submit" 
                            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        Log Time & Update Status
                    </button>
                </div>
            </form>
        `;
        
        showModal(modalContent);
        
        // Focus on hours input
        setTimeout(() => {
            document.getElementById('hours-input')?.focus();
        }, 100);
        
        // Cancel button
        document.getElementById('cancel-time-btn').addEventListener('click', () => {
            hideModal();
            resolve(null);
        });
        
        // Form submit
        document.getElementById('time-entry-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const hours = parseFloat(document.getElementById('hours-input').value);
            const notes = document.getElementById('time-notes-input').value.trim();
            
            if (hours <= 0 || isNaN(hours)) {
                showErrorMessage('Please enter a valid number of hours');
                return;
            }
            
            hideModal();
            resolve({ hours, notes });
        });
    });
}

async function updateItemStatusWithTime(draggedItem, newStatus, timeData) {
    try {
        const endpoint = draggedItem.type === 'action-item' 
            ? `/api/action-items/${draggedItem.id}`
            : `/api/issues/${draggedItem.id}`;
        
        const payload = {
            status: newStatus,
            actual_hours_added: timeData.hours
        };
        
        if (timeData.notes) {
            payload.time_notes = timeData.notes;
        }
        
        const response = await axios.patch(endpoint, payload);
        
        // Update local data with response
        if (draggedItem.type === 'action-item') {
            const item = actionItems.find(i => i.id == draggedItem.id);
            if (item) {
                item.status = newStatus;
                item.actual_effort_hours = response.data.actual_effort_hours;
                item.completion_percentage = response.data.completion_percentage;
            }
        } else {
            const item = issues.find(i => i.id == draggedItem.id);
            if (item) {
                item.status = newStatus;
                item.actual_effort_hours = response.data.actual_effort_hours;
                item.completion_percentage = response.data.completion_percentage;
            }
        }
        
        renderKanbanBoard();
        
        // Show success message with time tracking info
        const timeTracking = response.data.timeTracking;
        const actualHours = response.data.actual_effort_hours || timeTracking?.actualHours;
        const completionPercent = response.data.completion_percentage || timeTracking?.completionPercent;
        
        if (actualHours !== undefined && actualHours !== null) {
            const message = `Status updated! ${actualHours}h logged${completionPercent !== undefined ? ` (${completionPercent}% complete)` : ''}`;
            showSuccessMessage(message);
            
            if (timeTracking?.warning) {
                setTimeout(() => {
                    showWarningMessage(timeTracking.warning);
                }, 2000);
            }
        } else {
            showSuccessMessage(`Status updated! ${timeData.hours}h logged`);
        }
        
    } catch (error) {
        console.error('Error updating status with time:', error);
        
        if (error.response?.data?.message) {
            showErrorMessage(error.response.data.message);
        } else {
            showErrorMessage('Failed to update status');
        }
    }
}

// Helper function to show loading state on a card
function showCardLoadingState(itemId, itemType) {
    const cardElement = document.querySelector(`[data-item-id="${itemId}"][data-item-type="${itemType}"]`);
    if (cardElement) {
        // Add loading class and spinner
        cardElement.classList.add('kanban-card-updating');
        cardElement.style.opacity = '0.6';
        cardElement.style.pointerEvents = 'none';
        
        // Add loading spinner overlay
        const spinner = document.createElement('div');
        spinner.className = 'card-loading-spinner';
        spinner.innerHTML = `
            <div class="flex items-center justify-center gap-2 text-sm text-blue-600 font-medium">
                <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Updating...</span>
            </div>
        `;
        cardElement.appendChild(spinner);
    }
}

// Helper function to clear loading state
function clearCardLoadingState(itemId, itemType) {
    const cardElement = document.querySelector(`[data-item-id="${itemId}"][data-item-type="${itemType}"]`);
    if (cardElement) {
        cardElement.classList.remove('kanban-card-updating');
        cardElement.style.opacity = '1';
        cardElement.style.pointerEvents = 'auto';
        
        const spinner = cardElement.querySelector('.card-loading-spinner');
        if (spinner) {
            spinner.remove();
        }
    }
}

async function handleDrop(e) {
    e.preventDefault();
    
    if (!draggedItem) return;
    
    // Get the target column's status
    const columnElement = e.currentTarget;
    const columnId = columnElement.id;
    
    const statusMap = {
        'todo-column': 'To Do',
        'inprogress-column': 'In Progress',
        'blocked-column': 'Blocked',
        'done-column': 'Done'
    };
    
    const newStatus = statusMap[columnId];
    
    if (!newStatus) return;
    
    // Get current item to check its status
    const currentItem = draggedItem.type === 'action-item' 
        ? actionItems.find(i => i.id == draggedItem.id)
        : issues.find(i => i.id == draggedItem.id);
    
    const currentStatus = currentItem?.status || 'To Do';
    
    // Validate status change (check for incomplete checklists when moving to Done)
    const canProceed = await validateStatusChange(draggedItem.id, draggedItem.type, newStatus);
    
    if (!canProceed) {
        // User cancelled - reset dragged item and card opacity
        draggedItem = null;
        document.querySelectorAll('.kanban-card').forEach(card => {
            card.style.opacity = '1';
        });
        return;
    }
    
    // Show loading state on the card
    showCardLoadingState(draggedItem.id, draggedItem.type);
    
    // Check if this status change requires time entry (based on project/item settings)
    const requiresTime = doesStatusChangeRequireTime(currentStatus, newStatus, currentItem, currentProject);
    
    if (requiresTime) {
        // Clear loading state before showing modal
        clearCardLoadingState(draggedItem.id, draggedItem.type);
        
        // Show time entry modal
        const timeData = await showTimeEntryModal(currentItem, currentStatus, newStatus);
        
        if (!timeData) {
            // User cancelled - reset state
            draggedItem = null;
            document.querySelectorAll('.kanban-card').forEach(card => {
                card.style.opacity = '1';
            });
            return;
        }
        
        // Show loading state again before API call
        showCardLoadingState(draggedItem.id, draggedItem.type);
        
        // Update status with time tracking
        await updateItemStatusWithTime(draggedItem, newStatus, timeData);
        
        // Clear loading state after completion
        clearCardLoadingState(draggedItem.id, draggedItem.type);
    } else {
        // Simple status update without time tracking
        try {
            const endpoint = draggedItem.type === 'action-item' 
                ? `/api/action-items/${draggedItem.id}`
                : `/api/issues/${draggedItem.id}`;
            
            await axios.patch(endpoint, { status: newStatus });
            
            // Update local data
            if (draggedItem.type === 'action-item') {
                const item = actionItems.find(i => i.id == draggedItem.id);
                if (item) item.status = newStatus;
            } else {
                const item = issues.find(i => i.id == draggedItem.id);
                if (item) item.status = newStatus;
            }
            
            // Clear loading state
            clearCardLoadingState(draggedItem.id, draggedItem.type);
            
            renderKanbanBoard();
            showSuccessMessage('Status updated successfully!');
        } catch (error) {
            console.error('Error updating status:', error);
            
            // Check if this is a timesheet requirement error
            if (error.response?.data?.requiresHours || error.response?.data?.timesheetRequired) {
                // Clear loading before showing modal
                clearCardLoadingState(draggedItem.id, draggedItem.type);
                
                // Backend requires timesheet entry - show time entry modal as recovery
                const timeData = await showTimeEntryModal(currentItem, currentStatus, newStatus);
                
                if (timeData) {
                    // Show loading again for retry
                    showCardLoadingState(draggedItem.id, draggedItem.type);
                    
                    // Retry with time tracking
                    await updateItemStatusWithTime(draggedItem, newStatus, timeData);
                    
                    // Clear loading after retry
                    clearCardLoadingState(draggedItem.id, draggedItem.type);
                } else {
                    // User cancelled - reset state
                    draggedItem = null;
                    document.querySelectorAll('.kanban-card').forEach(card => {
                        card.style.opacity = '1';
                    });
                }
            } else {
                // Generic error - clear loading and show error message
                clearCardLoadingState(draggedItem.id, draggedItem.type);
                showErrorMessage(error.response?.data?.message || 'Failed to update status');
            }
        }
    }
    
    draggedItem = null;
    
    // Reset opacity for all cards
    document.querySelectorAll('.kanban-card').forEach(card => {
        card.style.opacity = '1';
    });
}

// Utility functions
function getBorderColor(priority) {
    const colors = {
        critical: "border-red-500",
        high: "border-orange-500",
        medium: "border-yellow-500",
        low: "border-green-500",
    };
    return colors[priority.toLowerCase()] || colors["medium"];
}

function getTextColor(type) {
    return type === "issue" ? "text-red-600" : "text-purple-600";
}

// Modal functions
function showCreateProject() {
    if (!AuthManager.canCreateProject()) {
        AuthManager.showNotification('Insufficient permissions - Project Manager role required', 'error');
        return;
    }
    
    const modalContent = `
        <h3 class="text-lg font-semibold mb-4">Create New Project</h3>
        <form id="create-project-form">
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Project Name</label>
                <input type="text" id="project-name" required 
                       class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Description</label>
                <textarea id="project-description" rows="3"
                          class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"></textarea>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Template</label>
                <select id="project-template" 
                        class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                    <option value="generic">Generic Project</option>
                    <option value="cloud-migration">Cloud Migration</option>
                    <option value="software-development">Software Development</option>
                    <option value="infrastructure">Infrastructure</option>
                </select>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Complexity Level</label>
                <select id="project-complexity" class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                    <option value="standard">Standard (5 file uploads)</option>
                    <option value="complex">Complex (10 file uploads)</option>
                    <option value="enterprise">Enterprise (20 file uploads)</option>
                </select>
                <p class="text-xs text-gray-500 mt-1">Determines maximum file attachments allowed per item</p>
            </div>
            <div class="flex justify-end space-x-3">
                <button type="button" id="cancel-btn" 
                        class="px-4 py-2 text-gray-600 border rounded hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Create Project
                </button>
            </div>
        </form>
    `;
    showModal(modalContent);

    // Add event listeners for the modal
    document.getElementById("cancel-btn").addEventListener("click", hideModal);
    document
        .getElementById("create-project-form")
        .addEventListener("submit", createProject);
}

async function createProject(event) {
    event.preventDefault();

    const projectData = {
        name: document.getElementById("project-name").value,
        description: document.getElementById("project-description").value,
        template: document.getElementById("project-template").value,
        complexity_level: document.getElementById("project-complexity").value,
    };

    try {
        const response = await axios.post("/api/projects", projectData);
        projects.push(response.data);
        renderProjects();
        hideModal();

        selectProject(response.data.id);
    } catch (error) {
        console.error("Error creating project:", error);
        alert("Error creating project. Please try again.");
    }
}

function showModal(content) {
    document.getElementById("modal-content").innerHTML = content;
    document.getElementById("modal-overlay").classList.remove("hidden");
}

function hideModal() {
    document.getElementById("modal-overlay").classList.add("hidden");
}

function showErrorMessage(message) {
    console.error(message);
}

// Welcome message
function showWelcomeMessage() {
    const container = document.getElementById("projects-list");
    container.innerHTML = `
        <div class="col-span-3 bg-blue-50 rounded-lg p-8 text-center">
            <div class="max-w-md mx-auto">
                <h3 class="text-xl font-semibold text-blue-900 mb-4">Welcome to Multi-Project Tracker!</h3>
                <p class="text-blue-700 mb-6">
                    Get started by creating your first project. Choose from templates like:
                </p>
                <div class="grid grid-cols-2 gap-4 mb-6 text-sm">
                    <div class="bg-white rounded p-3 border border-blue-200">
                        <strong>Cloud Migration</strong><br>
                        Perfect for the S4Carlisle project
                    </div>
                    <div class="bg-white rounded p-3 border border-blue-200">
                        <strong>Software Development</strong><br>
                        Agile development projects
                    </div>
                    <div class="bg-white rounded p-3 border border-blue-200">
                        <strong>Infrastructure</strong><br>
                        IT infrastructure projects
                    </div>
                    <div class="bg-white rounded p-3 border border-blue-200">
                        <strong>Generic</strong><br>
                        Customizable for any project
                    </div>
                </div>
                <button id="welcome-create-btn" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium">
                    Create Your First Project
                </button>
            </div>
        </div>
    `;

    // Add event listener to welcome button
    document
        .getElementById("welcome-create-btn")
        .addEventListener("click", showCreateProject);
}

// Issue creation functions
function showCreateIssue() {
    if (!currentProject) {
        alert('Please select a project first');
        return;
    }
    
    const modalContent = `
        <h3 class="text-lg font-semibold mb-4">Create New Issue</h3>
        <form id="create-issue-form">
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Issue Title *</label>
                <input type="text" id="issue-title" required 
                       class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                       placeholder="Brief description of the issue">
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Description</label>
                <textarea id="issue-description" rows="4"
                          class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                          placeholder="Detailed description of the issue"></textarea>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium mb-2">Priority</label>
                    <select id="issue-priority" 
                            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                        <option value="low">Low</option>
                        <option value="medium" selected>Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Category</label>
                    <select id="issue-category" 
                            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                        ${generateCategoryOptions()}
                    </select>
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium mb-2">Phase</label>
                    <select id="issue-phase" 
                            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                        ${generatePhaseOptions()}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Component</label>
                    <select id="issue-component" 
                            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                        ${generateComponentOptions()}
                    </select>
                </div>
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Assigned To</label>
                <select id="issue-assignee" 
                        class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                    ${generateAssigneeOptions()}
                </select>
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Due Date</label>
                <input type="date" id="issue-due-date"
                       class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Tags</label>
                <select id="issue-tags" multiple
                        class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                        style="min-height: 100px;">
                    <option value="" disabled>Loading tags...</option>
                </select>
                <small class="text-gray-500">Hold Ctrl/Cmd to select multiple tags</small>
            </div>
            
            <div class="flex justify-end space-x-3">
                <button type="button" id="cancel-issue-btn" 
                        class="px-4 py-2 text-gray-600 border rounded hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                    Create Issue
                </button>
            </div>
        </form>
    `;
    
    showModal(modalContent);
    
    // Load tags for issues/actions (tag_type: 'issue_action' or 'both')
    loadTagsForIssues();
    
    // Add event listeners
    document.getElementById('cancel-issue-btn').addEventListener('click', hideModal);
    document.getElementById('create-issue-form').addEventListener('submit', createIssue);
}

// Load tags for issues/actions (tag_type: 'issue_action' or 'both')
async function loadTagsForIssues() {
    try {
        const response = await fetch(`/api/projects/${currentProject.id}/tags`);
        if (!response.ok) throw new Error('Failed to fetch tags');
        
        const allTags = await response.json();
        
        // Filter tags for issues/actions: 'issue_action' or 'both'
        const filteredTags = allTags.filter(tag => 
            tag.tag_type === 'issue_action' || tag.tag_type === 'both'
        );
        
        const tagSelect = document.getElementById('issue-tags');
        if (filteredTags.length === 0) {
            tagSelect.innerHTML = '<option value="" disabled>No tags available</option>';
        } else {
            tagSelect.innerHTML = filteredTags.map(tag => 
                `<option value="${tag.id}" style="background-color: ${tag.color}20; color: #000;">
                    ${tag.name}
                </option>`
            ).join('');
        }
    } catch (error) {
        console.error('Error loading tags:', error);
        const tagSelect = document.getElementById('issue-tags');
        tagSelect.innerHTML = '<option value="" disabled>Error loading tags</option>';
    }
}

// Load tags for action items (same as issues: tag_type: 'issue_action' or 'both')
async function loadTagsForActionItems() {
    try {
        const response = await fetch(`/api/projects/${currentProject.id}/tags`);
        if (!response.ok) throw new Error('Failed to fetch tags');
        
        const allTags = await response.json();
        
        // Filter tags for issues/actions: 'issue_action' or 'both'
        const filteredTags = allTags.filter(tag => 
            tag.tag_type === 'issue_action' || tag.tag_type === 'both'
        );
        
        const tagSelect = document.getElementById('action-item-tags');
        if (filteredTags.length === 0) {
            tagSelect.innerHTML = '<option value="" disabled>No tags available</option>';
        } else {
            tagSelect.innerHTML = filteredTags.map(tag => 
                `<option value="${tag.id}" style="background-color: ${tag.color}20; color: #000;">
                    ${tag.name}
                </option>`
            ).join('');
        }
    } catch (error) {
        console.error('Error loading tags:', error);
        const tagSelect = document.getElementById('action-item-tags');
        tagSelect.innerHTML = '<option value="" disabled>Error loading tags</option>';
    }
}

// Helper functions for dynamic dropdowns
function generateCategoryOptions() {
    if (!currentProject || !currentProject.categories || currentProject.categories.length === 0) {
        return '<option value="General">General</option><option value="Bug">Bug</option><option value="Feature">Feature</option><option value="Task">Task</option>';
    }
    
    return currentProject.categories.map(category => 
        `<option value="${category}">${category}</option>`
    ).join('');
}

function generatePhaseOptions() {
    if (!currentProject || !currentProject.phases || currentProject.phases.length === 0) {
        return '<option value="Planning">Planning</option><option value="Development">Development</option><option value="Testing">Testing</option><option value="Deployment">Deployment</option>';
    }
    
    return currentProject.phases.map(phase => 
        `<option value="${phase}">${phase}</option>`
    ).join('');
}

function generateComponentOptions() {
    if (!currentProject || !currentProject.components || currentProject.components.length === 0) {
        return '<option value="General">General</option><option value="Frontend">Frontend</option><option value="Backend">Backend</option><option value="Database">Database</option>';
    }
    
    return currentProject.components.map(component => 
        `<option value="${component}">${component}</option>`
    ).join('');
}

function generateAssigneeOptions() {
    let options = '<option value="">Unassigned</option>';
    
    if (teamMembers && teamMembers.length > 0) {
        options += teamMembers.map(member => 
            `<option value="${member.name}">${member.name} (${member.email})</option>`
        ).join('');
    }
    
    return options;
}

// Create issue function
async function createIssue(event) {
    event.preventDefault();
    
    const issueData = {
        title: document.getElementById('issue-title').value,
        description: document.getElementById('issue-description').value,
        priority: document.getElementById('issue-priority').value,
        category: document.getElementById('issue-category').value,
        phase: document.getElementById('issue-phase').value,
        component: document.getElementById('issue-component').value,
        assignee: document.getElementById('issue-assignee').value.trim(),
        dueDate: document.getElementById('issue-due-date').value,
        projectId: currentProject.id,
        type: 'issue',
        status: 'To Do'
    };
    
    // Get selected tag IDs
    const tagSelect = document.getElementById('issue-tags');
    const selectedTagIds = Array.from(tagSelect.selectedOptions).map(option => parseInt(option.value));
    
    try {
        const response = await fetch('/api/issues', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(issueData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const newIssue = await response.json();
        
        // Assign tags to the new issue
        if (selectedTagIds.length > 0) {
            await fetch(`/api/issues/${newIssue.id}/tags`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tagIds: selectedTagIds })
            });
        }
        
        issues.push(newIssue);
        renderKanbanBoard();
        hideModal();
        
        // Show success message
        showSuccessMessage(`Issue "${newIssue.title}" created successfully!`);
        
    } catch (error) {
        console.error('Error creating issue:', error);
        alert('Error creating issue. Please try again.');
    }
}

// Add success message function
function showSuccessMessage(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50';
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

function showCreateActionItem() {
    if (!currentProject) {
        alert('Please select a project first');
        return;
    }
    
    const modalContent = `
        <h3 class="text-lg font-semibold mb-4">Create New Action Item</h3>
        <form id="create-action-item-form">
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Action Item Title *</label>
                <input type="text" id="action-item-title" required 
                       class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                       placeholder="Brief description of the action item">
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Description</label>
                <textarea id="action-item-description" rows="4"
                          class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                          placeholder="Detailed description of the action item"></textarea>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium mb-2">Priority</label>
                    <select id="action-item-priority" 
                            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                        <option value="low">Low</option>
                        <option value="medium" selected>Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Status</label>
                    <select id="action-item-status" 
                            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                        <option value="To Do" selected>To Do</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Done">Done</option>
                    </select>
                </div>
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Assigned To</label>
                <select id="action-item-assignee" 
                        class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                    ${generateAssigneeOptions()}
                </select>
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Due Date</label>
                <input type="date" id="action-item-due-date"
                       class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Tags</label>
                <select id="action-item-tags" multiple
                        class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                        style="min-height: 100px;">
                    <option value="" disabled>Loading tags...</option>
                </select>
                <small class="text-gray-500">Hold Ctrl/Cmd to select multiple tags</small>
            </div>
            
            <div class="flex justify-end space-x-3">
                <button type="button" id="cancel-action-item-btn" 
                        class="px-4 py-2 text-gray-600 border rounded hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                    Create Action Item
                </button>
            </div>
        </form>
    `;
    
    showModal(modalContent);
    
    // Load tags for action items (same as issues: 'issue_action' or 'both')
    loadTagsForActionItems();
    
    // Add event listeners
    document.getElementById('cancel-action-item-btn').addEventListener('click', hideModal);
    document.getElementById('create-action-item-form').addEventListener('submit', createActionItem);
}

// Create action item function
async function createActionItem(event) {
    event.preventDefault();
    
    const actionItemData = {
        title: document.getElementById('action-item-title').value,
        description: document.getElementById('action-item-description').value,
        priority: document.getElementById('action-item-priority').value,
        status: document.getElementById('action-item-status').value,
        assignee: document.getElementById('action-item-assignee').value.trim(),
        dueDate: document.getElementById('action-item-due-date').value,
        projectId: currentProject.id,
        type: 'action-item'
    };
    
    // Get selected tag IDs
    const tagSelect = document.getElementById('action-item-tags');
    const selectedTagIds = Array.from(tagSelect.selectedOptions).map(option => parseInt(option.value));
    
    try {
        const response = await fetch('/api/action-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(actionItemData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const newActionItem = await response.json();
        
        // Assign tags to the new action item
        if (selectedTagIds.length > 0) {
            await fetch(`/api/action-items/${newActionItem.id}/tags`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ tagIds: selectedTagIds })
            });
        }
        
        hideModal();
        
        // Show success message
        showSuccessMessage(`Action Item "${newActionItem.title}" created successfully!`);
        
        // Refresh the current view if needed
        if (currentProject) {
            await loadProjects();
        }
        
    } catch (error) {
        console.error('Error creating action item:', error);
        alert('Error creating action item. Please try again.');
    }
}

// ============= AUTHENTICATION FUNCTIONS =============

// Show login modal
function showLogin() {
    const content = `
        <h3 class="text-lg font-semibold mb-4">Login</h3>
        <form id="login-form">
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Email</label>
                <input type="email" id="login-email" required
                    class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Password</label>
                <input type="password" id="login-password" required
                    class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="flex space-x-2">
                <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    Login
                </button>
                <button type="button" class="modal-cancel-btn flex-1 bg-gray-300 px-4 py-2 rounded-lg hover:bg-gray-400">
                    Cancel
                </button>
            </div>
        </form>
    `;
    showModal(content);
    
    // Add event listener after modal is shown
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
}

// Handle login
async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    const success = await AuthManager.login(email, password);
    if (success) {
        hideModal();
        await loadProjects();
    }
}

// Show register modal
function showRegister() {
    const content = `
        <h3 class="text-lg font-semibold mb-4">Register</h3>
        <form id="register-form">
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Name</label>
                <input type="text" id="register-name" required
                    class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Email</label>
                <input type="email" id="register-email" required
                    class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Password</label>
                <input type="password" id="register-password" required
                    class="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <div class="flex space-x-2">
                <button type="submit" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    Register
                </button>
                <button type="button" class="modal-cancel-btn flex-1 bg-gray-300 px-4 py-2 rounded-lg hover:bg-gray-400">
                    Cancel
                </button>
            </div>
        </form>
    `;
    showModal(content);
    
    // Add event listener after modal is shown
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
}

// Handle register
async function handleRegister(event) {
    event.preventDefault();
    const username = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    const success = await AuthManager.register(username, email, password);
    if (success) {
        hideModal();
        await loadProjects();
    }
}

// Show user management modal (admin only)
async function showUserManagement() {
    if (!AuthManager.canManageUsers()) {
        AuthManager.showNotification('Admin access required', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/users', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to fetch users');
        
        const users = await response.json();
        
        const content = `
            <h3 class="text-lg font-semibold mb-4">User Management</h3>
            <div class="space-y-2 max-h-96 overflow-y-auto">
                ${users.map(user => `
                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
                        <div class="flex-1">
                            <p class="font-medium">${user.username}</p>
                            <p class="text-sm text-gray-600">${user.email}</p>
                        </div>
                        <div class="flex items-center space-x-2">
                            <select 
                                id="role-${user.id}" 
                                class="border rounded px-2 py-1 text-sm"
                                ${user.id === AuthManager.currentUser.id ? 'disabled' : ''}
                            >
                                ${Object.keys(AuthManager.roleHierarchy).map(role => `
                                    <option value="${role}" ${user.role === role ? 'selected' : ''}>
                                        ${role}
                                    </option>
                                `).join('')}
                            </select>
                            <button 
                                data-user-id="${user.id}"
                                class="update-role-btn bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                                ${user.id === AuthManager.currentUser.id ? 'disabled' : ''}
                            >
                                Update
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="mt-4 flex justify-end">
                <button class="modal-cancel-btn bg-gray-300 px-4 py-2 rounded-lg hover:bg-gray-400">
                    Close
                </button>
            </div>
        `;
        
        showModal(content);
    } catch (error) {
        console.error('Error loading users:', error);
        AuthManager.showNotification('Failed to load users', 'error');
    }
}

// Update user role
async function updateUserRole(userId) {
    const roleSelect = document.getElementById(`role-${userId}`);
    const newRole = roleSelect.value;
    
    try {
        const response = await fetch(`/api/users/${userId}/role`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ role: newRole })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update role');
        }
        
        AuthManager.showNotification('User role updated successfully', 'success');
    } catch (error) {
        console.error('Error updating role:', error);
        AuthManager.showNotification(error.message, 'error');
    }
}

// ============= FILTER FUNCTIONS =============

// Initialize filter listeners
function initializeFilters() {
  // Search input with debouncing
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      currentFilters.search = e.target.value;
      applyFilters();
      updateURL();
    }, 300));
  }
  
  // Type filter
  const typeFilter = document.getElementById('type-filter');
  if (typeFilter) {
    typeFilter.addEventListener('change', (e) => {
      currentFilters.type = e.target.value;
      applyFilters();
      updateURL();
    });
  }
  
  // Status filter
  const statusFilter = document.getElementById('status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      currentFilters.status = e.target.value;
      displayActiveFilters();
      applyFilters();
      updateURL();
    });
  }
  
  // Priority filter
  const priorityFilter = document.getElementById('priority-filter');
  if (priorityFilter) {
    priorityFilter.addEventListener('change', (e) => {
      currentFilters.priority = e.target.value;
      displayActiveFilters();
      applyFilters();
      updateURL();
    });
  }
  
  // Assignee filter
  const assigneeFilter = document.getElementById('assignee-filter');
  if (assigneeFilter) {
    assigneeFilter.addEventListener('change', (e) => {
      currentFilters.assignee = e.target.value;
      applyFilters();
      updateURL();
    });
  }
  
  // Tag filter
  const tagFilter = document.getElementById('tag-filter');
  if (tagFilter) {
    tagFilter.addEventListener('change', (e) => {
      currentFilters.tag = e.target.value;
      applyFilters();
      updateURL();
    });
  }
  
  // Planning estimate filter
  const hasPlanningFilter = document.getElementById('has-planning-filter');
  if (hasPlanningFilter) {
    hasPlanningFilter.addEventListener('change', (e) => {
      currentFilters.hasPlanning = e.target.checked;
      displayActiveFilters();
      applyFilters();
      updateURL();
    });
  }
  
  // Circular dependency filter
  const hasCircularDepFilter = document.getElementById('has-circular-dependency-filter');
  if (hasCircularDepFilter) {
    hasCircularDepFilter.addEventListener('change', (e) => {
      currentFilters.hasCircularDependency = e.target.checked;
      displayActiveFilters();
      applyFilters();
      updateURL();
    });
  }
  
  // Clear filters button
  const clearBtn = document.getElementById('clear-filters-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearAllFilters);
  }
  
  // Sort dropdowns for Kanban columns
  document.querySelectorAll('.column-sort-select').forEach(select => {
    select.addEventListener('change', function() {
      handleSortChange(this);
    });
  });
  
  // Load filters from URL on page load
  loadFiltersFromURL();
  
  // Populate assignee and tag dropdowns
  populateAssigneeFilter();
  populateTagFilter();
}

// Debounce helper for performance optimization
let filterDebounceTimeout = null;

// Apply filters - reload data with filter params
async function applyFilters() {
  if (!currentProject) return;
  
  // Show loading indicator
  showLoadingIndicator();
  
  await loadProjectData(currentProject.id);
  displayActiveFilters();
  
  // Hide loading indicator
  hideLoadingIndicator();
}

// Debounced filter application for better performance
function applyFiltersDebounced(delay = 300) {
  clearTimeout(filterDebounceTimeout);
  filterDebounceTimeout = setTimeout(() => {
    applyFilters();
  }, delay);
}

// Loading indicator helpers
function showLoadingIndicator() {
  const indicator = document.getElementById('loading-indicator');
  if (indicator) {
    indicator.classList.remove('hidden');
  }
}

function hideLoadingIndicator() {
  const indicator = document.getElementById('loading-indicator');
  if (indicator) {
    indicator.classList.add('hidden');
  }
}

// Clear all filters and reset to defaults
function clearAllFilters() {
  currentFilters = {
    search: '',
    type: '',
    status: '',
    priority: '',
    assignee: '',
    category: '',
    tag: '',
    hasPlanning: false,
    hasCircularDependency: false
  };
  
  // Reset form inputs
  const searchInput = document.getElementById('search-input');
  const typeFilter = document.getElementById('type-filter');
  const statusFilter = document.getElementById('status-filter');
  const priorityFilter = document.getElementById('priority-filter');
  const assigneeFilter = document.getElementById('assignee-filter');
  const tagFilter = document.getElementById('tag-filter');
  const hasPlanningFilter = document.getElementById('has-planning-filter');
  const hasCircularDepFilter = document.getElementById('has-circular-dependency-filter');
  
  if (searchInput) searchInput.value = '';
  if (typeFilter) typeFilter.value = '';
  if (statusFilter) statusFilter.value = '';
  if (priorityFilter) priorityFilter.value = '';
  if (assigneeFilter) assigneeFilter.value = '';
  if (tagFilter) tagFilter.value = '';
  if (hasPlanningFilter) hasPlanningFilter.checked = false;
  if (hasCircularDepFilter) hasCircularDepFilter.checked = false;
  
  // Hide filter restored indicator if present
  closeFilterIndicator();
  
  // Reload data
  applyFilters();
  updateURL();
  
  // Hide active filters display
  const activeFiltersDiv = document.getElementById('active-filters');
  const resultsCountDiv = document.getElementById('results-count');
  
  if (activeFiltersDiv) activeFiltersDiv.classList.add('hidden');
  if (resultsCountDiv) resultsCountDiv.classList.add('hidden');
  
  // Show success message
  showToast('Filters reset to defaults', 'success');
}

// Display active filters as badges
function displayActiveFilters() {
  const container = document.getElementById('active-filters');
  if (!container) return;
  
  const activeFilters = [];
  
  if (currentFilters.search) {
    activeFilters.push({ key: 'search', label: `Search: "${currentFilters.search}"` });
  }
  if (currentFilters.type) {
    const typeLabel = currentFilters.type === 'issue' ? 'Issues Only' : 'Action Items Only';
    activeFilters.push({ key: 'type', label: `Type: ${typeLabel}` });
  }
  if (currentFilters.status) {
    const statusLabels = {
      'todo': 'To Do',
      'inprogress': 'In Progress',
      'blocked': 'Blocked',
      'done': 'Done'
    };
    const statusLabel = statusLabels[currentFilters.status] || currentFilters.status;
    activeFilters.push({ key: 'status', label: `Status: ${statusLabel}` });
  }
  if (currentFilters.priority) {
    const priorityLabel = currentFilters.priority.charAt(0).toUpperCase() + currentFilters.priority.slice(1);
    activeFilters.push({ key: 'priority', label: `Priority: ${priorityLabel}` });
  }
  if (currentFilters.assignee) {
    activeFilters.push({ key: 'assignee', label: `Assignee: ${currentFilters.assignee}` });
  }
  if (currentFilters.category) {
    activeFilters.push({ key: 'category', label: `Category: ${currentFilters.category}` });
  }
  if (currentFilters.tag) {
    const tagSelect = document.getElementById('tag-filter');
    const tagName = tagSelect?.selectedOptions[0]?.text?.replace('🏷️ ', '') || currentFilters.tag;
    activeFilters.push({ key: 'tag', label: `Tag: ${tagName}` });
  }
  if (currentFilters.hasPlanning) {
    activeFilters.push({ key: 'hasPlanning', label: '📊 Has Planning Estimate' });
  }
  if (currentFilters.hasCircularDependency) {
    activeFilters.push({ key: 'hasCircularDependency', label: '⚠️ Circular Dependency' });
  }
  
  if (activeFilters.length === 0) {
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  container.innerHTML = activeFilters.map(filter => `
    <span class="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
      ${filter.label}
      <button 
        data-remove-filter="${filter.key}"
        class="ml-2 text-blue-600 hover:text-blue-800"
      >
        ×
      </button>
    </span>
  `).join('');
  
  // Add event listeners for remove buttons
  container.querySelectorAll('[data-remove-filter]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeFilter(btn.getAttribute('data-remove-filter'));
    });
  });
}

// Remove a single filter
async function removeFilter(filterKey) {
  if (filterKey === 'hasPlanning') {
    currentFilters[filterKey] = false;
    const checkbox = document.getElementById('has-planning-filter');
    if (checkbox) checkbox.checked = false;
  } else if (filterKey === 'hasCircularDependency') {
    currentFilters[filterKey] = false;
    const checkbox = document.getElementById('has-circular-dependency-filter');
    if (checkbox) checkbox.checked = false;
  } else {
    currentFilters[filterKey] = '';
    
    // Update UI
    if (filterKey === 'search') {
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.value = '';
    } else {
      const filterElement = document.getElementById(`${filterKey}-filter`);
      if (filterElement) filterElement.value = '';
    }
  }
  
  // Apply filters and wait for completion to ensure consistent state
  await applyFilters();
  updateURL();
}

// Display results count
function displayResultsCount() {
  const container = document.getElementById('results-count');
  if (!container) return;
  
  const totalItems = issues.length + actionItems.length;
  
  if (totalItems === 0 || Object.values(currentFilters).every(v => !v)) {
    container.classList.add('hidden');
    return;
  }
  
  container.classList.remove('hidden');
  container.textContent = `Found ${totalItems} item${totalItems !== 1 ? 's' : ''}`;
}

// Populate assignee filter with unique assignees
function populateAssigneeFilter() {
  const select = document.getElementById('assignee-filter');
  if (!select) return;
  
  // Save current selection
  const currentSelection = select.value;
  
  // Get unique assignees from issues and action items (trim to prevent duplicates)
  const assignees = new Set();
  [...issues, ...actionItems].forEach(item => {
    if (item.assignee && item.assignee.trim()) {
      assignees.add(item.assignee.trim());
    }
  });
  
  // Add assignee options (keep existing options)
  const assigneeOptions = Array.from(assignees)
    .sort()
    .map(assignee => `<option value="${assignee}">${assignee}</option>`)
    .join('');
  
  // Keep "All Assignees" and "Unassigned" options at the top
  select.innerHTML = `
    <option value="">All Assignees</option>
    <option value="Unassigned">Unassigned</option>
    ${assigneeOptions}
  `;
}

// Populate tag filter dropdown
async function populateTagFilter() {
  const select = document.getElementById('tag-filter');
  if (!select || !currentProject) return;
  
  try {
    // Save current selection
    const currentSelection = select.value;
    
    // Get all tags from the current project's items
    const tagSet = new Map(); // Use Map to store tag id and name
    
    [...issues, ...actionItems].forEach(item => {
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.forEach(tag => {
          if (tag && tag.id && tag.name) {
            tagSet.set(tag.id, tag.name);
          }
        });
      }
    });
    
    // Convert to array and sort by name
    const tags = Array.from(tagSet.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => `<option value="${id}">🏷️ ${escapeHtml(name)}</option>`)
      .join('');
    
    select.innerHTML = `
      <option value="">All Tags</option>
      ${tags}
    `;
    
    // Restore previous selection if it still exists
    if (currentSelection && select.querySelector(`option[value="${currentSelection}"]`)) {
      select.value = currentSelection;
    }
  } catch (error) {
    console.error('Error populating tag filter:', error);
  }
}

// Update URL with current filters (for shareable links)
function updateURL(additionalParams = {}) {
  if (!currentProject) return;
  
  const params = new URLSearchParams();
  params.set('project', currentProject.id);
  
  if (currentFilters.search) params.set('search', currentFilters.search);
  if (currentFilters.type) params.set('type', currentFilters.type);
  if (currentFilters.status) params.set('status', currentFilters.status);
  if (currentFilters.priority) params.set('priority', currentFilters.priority);
  if (currentFilters.assignee) params.set('assignee', currentFilters.assignee);
  if (currentFilters.category) params.set('category', currentFilters.category);
  if (currentFilters.tag) params.set('tag', currentFilters.tag);
  if (currentFilters.hasPlanning) params.set('hasPlanning', 'true');
  if (currentFilters.hasCircularDependency) params.set('hasCircularDependency', 'true');
  
  // Preserve view parameter if present
  const currentParams = new URLSearchParams(window.location.search);
  const view = currentParams.get('view');
  if (view) params.set('view', view);
  
  // Add any additional parameters
  Object.entries(additionalParams).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  
  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newURL);
}

// Load filters from URL on page load
function loadFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);
  
  currentFilters.search = params.get('search') || '';
  currentFilters.type = params.get('type') || '';
  currentFilters.status = params.get('status') || '';
  currentFilters.priority = params.get('priority') || '';
  currentFilters.assignee = params.get('assignee') || '';
  currentFilters.category = params.get('category') || '';
  currentFilters.tag = params.get('tag') || '';
  currentFilters.hasPlanning = params.get('hasPlanning') === 'true';
  currentFilters.hasCircularDependency = params.get('hasCircularDependency') === 'true';
  
  // Update UI for checkboxes
  const hasPlanningFilter = document.getElementById('has-planning-filter');
  if (hasPlanningFilter) {
    hasPlanningFilter.checked = currentFilters.hasPlanning;
  }
  const hasCircularDepFilter = document.getElementById('has-circular-dependency-filter');
  if (hasCircularDepFilter) {
    hasCircularDepFilter.checked = currentFilters.hasCircularDependency;
  }
  
  // Check if any filters were restored
  const hasFilters = !!(
    currentFilters.search ||
    currentFilters.type ||
    currentFilters.status ||
    currentFilters.priority ||
    currentFilters.assignee ||
    currentFilters.category ||
    currentFilters.tag ||
    currentFilters.hasPlanning ||
    currentFilters.hasCircularDependency
  );
  
  // Show indicator if filters were restored from URL
  if (hasFilters) {
    showFilterRestoredIndicator();
  }
  
  return hasFilters;
}

// Show visual indicator that filters were restored from URL
function showFilterRestoredIndicator() {
  const container = document.getElementById('filter-restored-indicator');
  if (!container) {
    // Create indicator element if it doesn't exist
    const indicator = document.createElement('div');
    indicator.id = 'filter-restored-indicator';
    indicator.className = 'bg-blue-50 border-l-4 border-blue-400 p-3 mb-4 rounded shadow-sm flex items-center justify-between';
    indicator.innerHTML = `
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>
        <span class="text-sm text-blue-800 font-medium">Filters restored from previous session</span>
      </div>
      <button onclick="closeFilterIndicator()" class="text-blue-600 hover:text-blue-800">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
    `;
    
    // Insert before the filters section
    const filtersSection = document.querySelector('.bg-white.rounded-lg.shadow-md.p-4.mb-4');
    if (filtersSection) {
      filtersSection.parentNode.insertBefore(indicator, filtersSection);
    }
  } else {
    container.classList.remove('hidden');
  }
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    closeFilterIndicator();
  }, 5000);
}

// Close filter restored indicator
window.closeFilterIndicator = function() {
  const container = document.getElementById('filter-restored-indicator');
  if (container) {
    container.classList.add('hidden');
  }
};

// Sync dropdown values with filter state
function syncFilterDropdowns() {
  const searchInput = document.getElementById('search-input');
  const typeFilter = document.getElementById('type-filter');
  const statusFilter = document.getElementById('status-filter');
  const priorityFilter = document.getElementById('priority-filter');
  const assigneeFilter = document.getElementById('assignee-filter');
  const tagFilter = document.getElementById('tag-filter');
  
  if (searchInput) searchInput.value = currentFilters.search || '';
  if (typeFilter) typeFilter.value = currentFilters.type || '';
  if (statusFilter) statusFilter.value = currentFilters.status || '';
  if (priorityFilter) priorityFilter.value = currentFilters.priority || '';
  if (assigneeFilter) assigneeFilter.value = currentFilters.assignee || '';
  if (tagFilter) tagFilter.value = currentFilters.tag || '';
}

// ============= RELATIONSHIP MANAGEMENT =============

// Global state for relationships
let currentRelationshipItem = null;

// Show relationship modal
async function showRelationshipModal(itemId, itemType, itemTitle) {
  try {
    currentRelationshipItem = { id: itemId, type: itemType, title: itemTitle };
    
    // Show modal
    const modal = document.getElementById('relationship-modal');
    if (!modal) {
      console.error('Relationship modal not found!');
      return;
    }
    modal.classList.remove('hidden');
    
    // Display item info
    document.getElementById('relationship-item-info').innerHTML = `
      <p class="font-medium">${itemTitle}</p>
      <p class="text-sm text-gray-600">${itemType === 'issue' ? 'Issue' : 'Action Item'} #${itemId}</p>
    `;
    
    // Load relationships
    await loadRelationships();
    
    // Populate target dropdown
    await populateTargetDropdown();
  } catch (error) {
    console.error('Error in showRelationshipModal:', error);
  }
}

// Close relationship modal
function closeRelationshipModal() {
  document.getElementById('relationship-modal').classList.add('hidden');
  currentRelationshipItem = null;
}

// Load relationships for current item
async function loadRelationships() {
  if (!currentRelationshipItem) return;
  
  try {
    const endpoint = currentRelationshipItem.type === 'issue' ? 'issues' : 'action-items';
    const response = await axios.get(
      `/api/${endpoint}/${currentRelationshipItem.id}/relationships`,
      { withCredentials: true }
    );
    
    const { outgoing, incoming } = response.data;
    
    const listContainer = document.getElementById('relationships-list');
    
    if (outgoing.length === 0 && incoming.length === 0) {
      listContainer.innerHTML = '<p class="text-gray-500 text-sm">No relationships yet</p>';
      return;
    }
    
    listContainer.innerHTML = [
      ...outgoing.map(r => `
        <div class="flex items-center justify-between p-3 ${r.created_by_ai ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'} rounded">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-blue-600 uppercase">${r.relationship_type.replace(/_/g, ' ')}</span>
              ${r.created_by_ai ? '<span class="text-xs bg-purple-600 text-white px-2 py-0.5 rounded">🤖 AI</span>' : ''}
            </div>
            <p class="text-sm mt-1">${r.target_title}</p>
            <span class="text-xs text-gray-500">${r.target_type} - ${r.target_status}</span>
            ${r.created_by_ai && r.ai_confidence ? `<div class="text-xs text-purple-600 mt-1">Confidence: ${r.ai_confidence}%</div>` : ''}
            ${r.transcript_title ? `<div class="text-xs text-gray-400 mt-1">From: ${r.transcript_title}</div>` : ''}
            ${r.notes ? `<div class="text-xs text-gray-500 mt-1 italic">${r.notes}</div>` : ''}
          </div>
          <button class="delete-relationship-btn text-red-600 hover:text-red-700" data-relationship-id="${r.id}">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      `),
      ...incoming.map(r => `
        <div class="flex items-center justify-between p-3 ${r.created_by_ai ? 'bg-purple-50 border border-purple-200' : 'bg-yellow-50'} rounded">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-yellow-600 uppercase">${r.relationship_type.replace(/_/g, ' ')} (incoming)</span>
              ${r.created_by_ai ? '<span class="text-xs bg-purple-600 text-white px-2 py-0.5 rounded">🤖 AI</span>' : ''}
            </div>
            <p class="text-sm mt-1">${r.source_title}</p>
            <span class="text-xs text-gray-500">${r.source_type} - ${r.source_status}</span>
            ${r.created_by_ai && r.ai_confidence ? `<div class="text-xs text-purple-600 mt-1">Confidence: ${r.ai_confidence}%</div>` : ''}
            ${r.transcript_title ? `<div class="text-xs text-gray-400 mt-1">From: ${r.transcript_title}</div>` : ''}
            ${r.notes ? `<div class="text-xs text-gray-500 mt-1 italic">${r.notes}</div>` : ''}
          </div>
          <span class="text-xs text-gray-400">Auto-managed</span>
        </div>
      `)
    ].join('');
    
    // Add delete button listeners
    document.querySelectorAll('.delete-relationship-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const relationshipId = this.getAttribute('data-relationship-id');
        deleteRelationship(relationshipId);
      });
    });
  } catch (error) {
    console.error('Error loading relationships:', error);
    document.getElementById('relationships-list').innerHTML = 
      '<p class="text-red-500 text-sm">Error loading relationships</p>';
  }
}

// Populate target dropdown based on selected type
async function populateTargetDropdown() {
  if (!currentRelationshipItem || !currentProject) return;
  
  const targetType = document.getElementById('relationship-target-type').value;
  const targetSelect = document.getElementById('relationship-target-id');
  
  try {
    // Get all items of the target type from current project
    const items = targetType === 'issue' ? issues : actionItems;
    
    // Filter out the current item
    const availableItems = items.filter(item => 
      !(item.id === currentRelationshipItem.id && 
        targetType === (currentRelationshipItem.type === 'issue' ? 'issue' : 'action-item'))
    );
    
    if (availableItems.length === 0) {
      targetSelect.innerHTML = '<option value="">No items available</option>';
      return;
    }
    
    targetSelect.innerHTML = 
      '<option value="">Select item...</option>' +
      availableItems.map(item => 
        `<option value="${item.id}">${item.title} (${item.status})</option>`
      ).join('');
  } catch (error) {
    console.error('Error populating target dropdown:', error);
    targetSelect.innerHTML = '<option value="">Error loading items</option>';
  }
}

// Add a new relationship
async function addRelationship() {
  if (!currentRelationshipItem) return;
  
  const relationshipType = document.getElementById('relationship-type').value;
  const targetType = document.getElementById('relationship-target-type').value;
  const targetId = document.getElementById('relationship-target-id').value;
  
  if (!relationshipType || !targetId) {
    alert('Please select both relationship type and target item');
    return;
  }
  
  try {
    const endpoint = currentRelationshipItem.type === 'issue' ? 'issues' : 'action-items';
    await axios.post(
      `/api/${endpoint}/${currentRelationshipItem.id}/relationships`,
      {
        targetId: parseInt(targetId),
        targetType,
        relationshipType
      },
      { withCredentials: true }
    );
    
    // Reload relationships
    await loadRelationships();
    
    // Reload the board to update count badges
    await renderKanbanBoard();
    
    // Reset form
    document.getElementById('relationship-type').value = '';
    document.getElementById('relationship-target-id').value = '';
  } catch (error) {
    console.error('Error adding relationship:', error);
    alert(error.response?.data?.error || 'Failed to add relationship');
  }
}

// Delete a relationship
async function deleteRelationship(relationshipId) {
  if (!currentRelationshipItem) return;
  
  if (!confirm('Are you sure you want to delete this relationship?')) {
    return;
  }
  
  try {
    const endpoint = currentRelationshipItem.type === 'issue' ? 'issues' : 'action-items';
    await axios.delete(
      `/api/${endpoint}/${currentRelationshipItem.id}/relationships/${relationshipId}`,
      { withCredentials: true }
    );
    
    // Reload relationships
    await loadRelationships();
    
    // Reload the board to update count badges
    await renderKanbanBoard();
  } catch (error) {
    console.error('Error deleting relationship:', error);
    alert('Failed to delete relationship');
  }
}

// ===== AI MEETING ANALYSIS =====

// Global state for AI analysis
let currentAIAnalysis = null;
let selectedFile = null;
let accumulatedFiles = []; // Array to store multiple files as user selects them
let mdSelectedFiles = []; // Multi-document selected files

// Show AI analysis modal
function showAIAnalysisModal() {
  if (!currentProject) {
    alert('Please select a project first');
    return;
  }

  if (!AuthManager.isAuthenticated) {
    AuthManager.showNotification('Please login to use AI analysis', 'warning');
    AuthManager.showAuthModal('login');
    return;
  }

  // Check if user has permission to upload transcripts
  if (!AuthManager.canUploadTranscript()) {
    AuthManager.showNotification('Insufficient permissions - Only Project Managers and System Administrators can upload transcripts and run AI analysis', 'error');
    return;
  }

  document.getElementById('ai-analysis-modal').classList.remove('hidden');
  resetAnalysis();
}

// Close AI analysis modal
function closeAIAnalysisModal() {
  document.getElementById('ai-analysis-modal').classList.add('hidden');
  resetAnalysis();
}

// Reset to upload step
function resetAnalysis() {
  document.getElementById('upload-step').classList.remove('hidden');
  document.getElementById('review-step').classList.add('hidden');
  document.getElementById('transcript-file').value = '';
  document.getElementById('file-name-list')?.classList.add('hidden');
  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('analysis-progress').classList.add('hidden');
  selectedFile = null;
  accumulatedFiles = [];
  currentAIAnalysis = null;

  setAIAnalysisMode('transcript');

  const multiDocFileInput = document.getElementById('multi-doc-file-input');
  if (multiDocFileInput) {
    multiDocFileInput.value = '';
  }

  document.getElementById('multi-doc-file-list')?.classList.add('hidden');
  const multiDocFilesList = document.getElementById('multi-doc-files');
  if (multiDocFilesList) {
    multiDocFilesList.innerHTML = '';
  }
  const multiDocProcessBtn = document.getElementById('multi-doc-process-btn');
  if (multiDocProcessBtn) {
    multiDocProcessBtn.disabled = true;
  }

  const multiDocImportBtn = document.getElementById('multi-doc-import-btn');
  if (multiDocImportBtn) {
    multiDocImportBtn.disabled = true;
  }
  document.getElementById('multi-doc-progress')?.classList.add('hidden');
  document.getElementById('multi-doc-review')?.classList.add('hidden');

  const multiDocResults = document.getElementById('multi-doc-results');
  if (multiDocResults) {
    multiDocResults.innerHTML = '<p class="text-sm text-gray-500">Upload documents to view AI results.</p>';
  }
  
  // Update project complexity display
  if (currentProject) {
    const complexityLevel = currentProject.complexity_level || 'standard';
    const maxFiles = currentProject.max_file_uploads || 5;
    
    const badgeColors = {
      'standard': 'bg-green-100 text-green-800',
      'complex': 'bg-yellow-100 text-yellow-800',
      'enterprise': 'bg-purple-100 text-purple-800'
    };
    
    const transcriptBadgeClass = `px-2 py-1 rounded text-sm font-semibold ${badgeColors[complexityLevel] || badgeColors.standard}`;
    const multiDocBadgeClass = `px-2 py-1 rounded-full text-sm font-semibold ${badgeColors[complexityLevel] || badgeColors.standard}`;

    const badge = document.getElementById('transcript-complexity-badge');
    if (badge) {
      badge.className = transcriptBadgeClass;
      badge.textContent = complexityLevel.charAt(0).toUpperCase() + complexityLevel.slice(1);
    }
    
    const maxFilesDisplay = document.getElementById('transcript-max-files');
    if (maxFilesDisplay) {
      maxFilesDisplay.textContent = maxFiles;
    }

    const multiDocBadge = document.getElementById('multi-doc-complexity-badge');
    if (multiDocBadge) {
      multiDocBadge.className = multiDocBadgeClass;
      multiDocBadge.textContent = complexityLevel.charAt(0).toUpperCase() + complexityLevel.slice(1);
    }

    const multiDocMaxFiles = document.getElementById('multi-doc-max-files');
    if (multiDocMaxFiles) {
      multiDocMaxFiles.textContent = maxFiles;
    }
  }
}

// Handle file selection - accumulates files instead of replacing
function handleFileSelect(event) {
  const newFiles = event.target.files;
  if (!newFiles || newFiles.length === 0) return;

  // Get project's max file limit
  const maxFiles = currentProject?.max_file_uploads || 5;
  
  // Add new files to accumulated list
  Array.from(newFiles).forEach(file => {
    // Check if we've reached the limit
    if (accumulatedFiles.length >= maxFiles) {
      alert(`Maximum ${maxFiles} files allowed for ${currentProject?.complexity_level || 'standard'} complexity projects`);
      return;
    }
    
    // Check for duplicate filenames
    const isDuplicate = accumulatedFiles.some(f => f.name === file.name);
    if (!isDuplicate) {
      accumulatedFiles.push(file);
    }
  });
  
  // Clear the file input so the same file can be selected again if needed
  event.target.value = '';
  
  // Update the display
  updateFilesList();
  
  // Enable analyze button if we have files
  document.getElementById('analyze-btn').disabled = accumulatedFiles.length === 0;
}

// Update the files list display
function updateFilesList() {
  const fileNamesContainer = document.getElementById('file-names');
  const fileNameList = document.getElementById('file-name-list');
  
  if (accumulatedFiles.length === 0) {
    fileNameList.classList.add('hidden');
    return;
  }
  
  const filesHTML = accumulatedFiles.map((file, index) => {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return `
      <div class="flex items-center justify-between py-1 px-2 hover:bg-green-100 rounded">
        <div class="text-sm">📄 ${index + 1}. ${file.name} (${fileSizeMB} MB)</div>
        <button 
          onclick="removeFile(${index})" 
          class="text-red-600 hover:text-red-800 text-sm font-bold ml-2"
          title="Remove file"
        >
          ✕
        </button>
      </div>
    `;
  }).join('');
  
  fileNamesContainer.innerHTML = filesHTML;
  fileNameList.classList.remove('hidden');
}

// Remove a file from the accumulated list
function removeFile(index) {
  accumulatedFiles.splice(index, 1);
  updateFilesList();
  
  // Disable analyze button if no files left
  if (accumulatedFiles.length === 0) {
    document.getElementById('analyze-btn').disabled = true;
  }
}

// Analyze transcript with AI (now supports multiple accumulated files)
async function analyzeTranscript() {
  if (accumulatedFiles.length === 0 || !currentProject) return;
  
  const analyzeBtn = document.getElementById('analyze-btn');
  const progressDiv = document.getElementById('analysis-progress');
  
  try {
    // Show progress
    analyzeBtn.disabled = true;
    progressDiv.classList.remove('hidden');
    
    // Create FormData and append all accumulated files
    const formData = new FormData();
    
    accumulatedFiles.forEach(file => {
      formData.append('transcript', file);
    });
    
    formData.append('projectId', currentProject.id);
    
    // Call API
    const response = await axios.post('/api/meetings/analyze', formData, {
      withCredentials: true,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    currentAIAnalysis = response.data;
    
    // Show review step
    displayAIResults();
    document.getElementById('upload-step').classList.add('hidden');
    document.getElementById('review-step').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error analyzing transcript:', error);
    const errorMessage = error.response?.data?.message || error.response?.data?.error;
    
    if (error.response?.status === 403) {
      // Permission denied error
      alert(`⚠️ Permission Denied\n\n${errorMessage}\n\nOnly Project Managers and System Administrators can upload transcripts and run AI analysis.`);
    } else {
      alert(errorMessage || 'Failed to analyze transcript. Please check your OpenAI API key.');
    }
    
    progressDiv.classList.add('hidden');
    analyzeBtn.disabled = false;
  }
}

// Display AI analysis results
function displayAIResults() {
  if (!currentAIAnalysis) return;
  
  const { actionItems, issues, metadata, documentClassifications } = currentAIAnalysis;
  
  // Calculate statistics
  const totalItems = actionItems.length + issues.length;
  const allItems = [...actionItems, ...issues];
  const avgConfidence = totalItems > 0 
    ? Math.round(allItems.reduce((sum, item) => sum + item.confidence, 0) / totalItems)
    : 0;
  const assignedCount = actionItems.filter(item => item.assignee && item.assignee !== 'Unassigned').length;
  
  // Update cost info with model information
  const modelInfo = metadata.modelName === 'GPT-4o' 
    ? '🚀 GPT-4o (Large Context)' 
    : '⚡ GPT-3.5-Turbo';
  
  document.getElementById('analysis-cost').textContent = 
    `${modelInfo} | Cost: ${metadata.estimatedCost} | Tokens: ${metadata.tokensUsed.total}`;
  
  // Display guidance and statistics
  const reviewStepContent = document.getElementById('review-step');
  const existingGuidance = reviewStepContent.querySelector('.ai-guidance-box');
  
  if (!existingGuidance) {
    const guidanceHTML = `
      <div class="ai-guidance-box mb-6">
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div class="flex items-start gap-3">
            <span class="text-2xl">💡</span>
            <div>
              <h4 class="font-semibold text-blue-900 mb-1">AI Extraction Results</h4>
              <p class="text-sm text-blue-800 mb-2">
                The AI has analyzed your transcript and identified <strong>${totalItems} items</strong> 
                with an average confidence of <strong>${avgConfidence}%</strong>.
              </p>
              <ul class="text-sm text-blue-700 space-y-1">
                <li>✓ All high-priority items with clear owners and dates have been captured</li>
                <li>✓ Items marked "Unassigned" need an owner to be assigned</li>
                <li>✓ Review items with confidence below 80% carefully</li>
                <li>✓ You can manually add any items the AI may have missed</li>
              </ul>
            </div>
          </div>
        </div>
        
        <div class="grid grid-cols-4 gap-4 mb-6">
          <div class="bg-white p-4 rounded-lg border border-gray-200 text-center">
            <div class="text-3xl font-bold text-green-600">${actionItems.length}</div>
            <div class="text-sm text-gray-600">Action Items</div>
          </div>
          <div class="bg-white p-4 rounded-lg border border-gray-200 text-center">
            <div class="text-3xl font-bold text-red-600">${issues.length}</div>
            <div class="text-sm text-gray-600">Issues</div>
          </div>
          <div class="bg-white p-4 rounded-lg border border-gray-200 text-center">
            <div class="text-3xl font-bold text-blue-600">${avgConfidence}%</div>
            <div class="text-sm text-gray-600">Avg Confidence</div>
          </div>
          <div class="bg-white p-4 rounded-lg border border-gray-200 text-center">
            <div class="text-3xl font-bold text-purple-600">${assignedCount}</div>
            <div class="text-sm text-gray-600">With Assignees</div>
          </div>
        </div>
      </div>
    `;
    
    // Insert guidance after the existing info box
    const existingInfoBox = reviewStepContent.querySelector('.bg-blue-50');
    if (existingInfoBox) {
      existingInfoBox.insertAdjacentHTML('afterend', guidanceHTML);
    }
  } else {
    // Update existing guidance with new stats
    existingGuidance.querySelector('.bg-blue-50 strong:first-of-type').textContent = `${totalItems} items`;
    existingGuidance.querySelector('.bg-blue-50 strong:last-of-type').textContent = `${avgConfidence}%`;
    existingGuidance.querySelectorAll('.text-3xl')[0].textContent = actionItems.length;
    existingGuidance.querySelectorAll('.text-3xl')[1].textContent = issues.length;
    existingGuidance.querySelectorAll('.text-3xl')[2].textContent = `${avgConfidence}%`;
    existingGuidance.querySelectorAll('.text-3xl')[3].textContent = assignedCount;
  }
  
  // Display document classifications if available
  const existingClassifications = reviewStepContent.querySelector('.document-classifications');
  if (existingClassifications) {
    existingClassifications.remove();
  }
  
  if (documentClassifications && documentClassifications.length > 0) {
    const classificationsHTML = `
      <div class="document-classifications bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h4 class="font-semibold text-blue-900 mb-3 flex items-center">
          <span class="mr-2">🏷️</span>
          Document Classifications
        </h4>
        <div class="space-y-2">
          ${documentClassifications.map(doc => {
            const confidencePercent = Math.round(doc.confidence * 100);
            const confidenceColor = doc.confidence >= 0.8 ? 'green' : doc.confidence >= 0.6 ? 'yellow' : 'gray';
            
            // Capitalize category name (e.g., "dependencies" -> "Dependencies")
            const capitalizedCategory = doc.category
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            
            const categoryBadge = doc.is_custom 
              ? `<span class="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded">Category Type: Custom</span>`
              : `<span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">Category Type: Base</span>`;
            
            return `
              <div class="flex items-start justify-between bg-white rounded p-3 text-sm">
                <div class="flex-1">
                  <div class="font-medium text-gray-900 mb-1">📄 ${escapeHtml(doc.filename)}</div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="px-2 py-1 bg-gray-100 text-gray-800 rounded font-medium">Document Category: ${escapeHtml(capitalizedCategory)}</span>
                    ${categoryBadge}
                    <span class="text-xs px-2 py-1 bg-${confidenceColor}-100 text-${confidenceColor}-800 rounded">
                      ${confidencePercent}% confident
                    </span>
                  </div>
                  ${doc.reasoning ? `<div class="text-xs text-gray-600 mt-2 italic">${escapeHtml(doc.reasoning)}</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
    
    // Insert after the stats section
    const statsSection = reviewStepContent.querySelector('.ai-guidance-box');
    if (statsSection) {
      statsSection.insertAdjacentHTML('afterend', classificationsHTML);
    }
  }
  
  // Display action items
  const actionItemsDiv = document.getElementById('ai-action-items');
  const actionCount = document.getElementById('ai-action-count');
  actionCount.textContent = actionItems.length;
  
  if (actionItems.length === 0) {
    actionItemsDiv.innerHTML = '<p class="text-sm text-gray-500 italic">No action items found</p>';
  } else {
    actionItemsDiv.innerHTML = actionItems.map((item, idx) => `
      <div class="border rounded p-3 hover:bg-gray-50">
        <div class="flex items-start">
          <input type="checkbox" id="action-${idx}" checked class="mt-1 mr-3" data-index="${idx}">
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <h6 class="font-medium text-sm">${escapeHtml(item.title)}</h6>
              <span class="text-xs px-2 py-1 rounded ${getPriorityClass(item.priority)}">${item.priority}</span>
            </div>
            <p class="text-xs text-gray-600 mt-1">${escapeHtml(item.description || 'No description')}</p>
            <div class="flex items-center gap-3 mt-2 text-xs text-gray-500">
              <span>👤 ${escapeHtml(item.assignee || 'Unassigned')}</span>
              ${item.dueDate ? `<span>📅 ${item.dueDate}</span>` : ''}
              <span>🎯 Confidence: ${item.confidence}%</span>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }
  
  // Display issues
  const issuesDiv = document.getElementById('ai-issues');
  const issueCount = document.getElementById('ai-issue-count');
  issueCount.textContent = issues.length;
  
  if (issues.length === 0) {
    issuesDiv.innerHTML = '<p class="text-sm text-gray-500 italic">No issues found</p>';
  } else {
    issuesDiv.innerHTML = issues.map((issue, idx) => `
      <div class="border rounded p-3 hover:bg-gray-50">
        <div class="flex items-start">
          <input type="checkbox" id="issue-${idx}" checked class="mt-1 mr-3" data-index="${idx}">
          <div class="flex-1">
            <div class="flex items-center justify-between">
              <h6 class="font-medium text-sm">${escapeHtml(issue.title)}</h6>
              <span class="text-xs px-2 py-1 rounded ${getPriorityClass(issue.priority)}">${issue.priority}</span>
            </div>
            <p class="text-xs text-gray-600 mt-1">${escapeHtml(issue.description || 'No description')}</p>
            <div class="flex items-center gap-3 mt-2 text-xs text-gray-500">
              <span>🏷️ ${escapeHtml(issue.category || 'General')}</span>
              <span>🎯 Confidence: ${issue.confidence}%</span>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }
  
  // Display status updates (NEW)
  const statusUpdateResults = currentAIAnalysis.statusUpdateResults;
  if (statusUpdateResults && (statusUpdateResults.matched.length > 0 || statusUpdateResults.unmatched.length > 0)) {
    const statusSection = document.getElementById('status-updates-section');
    const countSpan = document.getElementById('status-updates-count');
    const matchedContainer = document.getElementById('matched-updates');
    const unmatchedContainer = document.getElementById('unmatched-updates');
    
    statusSection.classList.remove('hidden');
    countSpan.textContent = statusUpdateResults.matched.length + statusUpdateResults.unmatched.length;
    
    // Display matched updates
    if (statusUpdateResults.matched.length > 0) {
      matchedContainer.innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-3">
          <h6 class="font-semibold text-green-900 mb-2 text-sm">
            ✅ Successfully Updated (${statusUpdateResults.matched.length})
          </h6>
          <div class="space-y-3">
            ${statusUpdateResults.matched.map(match => `
              <div class="bg-white border border-green-300 rounded-lg p-3">
                <div class="flex justify-between items-start mb-2">
                  <h6 class="font-medium text-sm text-gray-900">${escapeHtml(match.itemTitle)}</h6>
                  <span class="text-xs px-2 py-1 rounded ${getStatusBadgeClass(match.newStatus)}">
                    ${match.oldStatus} → ${match.newStatus}
                  </span>
                </div>
                <p class="text-xs text-gray-600 italic mb-2">"${escapeHtml(match.evidence)}"</p>
                <div class="flex gap-3 text-xs text-gray-500">
                  <span>🎯 Match: ${match.matchConfidence}%</span>
                  <span>🤖 AI: ${match.aiConfidence}%</span>
                  <span>📝 ${match.itemType === 'issue' ? 'Issue' : 'Action'} #${match.itemId}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      matchedContainer.innerHTML = '';
    }
    
    // Display unmatched updates with search functionality
    if (statusUpdateResults.unmatched.length > 0) {
      unmatchedContainer.innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h6 class="font-semibold text-yellow-900 mb-2 text-sm">
            ⚠️ Needs Manual Review (${statusUpdateResults.unmatched.length})
          </h6>
          <p class="text-xs text-yellow-800 mb-3">
            Search for matching items below, or save to Review Queue to handle later.
          </p>
          <div class="space-y-3" id="unmatched-items-container">
            ${statusUpdateResults.unmatched.map((unmatched, idx) => `
              <div class="bg-white border border-yellow-300 rounded-lg p-3" data-unmatched-idx="${idx}">
                <p class="font-medium text-sm text-gray-900 mb-1">${escapeHtml(unmatched.update.itemDescription)}</p>
                <p class="text-xs text-gray-600 mb-2">"${escapeHtml(unmatched.update.evidence)}"</p>
                <p class="text-xs text-yellow-700 mb-2">Reason: ${escapeHtml(unmatched.reason)}</p>
                ${unmatched.closestMatch ? `<p class="text-xs text-gray-500 mb-2">Closest match: ${escapeHtml(unmatched.closestMatch)}</p>` : ''}
                
                <!-- Search Box -->
                <div class="mt-3 border-t pt-3">
                  <div class="flex gap-2 mb-2">
                    <input type="text" 
                           placeholder="Search for matching items..." 
                           class="flex-1 px-3 py-1 text-xs border rounded"
                           id="search-input-${idx}"
                           data-unmatched-idx="${idx}">
                    <button class="unmatched-search-btn px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                            data-idx="${idx}">
                      Search
                    </button>
                  </div>
                  
                  <!-- Search Results -->
                  <div id="search-results-${idx}" class="hidden space-y-1 mb-2"></div>
                  
                  <!-- Actions -->
                  <div class="flex gap-2">
                    <button class="save-to-queue-btn flex-1 px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                            data-idx="${idx}">
                      📋 Save to Review Queue
                    </button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
      // Add event delegation for search and save buttons
      const unmatchedItemsContainer = document.getElementById('unmatched-items-container');
      if (unmatchedItemsContainer) {
        // Handle search button clicks
        unmatchedItemsContainer.addEventListener('click', function(e) {
          if (e.target.classList.contains('unmatched-search-btn')) {
            const idx = parseInt(e.target.dataset.idx);
            window.searchExistingItems(idx);
          }
          // Handle save to queue button clicks
          if (e.target.classList.contains('save-to-queue-btn')) {
            const idx = parseInt(e.target.dataset.idx);
            window.saveToReviewQueue(idx);
          }
          // Handle match button clicks from search results
          if (e.target.classList.contains('match-from-search-btn')) {
            const unmatchedIdx = parseInt(e.target.dataset.unmatchedIdx);
            const itemId = parseInt(e.target.dataset.itemId);
            const itemType = e.target.dataset.itemType;
            window.matchItemFromSearch(unmatchedIdx, itemId, itemType);
          }
        });
      }
    } else {
      unmatchedContainer.innerHTML = '';
    }
  }
  
  // Display relationships (NEW)
  const relationshipResults = currentAIAnalysis.relationshipResults;
  if (relationshipResults && (relationshipResults.created.length > 0 || relationshipResults.failed.length > 0)) {
    const relationshipsSection = document.getElementById('relationships-section');
    const countSpan = document.getElementById('relationships-count');
    const createdContainer = document.getElementById('created-relationships');
    const failedContainer = document.getElementById('failed-relationships');
    
    relationshipsSection.classList.remove('hidden');
    countSpan.textContent = relationshipResults.created.length + relationshipResults.failed.length;
    
    // Display created relationships
    if (relationshipResults.created.length > 0) {
      createdContainer.innerHTML = `
        <div class="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-3">
          <h6 class="font-semibold text-purple-900 mb-2 text-sm">
            ✅ Successfully Created (${relationshipResults.created.length})
          </h6>
          <div class="space-y-3">
            ${relationshipResults.created.map(rel => `
              <div class="bg-white border border-purple-300 rounded-lg p-3">
                <div class="flex items-start gap-2 mb-2">
                  <span class="text-xs font-semibold text-purple-700 uppercase px-2 py-1 bg-purple-100 rounded">
                    ${rel.relationshipType.replace(/_/g, ' ')}
                  </span>
                  <span class="text-xs px-2 py-1 bg-purple-600 text-white rounded">🤖 AI</span>
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <span class="font-medium">${escapeHtml(rel.sourceItem)}</span>
                  <span class="text-gray-400">→</span>
                  <span class="font-medium">${escapeHtml(rel.targetItem)}</span>
                </div>
                <p class="text-xs text-gray-600 italic mt-2">"${escapeHtml(rel.evidence)}"</p>
                <div class="flex gap-3 text-xs text-gray-500 mt-2">
                  <span>🎯 Confidence: ${rel.confidence}%</span>
                  <span>📝 ${rel.sourceType} → ${rel.targetType}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      createdContainer.innerHTML = '';
    }
    
    // Display failed relationships
    if (relationshipResults.failed.length > 0) {
      failedContainer.innerHTML = `
        <div class="bg-red-50 border border-red-200 rounded-lg p-4">
          <h6 class="font-semibold text-red-900 mb-2 text-sm">
            ⚠️ Could Not Create (${relationshipResults.failed.length})
          </h6>
          <p class="text-xs text-red-800 mb-3">
            These relationships could not be matched to existing items.
          </p>
          <div class="space-y-2">
            ${relationshipResults.failed.map(failed => `
              <div class="bg-white border border-red-300 rounded-lg p-2">
                <p class="text-xs font-medium text-gray-900">
                  ${escapeHtml(failed.relationship.sourceItem)} 
                  <span class="text-gray-500">${failed.relationship.relationshipType}</span>
                  ${escapeHtml(failed.relationship.targetItem)}
                </p>
                <p class="text-xs text-red-700 mt-1">Reason: ${escapeHtml(failed.reason)}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      failedContainer.innerHTML = '';
    }
  }
}

// Get status badge styling
function getStatusBadgeClass(status) {
  const statusClasses = {
    'To Do': 'bg-gray-100 text-gray-800',
    'In Progress': 'bg-blue-100 text-blue-800',
    'Done': 'bg-green-100 text-green-800',
    'Blocked': 'bg-red-100 text-red-800'
  };
  return statusClasses[status] || 'bg-gray-100 text-gray-800';
}

// Search existing items for unmatched updates
window.searchExistingItems = async function(unmatchedIdx) {
  if (!currentProject || !currentAIAnalysis) return;
  
  const searchInput = document.getElementById(`search-input-${unmatchedIdx}`);
  const searchResults = document.getElementById(`search-results-${unmatchedIdx}`);
  const query = searchInput.value.trim();
  
  if (!query) {
    alert('Please enter a search term');
    return;
  }
  
  try {
    const response = await axios.get('/api/search-items', {
      params: {
        projectId: currentProject.id,
        query: query
      },
      withCredentials: true
    });
    
    const items = response.data.items;
    
    if (items.length === 0) {
      searchResults.innerHTML = '<p class="text-xs text-gray-500 italic p-2">No matching items found</p>';
      searchResults.classList.remove('hidden');
      return;
    }
    
    searchResults.innerHTML = items.map(item => `
      <div class="flex items-start justify-between p-2 bg-gray-50 rounded border border-gray-200 text-xs">
        <div class="flex-1">
          <p class="font-medium">${escapeHtml(item.title)}</p>
          <p class="text-gray-500 mt-1">${escapeHtml(item.description?.substring(0, 60) || 'No description')}...</p>
          <div class="flex gap-2 mt-1 text-xs text-gray-400">
            <span>${item.type === 'action' ? '✓ Action' : '⚠️ Issue'}</span>
            <span>Status: ${item.status}</span>
          </div>
        </div>
        <button class="match-from-search-btn ml-2 px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 whitespace-nowrap"
                data-unmatched-idx="${unmatchedIdx}"
                data-item-id="${item.id}"
                data-item-type="${item.type}">
          Match & Update
        </button>
      </div>
    `).join('');
    searchResults.classList.remove('hidden');
    
  } catch (error) {
    console.error('Error searching items:', error);
    alert('Failed to search items');
  }
}

// Match unmatched update to a found item (from search)
window.matchItemFromSearch = async function(unmatchedIdx, itemId, itemType) {
  if (!currentAIAnalysis || !currentProject) return;
  
  const unmatched = currentAIAnalysis.statusUpdateResults.unmatched[unmatchedIdx];
  
  if (!confirm(`Match this status update to the selected ${itemType}?\n\nUpdate: "${unmatched.update.itemDescription}"\nStatus: ${unmatched.update.statusChange}`)) {
    return;
  }
  
  try {
    // First save to queue
    const queueResponse = await axios.post('/api/review-queue', {
      projectId: currentProject.id,
      transcriptId: currentAIAnalysis.transcriptId,
      unmatchedUpdate: unmatched
    }, { withCredentials: true });
    
    const queueId = queueResponse.data.id;
    
    // Then immediately match it
    await axios.post(`/api/review-queue/${queueId}/match`, {
      itemId: itemId,
      itemType: itemType
    }, { withCredentials: true });
    
    alert('Item matched and status updated successfully!');
    
    // Remove from unmatched list
    const container = document.querySelector(`[data-unmatched-idx="${unmatchedIdx}"]`);
    if (container) {
      container.remove();
    }
    
    // Reload project data to show updated status
    await loadProjectData(currentProject.id);
    
  } catch (error) {
    console.error('Error matching item:', error);
    alert(error.response?.data?.error || 'Failed to match item');
  }
}

// Save unmatched update to review queue
window.saveToReviewQueue = async function(unmatchedIdx) {
  if (!currentAIAnalysis || !currentProject) return;
  
  const unmatched = currentAIAnalysis.statusUpdateResults.unmatched[unmatchedIdx];
  
  try {
    await axios.post('/api/review-queue', {
      projectId: currentProject.id,
      transcriptId: currentAIAnalysis.transcriptId,
      unmatchedUpdate: unmatched
    }, { withCredentials: true });
    
    alert('Saved to Review Queue! You can process it later from the kanban board.');
    
    // Remove from unmatched list
    const container = document.querySelector(`[data-unmatched-idx="${unmatchedIdx}"]`);
    if (container) {
      container.remove();
    }
    
  } catch (error) {
    console.error('Error saving to queue:', error);
    alert(error.response?.data?.error || 'Failed to save to queue');
  }
}

// Review Queue Management Functions

// Load review queue items
async function loadReviewQueue(projectId) {
  if (!projectId) return;
  
  try {
    const response = await axios.get('/api/review-queue', {
      params: { projectId },
      withCredentials: true
    });
    
    const queueItems = response.data;
    displayReviewQueue(queueItems);
    
  } catch (error) {
    console.error('Error loading review queue:', error);
  }
}

// Display review queue items
function displayReviewQueue(queueItems) {
  const panel = document.getElementById('review-queue-panel');
  const container = document.getElementById('review-queue-items');
  const countBadge = document.getElementById('review-queue-count');
  
  if (!queueItems || queueItems.length === 0) {
    panel.classList.add('hidden');
    return;
  }
  
  panel.classList.remove('hidden');
  countBadge.textContent = queueItems.length;
  
  container.innerHTML = queueItems.map(item => `
    <div class="bg-white border border-purple-300 rounded-lg p-3" data-queue-id="${item.id}">
      <div class="mb-2">
        <p class="font-medium text-sm text-gray-900">${escapeHtml(item.item_description)}</p>
        <p class="text-xs text-gray-600 mt-1">"${escapeHtml(item.evidence)}"</p>
        <div class="flex gap-3 text-xs text-gray-500 mt-1">
          <span>→ ${item.status_change}</span>
          ${item.ai_confidence ? `<span>🤖 ${item.ai_confidence}%</span>` : ''}
        </div>
      </div>
      
      <!-- Search and Match -->
      <div class="mt-3 border-t pt-3">
        <div class="flex gap-2 mb-2">
          <input type="text" 
                 placeholder="Search to match..." 
                 class="flex-1 px-2 py-1 text-xs border rounded"
                 id="queue-search-${item.id}">
          <button class="queue-search-btn px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                  data-queue-id="${item.id}">
            Search
          </button>
        </div>
        
        <!-- Search Results -->
        <div id="queue-search-results-${item.id}" class="hidden space-y-1 mb-2"></div>
        
        <!-- Actions -->
        <div class="flex gap-2">
          <button class="queue-dismiss-btn flex-1 px-2 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500"
                  data-queue-id="${item.id}">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  `).join('');
  
  // Add event delegation for queue buttons
  const queueItemsContainer = document.getElementById('review-queue-items');
  if (queueItemsContainer) {
    queueItemsContainer.addEventListener('click', function(e) {
      // Handle queue search button
      if (e.target.classList.contains('queue-search-btn')) {
        const queueId = parseInt(e.target.dataset.queueId);
        window.searchForQueueItem(queueId);
      }
      // Handle queue dismiss button
      if (e.target.classList.contains('queue-dismiss-btn')) {
        const queueId = parseInt(e.target.dataset.queueId);
        window.dismissQueueItem(queueId);
      }
      // Handle match button from queue search results
      if (e.target.classList.contains('queue-match-btn')) {
        const queueId = parseInt(e.target.dataset.queueId);
        const itemId = parseInt(e.target.dataset.itemId);
        const itemType = e.target.dataset.itemType;
        window.matchQueueItem(queueId, itemId, itemType);
      }
    });
  }
}

// Search for items to match queue item
window.searchForQueueItem = async function(queueId) {
  if (!currentProject) return;
  
  const searchInput = document.getElementById(`queue-search-${queueId}`);
  const searchResults = document.getElementById(`queue-search-results-${queueId}`);
  const query = searchInput.value.trim();
  
  if (!query) {
    alert('Please enter a search term');
    return;
  }
  
  try {
    const response = await axios.get('/api/search-items', {
      params: {
        projectId: currentProject.id,
        query: query
      },
      withCredentials: true
    });
    
    const items = response.data.items;
    
    if (items.length === 0) {
      searchResults.innerHTML = '<p class="text-xs text-gray-500 italic p-2">No matching items found</p>';
      searchResults.classList.remove('hidden');
      return;
    }
    
    searchResults.innerHTML = items.map(item => `
      <div class="flex items-start justify-between p-2 bg-gray-50 rounded border border-gray-200 text-xs">
        <div class="flex-1">
          <p class="font-medium">${escapeHtml(item.title)}</p>
          <p class="text-gray-500 mt-1">${escapeHtml(item.description?.substring(0, 50) || 'No description')}...</p>
        </div>
        <button class="queue-match-btn ml-2 px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 whitespace-nowrap"
                data-queue-id="${queueId}"
                data-item-id="${item.id}"
                data-item-type="${item.type}">
          Match
        </button>
      </div>
    `).join('');
    searchResults.classList.remove('hidden');
    
  } catch (error) {
    console.error('Error searching items:', error);
    alert('Failed to search items');
  }
}

// Match queue item to existing item
window.matchQueueItem = async function(queueId, itemId, itemType) {
  if (!confirm('Match this status update to the selected item?')) {
    return;
  }
  
  try {
    await axios.post(`/api/review-queue/${queueId}/match`, {
      itemId: itemId,
      itemType: itemType
    }, { withCredentials: true });
    
    alert('Item matched and status updated!');
    
    // Remove from queue display
    const container = document.querySelector(`[data-queue-id="${queueId}"]`);
    if (container) {
      container.remove();
    }
    
    // Reload data
    await loadProjectData(currentProject.id);
    await loadReviewQueue(currentProject.id);
    
  } catch (error) {
    console.error('Error matching queue item:', error);
    alert(error.response?.data?.error || 'Failed to match item');
  }
}

// Dismiss queue item
window.dismissQueueItem = async function(queueId) {
  if (!confirm('Dismiss this item from the review queue?')) {
    return;
  }
  
  try {
    await axios.delete(`/api/review-queue/${queueId}`, {
      withCredentials: true
    });
    
    // Remove from queue display
    const container = document.querySelector(`[data-queue-id="${queueId}"]`);
    if (container) {
      container.remove();
    }
    
    // Reload queue
    await loadReviewQueue(currentProject.id);
    
  } catch (error) {
    console.error('Error dismissing queue item:', error);
    alert('Failed to dismiss item');
  }
}

// Toggle review queue visibility
window.toggleReviewQueue = function() {
  const panel = document.getElementById('review-queue-panel');
  panel.classList.toggle('hidden');
}

// ============= MODE SWITCHING =============

// Global state for multi-document processing
let multiDocFile = null;
let multiDocResults = null;

// Switch between analysis modes
function switchAnalysisMode(mode) {
  const meetingContent = document.getElementById('meeting-transcript-content');
  const multiDocContent = document.getElementById('multi-document-content');
  const meetingBtn = document.getElementById('mode-meeting-transcript');
  const multiDocBtn = document.getElementById('mode-multi-document');
  const modeDescription = document.getElementById('mode-description');
  
  if (mode === 'meeting') {
    // Reset multi-document state before switching
    resetMultiDocWorkflow();
    
    meetingContent.classList.remove('hidden');
    multiDocContent.classList.add('hidden');
    meetingBtn.classList.add('active');
    multiDocBtn.classList.remove('active');
    modeDescription.textContent = 'Extract action items and issues from meeting transcripts';
  } else {
    // Reset meeting transcript state before switching
    resetAnalysis();
    
    meetingContent.classList.add('hidden');
    multiDocContent.classList.remove('hidden');
    meetingBtn.classList.remove('active');
    multiDocBtn.classList.add('active');
    modeDescription.textContent = 'AI-powered multi-document analysis with workstream detection and checklist generation';
  }
}

// ============= MULTI-DOCUMENT PROCESSING =============

function handleMultiDocFileSelect() {
  const fileInput = document.getElementById('md-file-input');
  const file = fileInput.files[0];
  
  if (!file) return;
  
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    alert('File too large. Maximum size is 10MB.');
    return;
  }
  
  const allowedTypes = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|txt|docx)$/i)) {
    alert('Invalid file type. Please upload PDF, TXT, or DOCX.');
    return;
  }
  
  multiDocFile = file;
  
  document.getElementById('md-file-preview').classList.remove('hidden');
  document.getElementById('md-file-name').textContent = file.name;
  document.getElementById('md-file-size').textContent = formatFileSize(file.size);
  document.getElementById('md-analyze-btn').disabled = false;
}

function clearMultiDocFile() {
  multiDocFile = null;
  document.getElementById('md-file-input').value = '';
  document.getElementById('md-file-preview').classList.add('hidden');
  document.getElementById('md-analyze-btn').disabled = true;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function startMultiDocAnalysis() {
  if (!multiDocFile || !currentProject) {
    alert('Please select a file and project first');
    return;
  }
  
  try {
    showMultiDocSection('processing');
    updateMultiDocStep(2);
    
    updateMultiDocProgress(1, 'processing', 'Extracting document text...');
    const documentText = await extractMultiDocText(multiDocFile);
    updateMultiDocProgress(1, 'complete', 'Document text extracted ✓');
    
    updateMultiDocProgress(2, 'processing', 'Detecting workstreams with AI...');
    const workstreamsData = await detectWorkstreams(documentText);
    updateMultiDocProgress(2, 'complete', `${workstreamsData.workstreams.length} workstreams detected ✓`);
    updateMultiDocStep(3);
    
    updateMultiDocProgress(3, 'processing', 'Generating checklists...');
    const checklistsData = await generateWorkstreamChecklists(workstreamsData.workstreams, documentText);
    updateMultiDocProgress(3, 'complete', `${checklistsData.count} checklists generated ✓`);
    updateMultiDocStep(4);
    
    updateMultiDocProgress(4, 'processing', 'Matching checklists to issues...');
    const matchesData = await matchChecklistsToIssues(checklistsData.checklists);
    updateMultiDocProgress(4, 'complete', 'Matching complete ✓');
    updateMultiDocStep(5);
    
    multiDocResults = matchesData;
    
    setTimeout(() => {
      showMultiDocResults(matchesData);
    }, 500);
    
  } catch (error) {
    console.error('Multi-doc analysis error:', error);
    alert('Analysis failed: ' + (error.response?.data?.error || error.message));
    resetMultiDocWorkflow();
  }
}

async function extractMultiDocText(file) {
  if (file.type === 'text/plain') {
    return await file.text();
  }
  
  const formData = new FormData();
  formData.append('document', file);
  
  const response = await axios.post('/api/documents/extract', formData, {
    withCredentials: true
  });
  
  return response.data.extractedText;
}

async function detectWorkstreams(text) {
  const response = await axios.post(`/api/projects/${currentProject.id}/analyze-workstreams`, {
    documentText: text,
    filename: multiDocFile.name
  }, { withCredentials: true });
  
  return response.data;
}

async function generateWorkstreamChecklists(workstreams, text) {
  const response = await axios.post(`/api/projects/${currentProject.id}/generate-workstream-checklists`, {
    workstreams: workstreams,
    documentText: text
  }, { withCredentials: true });
  
  return response.data;
}

async function matchChecklistsToIssues(checklists) {
  const response = await axios.post(`/api/projects/${currentProject.id}/match-checklists-to-issues`, {
    checklists: checklists
  }, { withCredentials: true });
  
  return response.data;
}

function showMultiDocSection(section) {
  document.getElementById('md-upload-section').classList.toggle('hidden', section !== 'upload');
  document.getElementById('md-processing-section').classList.toggle('hidden', section !== 'processing');
  document.getElementById('md-review-section').classList.toggle('hidden', section !== 'review');
}

function updateMultiDocStep(step) {
  for (let i = 1; i <= 7; i++) {
    const stepEl = document.getElementById(`md-step-${i}`);
    if (!stepEl) continue;
    
    const circle = stepEl.querySelector('span:first-child');
    const label = stepEl.querySelector('span:last-child');
    
    if (i < step) {
      circle.className = 'w-7 h-7 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-semibold';
      label.className = 'text-[10px] leading-tight text-green-700 font-semibold';
    } else if (i === step) {
      circle.className = 'w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold animate-pulse';
      label.className = 'text-[10px] leading-tight text-blue-700 font-semibold';
    } else {
      circle.className = 'w-7 h-7 rounded-full bg-white text-purple-700 flex items-center justify-center text-xs font-semibold';
      label.className = 'text-[10px] leading-tight text-purple-800';
    }
  }
}

function addConsoleLog(message, type = 'info') {
  const consoleEl = document.getElementById('multi-doc-console');
  if (!consoleEl) return;
  
  const logEntry = document.createElement('div');
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  
  let colorClass = 'text-green-400';
  let icon = '→';
  
  if (type === 'success') {
    colorClass = 'text-green-400';
    icon = '✓';
  } else if (type === 'error') {
    colorClass = 'text-red-400';
    icon = '✗';
  } else if (type === 'warning') {
    colorClass = 'text-yellow-400';
    icon = '⚠';
  } else if (type === 'step') {
    colorClass = 'text-blue-400';
    icon = '▶';
  }
  
  logEntry.className = `${colorClass} flex gap-2`;
  logEntry.innerHTML = `
    <span class="text-gray-500 flex-shrink-0">[${timestamp}]</span>
    <span class="flex-shrink-0">${icon}</span>
    <span class="break-all">${escapeHtml(message)}</span>
  `;
  
  consoleEl.appendChild(logEntry);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function clearConsole() {
  const consoleEl = document.getElementById('multi-doc-console');
  if (consoleEl) {
    consoleEl.innerHTML = '<div class="text-gray-500">Console cleared. Waiting for processing...</div>';
  }
}

function updateMultiDocProgress(step, status, message) {
  const progressEl = document.getElementById(`md-progress-${step}`);
  if (!progressEl) return;
  
  const icon = progressEl.querySelector('div');
  const text = progressEl.querySelector('span');
  
  if (status === 'processing') {
    icon.innerHTML = '<span class="text-xs">⏳</span>';
    icon.className = 'w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center';
    text.className = 'text-sm text-blue-700 font-medium';
  } else if (status === 'complete') {
    icon.innerHTML = '<span class="text-xs">✓</span>';
    icon.className = 'w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center';
    text.className = 'text-sm text-green-700';
  }
  
  text.textContent = message;
}

function showMultiDocResults(data) {
  showMultiDocSection('review');
  
  document.getElementById('md-stat-workstreams').textContent = data.summary?.workstreamsCount || 0;
  document.getElementById('md-stat-matched').textContent = data.summary?.matchedCount || 0;
  document.getElementById('md-stat-new').textContent = data.summary?.newIssuesCount || 0;
  document.getElementById('md-stat-items').textContent = data.summary?.totalItems || 0;
  
  const resultsList = document.getElementById('md-results-list');
  resultsList.innerHTML = '';
  
  if (data.matches && data.matches.length > 0) {
    data.matches.forEach(match => {
      const matchEl = document.createElement('div');
      matchEl.className = 'p-4 border border-gray-200 rounded-lg bg-white';
      matchEl.innerHTML = `
        <div class="flex items-start gap-3">
          <input type="checkbox" checked class="mt-1" data-match-id="${match.id}">
          <div class="flex-1">
            <h5 class="font-medium text-gray-900">${escapeHtml(match.title)}</h5>
            <p class="text-sm text-gray-600 mt-1">${escapeHtml(match.description || '')}</p>
            <div class="flex items-center gap-2 mt-2">
              <span class="text-xs px-2 py-1 rounded ${match.isNew ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}">
                ${match.isNew ? 'New Issue' : 'Matched to: ' + escapeHtml(match.matchedTo)}
              </span>
              <span class="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                ${match.itemsCount || 0} checklist items
              </span>
            </div>
          </div>
        </div>
      `;
      resultsList.appendChild(matchEl);
    });
  }
}

function resetMultiDocWorkflow() {
  clearMultiDocFile();
  multiDocResults = null;
  showMultiDocSection('upload');
  updateMultiDocStep(1);
}

async function createMultiDocItems() {
  if (!multiDocResults || !currentProject) {
    alert('No results to create');
    return;
  }
  
  const createBtn = document.getElementById('md-create-btn');
  const originalText = createBtn.innerHTML;
  
  try {
    createBtn.disabled = true;
    createBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creating...';
    
    // Get selected matches
    const checkboxes = document.querySelectorAll('#md-results-list input[type="checkbox"]:checked');
    const selectedMatchIds = Array.from(checkboxes).map(cb => cb.dataset.matchId);
    
    if (selectedMatchIds.length === 0) {
      alert('Please select at least one item to create');
      return;
    }
    
    // Filter results to only selected items
    const selectedMatches = multiDocResults.matches.filter(m => 
      selectedMatchIds.includes(String(m.id))
    );
    
    // Submit to backend for creation
    const response = await axios.post(`/api/projects/${currentProject.id}/create-from-matches`, {
      matches: selectedMatches
    }, { withCredentials: true });
    
    alert(`Successfully created ${response.data.created} items!`);
    
    // Close modal and refresh project data
    closeAIAnalysisModal();
    await loadProjectData(currentProject.id);
    
  } catch (error) {
    console.error('Error creating multi-doc items:', error);
    alert(error.response?.data?.error || 'Failed to create items');
  } finally {
    createBtn.disabled = false;
    createBtn.innerHTML = originalText;
  }
}

// Toggle all action items
function toggleAllActionItems() {
  const checkboxes = document.querySelectorAll('#ai-action-items input[type="checkbox"]');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  checkboxes.forEach(cb => cb.checked = !allChecked);
}

// Toggle all issues
function toggleAllIssues() {
  const checkboxes = document.querySelectorAll('#ai-issues input[type="checkbox"]');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  checkboxes.forEach(cb => cb.checked = !allChecked);
}

// Create all selected items
async function createAllItems() {
  if (!currentAIAnalysis || !currentProject) return;
  
  const createBtn = document.getElementById('create-all-items-btn');
  const originalText = createBtn.innerHTML;
  
  // Get selected action items
  const selectedActionItems = [];
  const actionCheckboxes = document.querySelectorAll('#ai-action-items input[type="checkbox"]:checked');
  actionCheckboxes.forEach(cb => {
    const idx = parseInt(cb.getAttribute('data-index'));
    selectedActionItems.push(currentAIAnalysis.actionItems[idx]);
  });
  
  // Get selected issues
  const selectedIssues = [];
  const issueCheckboxes = document.querySelectorAll('#ai-issues input[type="checkbox"]:checked');
  issueCheckboxes.forEach(cb => {
    const idx = parseInt(cb.getAttribute('data-index'));
    selectedIssues.push(currentAIAnalysis.issues[idx]);
  });
  
  if (selectedActionItems.length === 0 && selectedIssues.length === 0) {
    alert('Please select at least one item to create');
    return;
  }
  
  try {
    // Disable button and show loading state
    createBtn.disabled = true;
    createBtn.innerHTML = '⏳ Creating...';
    
    const response = await axios.post('/api/meetings/create-items', {
      projectId: currentProject.id,
      transcriptId: currentAIAnalysis.transcriptId,
      analysisId: currentAIAnalysis.analysisId,
      actionItems: selectedActionItems,
      issues: selectedIssues
    }, { withCredentials: true });
    
    // Show success state briefly
    createBtn.innerHTML = '✅ Created!';
    
    alert(`Created ${response.data.actionItems.length} action items and ${response.data.issues.length} issues!`);
    
    // Reset button state before closing modal
    createBtn.innerHTML = originalText;
    createBtn.disabled = false;
    
    // Close modal and reload data
    closeAIAnalysisModal();
    await loadProjectData(currentProject.id);
    
  } catch (error) {
    console.error('Error creating items:', error);
    const errorMessage = error.response?.data?.message || error.response?.data?.error;
    
    // Re-enable button on error
    createBtn.disabled = false;
    createBtn.innerHTML = originalText;
    
    if (error.response?.status === 403) {
      // Permission denied error
      alert(`⚠️ Permission Denied\n\n${errorMessage}\n\nOnly Project Managers and System Administrators can create items from AI analysis.`);
    } else {
      alert(errorMessage || 'Failed to create items');
    }
  }
}

// Get priority CSS class
function getPriorityClass(priority) {
  const classes = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-green-100 text-green-800'
  };
  return classes[priority] || classes.medium;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize AI modal event listeners
document.addEventListener('DOMContentLoaded', function() {
  // Close button
  const closeBtn = document.getElementById('close-ai-analysis-modal-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAIAnalysisModal);
  }
  
  // File input
  const fileInput = document.getElementById('transcript-file');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }
  
  // Analyze button
  const analyzeBtn = document.getElementById('analyze-btn');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', analyzeTranscript);
  }
  
  // Toggle buttons
  const toggleActionsBtn = document.getElementById('toggle-all-actions-btn');
  if (toggleActionsBtn) {
    toggleActionsBtn.addEventListener('click', toggleAllActionItems);
  }
  
  const toggleIssuesBtn = document.getElementById('toggle-all-issues-btn');
  if (toggleIssuesBtn) {
    toggleIssuesBtn.addEventListener('click', toggleAllIssues);
  }
  
  // Reset button
  const resetBtn = document.getElementById('reset-analysis-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetAnalysis);
  }
  
  // Cancel button
  const cancelBtn = document.getElementById('cancel-ai-modal-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeAIAnalysisModal);
  }
  
  // Create items button
  const createBtn = document.getElementById('create-all-items-btn');
  if (createBtn) {
    createBtn.addEventListener('click', createAllItems);
  }
  
  // Multi-document event listeners
  const mdFileInput = document.getElementById('multi-doc-file-input');
  const mdFileList = document.getElementById('multi-doc-file-list');
  const mdProcessBtn = document.getElementById('multi-doc-process-btn');
  const mdResetBtn = document.getElementById('multi-doc-reset-btn');
  const mdImportBtn = document.getElementById('multi-doc-import-btn');
  
  if (mdFileInput) {
    mdFileInput.addEventListener('change', (e) => {
      console.log('Files selected:', e.target.files.length);
      mdSelectedFiles = Array.from(e.target.files);
      displayMultiDocFiles();
      if (mdProcessBtn) {
        mdProcessBtn.disabled = mdSelectedFiles.length === 0;
      }
    });
  }
  
  if (mdProcessBtn) {
    mdProcessBtn.addEventListener('click', processMultiDocuments);
  }
  
  if (mdResetBtn) {
    mdResetBtn.addEventListener('click', resetMultiDocWorkflow);
  }
  
  if (mdImportBtn) {
    mdImportBtn.addEventListener('click', createMultiDocResults);
  }
  
  const mdClearConsoleBtn = document.getElementById('multi-doc-clear-console');
  if (mdClearConsoleBtn) {
    mdClearConsoleBtn.addEventListener('click', clearConsole);
  }
  
  // Transcripts modal event listeners
  const closeTranscriptsBtn = document.getElementById('close-transcripts-modal-btn');
  if (closeTranscriptsBtn) {
    closeTranscriptsBtn.addEventListener('click', closeTranscriptsModal);
  }
  
  const backToListBtn = document.getElementById('back-to-list-btn');
  if (backToListBtn) {
    backToListBtn.addEventListener('click', showTranscriptsList);
  }
  
  // Hierarchy expand/collapse controls (Prompt 7)
  const expandAllBtn = document.getElementById('expand-all-btn');
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', expandAllKanbanCards);
  }
  
  const collapseAllBtn = document.getElementById('collapse-all-btn');
  if (collapseAllBtn) {
    collapseAllBtn.addEventListener('click', collapseAllKanbanCards);
  }
});

// ============= TRANSCRIPTS VIEWER =============

// Open transcripts modal
async function openTranscriptsModal() {
  if (!currentProject) return;
  
  const modal = document.getElementById('transcripts-modal');
  const loading = document.getElementById('transcripts-loading');
  const listView = document.getElementById('transcripts-list-view');
  const detailView = document.getElementById('transcript-detail-view');
  const noTranscripts = document.getElementById('no-transcripts');
  
  // Show modal and loading with SharedLoadingSpinner
  modal.classList.remove('hidden');
  if (typeof window.SharedLoadingSpinner !== 'undefined') {
    loading.innerHTML = '';
    new window.SharedLoadingSpinner(loading, {
      message: 'Loading transcripts...',
      size: 'large'
    });
  }
  loading.classList.remove('hidden');
  listView.classList.add('hidden');
  detailView.classList.add('hidden');
  
  try {
    const response = await axios.get(`/api/transcripts?projectId=${currentProject.id}`, {
      withCredentials: true
    });
    
    const transcripts = response.data;
    
    // Hide loading
    loading.classList.add('hidden');
    listView.classList.remove('hidden');
    
    // Display transcripts
    if (transcripts.length === 0) {
      // Show empty state with SharedEmptyState
      if (typeof window.SharedEmptyState !== 'undefined') {
        noTranscripts.innerHTML = '';
        new window.SharedEmptyState(noTranscripts, {
          icon: 'file-alt',
          title: 'No Transcripts Yet',
          message: 'Upload meeting transcripts to get started with AI-powered analysis.',
          actionText: null
        });
      }
      noTranscripts.classList.remove('hidden');
      document.getElementById('transcripts-list').innerHTML = '';
    } else {
      noTranscripts.classList.add('hidden');
      renderTranscriptsList(transcripts);
    }
    
  } catch (error) {
    console.error('Error loading transcripts:', error);
    loading.classList.add('hidden');
    listView.classList.remove('hidden');
    document.getElementById('transcripts-list').innerHTML = `
      <div class="text-center py-8 text-red-600">
        <p>Failed to load transcripts</p>
        <p class="text-sm mt-1">${error.response?.data?.error || error.message}</p>
      </div>
    `;
  }
}

// Close transcripts modal
function closeTranscriptsModal() {
  document.getElementById('transcripts-modal').classList.add('hidden');
}

// Render transcripts list
function renderTranscriptsList(transcripts) {
  const listContainer = document.getElementById('transcripts-list');
  
  listContainer.innerHTML = transcripts.map(transcript => {
    const date = new Date(transcript.meeting_date).toLocaleDateString();
    const uploadedDate = new Date(transcript.uploaded_at).toLocaleDateString();
    const status = transcript.status === 'processed' ? '✓' : '⚠';
    const statusColor = transcript.status === 'processed' ? 'text-green-600' : 'text-yellow-600';
    
    return `
      <div class="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-all" 
           data-transcript-id="${transcript.id}">
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <h4 class="font-semibold text-gray-800">${escapeHtml(transcript.title)}</h4>
              <span class="${statusColor} font-bold">${status}</span>
            </div>
            <p class="text-sm text-gray-600 mt-1">Meeting Date: ${date}</p>
            <p class="text-xs text-gray-500">Uploaded: ${uploadedDate} | File: ${transcript.original_filename}</p>
          </div>
          <div class="text-right">
            <div class="text-sm font-medium text-gray-700">
              ${transcript.action_items_extracted || 0} Actions, ${transcript.issues_extracted || 0} Issues
            </div>
            <div class="text-xs text-gray-500 mt-1">
              ${transcript.avg_confidence ? `Confidence: ${transcript.avg_confidence}%` : ''}
            </div>
            <div class="text-xs text-gray-400 mt-1">
              ${transcript.estimated_cost ? `Cost: $${transcript.estimated_cost}` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers to each transcript
  document.querySelectorAll('[data-transcript-id]').forEach(item => {
    item.addEventListener('click', function() {
      const transcriptId = this.getAttribute('data-transcript-id');
      viewTranscriptDetail(transcriptId);
    });
  });
}

// View single transcript detail
async function viewTranscriptDetail(transcriptId) {
  const loading = document.getElementById('transcripts-loading');
  const listView = document.getElementById('transcripts-list-view');
  const detailView = document.getElementById('transcript-detail-view');
  
  // Show loading
  listView.classList.add('hidden');
  loading.classList.remove('hidden');
  
  try {
    const response = await axios.get(`/api/transcripts/${transcriptId}`, {
      withCredentials: true
    });
    
    const transcript = response.data;
    
    // Hide loading, show detail
    loading.classList.add('hidden');
    detailView.classList.remove('hidden');
    
    // Render transcript details
    const date = new Date(transcript.meeting_date).toLocaleDateString();
    const uploadedDate = new Date(transcript.uploaded_at).toLocaleDateString();
    
    document.getElementById('transcript-header').innerHTML = `
      <h3 class="text-lg font-semibold text-gray-800 mb-2">${escapeHtml(transcript.title)}</h3>
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p class="text-gray-600">Meeting Date: <span class="font-medium">${date}</span></p>
          <p class="text-gray-600">Uploaded: <span class="font-medium">${uploadedDate}</span></p>
          <p class="text-gray-600">File: <span class="font-medium">${escapeHtml(transcript.original_filename)}</span></p>
        </div>
        <div>
          <p class="text-gray-600">Status: <span class="font-medium ${transcript.status === 'processed' ? 'text-green-600' : 'text-yellow-600'}">${transcript.status}</span></p>
          <p class="text-gray-600">Extracted: <span class="font-medium">${transcript.action_items_extracted || 0} actions, ${transcript.issues_extracted || 0} issues</span></p>
          ${transcript.avg_confidence ? `<p class="text-gray-600">Avg Confidence: <span class="font-medium">${transcript.avg_confidence}%</span></p>` : ''}
          ${transcript.estimated_cost ? `<p class="text-gray-600">Cost: <span class="font-medium">$${transcript.estimated_cost}</span></p>` : ''}
        </div>
      </div>
    `;
    
    document.getElementById('transcript-text').textContent = transcript.transcript_text || 'No transcript text available';
    
  } catch (error) {
    console.error('Error loading transcript:', error);
    loading.classList.add('hidden');
    detailView.classList.remove('hidden');
    document.getElementById('transcript-header').innerHTML = `
      <div class="text-center py-4 text-red-600">
        <p>Failed to load transcript</p>
        <p class="text-sm mt-1">${error.response?.data?.error || error.message}</p>
      </div>
    `;
  }
}

// Show transcripts list
function showTranscriptsList() {
  document.getElementById('transcript-detail-view').classList.add('hidden');
  document.getElementById('transcripts-list-view').classList.remove('hidden');
}

// ============= EDIT/DELETE FUNCTIONALITY =============

// Open edit modal for issue or action item
async function openEditModal(itemId, itemType) {
  try {
    const endpoint = itemType === 'issue' ? 'issues' : 'action-items';
    const response = await axios.get(`/api/${endpoint}/${itemId}`, {
      withCredentials: true
    });
    
    const item = response.data;
    
    if (itemType === 'issue') {
      // Populate issue edit modal
      document.getElementById('edit-issue-id').value = item.id;
      document.getElementById('edit-issue-title').value = item.title;
      document.getElementById('edit-issue-description').value = item.description || '';
      document.getElementById('edit-issue-due-date').value = item.due_date ? item.due_date.split('T')[0] : '';
      document.getElementById('edit-issue-priority').value = item.priority || 'medium';
      document.getElementById('edit-issue-status').value = item.status || 'To Do';
      document.getElementById('edit-issue-progress').value = item.completion_percentage || item.progress || 0;
      
      // Populate category dropdown options
      const categorySelect = document.getElementById('edit-issue-category');
      categorySelect.innerHTML = '<option value="">Select Category</option>' + generateCategoryOptions();
      categorySelect.value = item.category || '';
      
      // Load team members for assignee dropdown
      if (currentProject) {
        await loadTeamMembersForEdit('issue', item.assignee || '');
      }
      
      // Load tags and pre-select current ones
      await loadTagsForEditIssue(item.id);
      
      // Load attachments
      await loadEditAttachments(item.id, 'issue');
      
      // Load effort estimates and actual hours
      await loadActualHoursForEdit(item.id, 'issue');
      
      // Set item ID for "Open Effort Estimates" button
      document.getElementById('edit-issue-open-estimates').setAttribute('data-issue-id', item.id);
      
      // Set timesheet override checkbox
      document.getElementById('edit-issue-timesheet-override').checked = item.timesheet_required_override || false;
      
      // Show modal
      document.getElementById('editIssueModal').classList.remove('hidden');
    } else {
      // Populate action item edit modal
      document.getElementById('edit-action-item-id').value = item.id;
      document.getElementById('edit-action-item-title').value = item.title;
      document.getElementById('edit-action-item-description').value = item.description || '';
      document.getElementById('edit-action-item-due-date').value = item.due_date ? item.due_date.split('T')[0] : '';
      document.getElementById('edit-action-item-priority').value = item.priority || 'medium';
      document.getElementById('edit-action-item-status').value = item.status || 'To Do';
      document.getElementById('edit-action-item-progress').value = item.completion_percentage || item.progress || 0;
      
      // Load team members for assignee dropdown
      if (currentProject) {
        await loadTeamMembersForEdit('action-item', item.assignee || '');
      }
      
      // Load tags and pre-select current ones
      await loadTagsForEditActionItem(item.id);
      
      // Load attachments
      await loadEditAttachments(item.id, 'action-item');
      
      // Load effort estimates and actual hours
      await loadActualHoursForEdit(item.id, 'action-item');
      
      // Set item ID for "Open Effort Estimates" button
      document.getElementById('edit-action-item-open-estimates').setAttribute('data-action-item-id', item.id);
      
      // Set timesheet override checkbox
      document.getElementById('edit-action-item-timesheet-override').checked = item.timesheet_required_override || false;
      
      // Show modal
      document.getElementById('editActionItemModal').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error loading item for edit:', error);
    alert('Failed to load item data. Please try again.');
  }
}

// Helper function to update selected tag badges dynamically
function updateSelectedTagBadges(containerId, selectElement) {
  const container = document.getElementById(containerId);
  const selectedOptions = Array.from(selectElement.selectedOptions);
  
  if (selectedOptions.length > 0) {
    // Build badges from data attributes stored in options
    container.innerHTML = `
      <div class="flex flex-wrap gap-2 mb-2">
        ${selectedOptions.map(opt => {
          const color = opt.dataset.color;
          const name = opt.dataset.name;
          return `
            <span class="px-3 py-1 text-sm rounded-full font-medium flex items-center gap-1" 
                  style="background-color: ${color}20; color: ${color}; border: 1px solid ${color}40;">
              ${name}
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
            </span>
          `;
        }).join('')}
      </div>
    `;
  } else {
    container.innerHTML = '<p class="text-sm text-gray-500 mb-2">No tags assigned</p>';
  }
}

// Load tags for edit issue modal
async function loadTagsForEditIssue(issueId) {
  try {
    // Get all available tags for issues
    const tagsResponse = await axios.get(`/api/projects/${currentProject.id}/tags`);
    const allTags = tagsResponse.data;
    
    // Filter tags for issues/actions: 'issue_action' or 'both'
    const filteredTags = allTags.filter(tag => 
      tag.tag_type === 'issue_action' || tag.tag_type === 'both'
    );
    
    // Get current tags for this issue
    const currentTagsResponse = await axios.get(`/api/issues/${issueId}/tags`);
    const currentTags = currentTagsResponse.data;
    const currentTagIds = currentTags.map(t => t.id);
    
    // Display selected tags as badges
    const selectedTagsContainer = document.getElementById('edit-issue-selected-tags');
    if (currentTags.length > 0) {
      selectedTagsContainer.innerHTML = `
        <div class="flex flex-wrap gap-2 mb-2">
          ${currentTags.map(tag => `
            <span class="px-3 py-1 text-sm rounded-full font-medium flex items-center gap-1" 
                  style="background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}40;">
              ${tag.name}
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
            </span>
          `).join('')}
        </div>
      `;
    } else {
      selectedTagsContainer.innerHTML = '<p class="text-sm text-gray-500 mb-2">No tags assigned</p>';
    }
    
    // Populate dropdown with data attributes for color/name
    const tagSelect = document.getElementById('edit-issue-tags');
    if (filteredTags.length === 0) {
      tagSelect.innerHTML = '<option value="" disabled>No tags available</option>';
    } else {
      tagSelect.innerHTML = filteredTags.map(tag => {
        const isSelected = currentTagIds.includes(tag.id);
        return `<option value="${tag.id}" 
                        data-color="${tag.color}" 
                        data-name="${tag.name}" 
                        style="background-color: ${tag.color}20; color: #000;" 
                        ${isSelected ? 'selected' : ''}>
          ${tag.name}
        </option>`;
      }).join('');
      
      // Add change listener to update badges dynamically
      tagSelect.addEventListener('change', function() {
        updateSelectedTagBadges('edit-issue-selected-tags', tagSelect);
      });
    }
  } catch (error) {
    console.error('Error loading tags for edit:', error);
    const tagSelect = document.getElementById('edit-issue-tags');
    tagSelect.innerHTML = '<option value="" disabled>Error loading tags</option>';
  }
}

// Load tags for edit action item modal
async function loadTagsForEditActionItem(actionItemId) {
  try {
    // Get all available tags for action items
    const tagsResponse = await axios.get(`/api/projects/${currentProject.id}/tags`);
    const allTags = tagsResponse.data;
    
    // Filter tags for issues/actions: 'issue_action' or 'both'
    const filteredTags = allTags.filter(tag => 
      tag.tag_type === 'issue_action' || tag.tag_type === 'both'
    );
    
    // Get current tags for this action item
    const currentTagsResponse = await axios.get(`/api/action-items/${actionItemId}/tags`);
    const currentTags = currentTagsResponse.data;
    const currentTagIds = currentTags.map(t => t.id);
    
    // Display selected tags as badges
    const selectedTagsContainer = document.getElementById('edit-action-item-selected-tags');
    if (currentTags.length > 0) {
      selectedTagsContainer.innerHTML = `
        <div class="flex flex-wrap gap-2 mb-2">
          ${currentTags.map(tag => `
            <span class="px-3 py-1 text-sm rounded-full font-medium flex items-center gap-1" 
                  style="background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}40;">
              ${tag.name}
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
            </span>
          `).join('')}
        </div>
      `;
    } else {
      selectedTagsContainer.innerHTML = '<p class="text-sm text-gray-500 mb-2">No tags assigned</p>';
    }
    
    // Populate dropdown with data attributes for color/name
    const tagSelect = document.getElementById('edit-action-item-tags');
    if (filteredTags.length === 0) {
      tagSelect.innerHTML = '<option value="" disabled>No tags available</option>';
    } else {
      tagSelect.innerHTML = filteredTags.map(tag => {
        const isSelected = currentTagIds.includes(tag.id);
        return `<option value="${tag.id}" 
                        data-color="${tag.color}" 
                        data-name="${tag.name}" 
                        style="background-color: ${tag.color}20; color: #000;" 
                        ${isSelected ? 'selected' : ''}>
          ${tag.name}
        </option>`;
      }).join('');
      
      // Add change listener to update badges dynamically
      tagSelect.addEventListener('change', function() {
        updateSelectedTagBadges('edit-action-item-selected-tags', tagSelect);
      });
    }
  } catch (error) {
    console.error('Error loading tags for edit:', error);
    const tagSelect = document.getElementById('edit-action-item-tags');
    tagSelect.innerHTML = '<option value="" disabled>Error loading tags</option>';
  }
}

// Load team members for edit modals
async function loadTeamMembersForEdit(type, currentAssignee = '') {
  try {
    const response = await axios.get(`/api/projects/${currentProject.id}/team`, {
      withCredentials: true
    });
    
    const members = response.data;
    
    const selectId = type === 'issue' ? 'edit-issue-assignee' : 'edit-action-item-assignee';
    const select = document.getElementById(selectId);
    
    // Clear and populate
    select.innerHTML = '<option value="">Select Assignee</option>';
    members.forEach(member => {
      const option = document.createElement('option');
      option.value = member.name;
      option.textContent = member.name;
      if (member.name === currentAssignee) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading team members:', error);
  }
}

// Load attachments for edit modals
async function loadEditAttachments(itemId, itemType) {
  try {
    const entityType = itemType === 'issue' ? 'issues' : 'action-items';
    const response = await axios.get(`/api/${entityType}/${itemId}/attachments`, { withCredentials: true });
    
    const prefix = itemType === 'issue' ? 'edit-issue' : 'edit-action-item';
    const attachmentsList = document.getElementById(`${prefix}-attachments-list`);
    const attachments = response.data;
    
    if (attachments.length === 0) {
      attachmentsList.innerHTML = '<p class="text-sm text-gray-500 italic">No attachments yet</p>';
    } else {
      attachmentsList.innerHTML = attachments.map(att => `
        <div class="flex items-center justify-between p-2 border rounded hover:bg-gray-50">
          <div class="flex items-center space-x-2 flex-1 min-w-0">
            <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path>
            </svg>
            <span class="text-sm truncate">${att.file_name}</span>
            <span class="text-xs text-gray-400">(${formatFileSize(att.file_size)})</span>
          </div>
          <div class="flex items-center space-x-2 flex-shrink-0">
            <button type="button" onclick="downloadAttachment(${att.id}, '${att.file_name}')" 
                    class="text-blue-600 hover:text-blue-800 p-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
              </svg>
            </button>
            <button type="button" onclick="deleteEditAttachment(${att.id}, ${itemId}, '${itemType}')" 
                    class="text-red-600 hover:text-red-800 p-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
            </button>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading attachments:', error);
    const prefix = itemType === 'issue' ? 'edit-issue' : 'edit-action-item';
    document.getElementById(`${prefix}-attachments-list`).innerHTML = 
      '<p class="text-sm text-red-500">Failed to load attachments</p>';
  }
}

// Load actual hours and entry count for edit modals
async function loadActualHoursForEdit(itemId, itemType) {
  try {
    const endpoint = itemType === 'issue' ? 'issues' : 'action-items';
    const prefix = itemType === 'issue' ? 'edit-issue' : 'edit-action-item';
    
    // Fetch item data and time entries
    const [itemResponse, timeEntriesResponse] = await Promise.all([
      axios.get(`/api/${endpoint}/${itemId}`, { withCredentials: true }),
      axios.get(`/api/${endpoint}/${itemId}/time-entries`, { withCredentials: true })
    ]);
    
    const item = itemResponse.data;
    const timeData = timeEntriesResponse.data;
    
    // Populate actual hours field
    const actualHoursField = document.getElementById(`${prefix}-actual-hours`);
    if (actualHoursField) {
      actualHoursField.value = item.actual_effort_hours || item.actual_hours || 0;
    }
    
    // Populate entry count badge
    const timeCountBadge = document.getElementById(`${prefix}-time-count`);
    if (timeCountBadge) {
      const entriesCount = timeData.entries.length;
      timeCountBadge.textContent = `${entriesCount} ${entriesCount === 1 ? 'entry' : 'entries'}`;
    }
    
  } catch (error) {
    console.error('Error loading actual hours:', error);
    const prefix = itemType === 'issue' ? 'edit-issue' : 'edit-action-item';
    
    // Set defaults on error
    const actualHoursField = document.getElementById(`${prefix}-actual-hours`);
    if (actualHoursField) {
      actualHoursField.value = 0;
    }
    
    const timeCountBadge = document.getElementById(`${prefix}-time-count`);
    if (timeCountBadge) {
      timeCountBadge.textContent = '0 entries';
    }
  }
}

// Download attachment
async function downloadAttachment(attachmentId, fileName) {
  try {
    const response = await axios.get(`/api/attachments/${attachmentId}/download`, {
      withCredentials: true,
      responseType: 'blob'
    });
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    alert('Failed to download attachment');
  }
}

// Delete attachment from edit modal
async function deleteEditAttachment(attachmentId, itemId, itemType) {
  if (!confirm('Are you sure you want to delete this attachment?')) {
    return;
  }
  
  try {
    await axios.delete(`/api/attachments/${attachmentId}`, { withCredentials: true });
    await loadEditAttachments(itemId, itemType);
    showToast('Attachment deleted successfully', 'success');
  } catch (error) {
    console.error('Error deleting attachment:', error);
    alert('Failed to delete attachment');
  }
}

// Upload attachment from edit modal
async function uploadEditAttachment(files, itemId, itemType) {
  if (!files || files.length === 0) return;
  
  const formData = new FormData();
  Array.from(files).forEach(file => {
    formData.append('files', file);
  });
  
  try {
    const entityType = itemType === 'issue' ? 'issues' : 'action-items';
    await axios.post(`/api/${entityType}/${itemId}/attachments`, formData, {
      withCredentials: true,
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    await loadEditAttachments(itemId, itemType);
    showToast('Files uploaded successfully', 'success');
  } catch (error) {
    console.error('Error uploading attachments:', error);
    alert(error.response?.data?.error || 'Failed to upload files');
  }
}

// Handle edit issue form submission
document.getElementById('editIssueForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const itemId = document.getElementById('edit-issue-id').value;
  const data = {
    title: document.getElementById('edit-issue-title').value,
    description: document.getElementById('edit-issue-description').value,
    assignee: document.getElementById('edit-issue-assignee').value.trim(),
    due_date: document.getElementById('edit-issue-due-date').value,
    priority: document.getElementById('edit-issue-priority').value,
    status: document.getElementById('edit-issue-status').value,
    category: document.getElementById('edit-issue-category').value,
    timesheet_required_override: document.getElementById('edit-issue-timesheet-override').checked ? true : null
  };
  
  // Get selected tag IDs
  const tagSelect = document.getElementById('edit-issue-tags');
  const selectedTagIds = Array.from(tagSelect.selectedOptions).map(option => parseInt(option.value));
  
  try {
    await axios.patch(`/api/issues/${itemId}`, data, {
      withCredentials: true
    });
    
    // Update tags
    await axios.put(`/api/issues/${itemId}/tags`, { tagIds: selectedTagIds }, {
      withCredentials: true
    });
    
    // Close modal
    document.getElementById('editIssueModal').classList.add('hidden');
    
    // Reload project data and refresh kanban board
    await loadProjectData(currentProject.id);
    
    showToast('Issue updated successfully!', 'success');
    
    // Check if we should return to detail modal
    if (window.returnToDetailModal) {
      const { itemId: detailItemId, itemType } = window.returnToDetailModal;
      window.returnToDetailModal = null; // Clear the flag
      
      // Reopen the detail modal
      if (typeof openItemDetailModal === 'function') {
        openItemDetailModal(detailItemId, itemType);
      }
    }
  } catch (error) {
    console.error('Error updating issue:', error);
    alert(error.response?.data?.error || 'Failed to update issue');
  }
});

// Handle edit action item form submission
document.getElementById('editActionItemForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const itemId = document.getElementById('edit-action-item-id').value;
  const data = {
    title: document.getElementById('edit-action-item-title').value,
    description: document.getElementById('edit-action-item-description').value,
    assignee: document.getElementById('edit-action-item-assignee').value.trim(),
    due_date: document.getElementById('edit-action-item-due-date').value,
    priority: document.getElementById('edit-action-item-priority').value,
    status: document.getElementById('edit-action-item-status').value,
    progress: parseInt(document.getElementById('edit-action-item-progress').value) || 0,
    timesheet_required_override: document.getElementById('edit-action-item-timesheet-override').checked ? true : null
  };
  
  // Get selected tag IDs
  const tagSelect = document.getElementById('edit-action-item-tags');
  const selectedTagIds = Array.from(tagSelect.selectedOptions).map(option => parseInt(option.value));
  
  try {
    await axios.patch(`/api/action-items/${itemId}`, data, {
      withCredentials: true
    });
    
    // Update tags
    await axios.put(`/api/action-items/${itemId}/tags`, { tagIds: selectedTagIds }, {
      withCredentials: true
    });
    
    // Close modal
    document.getElementById('editActionItemModal').classList.add('hidden');
    
    // Reload project data and refresh kanban board
    await loadProjectData(currentProject.id);
    
    showToast('Action item updated successfully!', 'success');
    
    // Check if we should return to detail modal
    if (window.returnToDetailModal) {
      const { itemId: detailItemId, itemType } = window.returnToDetailModal;
      window.returnToDetailModal = null; // Clear the flag
      
      // Reopen the detail modal
      if (typeof openItemDetailModal === 'function') {
        openItemDetailModal(detailItemId, itemType);
      }
    }
  } catch (error) {
    console.error('Error updating action item:', error);
    alert(error.response?.data?.error || 'Failed to update action item');
  }
});

// Close edit modals
function closeEditIssueModalHandler() {
  document.getElementById('editIssueModal').classList.add('hidden');
  
  // Check if we should return to detail modal
  if (window.returnToDetailModal) {
    const { itemId, itemType } = window.returnToDetailModal;
    window.returnToDetailModal = null; // Clear the flag
    
    // Reopen the detail modal
    if (typeof openItemDetailModal === 'function') {
      openItemDetailModal(itemId, itemType);
    }
  }
}

function closeEditActionItemModalHandler() {
  document.getElementById('editActionItemModal').classList.add('hidden');
  
  // Check if we should return to detail modal
  if (window.returnToDetailModal) {
    const { itemId, itemType } = window.returnToDetailModal;
    window.returnToDetailModal = null; // Clear the flag
    
    // Reopen the detail modal
    if (typeof openItemDetailModal === 'function') {
      openItemDetailModal(itemId, itemType);
    }
  }
}

document.getElementById('closeEditIssueModal').addEventListener('click', closeEditIssueModalHandler);
document.getElementById('cancelEditIssue').addEventListener('click', closeEditIssueModalHandler);
document.getElementById('closeEditActionItemModal').addEventListener('click', closeEditActionItemModalHandler);
document.getElementById('cancelEditActionItem').addEventListener('click', closeEditActionItemModalHandler);

// Open Effort Estimates from Edit Issue modal
document.getElementById('edit-issue-open-estimates').addEventListener('click', async function() {
  const issueId = parseInt(this.getAttribute('data-issue-id'));
  if (issueId) {
    // Close Edit modal
    closeEditIssueModalHandler();
    
    // Open Detail modal and wait for it to fully load
    await openItemDetailModal(issueId, 'issue');
    
    // Now safely switch to Effort Estimates tab (note: tab name is "effort-estimates")
    const estimatesTab = document.querySelector('[data-tab="effort-estimates"]');
    if (estimatesTab) {
      estimatesTab.click();
    } else {
      console.warn('Effort Estimates tab not found after opening detail modal');
    }
  }
});

// Open Effort Estimates from Edit Action Item modal
document.getElementById('edit-action-item-open-estimates').addEventListener('click', async function() {
  const actionItemId = parseInt(this.getAttribute('data-action-item-id'));
  if (actionItemId) {
    // Close Edit modal
    closeEditActionItemModalHandler();
    
    // Open Detail modal and wait for it to fully load
    await openItemDetailModal(actionItemId, 'action-item');
    
    // Now safely switch to Effort Estimates tab (note: tab name is "effort-estimates")
    const estimatesTab = document.querySelector('[data-tab="effort-estimates"]');
    if (estimatesTab) {
      estimatesTab.click();
    } else {
      console.warn('Effort Estimates tab not found after opening detail modal');
    }
  }
});

// Confirm and delete item
async function confirmDeleteItem(itemId, itemType) {
  const itemName = itemType === 'issue' ? 'issue' : 'action item';
  
  if (!confirm(`Are you sure you want to delete this ${itemName}? This action cannot be undone.`)) {
    return;
  }
  
  try {
    const endpoint = itemType === 'issue' ? 'issues' : 'action-items';
    await axios.delete(`/api/${endpoint}/${itemId}`, {
      withCredentials: true
    });
    
    // Reload project data and refresh kanban board
    await loadProjectData(currentProject.id);
    
    showToast(`${itemName.charAt(0).toUpperCase() + itemName.slice(1)} deleted successfully!`, 'success');
  } catch (error) {
    console.error(`Error deleting ${itemName}:`, error);
    alert(error.response?.data?.error || `Failed to delete ${itemName}`);
  }
}

// Toast notification helper
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white z-50 ${
    type === 'success' ? 'bg-green-500' : 
    type === 'error' ? 'bg-red-500' : 
    'bg-blue-500'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// AI Checklist Generation
let currentAIChecklistData = null;
let selectedAttachmentIds = [];
let uploadedFiles = [];
let workstreamAnalysis = null;
let selectedChecklistIndices = [];

// Update step indicator
function updateChecklistGenerationStep(stepNumber, markComplete = false) {
  const stepNames = ['', 'Source Selection', 'Source Analysis', 'Checklist Generation', 'Preview', 'Checklist Creation'];
  
  // Update step name in title
  const stepNameEl = document.getElementById('ai-checklist-step-name');
  if (stepNameEl) {
    stepNameEl.textContent = markComplete ? '' : ` - ${stepNames[stepNumber]}`;
  }
  
  // Update step indicators
  for (let i = 1; i <= 5; i++) {
    const indicator = document.getElementById(`step-indicator-${i}`);
    const circle = indicator?.querySelector('div');
    const label = indicator?.querySelector('span');
    const line = document.getElementById(`step-line-${i}`);
    
    if (i < stepNumber || (i === stepNumber && markComplete)) {
      // Completed steps
      if (circle) {
        circle.className = 'w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-semibold';
        circle.innerHTML = '✓';
      }
      if (label) label.className = 'text-xs text-green-600 ml-1.5';
      if (line) line.className = 'w-8 h-0.5 bg-green-500';
    } else if (i === stepNumber && !markComplete) {
      // Current step
      if (circle) {
        circle.className = 'w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-semibold';
        circle.textContent = i;
      }
      if (label) label.className = 'text-xs text-blue-600 ml-1.5 font-semibold';
      if (line) line.className = 'w-8 h-0.5 bg-gray-300';
    } else {
      // Future steps
      if (circle) {
        circle.className = 'w-6 h-6 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center text-xs font-semibold';
        circle.textContent = i;
      }
      if (label) label.className = 'text-xs text-gray-500 ml-1.5';
      if (line) line.className = 'w-8 h-0.5 bg-gray-300';
    }
  }
}

async function openAIChecklistModal(itemId, itemType, itemTitle) {
  const modal = document.getElementById('ai-checklist-modal');
  const sourceSelectionEl = document.getElementById('ai-checklist-source-selection');
  const loadingEl = document.getElementById('ai-checklist-loading');
  const errorEl = document.getElementById('ai-checklist-error');
  const previewEl = document.getElementById('ai-checklist-preview');
  
  // Reset state
  currentAIChecklistData = { 
    itemId, 
    itemType, 
    itemTitle,
    projectName: currentProject?.name || 'Unknown Project',
    attachments: []
  };
  selectedAttachmentIds = [];
  uploadedFiles = [];
  workstreamAnalysis = null; // Clear cached analysis
  loadingEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  previewEl.classList.add('hidden');
  sourceSelectionEl.classList.add('hidden');
  document.getElementById('ai-checklist-workstream-analysis')?.classList.add('hidden');
  document.getElementById('ai-checklist-batch-preview')?.classList.add('hidden');
  document.getElementById('newly-uploaded-files').innerHTML = ''; // Clear uploaded files UI
  
  // Set header information
  const itemTypeLabel = itemType === 'issue' ? 'Issue' : 'Action Item';
  document.getElementById('ai-checklist-project-name').textContent = currentProject?.name || 'Unknown Project';
  document.getElementById('ai-checklist-item-info').textContent = `${itemTypeLabel}: ${itemTitle}`;
  updateSourcesDisplay();
  
  // Show modal and source selection
  modal.classList.remove('hidden');
  sourceSelectionEl.classList.remove('hidden');
  
  // Set to Step 1: Source Selection
  updateChecklistGenerationStep(1);
  
  // Load existing attachments
  await loadExistingAttachments(itemId, itemType);
  
  // Setup event listeners
  setupSourceSelectionListeners();
}

async function loadExistingAttachments(itemId, itemType) {
  try {
    const entityType = itemType === 'issue' ? 'issues' : 'action-items';
    const response = await axios.get(`/api/${entityType}/${itemId}/attachments`, { withCredentials: true });
    
    const attachmentsList = document.getElementById('existing-attachments-list');
    const attachments = response.data;
    
    if (attachments.length === 0) {
      attachmentsList.innerHTML = '<p class="text-xs text-gray-400 italic">No existing attachments</p>';
    } else {
      attachmentsList.innerHTML = attachments.map(att => {
        const supportedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
        const isSupported = supportedTypes.includes(att.file_type);
        
        return `
          <label class="flex items-center space-x-2 p-2 border rounded cursor-pointer hover:bg-gray-50 ${!isSupported ? 'opacity-50' : ''}">
            <input type="checkbox" class="attachment-checkbox" data-attachment-id="${att.id}" ${!isSupported ? 'disabled' : ''}>
            <div class="flex-1">
              <div class="text-sm font-medium text-gray-900">${att.original_name}</div>
              <div class="text-xs text-gray-500">${formatFileSize(att.file_size)}${!isSupported ? ' - Unsupported format' : ''}</div>
            </div>
          </label>
        `;
      }).join('');
    }
    
    updateAttachmentCount();
  } catch (error) {
    console.error('Error loading attachments:', error);
    document.getElementById('existing-attachments-list').innerHTML = '<p class="text-xs text-red-500">Failed to load attachments</p>';
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function setupSourceSelectionListeners() {
  // Description checkbox
  const descCheckbox = document.getElementById('use-description-checkbox');
  if (descCheckbox) {
    descCheckbox.onchange = () => {
      updateSourcesDisplay();
    };
  }
  
  // Upload button
  document.getElementById('upload-attachment-btn').onclick = () => {
    document.getElementById('attachment-upload-input').click();
  };
  
  // File upload handler
  document.getElementById('attachment-upload-input').onchange = async (e) => {
    const files = Array.from(e.target.files);
    await handleFileUploads(files);
    e.target.value = ''; // Reset input
  };
  
  // Attachment checkboxes
  document.querySelectorAll('.attachment-checkbox').forEach(cb => {
    cb.onchange = () => {
      const id = parseInt(cb.dataset.attachmentId);
      if (cb.checked) {
        if (!selectedAttachmentIds.includes(id)) {
          selectedAttachmentIds.push(id);
        }
      } else {
        selectedAttachmentIds = selectedAttachmentIds.filter(aid => aid !== id);
      }
      updateAttachmentCount();
    };
  });
  
  // Cancel button
  document.getElementById('cancel-source-selection-btn').onclick = () => {
    document.getElementById('ai-checklist-modal').classList.add('hidden');
  };
  
  // Generate button
  document.getElementById('generate-with-sources-btn').onclick = async () => {
    await generateWithSelectedSources();
  };
}

async function handleFileUploads(files) {
  const newlyUploadedEl = document.getElementById('newly-uploaded-files');
  const entityType = currentAIChecklistData.itemType === 'issue' ? 'issues' : 'action-items';
  
  for (const file of files) {
    // Validate file size
    if (file.size > 10 * 1024 * 1024) {
      showToast(`${file.name} is too large (max 10MB)`, 'error');
      continue;
    }
    
    // Upload file
    try {
      const formData = new FormData();
      formData.append('files', file);
      
      const response = await axios.post(
        `/api/${entityType}/${currentAIChecklistData.itemId}/attachments`,
        formData,
        { 
          withCredentials: true,
          headers: { 'Content-Type': 'multipart/form-data' }
        }
      );
      
      const uploadedFile = response.data.attachments ? response.data.attachments[0] : response.data[0];
      uploadedFiles.push(uploadedFile);
      selectedAttachmentIds.push(uploadedFile.id);
      
      // Add to UI
      const fileEl = document.createElement('div');
      fileEl.className = 'flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded';
      fileEl.innerHTML = `
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
          </svg>
          <div>
            <div class="text-sm font-medium text-gray-900">${uploadedFile.original_name}</div>
            <div class="text-xs text-gray-500">${formatFileSize(uploadedFile.file_size)}</div>
          </div>
        </div>
        <button class="text-red-500 hover:text-red-700" onclick="removeUploadedFile(${uploadedFile.id})">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
      `;
      newlyUploadedEl.appendChild(fileEl);
      
      updateAttachmentCount();
      showToast(`${file.name} uploaded successfully`, 'success');
      
    } catch (error) {
      console.error('Upload error:', error);
      showToast(`Failed to upload ${file.name}`, 'error');
    }
  }
}

function removeUploadedFile(attachmentId) {
  selectedAttachmentIds = selectedAttachmentIds.filter(id => id !== attachmentId);
  uploadedFiles = uploadedFiles.filter(f => f.id !== attachmentId);
  updateAttachmentCount();
  
  // Remove from UI
  const container = document.getElementById('newly-uploaded-files');
  const fileElements = container.children;
  for (let el of fileElements) {
    if (el.querySelector('button').onclick.toString().includes(attachmentId)) {
      el.remove();
      break;
    }
  }
}

function updateAttachmentCount() {
  const badge = document.getElementById('attachment-count-badge');
  badge.textContent = `${selectedAttachmentIds.length} selected`;
  updateSourcesDisplay();
}

function updateSourcesDisplay() {
  const sourcesEl = document.getElementById('ai-checklist-sources');
  const useDescription = document.getElementById('use-description-checkbox')?.checked;
  const sources = [];
  
  // Add description if selected
  if (useDescription) {
    sources.push('Description');
  }
  
  // Add attachment names
  const attachmentNames = [];
  
  // Get names from uploaded files
  uploadedFiles.forEach(file => {
    if (selectedAttachmentIds.includes(file.id)) {
      attachmentNames.push(file.original_name);
    }
  });
  
  // Get names from existing attachments
  document.querySelectorAll('.attachment-checkbox:checked').forEach(cb => {
    const label = cb.closest('label');
    const nameEl = label?.querySelector('.text-sm.font-medium');
    if (nameEl && !attachmentNames.includes(nameEl.textContent)) {
      attachmentNames.push(nameEl.textContent);
    }
  });
  
  if (attachmentNames.length > 0) {
    sources.push(`Files: ${attachmentNames.join(', ')}`);
  }
  
  // Update display
  if (sources.length > 0) {
    sourcesEl.textContent = `Sources: ${sources.join(' • ')}`;
  } else {
    sourcesEl.textContent = 'Sources: None selected';
  }
}

async function generateWithSelectedSources() {
  console.log('[DEBUG] generateWithSelectedSources called');
  const useDescription = document.getElementById('use-description-checkbox').checked;
  
  if (!useDescription && selectedAttachmentIds.length === 0) {
    showToast('Please select at least one source (description or attachments)', 'error');
    return;
  }
  
  // Clear previous analysis to ensure fresh generation
  console.log('[DEBUG] Clearing workstreamAnalysis');
  workstreamAnalysis = null;
  
  // Hide source selection, show loading
  document.getElementById('ai-checklist-source-selection').classList.add('hidden');
  document.getElementById('ai-checklist-loading').classList.remove('hidden');
  document.getElementById('loading-main-text').textContent = 'AI is analyzing your content...';
  document.getElementById('loading-sub-text').textContent = 'Detecting workstreams and complexity';
  
  // Store current selections
  currentAIChecklistData.attachment_ids = selectedAttachmentIds;
  currentAIChecklistData.use_description = useDescription;
  
  // If attachments selected, analyze for workstreams first
  if (selectedAttachmentIds.length > 0) {
    // Show warning for unsupported file types
    const selectedAttachments = currentAIChecklistData.attachments?.filter(
      a => selectedAttachmentIds.includes(a.id)
    ) || [];
    
    const unsupportedTypes = selectedAttachments.filter(
      a => !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'].includes(a.file_type)
    );
    
    if (unsupportedTypes.length > 0) {
      showToast(
        `⚠️ ${unsupportedTypes.length} file${unsupportedTypes.length > 1 ? 's' : ''} may not extract properly (only PDF, DOCX, TXT supported)`,
        'warning',
        4000
      );
    }
    
    // Set to Step 2: Source Analysis (active during loading)
    updateChecklistGenerationStep(2);
    try {
      const analysisResponse = await axios.post('/api/checklists/analyze-document', {
        source_type: currentAIChecklistData.itemType,
        source_id: currentAIChecklistData.itemId,
        attachment_ids: selectedAttachmentIds
      }, { withCredentials: true });
      
      workstreamAnalysis = analysisResponse.data;
      
      // Show workstream analysis UI
      document.getElementById('ai-checklist-loading').classList.add('hidden');
      renderWorkstreamAnalysis(workstreamAnalysis);
      document.getElementById('ai-checklist-workstream-analysis').classList.remove('hidden');
      
      // Mark Step 2 as complete (analysis done, showing results)
      updateChecklistGenerationStep(2, true);
      
    } catch (error) {
      document.getElementById('ai-checklist-loading').classList.add('hidden');
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to analyze document';
      document.getElementById('ai-checklist-error-message').textContent = errorMessage;
      document.getElementById('ai-checklist-error').classList.remove('hidden');
    }
  } else {
    // No attachments, generate single checklist directly
    await generateSingleChecklist();
  }
}

async function generateSingleChecklist() {
  // Show loading
  document.getElementById('ai-checklist-workstream-analysis')?.classList.add('hidden');
  document.getElementById('ai-checklist-loading').classList.remove('hidden');
  
  // Set to Step 3: Checklist Generation
  updateChecklistGenerationStep(3);
  
  document.getElementById('loading-main-text').textContent = `Generating checklist for ${currentAIChecklistData.projectName}`;
  document.getElementById('loading-sub-text').textContent = 'Creating comprehensive task list';
  
  try {
    const endpoint = currentAIChecklistData.itemType === 'issue' 
      ? `/api/checklists/generate-from-issue` 
      : `/api/checklists/generate-from-action`;
    
    const response = await axios.post(endpoint, {
      [currentAIChecklistData.itemType === 'issue' ? 'issue_id' : 'action_id']: currentAIChecklistData.itemId,
      attachment_ids: currentAIChecklistData.attachment_ids || [],
      use_description: currentAIChecklistData.use_description,
      project_id: currentProject.id
    }, { withCredentials: true });
    
    // Store the generated data
    currentAIChecklistData.preview = response.data;
    
    // Show rate limit info if available
    if (response.data.rate_limit_remaining !== undefined) {
      const remaining = response.data.rate_limit_remaining;
      if (remaining <= 3 && remaining > 0) {
        showToast(`⚠️ ${remaining} generation${remaining !== 1 ? 's' : ''} remaining this hour`, 'warning', 5000);
      } else if (remaining === 0) {
        showToast('🚫 Rate limit reached for this hour', 'warning', 5000);
      }
    }
    
    // Show preview
    document.getElementById('ai-checklist-loading').classList.add('hidden');
    renderAIChecklistPreview(response.data);
    document.getElementById('ai-checklist-preview').classList.remove('hidden');
    
    // Set to Step 4: Preview
    updateChecklistGenerationStep(4);
    
  } catch (error) {
    document.getElementById('ai-checklist-loading').classList.add('hidden');
    const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to generate checklist';
    document.getElementById('ai-checklist-error-message').textContent = errorMessage;
    document.getElementById('ai-checklist-error').classList.remove('hidden');
  }
}

async function generateMultipleChecklists() {
  console.log('[DEBUG] generateMultipleChecklists called');
  console.log('[DEBUG] workstreamAnalysis:', workstreamAnalysis);
  
  if (!workstreamAnalysis?.workstreams) {
    console.error('[DEBUG] No workstream data!');
    showToast('No workstream data available', 'error');
    return;
  }
  
  console.log('[DEBUG] Starting batch generation for', workstreamAnalysis.workstreams.length, 'workstreams');
  const totalChecklists = workstreamAnalysis.workstreams.length;
  
  // Show loading with progress
  document.getElementById('ai-checklist-workstream-analysis').classList.add('hidden');
  document.getElementById('ai-checklist-loading').classList.remove('hidden');
  
  // Set to Step 3: Checklist Generation
  updateChecklistGenerationStep(3);
  
  // Update loading text
  document.getElementById('loading-main-text').textContent = `Generating ${totalChecklists} checklists for ${currentAIChecklistData.projectName}`;
  document.getElementById('loading-sub-text').textContent = 'AI is analyzing each workstream';
  
  // Show progress bar
  const progressContainer = document.getElementById('batch-progress-container');
  const progressBar = document.getElementById('batch-progress-bar');
  const progressText = document.getElementById('batch-progress-text');
  const progressPercent = document.getElementById('batch-progress-percent');
  const timeEstimate = document.getElementById('loading-time-estimate');
  
  progressContainer.classList.remove('hidden');
  
  // Estimate: ~8 seconds per checklist
  const estimatedTime = totalChecklists * 8;
  timeEstimate.textContent = `Estimated time: ${estimatedTime}-${estimatedTime + 20} seconds`;
  
  // Simulate progress (since backend doesn't send real-time updates)
  let currentProgress = 0;
  const progressInterval = setInterval(() => {
    // Increment progress slowly (95% max before completion)
    currentProgress = Math.min(currentProgress + (95 / (estimatedTime * 1.2)), 95);
    const currentChecklistIndex = Math.min(Math.ceil((currentProgress / 95) * totalChecklists), totalChecklists);
    const currentChecklistName = workstreamAnalysis.workstreams[currentChecklistIndex - 1]?.name || 'Checklist';
    
    progressBar.style.width = `${currentProgress}%`;
    progressPercent.textContent = `${Math.round(currentProgress)}%`;
    progressText.textContent = `Generating ${currentChecklistName} for ${currentAIChecklistData.projectName}`;
    
    // Update main text with checklist number
    document.getElementById('loading-main-text').textContent = `Generating checklist ${currentChecklistIndex} of ${totalChecklists}`;
  }, 1000);
  
  try {
    const response = await axios.post('/api/checklists/generate-batch', {
      source_type: currentAIChecklistData.itemType,
      source_id: currentAIChecklistData.itemId,
      attachment_ids: currentAIChecklistData.attachment_ids || [],
      workstreams: workstreamAnalysis.workstreams,
      use_description: currentAIChecklistData.use_description
    }, { 
      withCredentials: true,
      timeout: 300000 // 5 minute timeout (for large batch generations)
    });
    
    // Complete progress
    clearInterval(progressInterval);
    progressBar.style.width = '100%';
    progressPercent.textContent = '100%';
    progressText.textContent = `All ${totalChecklists} checklists generated!`;
    
    // Store batch results
    currentAIChecklistData.batchResults = response.data;
    
    // Small delay to show completion
    setTimeout(() => {
      // Hide loading and reset progress
      document.getElementById('ai-checklist-loading').classList.add('hidden');
      progressContainer.classList.add('hidden');
      progressBar.style.width = '0%';
      
      // Show batch preview
      renderBatchPreview(response.data);
      document.getElementById('ai-checklist-batch-preview').classList.remove('hidden');
      
      // Set to Step 4: Preview
      updateChecklistGenerationStep(4);
    }, 500);
    
  } catch (error) {
    clearInterval(progressInterval);
    document.getElementById('ai-checklist-loading').classList.add('hidden');
    progressContainer.classList.add('hidden');
    progressBar.style.width = '0%';
    
    const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to generate checklists';
    document.getElementById('ai-checklist-error-message').textContent = errorMessage;
    document.getElementById('ai-checklist-error').classList.remove('hidden');
  }
}

function renderWorkstreamAnalysis(analysis) {
  const detailsContainer = document.getElementById('workstream-analysis-details');
  
  const complexityColors = {
    'Simple': 'bg-green-100 text-green-700',
    'Medium': 'bg-yellow-100 text-yellow-700',
    'Complex': 'bg-red-100 text-red-700'
  };
  
  detailsContainer.innerHTML = `
    <div class="bg-white border rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h5 class="font-semibold text-gray-800">Document Analysis</h5>
        <span class="text-xs px-2 py-1 ${complexityColors[analysis.complexity] || 'bg-gray-100 text-gray-700'} rounded-full font-semibold">
          ${analysis.complexity} Document
        </span>
      </div>
      
      <div class="grid grid-cols-3 gap-3 mb-3">
        <div class="text-center p-2 bg-blue-50 rounded">
          <div class="text-2xl font-bold text-blue-600">${analysis.workstreams?.length || 0}</div>
          <div class="text-xs text-gray-600">Workstreams</div>
        </div>
        <div class="text-center p-2 bg-purple-50 rounded">
          <div class="text-2xl font-bold text-purple-600">${analysis.total_estimated_items || 0}</div>
          <div class="text-xs text-gray-600">Total Items</div>
        </div>
        <div class="text-center p-2 bg-green-50 rounded">
          <div class="text-2xl font-bold text-green-600">${analysis.recommendation === 'multiple' ? 'Multiple' : 'Single'}</div>
          <div class="text-xs text-gray-600">Recommended</div>
        </div>
      </div>
      
      <div class="border-t pt-3">
        <p class="text-xs font-medium text-gray-700 mb-2">Detected Workstreams:</p>
        <div class="space-y-1">
          ${analysis.workstreams?.map((ws, i) => `
            <div class="flex items-center text-xs text-gray-600">
              <span class="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center mr-2 font-semibold">${i + 1}</span>
              <span class="flex-1">${ws.name}</span>
              <span class="text-gray-400">${ws.estimated_items} items</span>
            </div>
          `).join('') || '<p class="text-xs text-gray-500">No workstreams detected</p>'}
        </div>
      </div>
    </div>
  `;
  
  // Update button styling and badges based on recommendation
  const singleBtn = document.getElementById('generate-single-checklist-btn');
  const multipleBtn = document.getElementById('generate-multiple-checklists-btn');
  const singleBadge = document.getElementById('single-recommended-badge');
  const multipleBadge = document.getElementById('multiple-recommended-badge');
  
  if (analysis.recommendation === 'multiple') {
    // Multiple is recommended
    multipleBadge.classList.remove('hidden');
    singleBadge.classList.add('hidden');
    multipleBtn.className = 'w-full text-left border-2 border-blue-500 bg-blue-50 rounded-lg p-4 hover:bg-blue-100 transition-colors';
    singleBtn.className = 'w-full text-left border rounded-lg p-4 hover:bg-gray-50 transition-colors';
  } else {
    // Single is recommended
    singleBadge.classList.remove('hidden');
    multipleBadge.classList.add('hidden');
    singleBtn.className = 'w-full text-left border-2 border-blue-500 bg-blue-50 rounded-lg p-4 hover:bg-blue-100 transition-colors';
    multipleBtn.className = 'w-full text-left border rounded-lg p-4 hover:bg-gray-50 transition-colors';
  }
}

function renderBatchPreview(batchData) {
  const container = document.getElementById('batch-checklist-previews');
  const summaryContainer = document.getElementById('batch-summary');
  
  const successfulChecklists = batchData.results?.filter(r => r.success) || [];
  const failedChecklists = batchData.results?.filter(r => !r.success) || [];
  const totalRequested = batchData.workstreams_requested || batchData.results?.length || 0;
  
  // Store failed checklists for retry
  currentAIChecklistData.failedChecklists = failedChecklists;
  
  // Render summary
  const allSuccess = failedChecklists.length === 0;
  const partialSuccess = successfulChecklists.length > 0 && failedChecklists.length > 0;
  const allFailed = successfulChecklists.length === 0;
  
  summaryContainer.innerHTML = `
    <div class="flex items-start">
      ${allSuccess ? `
        <svg class="w-5 h-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
        <div class="flex-1">
          <p class="text-sm font-medium text-green-800">All Checklists Generated Successfully!</p>
          <p class="text-xs text-green-600 mt-1">${successfulChecklists.length} of ${totalRequested} checklists ready to create</p>
        </div>
      ` : partialSuccess ? `
        <svg class="w-5 h-5 text-yellow-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <div class="flex-1">
          <p class="text-sm font-medium text-yellow-800">Partial Success</p>
          <p class="text-xs text-yellow-600 mt-1">
            <span class="font-semibold">${successfulChecklists.length} of ${totalRequested}</span> checklists generated successfully. 
            <span class="font-semibold">${failedChecklists.length}</span> failed.
          </p>
        </div>
      ` : `
        <svg class="w-5 h-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>
        <div class="flex-1">
          <p class="text-sm font-medium text-red-800">All Checklists Failed</p>
          <p class="text-xs text-red-600 mt-1">None of the ${totalRequested} checklists could be generated. See errors below.</p>
        </div>
      `}
    </div>
  `;
  
  // Show rate limit warning if applicable
  const rateLimitWarning = document.getElementById('batch-rate-limit-warning');
  const rateLimitText = document.getElementById('rate-limit-warning-text');
  
  if (batchData.rate_limit_remaining !== undefined) {
    const remaining = batchData.rate_limit_remaining;
    if (remaining <= 3 && remaining > 0) {
      rateLimitWarning.classList.remove('hidden');
      rateLimitText.textContent = `⚠️ Rate limit warning: Only ${remaining} generation${remaining !== 1 ? 's' : ''} remaining this hour`;
    } else if (remaining === 0) {
      rateLimitWarning.classList.remove('hidden');
      rateLimitText.textContent = '🚫 Rate limit reached: Maximum generations per hour exceeded';
    } else {
      rateLimitWarning.classList.add('hidden');
    }
  }
  
  // Initialize all successful checklists as selected
  selectedChecklistIndices = successfulChecklists.map((_, index) => index);
  
  // Render both successful and failed checklists
  container.innerHTML = [
    // Successful checklists
    ...successfulChecklists.map((result, index) => {
      const preview = result.preview;
      const totalItems = preview.sections.reduce((sum, sec) => sum + sec.items.length, 0);
      
      return `
        <div class="border border-green-200 rounded-lg p-4 bg-white">
          <div class="flex items-start gap-3 mb-3">
            <input type="checkbox" 
                   id="checklist-select-${index}" 
                   data-index="${index}"
                   class="checklist-select-checkbox mt-1 w-4 h-4 text-green-600 rounded focus:ring-2 focus:ring-green-500" 
                   checked>
            <div class="flex-1">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <svg class="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                  </svg>
                  <h5 class="font-semibold text-gray-900">${preview.title}</h5>
                </div>
                <span class="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">${totalItems} items</span>
              </div>
              
              ${preview.description ? `
                <p class="text-xs text-gray-600 mb-3">${preview.description}</p>
              ` : ''}
              
              <details class="text-xs">
                <summary class="cursor-pointer text-blue-600 hover:text-blue-700 font-medium">▶ View sections (${preview.sections.length})</summary>
                <div class="mt-3 space-y-3">
                  ${preview.sections.map((section, sIdx) => `
                    <div class="border-l-2 border-blue-400 pl-3 pb-2">
                      <div class="flex items-center justify-between mb-2">
                        <div class="font-semibold text-gray-800">${sIdx + 1}. ${section.title}</div>
                        <span class="text-gray-500 text-xs">${section.items.length} items</span>
                      </div>
                      ${section.description ? `
                        <p class="text-gray-600 italic mb-2 text-xs">${section.description}</p>
                      ` : ''}
                      <div class="space-y-1.5 mt-2">
                        ${section.items.map((item, itemIdx) => `
                          <div class="flex items-start gap-2 text-gray-700 bg-gray-50 rounded px-2 py-1.5">
                            <span class="text-gray-400 font-mono text-xs mt-0.5 flex-shrink-0">${itemIdx + 1}.</span>
                            <span class="flex-1 text-xs">
                              ${item.text || item.title || item.item_text}
                              ${item.is_required ? '<span class="text-red-500 font-bold ml-1" title="Required">*</span>' : ''}
                              ${item.field_type && item.field_type !== 'checkbox' ? `<span class="text-gray-400 ml-2">(${item.field_type})</span>` : ''}
                            </span>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </details>
            </div>
          </div>
        </div>
      `;
    }),
    // Failed checklists
    ...failedChecklists.map((result, index) => {
      return `
        <div class="border border-red-200 rounded-lg p-4 bg-red-50">
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
            </svg>
            <div class="flex-1">
              <div class="flex items-center justify-between mb-2">
                <h5 class="font-semibold text-red-900">${result.workstream_name}</h5>
                <button onclick="retryFailedChecklist(${index})" 
                        class="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
                  Retry
                </button>
              </div>
              <p class="text-xs text-red-700">
                <span class="font-medium">Error:</span> ${result.error || 'Unknown error occurred'}
              </p>
            </div>
          </div>
        </div>
      `;
    })
  ].join('');
  
  // Add event listeners to checkboxes
  document.querySelectorAll('.checklist-select-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateChecklistSelection);
  });
  
  // Show/hide retry all button
  const retryBtn = document.getElementById('retry-failed-checklists-btn');
  const retryBtnText = document.getElementById('retry-btn-text');
  if (failedChecklists.length > 0) {
    retryBtn.classList.remove('hidden');
    retryBtnText.textContent = failedChecklists.length === 1 ? 'Retry Failed' : `Retry ${failedChecklists.length} Failed`;
  } else {
    retryBtn.classList.add('hidden');
  }
  
  // Update create button text
  updateBatchCreateButtonText();
}

function updateChecklistSelection(event) {
  const index = parseInt(event.target.dataset.index);
  
  if (event.target.checked) {
    // Add to selection if not already there
    if (!selectedChecklistIndices.includes(index)) {
      selectedChecklistIndices.push(index);
    }
  } else {
    // Remove from selection
    selectedChecklistIndices = selectedChecklistIndices.filter(i => i !== index);
  }
  
  updateBatchCreateButtonText();
}

function updateBatchCreateButtonText() {
  const buttonText = document.getElementById('create-batch-btn-text');
  const count = selectedChecklistIndices.length;
  
  if (count === 0) {
    buttonText.textContent = 'Select checklists to create';
  } else if (count === 1) {
    buttonText.textContent = 'Create 1 Checklist';
  } else {
    buttonText.textContent = `Create ${count} Checklists`;
  }
}

// Retry a single failed checklist
async function retryFailedChecklist(failedIndex) {
  const failedChecklist = currentAIChecklistData.failedChecklists[failedIndex];
  if (!failedChecklist) {
    showToast('Failed checklist not found', 'error');
    return;
  }
  
  showToast(`Retrying generation for ${failedChecklist.workstream_name}...`, 'info');
  
  try {
    const response = await axios.post('/api/checklists/generate-batch', {
      source_type: currentAIChecklistData.itemType,
      source_id: currentAIChecklistData.itemId,
      attachment_ids: currentAIChecklistData.attachment_ids || [],
      workstreams: [{ name: failedChecklist.workstream_name }],
      use_description: currentAIChecklistData.use_description
    }, { 
      withCredentials: true,
      timeout: 90000
    });
    
    if (response.data.results && response.data.results[0]?.success) {
      // Replace failed checklist with successful one
      currentAIChecklistData.batchResults.results = currentAIChecklistData.batchResults.results.map((result, idx) => {
        if (result.workstream_name === failedChecklist.workstream_name && !result.success) {
          return response.data.results[0];
        }
        return result;
      });
      
      // Update rate limit info
      currentAIChecklistData.batchResults.rate_limit_remaining = response.data.rate_limit_remaining;
      
      // Re-render preview
      renderBatchPreview(currentAIChecklistData.batchResults);
      showToast(`Successfully generated ${failedChecklist.workstream_name}`, 'success');
    } else {
      showToast(`Retry failed: ${response.data.results[0]?.error || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Retry failed';
    showToast(errorMessage, 'error');
  }
}

// Retry all failed checklists
async function retryAllFailedChecklists() {
  const failedChecklists = currentAIChecklistData.failedChecklists || [];
  if (failedChecklists.length === 0) {
    return;
  }
  
  const failedWorkstreams = failedChecklists.map(fc => ({ name: fc.workstream_name }));
  showToast(`Retrying ${failedWorkstreams.length} failed checklist${failedWorkstreams.length > 1 ? 's' : ''}...`, 'info');
  
  try {
    const response = await axios.post('/api/checklists/generate-batch', {
      source_type: currentAIChecklistData.itemType,
      source_id: currentAIChecklistData.itemId,
      attachment_ids: currentAIChecklistData.attachment_ids || [],
      workstreams: failedWorkstreams,
      use_description: currentAIChecklistData.use_description
    }, { 
      withCredentials: true,
      timeout: 300000
    });
    
    // Merge retry results with existing results
    const retryResultsMap = new Map(
      response.data.results.map(r => [r.workstream_name, r])
    );
    
    currentAIChecklistData.batchResults.results = currentAIChecklistData.batchResults.results.map(result => {
      if (!result.success && retryResultsMap.has(result.workstream_name)) {
        return retryResultsMap.get(result.workstream_name);
      }
      return result;
    });
    
    // Update rate limit info
    currentAIChecklistData.batchResults.rate_limit_remaining = response.data.rate_limit_remaining;
    
    // Re-render preview
    renderBatchPreview(currentAIChecklistData.batchResults);
    
    const successCount = response.data.results.filter(r => r.success).length;
    const failCount = response.data.results.filter(r => !r.success).length;
    
    if (successCount > 0 && failCount === 0) {
      showToast(`All ${successCount} checklists generated successfully!`, 'success');
    } else if (successCount > 0) {
      showToast(`${successCount} succeeded, ${failCount} still failed`, 'warning');
    } else {
      showToast('All retry attempts failed', 'error');
    }
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Retry failed';
    showToast(errorMessage, 'error');
  }
}

function renderAIChecklistPreview(data) {
  const templateBadge = document.getElementById('ai-checklist-template-badge');
  const sectionsContainer = document.getElementById('ai-checklist-sections');
  
  // Calculate total items
  const totalItems = data.sections.reduce((sum, section) => sum + section.items.length, 0);
  
  // Show checklist title with item count
  templateBadge.innerHTML = `
    <span class="flex items-center gap-2">
      <span>✨ ${data.title || 'Generated Checklist'}</span>
      <span class="bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full font-semibold">${totalItems} items</span>
    </span>
  `;
  
  // Render sections and items with enhanced styling
  sectionsContainer.innerHTML = data.sections.map((section, index) => `
    <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="flex items-center justify-center w-6 h-6 bg-blue-500 text-white text-xs font-bold rounded-full">${index + 1}</span>
          <h5 class="font-semibold text-sm text-gray-900">${section.title || section.name}</h5>
        </div>
        <span class="text-xs text-gray-500">${section.items.length} ${section.items.length === 1 ? 'item' : 'items'}</span>
      </div>
      
      ${section.description ? `
        <p class="text-xs text-gray-600 mb-3 pl-8 italic">${section.description}</p>
      ` : ''}
      
      <div class="space-y-2 pl-8">
        ${section.items.map((item, itemIndex) => `
          <div class="flex items-start gap-2 text-sm text-gray-700 group">
            <span class="text-gray-400 font-mono text-xs mt-0.5">${itemIndex + 1}.</span>
            <span class="flex-1">
              ${item.text || item.title}
              ${item.is_required ? '<span class="text-red-500 font-semibold ml-1" title="Required">*</span>' : ''}
              ${item.field_type && item.field_type !== 'checkbox' ? `<span class="text-xs text-gray-400 ml-2">(${item.field_type})</span>` : ''}
            </span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

async function confirmAIChecklistCreation() {
  if (!currentAIChecklistData?.preview) {
    showToast('No checklist data available', 'error');
    return;
  }
  
  // Set to Step 5: Checklist Creation
  updateChecklistGenerationStep(5);
  
  try {
    const response = await axios.post('/api/checklists/confirm-generated', {
      preview: currentAIChecklistData.preview,
      source_id: currentAIChecklistData.itemId,
      source_type: currentAIChecklistData.itemType === 'issue' ? 'issue' : 'action-item',
      project_id: currentProject.id,
      attachment_ids: currentAIChecklistData.attachment_ids || [],
      use_description: currentAIChecklistData.use_description !== undefined ? currentAIChecklistData.use_description : true
    }, { withCredentials: true });
    
    // Dispatch checklist update event for real-time badge refresh
    window.dispatchChecklistUpdate(
      currentAIChecklistData.itemType === 'issue' ? 'issue' : 'action-item',
      currentAIChecklistData.itemId
    );
    
    // Close modal
    document.getElementById('ai-checklist-modal').classList.add('hidden');
    showToast('AI Checklist created successfully!', 'success');
    
    // Show promotion prompt if it's a new AI template
    if (response.data.is_new_template && response.data.template_id) {
      showTemplatePromotionPrompt(response.data.template_id);
    } else {
      // Navigate to checklists page after delay to show toast
      setTimeout(() => {
        navigateToChecklists();
      }, 2000);
    }
    
  } catch (error) {
    console.error('Error confirming checklist:', error);
    showToast(error.response?.data?.error || 'Failed to create checklist', 'error');
  }
}

async function confirmBatchChecklistCreation() {
  if (!currentAIChecklistData?.batchResults) {
    showToast('No batch data available', 'error');
    return;
  }
  
  // Check if any checklists are selected
  if (selectedChecklistIndices.length === 0) {
    showToast('Please select at least one checklist to create', 'error');
    return;
  }
  
  try {
    const successfulResults = currentAIChecklistData.batchResults.results.filter(r => r.success);
    
    // Filter to only selected checklists
    const selectedPreviews = selectedChecklistIndices
      .sort((a, b) => a - b) // Sort to maintain order
      .map(index => successfulResults[index].preview);
    
    const totalChecklists = selectedPreviews.length;
    
    // Hide preview and show loading with creation progress
    document.getElementById('ai-checklist-batch-preview').classList.add('hidden');
    document.getElementById('ai-checklist-loading').classList.remove('hidden');
    
    // Set to Step 5: Checklist Creation
    updateChecklistGenerationStep(5);
    
    // Setup progress UI
    document.getElementById('loading-main-text').textContent = `Creating ${totalChecklists} checklists...`;
    document.getElementById('loading-sub-text').textContent = 'Saving to database';
    
    const progressContainer = document.getElementById('batch-progress-container');
    const progressBar = document.getElementById('batch-progress-bar');
    const progressText = document.getElementById('batch-progress-text');
    const progressPercent = document.getElementById('batch-progress-percent');
    
    progressContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    
    // Simulate progress during database creation
    let currentProgress = 0;
    const estimatedTime = totalChecklists * 1.5; // ~1.5 seconds per checklist for DB operations
    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + (95 / (estimatedTime * 1.2)), 95);
      const currentChecklistIndex = Math.min(Math.ceil((currentProgress / 95) * totalChecklists), totalChecklists);
      const currentChecklistName = selectedPreviews[currentChecklistIndex - 1]?.title || 'Checklist';
      
      progressBar.style.width = `${currentProgress}%`;
      progressPercent.textContent = `${Math.round(currentProgress)}%`;
      progressText.textContent = `Creating ${currentChecklistName}...`;
      
      document.getElementById('loading-main-text').textContent = `Creating checklist ${currentChecklistIndex} of ${totalChecklists}`;
    }, 300);
    
    const response = await axios.post('/api/checklists/confirm-batch', {
      previews: selectedPreviews,
      source_id: currentAIChecklistData.itemId,
      source_type: currentAIChecklistData.itemType === 'issue' ? 'issue' : 'action-item',
      project_id: currentProject.id,
      attachment_ids: currentAIChecklistData.attachment_ids || [],
      use_description: currentAIChecklistData.use_description
    }, { withCredentials: true });
    
    // Complete progress
    clearInterval(progressInterval);
    progressBar.style.width = '100%';
    progressPercent.textContent = '100%';
    progressText.textContent = `All ${totalChecklists} checklists created!`;
    document.getElementById('loading-main-text').textContent = 'Checklists created successfully!';
    
    // Small delay to show completion
    setTimeout(() => {
      // Close modal
      document.getElementById('ai-checklist-modal').classList.add('hidden');
      
      // Reset progress
      progressContainer.classList.add('hidden');
      progressBar.style.width = '0%';
      
      showToast(`${response.data.count} checklists created successfully!`, 'success');
      
      // Show template promotion prompts if there are new templates
      if (response.data.has_new_templates && response.data.new_template_ids.length > 0) {
        showBatchTemplatePromotionPrompt(response.data.new_template_ids);
      } else {
        // Navigate to checklists page
        setTimeout(() => {
          navigateToChecklists();
        }, 1500);
      }
    }, 800);
    
  } catch (error) {
    console.error('Error confirming batch:', error);
    
    // Hide loading and show error
    document.getElementById('ai-checklist-loading').classList.add('hidden');
    document.getElementById('batch-progress-container').classList.add('hidden');
    
    showToast(error.response?.data?.error || 'Failed to create checklists', 'error');
  }
}

function showTemplatePromotionPrompt(templateId) {
  const promptHtml = `
    <div id="template-promotion-toast" class="fixed bottom-4 right-4 bg-white rounded-lg shadow-2xl border-2 border-blue-200 p-5 z-50 max-w-md animate-slide-up">
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0">
          <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span class="text-white text-xl">✨</span>
          </div>
        </div>
        <div class="flex-1">
          <h4 class="font-bold text-gray-900 mb-1 flex items-center gap-2">
            Make this template reusable?
            <span class="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-semibold">Recommended</span>
          </h4>
          <p class="text-sm text-gray-600 mb-3">Save time on future projects by making this AI template available to your team.</p>
          
          <div class="bg-blue-50 rounded-md p-2 mb-3 border border-blue-100">
            <p class="text-xs text-blue-800 font-medium mb-1">✓ Benefits:</p>
            <ul class="text-xs text-blue-700 space-y-0.5">
              <li>• Reuse for similar tasks</li>
              <li>• Available to all team members</li>
              <li>• Appears in template library</li>
            </ul>
          </div>
          
          <div class="flex gap-2">
            <button onclick="promoteTemplate(${templateId})" class="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm">
              ✨ Promote Template
            </button>
            <button onclick="dismissPromotionPrompt()" class="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
              Not Now
            </button>
          </div>
        </div>
        <button onclick="dismissPromotionPrompt()" class="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', promptHtml);
  
  // Auto-dismiss after 20 seconds
  setTimeout(() => {
    dismissPromotionPrompt();
  }, 20000);
}

async function promoteTemplate(templateId) {
  try {
    await axios.post(`/api/templates/${templateId}/promote`, {}, { withCredentials: true });
    showToast('Template promoted to reusable!', 'success');
    dismissPromotionPrompt();
    // Delay navigation to show toast
    setTimeout(() => {
      navigateToChecklists();
    }, 2000);
  } catch (error) {
    console.error('Error promoting template:', error);
    showToast(error.response?.data?.error || 'Failed to promote template', 'error');
  }
}

function dismissPromotionPrompt() {
  const toast = document.getElementById('template-promotion-toast');
  if (toast) {
    toast.remove();
  }
  // Delay navigation after dismissing prompt
  setTimeout(() => {
    navigateToChecklists();
  }, 500);
}

function showBatchTemplatePromotionPrompt(templateIds) {
  const count = templateIds.length;
  const promptHtml = `
    <div id="template-promotion-toast" class="fixed bottom-4 right-4 bg-white rounded-lg shadow-2xl border-2 border-blue-200 p-5 z-50 max-w-md animate-slide-up">
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0">
          <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span class="text-white text-xl">✨</span>
          </div>
        </div>
        <div class="flex-1">
          <h4 class="font-bold text-gray-900 mb-1 flex items-center gap-2">
            Make these ${count} templates reusable?
            <span class="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-semibold">Recommended</span>
          </h4>
          <p class="text-sm text-gray-600 mb-3">Save time on future projects by making these AI templates available to your team.</p>
          
          <div class="bg-blue-50 rounded-md p-2 mb-3 border border-blue-100">
            <p class="text-xs text-blue-800 font-medium mb-1">✓ Benefits:</p>
            <ul class="text-xs text-blue-700 space-y-0.5">
              <li>• Reuse for similar tasks</li>
              <li>• Available to all team members</li>
              <li>• Appear in template library</li>
            </ul>
          </div>
          
          <div class="flex gap-2">
            <button onclick="promoteBatchTemplates(${JSON.stringify(templateIds)})" class="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm">
              ✨ Promote All ${count}
            </button>
            <button onclick="dismissPromotionPrompt()" class="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">
              Not Now
            </button>
          </div>
        </div>
        <button onclick="dismissPromotionPrompt()" class="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', promptHtml);
  
  // Auto-dismiss after 20 seconds
  setTimeout(() => {
    dismissPromotionPrompt();
  }, 20000);
}

async function promoteBatchTemplates(templateIds) {
  try {
    // Promote all templates in parallel
    await Promise.all(
      templateIds.map(id => 
        axios.post(`/api/templates/${id}/promote`, {}, { withCredentials: true })
      )
    );
    showToast(`${templateIds.length} templates promoted to reusable!`, 'success');
    dismissPromotionPrompt();
    // Delay navigation to show toast
    setTimeout(() => {
      navigateToChecklists();
    }, 2000);
  } catch (error) {
    console.error('Error promoting templates:', error);
    showToast(error.response?.data?.error || 'Failed to promote templates', 'error');
  }
}

function navigateToChecklists() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectParam = urlParams.get('project') || urlParams.get('projectId');
  if (projectParam) {
    window.location.href = `/checklists.html?project=${projectParam}`;
  }
}

// Event listeners for AI checklist modal
document.getElementById('close-ai-checklist-modal-btn').addEventListener('click', function() {
  document.getElementById('ai-checklist-modal').classList.add('hidden');
  currentAIChecklistData = null;
  workstreamAnalysis = null;
});

document.getElementById('cancel-ai-checklist-btn').addEventListener('click', function() {
  document.getElementById('ai-checklist-modal').classList.add('hidden');
  currentAIChecklistData = null;
  workstreamAnalysis = null;
});

// Cancel button from error state
document.getElementById('cancel-error-ai-checklist-btn').addEventListener('click', function() {
  document.getElementById('ai-checklist-modal').classList.add('hidden');
  currentAIChecklistData = null;
  workstreamAnalysis = null;
});

// Workstream analysis buttons
document.getElementById('generate-single-checklist-btn').addEventListener('click', async function() {
  await generateSingleChecklist();
});

document.getElementById('generate-multiple-checklists-btn').addEventListener('click', async function(e) {
  e.preventDefault();
  e.stopPropagation();
  console.log('[DEBUG] Multiple checklists button clicked');
  await generateMultipleChecklists();
});

document.getElementById('cancel-workstream-analysis-btn').addEventListener('click', function() {
  document.getElementById('ai-checklist-modal').classList.add('hidden');
  currentAIChecklistData = null;
  workstreamAnalysis = null;
});

// Batch preview buttons
document.getElementById('cancel-batch-preview-btn').addEventListener('click', function() {
  document.getElementById('ai-checklist-modal').classList.add('hidden');
  currentAIChecklistData = null;
  workstreamAnalysis = null;
});

document.getElementById('create-batch-checklists-btn').addEventListener('click', async function() {
  await confirmBatchChecklistCreation();
});

document.getElementById('retry-failed-checklists-btn').addEventListener('click', async function() {
  await retryAllFailedChecklists();
});

document.getElementById('retry-ai-checklist-btn').addEventListener('click', function() {
  if (currentAIChecklistData) {
    openAIChecklistModal(
      currentAIChecklistData.itemId,
      currentAIChecklistData.itemType,
      currentAIChecklistData.itemTitle
    );
  }
});

document.getElementById('create-ai-checklist-btn').addEventListener('click', function() {
  confirmAIChecklistCreation();
});

// Keyboard shortcuts for AI checklist modal
document.addEventListener('keydown', function(e) {
  const modal = document.getElementById('ai-checklist-modal');
  const isModalOpen = !modal.classList.contains('hidden');
  
  if (!isModalOpen) return;
  
  // Escape key - close modal
  if (e.key === 'Escape') {
    e.preventDefault();
    modal.classList.add('hidden');
    currentAIChecklistData = null;
  }
  
  // Enter key - confirm creation (only in preview state)
  if (e.key === 'Enter' && !document.getElementById('ai-checklist-preview').classList.contains('hidden')) {
    e.preventDefault();
    confirmAIChecklistCreation();
  }
  
  // R key - retry (only in error state)
  if ((e.key === 'r' || e.key === 'R') && !document.getElementById('ai-checklist-error').classList.contains('hidden')) {
    e.preventDefault();
    document.getElementById('retry-ai-checklist-btn').click();
  }
});

// Event listeners for edit modal attachment uploads
document.getElementById('edit-issue-upload-btn')?.addEventListener('click', function() {
  document.getElementById('edit-issue-file-input').click();
});

document.getElementById('edit-issue-file-input')?.addEventListener('change', async function(e) {
  const itemId = document.getElementById('edit-issue-id').value;
  if (itemId && e.target.files.length > 0) {
    await uploadEditAttachment(e.target.files, itemId, 'issue');
    e.target.value = '';
  }
});

document.getElementById('edit-action-item-upload-btn')?.addEventListener('click', function() {
  document.getElementById('edit-action-item-file-input').click();
});

document.getElementById('edit-action-item-file-input')?.addEventListener('change', async function(e) {
  const itemId = document.getElementById('edit-action-item-id').value;
  if (itemId && e.target.files.length > 0) {
    await uploadEditAttachment(e.target.files, itemId, 'action-item');
    e.target.value = '';
  }
});

// ============================================
// Phase 3b Feature 3: Bulk Apply Template UI
// ============================================

let selectedItems = new Map(); // Map of "type-id" -> {id, type}
let allTemplates = [];

// Initialize bulk actions
function initBulkActions() {
  // Load templates
  loadTemplatesForBulk();
  
  // Select All checkbox
  document.getElementById('selectAllItems')?.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.item-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = e.target.checked;
      const itemId = parseInt(cb.dataset.itemId);
      const itemType = cb.dataset.itemType;
      const key = `${itemType}-${itemId}`;
      
      if (e.target.checked) {
        selectedItems.set(key, { id: itemId, type: itemType });
      } else {
        selectedItems.delete(key);
      }
    });
    updateBulkActionsBar();
  });
  
  // Delegate checkbox changes
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('item-checkbox')) {
      e.stopPropagation(); // Prevent bubbling to card
      const itemId = parseInt(e.target.dataset.itemId);
      const itemType = e.target.dataset.itemType;
      const key = `${itemType}-${itemId}`;
      
      if (e.target.checked) {
        selectedItems.set(key, { id: itemId, type: itemType });
      } else {
        selectedItems.delete(key);
      }
      updateBulkActionsBar();
    }
  });
  
  // Also prevent click events from bubbling
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('item-checkbox')) {
      e.stopPropagation(); // Prevent card click handler
    }
  });
  
  // Bulk Apply button
  document.getElementById('bulkApplyTemplateBtn')?.addEventListener('click', () => {
    showBulkApplyModal();
  });
  
  // Clear Selection button
  document.getElementById('clearSelectionBtn')?.addEventListener('click', () => {
    clearSelection();
  });
  
  // Modal: Cancel
  document.getElementById('cancelBulkApply')?.addEventListener('click', () => {
    hideBulkApplyModal();
  });
  
  // Modal: Confirm Apply
  document.getElementById('confirmBulkApply')?.addEventListener('click', () => {
    executeBulkApply();
  });
  
  // Batch Generate Estimates button
  document.getElementById('bulkGenerateEstimatesBtn')?.addEventListener('click', () => {
    startBatchEstimation();
  });
  
  // Close batch results modal
  document.getElementById('closeBatchResultsModal')?.addEventListener('click', () => {
    document.getElementById('batchResultsModal').classList.add('hidden');
  });
  
  document.getElementById('closeBatchResultsBtn')?.addEventListener('click', () => {
    document.getElementById('batchResultsModal').classList.add('hidden');
  });
}

// Update bulk actions bar visibility and counts
function updateBulkActionsBar() {
  const bar = document.getElementById('bulkActionsBar');
  const countSpan = document.getElementById('selectedCount');
  const applyBtn = document.getElementById('bulkApplyTemplateBtn');
  const estimateBtn = document.getElementById('bulkGenerateEstimatesBtn');
  const selectAllCheckbox = document.getElementById('selectAllItems');
  
  const count = selectedItems.size;
  
  if (count > 0) {
    bar.style.display = 'block';
    countSpan.textContent = `${count} selected`;
    applyBtn.disabled = false;
    if (estimateBtn) estimateBtn.disabled = false;
  } else {
    bar.style.display = 'none';
    applyBtn.disabled = true;
    if (estimateBtn) estimateBtn.disabled = true;
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
  }
}

// Clear all selections
function clearSelection() {
  selectedItems.clear();
  document.querySelectorAll('.item-checkbox').forEach(cb => cb.checked = false);
  document.getElementById('selectAllItems').checked = false;
  updateBulkActionsBar();
}

// Load templates for bulk apply
async function loadTemplatesForBulk() {
  try {
    const response = await axios.get('/api/templates?sort=name', { withCredentials: true });
    allTemplates = response.data.templates || [];
    
    const select = document.getElementById('bulkTemplateSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select a template...</option>';
    
    allTemplates.forEach(template => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = `${template.name} (${template.usage_count || 0} uses)`;
      select.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading templates:', error);
  }
}

// Show bulk apply modal
function showBulkApplyModal() {
  const modal = document.getElementById('bulkApplyModal');
  const countSpan = document.getElementById('modalSelectedCount');
  const entityTypeSpan = document.getElementById('modalEntityType');
  
  // Determine if all selected items are the same type
  const types = new Set([...selectedItems.values()].map(item => item.type));
  let entityTypeText = 'item(s)';
  if (types.size === 1) {
    const type = [...types][0];
    entityTypeText = type === 'issue' ? 'issue(s)' : 'action item(s)';
  }
  
  countSpan.textContent = selectedItems.size;
  entityTypeSpan.textContent = entityTypeText;
  
  // Reset modal state
  document.getElementById('bulkApplyProgress').classList.add('hidden');
  document.getElementById('bulkApplyResults').classList.add('hidden');
  document.getElementById('bulkTemplateSelect').disabled = false;
  document.getElementById('confirmBulkApply').disabled = false;
  
  modal.classList.remove('hidden');
}

// Hide bulk apply modal
function hideBulkApplyModal() {
  document.getElementById('bulkApplyModal').classList.add('hidden');
}

// Execute bulk apply
async function executeBulkApply() {
  const templateId = document.getElementById('bulkTemplateSelect').value;
  
  if (!templateId) {
    alert('Please select a template');
    return;
  }
  
  // Group selected items by type
  const itemsByType = {};
  selectedItems.forEach((item) => {
    if (!itemsByType[item.type]) {
      itemsByType[item.type] = [];
    }
    itemsByType[item.type].push(item.id);
  });
  
  // Show progress
  document.getElementById('bulkApplyProgress').classList.remove('hidden');
  document.getElementById('confirmBulkApply').disabled = true;
  document.getElementById('bulkTemplateSelect').disabled = true;
  
  let totalSuccess = 0;
  let totalFailed = 0;
  
  try {
    // Apply to each type separately
    for (const [entityType, entityIds] of Object.entries(itemsByType)) {
      const response = await axios.post('/api/templates/bulk-apply', {
        templateId: parseInt(templateId),
        entityType: entityType,
        entityIds: entityIds,
        projectId: currentProject?.id || parseInt(localStorage.getItem('currentProjectId'))
      }, { withCredentials: true });
      
      const data = response.data;
      totalSuccess += data.results.successful;
      totalFailed += data.results.failed;
      
      // Update progress
      document.getElementById('progressText').textContent = 
        `${totalSuccess + totalFailed}/${selectedItems.size}`;
      document.getElementById('progressBar').style.width = 
        `${((totalSuccess + totalFailed) / selectedItems.size) * 100}%`;
    }
    
    // Show results
    document.getElementById('bulkApplyProgress').classList.add('hidden');
    document.getElementById('bulkApplyResults').classList.remove('hidden');
    document.getElementById('successCount').textContent = totalSuccess;
    document.getElementById('failCount').textContent = totalFailed;
    
    // Show notification
    if (totalFailed === 0) {
      showNotification(`✅ Applied template to ${totalSuccess} items`, 'success');
    } else {
      showNotification(
        `⚠️ Applied to ${totalSuccess} items, ${totalFailed} failed`, 
        'warning'
      );
    }
    
    // Auto-close after 2 seconds if successful
    if (totalFailed === 0) {
      setTimeout(() => {
        hideBulkApplyModal();
        clearSelection();
        // Reload Kanban board
        loadProjectData(currentProject?.id || parseInt(localStorage.getItem('currentProjectId')));
      }, 2000);
    }
    
  } catch (error) {
    console.error('Bulk apply error:', error);
    document.getElementById('bulkApplyProgress').classList.add('hidden');
    alert('Failed to apply template: ' + (error.response?.data?.error || error.message));
    document.getElementById('confirmBulkApply').disabled = false;
    document.getElementById('bulkTemplateSelect').disabled = false;
  }
}

// ============================================
// BATCH ESTIMATION FUNCTIONS (Phase 2)
// ============================================

let batchJobId = null;
let batchPollInterval = null;

async function startBatchEstimation() {
  if (selectedItems.size === 0) {
    showToast('No items selected', 'warning');
    return;
  }

  // Convert selectedItems Map to array
  const items = Array.from(selectedItems.values());
  
  // Show confirmation
  const confirm = window.confirm(
    `Generate AI estimates for ${items.length} selected item(s)?\n\n` +
    `This will use AI credits and may take a few minutes.`
  );
  
  if (!confirm) return;

  try {
    // Start batch job
    const response = await axios.post('/api/estimates/batch', {
      items,
      projectId: currentProject?.id || parseInt(localStorage.getItem('currentProjectId'))
    }, { withCredentials: true });

    batchJobId = response.data.jobId;
    
    // Show progress modal
    document.getElementById('batchEstimateProgressModal').classList.remove('hidden');
    document.getElementById('batch-progress-total').textContent = response.data.total;
    document.getElementById('batch-progress-current').textContent = '0';
    document.getElementById('batch-progress-percentage').textContent = '0%';
    document.getElementById('batch-estimate-progress-bar').style.width = '0%';
    document.getElementById('batch-status-log').innerHTML = 
      '<div class="text-green-600">✓ Batch job started...</div>';
    
    // Start polling for progress
    startBatchProgressPolling();
    
  } catch (error) {
    console.error('Error starting batch estimation:', error);
    showToast('Failed to start batch estimation: ' + (error.response?.data?.error || error.message), 'error');
  }
}

function startBatchProgressPolling() {
  // Clear any existing interval
  if (batchPollInterval) {
    clearInterval(batchPollInterval);
  }
  
  // Poll every 1 second
  batchPollInterval = setInterval(async () => {
    try {
      const response = await axios.get(`/api/estimates/batch/${batchJobId}`, {
        withCredentials: true
      });
      
      const job = response.data;
      updateBatchProgressUI(job);
      
      // If completed, stop polling and show results
      if (job.status === 'completed' || job.status === 'error') {
        clearInterval(batchPollInterval);
        batchPollInterval = null;
        
        setTimeout(() => {
          document.getElementById('batchEstimateProgressModal').classList.add('hidden');
          showBatchResults(job);
        }, 1000);
      }
      
    } catch (error) {
      console.error('Error polling batch progress:', error);
      clearInterval(batchPollInterval);
      batchPollInterval = null;
      document.getElementById('batchEstimateProgressModal').classList.add('hidden');
      showToast('Error checking batch progress', 'error');
    }
  }, 1000);
}

function updateBatchProgressUI(job) {
  const percentage = job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;
  
  document.getElementById('batch-progress-current').textContent = job.completed;
  document.getElementById('batch-progress-percentage').textContent = `${percentage}%`;
  document.getElementById('batch-estimate-progress-bar').style.width = `${percentage}%`;
  
  if (job.currentItem) {
    document.getElementById('batch-current-item').textContent = job.currentItem;
  }
  
  // Calculate ETA
  if (job.completed > 0 && job.completed < job.total) {
    const elapsed = new Date() - new Date(job.startedAt);
    const avgTimePerItem = elapsed / job.completed;
    const remaining = job.total - job.completed;
    const etaMs = remaining * avgTimePerItem;
    const etaSeconds = Math.round(etaMs / 1000);
    document.getElementById('batch-eta').textContent = 
      `Estimated time remaining: ${etaSeconds} seconds`;
  } else if (job.completed === job.total) {
    document.getElementById('batch-eta').textContent = 'Complete!';
  }
  
  // Add latest results to log
  const logDiv = document.getElementById('batch-status-log');
  const latestResults = job.results.slice(job.completed - 3, job.completed); // Last 3
  
  latestResults.forEach(result => {
    const existing = logDiv.querySelector(`[data-item="${result.itemType}-${result.itemId}"]`);
    if (!existing) {
      const logEntry = document.createElement('div');
      logEntry.setAttribute('data-item', `${result.itemType}-${result.itemId}`);
      logEntry.className = result.success ? 'text-green-600' : 'text-red-600';
      logEntry.textContent = result.success 
        ? `✓ ${result.title}: ${result.hours}h (${result.confidence})`
        : `✗ ${result.title}: ${result.error}`;
      logDiv.appendChild(logEntry);
      
      // Auto-scroll to bottom
      logDiv.scrollTop = logDiv.scrollHeight;
    }
  });
}

function showBatchResults(job) {
  // Update summary stats
  document.getElementById('batch-success-count').textContent = job.successful;
  document.getElementById('batch-error-count').textContent = job.failed;
  
  const totalHours = job.results
    .filter(r => r.success)
    .reduce((sum, r) => sum + (r.hours || 0), 0);
  document.getElementById('batch-total-hours').textContent = totalHours.toFixed(1);
  
  // Render detailed results
  const contentDiv = document.getElementById('batch-results-content');
  contentDiv.innerHTML = job.results.map(result => {
    if (result.success) {
      return `
        <div class="border-l-4 border-green-500 bg-green-50 p-3 rounded">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <div class="font-medium text-gray-800">${result.title || `${result.itemType} #${result.itemId}`}</div>
              <div class="text-sm text-gray-600 mt-1">
                ${result.hours} hours • ${result.confidence} confidence • ${result.taskCount} tasks
              </div>
            </div>
            <span class="text-green-600 font-bold">✓</span>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="border-l-4 border-red-500 bg-red-50 p-3 rounded">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <div class="font-medium text-gray-800">${result.title || `${result.itemType} #${result.itemId}`}</div>
              <div class="text-sm text-red-600 mt-1">${result.error}</div>
            </div>
            <span class="text-red-600 font-bold">✗</span>
          </div>
        </div>
      `;
    }
  }).join('');
  
  // Show results modal
  document.getElementById('batchResultsModal').classList.remove('hidden');
  
  // Clear selection and reload project data
  clearSelection();
  if (currentProject?.id) {
    loadProjectData(currentProject.id);
  }
}

// Notification helper
function showNotification(message, type = 'info') {
  const colors = {
    success: 'bg-green-500',
    warning: 'bg-orange-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  };
  
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50 transition-opacity`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ========================================
// TABLE VIEW FUNCTIONS
// ========================================

let currentView = 'kanban';
let tableSortColumn = 'priority';
let tableSortDirection = 'asc';
let tableSelectedItems = new Set();
let pendingViewSwitch = null;
let currentPage = 1;
let itemsPerPage = 25;

function initializeTableView() {
  const kanbanViewBtn = document.getElementById('kanban-view-btn');
  const tableViewBtn = document.getElementById('table-view-btn');
  
  const urlParams = new URLSearchParams(window.location.search);
  const viewParam = urlParams.get('view');
  if (viewParam === 'table') {
    if (currentProject) {
      switchToTableView();
    } else {
      pendingViewSwitch = 'table';
    }
  }
  
  kanbanViewBtn?.addEventListener('click', switchToKanbanView);
  tableViewBtn?.addEventListener('click', switchToTableView);
  
  const tableHeaders = document.querySelectorAll('th[data-sort]');
  tableHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const column = header.dataset.sort;
      handleTableSort(column);
    });
  });
  
  document.getElementById('table-select-all')?.addEventListener('change', handleTableSelectAll);
  
  document.getElementById('table-bulk-status-select')?.addEventListener('change', (e) => {
    const btn = document.getElementById('table-bulk-status-btn');
    btn.disabled = !e.target.value;
  });
  
  document.getElementById('table-bulk-status-btn')?.addEventListener('click', handleTableBulkStatusUpdate);
  document.getElementById('table-generate-estimates-btn')?.addEventListener('click', handleTableGenerateEstimates);
  document.getElementById('table-bulk-delete-btn')?.addEventListener('click', handleTableBulkDelete);
  document.getElementById('table-clear-selection-btn')?.addEventListener('click', clearTableSelection);
}

function switchToKanbanView() {
  currentView = 'kanban';
  
  const kanbanViewBtn = document.getElementById('kanban-view-btn');
  const tableViewBtn = document.getElementById('table-view-btn');
  const kanbanContainer = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-4');
  const tableView = document.getElementById('table-view');
  
  kanbanViewBtn.classList.add('bg-white', 'shadow-sm');
  kanbanViewBtn.classList.remove('hover:bg-gray-200');
  tableViewBtn.classList.remove('bg-white', 'shadow-sm');
  tableViewBtn.classList.add('hover:bg-gray-200');
  
  kanbanContainer?.classList.remove('hidden');
  tableView?.classList.add('hidden');
  
  updateURL({ view: 'kanban' });
}

function switchToTableView() {
  currentView = 'table';
  
  const kanbanViewBtn = document.getElementById('kanban-view-btn');
  const tableViewBtn = document.getElementById('table-view-btn');
  const kanbanContainer = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-4');
  const tableView = document.getElementById('table-view');
  
  tableViewBtn.classList.add('bg-white', 'shadow-sm');
  tableViewBtn.classList.remove('hover:bg-gray-200');
  kanbanViewBtn.classList.remove('bg-white', 'shadow-sm');
  kanbanViewBtn.classList.add('hover:bg-gray-200');
  
  kanbanContainer?.classList.add('hidden');
  tableView?.classList.remove('hidden');
  
  updateURL({ view: 'table' });
  
  renderTableView();
}

function renderTableView() {
  const tableBody = document.getElementById('table-body');
  const tableEmptyState = document.getElementById('table-empty-state');
  
  if (!tableBody) return;
  
  const allItems = getAllItemsForTable();
  
  if (allItems.length === 0) {
    // Show empty state with SharedEmptyState
    if (tableEmptyState && typeof window.SharedEmptyState !== 'undefined') {
      tableEmptyState.innerHTML = '';
      new window.SharedEmptyState(tableEmptyState, {
        icon: 'tasks',
        title: 'No Items to Display',
        message: 'Try adjusting your filters or create a new issue or action item.',
        actionText: null
      });
    }
    tableBody.innerHTML = '';
    tableEmptyState?.classList.remove('hidden');
    document.getElementById('table-pagination-top')?.classList.add('hidden');
    document.getElementById('table-pagination-bottom')?.classList.add('hidden');
    return;
  }
  
  tableEmptyState?.classList.add('hidden');
  
  const sortedItems = sortTableItems(allItems);
  
  // Calculate pagination
  const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
  if (currentPage > totalPages) {
    currentPage = totalPages || 1;
  }
  
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageItems = sortedItems.slice(startIndex, endIndex);
  
  tableBody.innerHTML = pageItems.map(item => createTableRow(item)).join('');
  
  renderPagination(sortedItems.length, totalPages);
  
  attachTableRowEventListeners();
}

function renderPagination(totalItems, totalPages) {
  const paginationHTML = createPaginationHTML(totalItems, totalPages);
  
  const topPagination = document.getElementById('table-pagination-top');
  const bottomPagination = document.getElementById('table-pagination-bottom');
  
  if (topPagination) {
    topPagination.innerHTML = paginationHTML;
    topPagination.classList.remove('hidden');
  }
  
  if (bottomPagination) {
    bottomPagination.innerHTML = paginationHTML;
    bottomPagination.classList.remove('hidden');
  }
  
  attachPaginationEventListeners();
}

function createPaginationHTML(totalItems, totalPages) {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  
  let pageNumbers = [];
  
  // Always show first page
  pageNumbers.push(1);
  
  if (totalPages <= 7) {
    // Show all pages if 7 or fewer
    for (let i = 2; i <= totalPages; i++) {
      pageNumbers.push(i);
    }
  } else {
    // Show smart pagination with ellipsis
    if (currentPage <= 3) {
      // Near start: 1 2 3 4 ... last
      for (let i = 2; i <= 4; i++) {
        pageNumbers.push(i);
      }
      pageNumbers.push('...');
      pageNumbers.push(totalPages);
    } else if (currentPage >= totalPages - 2) {
      // Near end: 1 ... last-3 last-2 last-1 last
      pageNumbers.push('...');
      for (let i = totalPages - 3; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Middle: 1 ... current-1 current current+1 ... last
      pageNumbers.push('...');
      pageNumbers.push(currentPage - 1);
      pageNumbers.push(currentPage);
      pageNumbers.push(currentPage + 1);
      pageNumbers.push('...');
      pageNumbers.push(totalPages);
    }
  }
  
  return `
    <div class="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <label for="items-per-page" class="text-sm text-gray-700">Rows per page:</label>
          <select 
            id="items-per-page" 
            class="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="10" ${itemsPerPage === 10 ? 'selected' : ''}>10</option>
            <option value="25" ${itemsPerPage === 25 ? 'selected' : ''}>25</option>
            <option value="50" ${itemsPerPage === 50 ? 'selected' : ''}>50</option>
            <option value="100" ${itemsPerPage === 100 ? 'selected' : ''}>100</option>
          </select>
        </div>
        <div class="text-sm text-gray-700">
          Showing ${startItem}-${endItem} of ${totalItems} items
        </div>
      </div>
      
      <div class="flex items-center gap-2">
        <button 
          data-action="first-page"
          class="px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          ${currentPage === 1 ? 'disabled' : ''}
          title="First page"
        >
          &laquo;
        </button>
        
        <button 
          data-action="prev-page"
          class="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          ${currentPage === 1 ? 'disabled' : ''}
          title="Previous page"
        >
          Previous
        </button>
        
        <div class="flex gap-1">
          ${pageNumbers.map(page => {
            if (page === '...') {
              return '<span class="px-2 py-1 text-gray-500">...</span>';
            }
            const isActive = page === currentPage;
            return `
              <button 
                data-action="goto-page"
                data-page="${page}"
                class="px-3 py-1 border rounded text-sm ${
                  isActive 
                    ? 'bg-blue-600 text-white border-blue-600' 
                    : 'border-gray-300 hover:bg-gray-50'
                }"
              >
                ${page}
              </button>
            `;
          }).join('')}
        </div>
        
        <button 
          data-action="next-page"
          class="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          ${currentPage === totalPages ? 'disabled' : ''}
          title="Next page"
        >
          Next
        </button>
        
        <button 
          data-action="last-page"
          data-total-pages="${totalPages}"
          class="px-2 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          ${currentPage === totalPages ? 'disabled' : ''}
          title="Last page"
        >
          &raquo;
        </button>
      </div>
    </div>
  `;
}

function attachPaginationEventListeners() {
  document.querySelectorAll('[data-action="first-page"]').forEach(btn => {
    btn.addEventListener('click', () => goToPage(1));
  });
  
  document.querySelectorAll('[data-action="prev-page"]').forEach(btn => {
    btn.addEventListener('click', () => goToPage(currentPage - 1));
  });
  
  document.querySelectorAll('[data-action="next-page"]').forEach(btn => {
    btn.addEventListener('click', () => goToPage(currentPage + 1));
  });
  
  document.querySelectorAll('[data-action="last-page"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const totalPages = parseInt(e.target.dataset.totalPages);
      goToPage(totalPages);
    });
  });
  
  document.querySelectorAll('[data-action="goto-page"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const page = parseInt(e.target.dataset.page);
      goToPage(page);
    });
  });
  
  document.querySelectorAll('#items-per-page').forEach(select => {
    select.addEventListener('change', (e) => {
      itemsPerPage = parseInt(e.target.value);
      currentPage = 1; // Reset to first page when changing items per page
      renderTableView();
    });
  });
}

function goToPage(page) {
  currentPage = page;
  renderTableView();
  // Scroll to top of table
  document.getElementById('table-view')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getAllItemsForTable() {
  const allItems = [];
  
  let itemsToDisplay = [];
  if (currentFilters.type === 'issue') {
    itemsToDisplay = [...issues];
  } else if (currentFilters.type === 'action') {
    itemsToDisplay = [...actionItems];
  } else {
    itemsToDisplay = [...issues, ...actionItems];
  }
  
  itemsToDisplay.forEach(item => {
    let matches = true;
    
    if (currentFilters.status && item.status?.toLowerCase() !== currentFilters.status.toLowerCase()) {
      matches = false;
    }
    if (currentFilters.priority && item.priority?.toLowerCase() !== currentFilters.priority.toLowerCase()) {
      matches = false;
    }
    if (currentFilters.assignee && item.assignee !== currentFilters.assignee) {
      matches = false;
    }
    if (currentFilters.category && item.category !== currentFilters.category) {
      matches = false;
    }
    if (currentFilters.search) {
      const searchLower = currentFilters.search.toLowerCase();
      const titleMatch = item.title?.toLowerCase().includes(searchLower);
      const descMatch = item.description?.toLowerCase().includes(searchLower);
      if (!titleMatch && !descMatch) {
        matches = false;
      }
    }
    if (currentFilters.tag) {
      const itemTags = item.tags || [];
      if (!itemTags.some(tag => tag.name === currentFilters.tag)) {
        matches = false;
      }
    }
    if (currentFilters.hasPlanning) {
      if (!item.planning_estimate_source) {
        matches = false;
      }
    }
    
    if (matches) {
      allItems.push({
        id: item.id,
        type: item.type,
        title: item.title || '',
        assignee: item.assignee || 'Unassigned',
        priority: item.priority || 'low',
        dueDate: item.due_date ? new Date(item.due_date).toLocaleDateString() : '',
        status: item.status || 'todo',
        planning_estimate_source: item.planning_estimate_source,
        estimated_effort_hours: item.estimated_effort_hours,
        ai_effort_estimate_hours: item.ai_effort_estimate_hours,
        hybrid_effort_estimate_hours: item.hybrid_effort_estimate_hours
      });
    }
  });
  
  return allItems;
}

function sortTableItems(items) {
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const statusOrder = { todo: 0, inprogress: 1, blocked: 2, done: 3 };
  
  return items.sort((a, b) => {
    let comparison = 0;
    
    switch (tableSortColumn) {
      case 'type':
        comparison = a.type.localeCompare(b.type);
        break;
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'assignee':
        comparison = a.assignee.localeCompare(b.assignee);
        break;
      case 'priority':
        comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
        break;
      case 'due_date':
        if (!a.dueDate && !b.dueDate) comparison = 0;
        else if (!a.dueDate) comparison = 1;
        else if (!b.dueDate) comparison = -1;
        else comparison = new Date(a.dueDate) - new Date(b.dueDate);
        break;
      case 'status':
        comparison = statusOrder[a.status] - statusOrder[b.status];
        break;
      default:
        comparison = 0;
    }
    
    return tableSortDirection === 'asc' ? comparison : -comparison;
  });
}

function handleTableSort(column) {
  if (tableSortColumn === column) {
    tableSortDirection = tableSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    tableSortColumn = column;
    tableSortDirection = 'asc';
  }
  
  updateTableHeaders();
  renderTableView();
}

function updateTableHeaders() {
  const headers = document.querySelectorAll('th[data-sort]');
  headers.forEach(header => {
    const svg = header.querySelector('svg');
    if (header.dataset.sort === tableSortColumn) {
      svg?.classList.remove('text-gray-400');
      svg?.classList.add('text-blue-600');
      if (tableSortDirection === 'desc') {
        svg?.classList.add('rotate-180');
      } else {
        svg?.classList.remove('rotate-180');
      }
    } else {
      svg?.classList.remove('text-blue-600', 'rotate-180');
      svg?.classList.add('text-gray-400');
    }
  });
}

function createTableRow(item) {
  const priorityColors = {
    critical: 'bg-red-100 text-red-800',
    high: 'bg-orange-100 text-orange-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-green-100 text-green-800'
  };
  
  const statusColors = {
    todo: 'bg-gray-100 text-gray-800',
    inprogress: 'bg-blue-100 text-blue-800',
    blocked: 'bg-yellow-100 text-yellow-800',
    done: 'bg-green-100 text-green-800'
  };
  
  const statusLabels = {
    todo: 'To Do',
    inprogress: 'In Progress',
    blocked: 'Blocked',
    done: 'Done'
  };
  
  const isSelected = tableSelectedItems.has(item.id);
  
  return `
    <tr class="hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}" data-item-id="${item.id}" data-item-type="${item.type}">
      <td class="px-4 py-3">
        <input 
          type="checkbox" 
          class="table-row-checkbox cursor-pointer w-4 h-4"
          data-item-id="${item.id}"
          ${isSelected ? 'checked' : ''}
        />
      </td>
      <td class="px-4 py-3">
        <span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium ${item.type === 'issue' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}">
          ${item.type === 'issue' ? 'Issue' : 'Action Item'}
        </span>
      </td>
      <td class="px-4 py-3 font-medium text-gray-900 max-w-md truncate" title="${item.title}">
        ${item.title}
      </td>
      <td class="px-4 py-3 text-gray-600">
        ${item.assignee}
      </td>
      <td class="px-4 py-3">
        <span class="px-2 py-1 rounded text-xs font-medium ${priorityColors[item.priority]}">
          ${item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
        </span>
      </td>
      <td class="px-4 py-3 text-gray-600 text-sm">
        ${item.dueDate || '-'}
      </td>
      <td class="px-4 py-3">
        ${createPlanningEstimateBadge(item) || '<span class="text-gray-400 text-xs">-</span>'}
      </td>
      <td class="px-4 py-3">
        <select 
          class="table-status-select px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer ${statusColors[item.status]}"
          data-item-id="${item.id}"
          data-item-type="${item.type}"
          data-current-status="${item.status}"
        >
          <option value="todo" ${item.status === 'todo' ? 'selected' : ''}>To Do</option>
          <option value="inprogress" ${item.status === 'inprogress' ? 'selected' : ''}>In Progress</option>
          <option value="blocked" ${item.status === 'blocked' ? 'selected' : ''}>Blocked</option>
          <option value="done" ${item.status === 'done' ? 'selected' : ''}>Done</option>
        </select>
      </td>
      <td class="px-4 py-3">
        <button 
          class="text-blue-600 hover:text-blue-800 text-sm font-medium"
          data-action="view-item"
          data-item-id="${item.id}"
          data-item-type="${item.type}"
        >
          View
        </button>
      </td>
    </tr>
  `;
}

function attachTableRowEventListeners() {
  const checkboxes = document.querySelectorAll('.table-row-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', handleTableRowSelect);
  });
  
  const statusSelects = document.querySelectorAll('.table-status-select');
  statusSelects.forEach(select => {
    select.addEventListener('change', handleTableStatusChange);
  });
  
  const viewButtons = document.querySelectorAll('[data-action="view-item"]');
  viewButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const itemId = parseInt(e.target.dataset.itemId);
      const itemType = e.target.dataset.itemType;
      openItemDetailModal(itemId, itemType);
    });
  });
}

function handleTableRowSelect(e) {
  const itemId = e.target.dataset.itemId;
  const row = e.target.closest('tr');
  
  if (e.target.checked) {
    tableSelectedItems.add(itemId);
    row?.classList.add('bg-blue-50');
  } else {
    tableSelectedItems.delete(itemId);
    row?.classList.remove('bg-blue-50');
  }
  
  updateTableSelectionUI();
}

function handleTableSelectAll(e) {
  const checkboxes = document.querySelectorAll('.table-row-checkbox');
  const rows = document.querySelectorAll('#table-body tr');
  
  if (e.target.checked) {
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
      const itemId = checkbox.dataset.itemId;
      tableSelectedItems.add(itemId);
    });
    rows.forEach(row => row.classList.add('bg-blue-50'));
  } else {
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    tableSelectedItems.clear();
    rows.forEach(row => row.classList.remove('bg-blue-50'));
  }
  
  updateTableSelectionUI();
}

function updateTableSelectionUI() {
  const selectAllCheckbox = document.getElementById('table-select-all');
  const checkboxes = document.querySelectorAll('.table-row-checkbox');
  const bulkActionsBar = document.getElementById('table-bulk-actions-bar');
  const selectedCount = document.getElementById('table-selected-count');
  const generateEstimatesBtn = document.getElementById('table-generate-estimates-btn');
  
  if (tableSelectedItems.size === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    bulkActionsBar?.classList.add('hidden');
    if (generateEstimatesBtn) generateEstimatesBtn.disabled = true;
  } else if (tableSelectedItems.size === checkboxes.length) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
    bulkActionsBar?.classList.remove('hidden');
    if (generateEstimatesBtn) generateEstimatesBtn.disabled = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
    bulkActionsBar?.classList.remove('hidden');
    if (generateEstimatesBtn) generateEstimatesBtn.disabled = false;
  }
  
  if (selectedCount) {
    selectedCount.textContent = `${tableSelectedItems.size} selected`;
  }
}

function clearTableSelection() {
  const checkboxes = document.querySelectorAll('.table-row-checkbox');
  const rows = document.querySelectorAll('#table-body tr');
  
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
  });
  
  tableSelectedItems.clear();
  
  rows.forEach(row => row.classList.remove('bg-blue-50'));
  
  updateTableSelectionUI();
  
  const statusSelect = document.getElementById('table-bulk-status-select');
  if (statusSelect) statusSelect.value = '';
  
  const statusBtn = document.getElementById('table-bulk-status-btn');
  if (statusBtn) statusBtn.disabled = true;
}

async function handleTableBulkStatusUpdate() {
  const statusSelect = document.getElementById('table-bulk-status-select');
  const newStatus = statusSelect?.value;
  
  if (!newStatus || tableSelectedItems.size === 0) {
    alert('Please select a status');
    return;
  }
  
  const confirmed = confirm(`Update status to "${newStatus.replace('inprogress', 'In Progress')}" for ${tableSelectedItems.size} item(s)?`);
  if (!confirmed) return;
  
  try {
    const promises = [];
    const rows = document.querySelectorAll('#table-body tr');
    
    rows.forEach(row => {
      const itemId = row.dataset.itemId;
      if (tableSelectedItems.has(itemId)) {
        const itemType = row.dataset.itemType;
        const endpoint = itemType === 'issue' ? '/api/issues' : '/api/action-items';
        promises.push(axios.patch(`${endpoint}/${itemId}`, { status: newStatus }));
      }
    });
    
    await Promise.all(promises);
    
    showNotification(`Updated ${tableSelectedItems.size} item(s) successfully`, 'success');
    
    clearTableSelection();
    
    await loadProjectData(currentProject.id);
    
    if (currentView === 'table') {
      renderTableView();
    }
    
  } catch (error) {
    console.error('Bulk status update error:', error);
    showNotification('Failed to update some items', 'error');
  }
}

async function handleTableBulkDelete() {
  if (tableSelectedItems.size === 0) {
    alert('Please select items to delete');
    return;
  }
  
  const confirmed = confirm(`Are you sure you want to delete ${tableSelectedItems.size} item(s)? This action cannot be undone.`);
  if (!confirmed) return;
  
  try {
    const promises = [];
    const rows = document.querySelectorAll('#table-body tr');
    
    rows.forEach(row => {
      const itemId = row.dataset.itemId;
      if (tableSelectedItems.has(itemId)) {
        const itemType = row.dataset.itemType;
        const endpoint = itemType === 'issue' ? '/api/issues' : '/api/action-items';
        promises.push(axios.delete(`${endpoint}/${itemId}`));
      }
    });
    
    await Promise.all(promises);
    
    showNotification(`Deleted ${tableSelectedItems.size} item(s) successfully`, 'success');
    
    clearTableSelection();
    
    await loadProjectData(currentProject.id);
    
    if (currentView === 'table') {
      renderTableView();
    }
    
  } catch (error) {
    console.error('Bulk delete error:', error);
    showNotification('Failed to delete some items', 'error');
  }
}

async function handleTableGenerateEstimates() {
  if (tableSelectedItems.size === 0) {
    showToast('No items selected', 'warning');
    return;
  }
  
  // Convert tableSelectedItems to the format expected by startBatchEstimation
  // We need to reconstruct the items with type and id from the table rows
  selectedItems.clear();
  
  const rows = document.querySelectorAll('#table-body tr');
  rows.forEach(row => {
    const itemId = row.dataset.itemId;
    if (tableSelectedItems.has(itemId)) {
      const itemType = row.dataset.itemType;
      const key = `${itemType}-${itemId}`;
      selectedItems.set(key, {
        id: parseInt(itemId),
        type: itemType
      });
    }
  });
  
  // Call the existing batch estimation function
  await startBatchEstimation();
  
  // Clear table selection after batch completes
  clearTableSelection();
}

async function handleTableStatusChange(e) {
  const select = e.target;
  const itemId = select.dataset.itemId;
  const itemType = select.dataset.itemType;
  const oldStatus = select.dataset.currentStatus;
  const newStatus = select.value;
  
  if (oldStatus === newStatus) return;
  
  try {
    select.disabled = true;
    
    const endpoint = itemType === 'issue' ? '/api/issues' : '/api/action-items';
    await axios.patch(`${endpoint}/${itemId}`, {
      status: newStatus
    });
    
    select.dataset.currentStatus = newStatus;
    
    updateStatusSelectColors(select, newStatus);
    
    showNotification(`Status updated to ${newStatus.replace('inprogress', 'In Progress')}`, 'success');
    
    if (currentView === 'kanban') {
      loadProjectIssuesAndActions(currentProject.id);
    } else {
      renderTableView();
    }
    
  } catch (error) {
    console.error('Error updating status:', error);
    showNotification('Failed to update status', 'error');
    select.value = oldStatus;
  } finally {
    select.disabled = false;
  }
}

function updateStatusSelectColors(select, status) {
  const statusColors = {
    todo: 'bg-gray-100 text-gray-800',
    inprogress: 'bg-blue-100 text-blue-800',
    blocked: 'bg-yellow-100 text-yellow-800',
    done: 'bg-green-100 text-green-800'
  };
  
  select.className = `table-status-select px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer ${statusColors[status]}`;
}

// ========================================
// EXPORT FUNCTIONS
// ========================================

// Export Kanban data as plain text file
async function exportAsText() {
  if (!currentProject) {
    alert('Please select a project first');
    return;
  }
  
  try {
    // Build query params with current filters
    const params = new URLSearchParams({ projectId: currentProject.id });
    
    if (currentFilters.status) params.append('status', currentFilters.status);
    if (currentFilters.priority) params.append('priority', currentFilters.priority);
    if (currentFilters.assignee) params.append('assignee', currentFilters.assignee);
    if (currentFilters.category) params.append('category', currentFilters.category);
    if (currentFilters.search) params.append('search', currentFilters.search);
    if (currentFilters.tag) params.append('tag', currentFilters.tag);
    
    // Trigger download
    window.location.href = `/api/projects/${currentProject.id}/export/txt?${params.toString()}`;
    
    showNotification('Text file export started', 'success');
  } catch (error) {
    console.error('Export error:', error);
    showNotification('Failed to export data', 'error');
  }
}

// Copy Kanban data to clipboard
async function copyToClipboard() {
  if (!currentProject) {
    alert('Please select a project first');
    return;
  }
  
  const btn = document.getElementById('copy-clipboard-btn');
  const btnText = document.getElementById('copy-btn-text');
  
  try {
    // Build query params with current filters
    const params = new URLSearchParams({ projectId: currentProject.id });
    
    if (currentFilters.status) params.append('status', currentFilters.status);
    if (currentFilters.priority) params.append('priority', currentFilters.priority);
    if (currentFilters.assignee) params.append('assignee', currentFilters.assignee);
    if (currentFilters.category) params.append('category', currentFilters.category);
    if (currentFilters.search) params.append('search', currentFilters.search);
    if (currentFilters.tag) params.append('tag', currentFilters.tag);
    
    // Fetch data from server
    const response = await axios.get(`/api/projects/${currentProject.id}/export/clipboard?${params.toString()}`);
    
    if (!response.data.success) {
      throw new Error('Failed to fetch data');
    }
    
    const data = response.data.data;
    
    // Convert to tab-separated format for Excel compatibility
    const rows = data.map(row => {
      return [
        row.type,
        row.title,
        row.assignee,
        row.priority,
        row.dueDate,
        row.status
      ].join('\t');
    });
    
    const textToCopy = rows.join('\n');
    
    // Copy to clipboard
    await navigator.clipboard.writeText(textToCopy);
    
    // Show success feedback
    btnText.textContent = '✓ Copied!';
    btn.classList.remove('bg-blue-50', 'hover:bg-blue-100', 'border-blue-300');
    btn.classList.add('bg-green-50', 'border-green-300');
    
    showNotification(`Copied ${response.data.count} items to clipboard. Paste into Excel!`, 'success');
    
    // Reset button after 2 seconds
    setTimeout(() => {
      btnText.textContent = 'Copy to Clipboard';
      btn.classList.remove('bg-green-50', 'border-green-300');
      btn.classList.add('bg-blue-50', 'hover:bg-blue-100', 'border-blue-300');
    }, 2000);
    
  } catch (error) {
    console.error('Copy to clipboard error:', error);
    showNotification('Failed to copy to clipboard', 'error');
    
    // Reset button
    btnText.textContent = 'Copy to Clipboard';
    btn.classList.remove('bg-green-50', 'border-green-300');
    btn.classList.add('bg-blue-50', 'hover:bg-blue-100', 'border-blue-300');
  }
}

// ==================== EFFORT ESTIMATION (PHASE 1) ====================

let currentEstimateData = null;

async function loadEffortEstimate(itemId, itemType) {
  try {
    const endpoint = itemType === 'issue' ? 'issues' : 'action-items';
    const response = await axios.get(`/api/${endpoint}/${itemId}`, { withCredentials: true });
    const item = response.data;
    
    // Determine which form elements to use based on itemType
    const prefix = itemType === 'issue' ? 'edit-issue' : 'edit-action-item';
    
    // RESET: Hide all estimate sections first to ensure clean state
    const aiSection = document.getElementById(`${prefix}-ai-estimate-section`);
    const hybridSection = document.getElementById(`${prefix}-hybrid-estimate-section`);
    const selectorSection = document.getElementById(`${prefix}-estimate-selector`);
    
    if (aiSection) aiSection.classList.add('hidden');
    if (hybridSection) hybridSection.classList.add('hidden');
    if (selectorSection) selectorSection.classList.add('hidden');
    
    document.getElementById(`${prefix}-estimated-hours`).value = item.estimated_effort_hours || item.estimated_hours || '';
    document.getElementById(`${prefix}-actual-hours`).value = item.actual_effort_hours || item.actual_hours || '';
    
    // Load time entry count
    try {
      const timeCountBadge = document.getElementById(`${prefix}-time-count`);
      if (timeCountBadge) {
        const timeEntriesResponse = await axios.get(`/api/${endpoint}/${itemId}/time-entries`, { withCredentials: true });
        const entriesCount = timeEntriesResponse.data.entries.length;
        timeCountBadge.textContent = `${entriesCount} ${entriesCount === 1 ? 'entry' : 'entries'}`;
      }
    } catch (error) {
      console.error('Error loading time entry count:', error);
      const timeCountBadge = document.getElementById(`${prefix}-time-count`);
      if (timeCountBadge) {
        timeCountBadge.textContent = '0 entries';
      }
    }
    
    if (item.ai_estimated_hours || item.ai_effort_estimate_hours) {
      // Parse as numbers (PostgreSQL returns NUMERIC/DECIMAL as strings)
      const aiHours = parseFloat(item.ai_effort_estimate_hours || item.ai_estimated_hours);
      const aiConfidence = item.ai_estimate_confidence || item.ai_confidence || 'medium';
      const hybridHours = parseFloat(item.hybrid_effort_estimate_hours) || 0;
      
      currentEstimateData = {
        hours: aiHours,
        confidence: aiConfidence,
        version: item.ai_estimate_version || 1,
        itemId,
        itemType,
        hasHybrid: hybridHours > 0,
        hybridHours: hybridHours,
        hybridSelectedCount: 0,
        hybridTotalTasks: 0
      };
      
      // Load hybrid task count if hybrid exists
      if (currentEstimateData.hasHybrid && item.hybrid_estimate_data) {
        try {
          const hybridData = typeof item.hybrid_estimate_data === 'string' 
            ? JSON.parse(item.hybrid_estimate_data) 
            : item.hybrid_estimate_data;
          if (hybridData && hybridData.selectedTasks) {
            currentEstimateData.hybridSelectedCount = hybridData.selectedTasks.filter(t => t.selected !== false).length;
            currentEstimateData.hybridTotalTasks = hybridData.totalTasks || hybridData.selectedTasks.length;
          }
        } catch (e) {
          console.error('Error parsing hybrid data:', e);
        }
      }
      
      // Display AI hours with 2 decimal places
      document.getElementById(`${prefix}-ai-hours`).textContent = aiHours.toFixed(2);
      const confidenceBadge = document.getElementById(`${prefix}-ai-confidence`);
      confidenceBadge.textContent = aiConfidence;
      confidenceBadge.className = `ml-2 text-xs px-2 py-1 rounded ${
        aiConfidence === 'high' ? 'bg-green-200 text-green-800' :
        aiConfidence === 'low' ? 'bg-red-200 text-red-800' :
        'bg-blue-200 text-blue-800'
      }`;
      
      document.getElementById(`${prefix}-ai-estimate-section`).classList.remove('hidden');
      
      // Show hybrid section if it exists
      if (currentEstimateData.hasHybrid) {
        document.getElementById(`${prefix}-hybrid-hours`).textContent = hybridHours.toFixed(1);
        document.getElementById(`${prefix}-hybrid-count`).textContent = `${currentEstimateData.hybridSelectedCount}/${currentEstimateData.hybridTotalTasks} tasks`;
        document.getElementById(`${prefix}-hybrid-estimate-section`).classList.remove('hidden');
      }
      
      // Update the three-way selector to show hybrid option if available
      updateThreeWayEstimateSelector(itemType);
    } else {
      document.getElementById(`${prefix}-ai-estimate-section`).classList.add('hidden');
      currentEstimateData = null;
    }
    
    await loadRateLimitStatus();
    
  } catch (error) {
    console.error('Error loading effort estimate:', error);
  }
}

async function loadRateLimitStatus() {
  try {
    const response = await axios.get('/api/ai-usage/rate-limit', { withCredentials: true });
    const { limits } = response.data;
    
    if (!limits || !limits.user) {
      console.warn('Rate limit data not available');
      return;
    }
    
    const user = limits.user;
    const project = limits.project;
    
    const warningDiv = document.getElementById('edit-issue-estimate-warning');
    const msgSpan = document.getElementById('edit-issue-rate-limit-msg');
    
    if (user.exceeded || (project && project.exceeded)) {
      warningDiv.classList.remove('hidden');
      if (user.exceeded) {
        const resetDate = new Date(user.resetAt);
        msgSpan.textContent = `User limit exceeded. Resets in ${Math.ceil((resetDate - Date.now()) / 60000)} min.`;
      } else if (project) {
        const resetDate = new Date(project.resetAt);
        msgSpan.textContent = `Project limit exceeded. Resets in ${Math.ceil((resetDate - Date.now()) / 60000)} min.`;
      }
      document.getElementById('edit-issue-generate-estimate').disabled = true;
    } else if (user.warning || (project && project.warning)) {
      warningDiv.classList.remove('hidden');
      const projectMsg = project ? ` ${project.remaining} project estimates today.` : '';
      msgSpan.textContent = `${user.remaining} user estimates remaining this hour.${projectMsg}`;
    } else {
      warningDiv.classList.add('hidden');
    }
    
  } catch (error) {
    console.error('Error loading rate limit status:', error);
  }
}

document.getElementById('edit-issue-generate-estimate')?.addEventListener('click', async function() {
  const itemId = document.getElementById('edit-issue-id').value;
  if (!itemId) return;
  
  // Warn if regenerating will clear hybrid estimate
  if (currentEstimateData && currentEstimateData.hasHybrid && currentEstimateData.hybridHours > 0) {
    const confirmRegenerate = confirm(
      `⚠️ Warning: Regenerating the AI estimate will reset your hybrid selections.\n\n` +
      `Current hybrid estimate: ${currentEstimateData.hybridHours.toFixed(1)} hours (${currentEstimateData.hybridSelectedCount} tasks selected)\n\n` +
      `Do you want to continue?`
    );
    
    if (!confirmRegenerate) {
      return; // User cancelled
    }
  }
  
  const btn = this;
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="animate-pulse">🤖 Generating...</span>';
  
  try {
    // Clear hybrid estimate data when regenerating
    if (currentEstimateData) {
      currentEstimateData.hasHybrid = false;
      currentEstimateData.hybridHours = 0;
      currentEstimateData.hybridSelectedCount = 0;
      currentEstimateData.hybridTotalTasks = 0;
    }
    document.getElementById('edit-issue-hybrid-estimate-section').classList.add('hidden');
    
    const response = await axios.post(`/api/issues/${itemId}/estimate`, 
      { model: 'gpt-4o' },
      { withCredentials: true }
    );
    
    const { estimate, rateLimitStatus } = response.data;
    
    currentEstimateData = {
      hours: estimate.hours,
      confidence: estimate.confidence,
      version: estimate.version,
      itemId,
      itemType: 'issue'
    };
    
    document.getElementById('edit-issue-ai-hours').textContent = estimate.hours;
    const confidenceBadge = document.getElementById('edit-issue-ai-confidence');
    confidenceBadge.textContent = estimate.confidence;
    confidenceBadge.className = `ml-2 text-xs px-2 py-1 rounded ${
      estimate.confidence === 'high' ? 'bg-green-200 text-green-800' :
      estimate.confidence === 'low' ? 'bg-red-200 text-red-800' :
      'bg-blue-200 text-blue-800'
    }`;
    
    document.getElementById('edit-issue-ai-estimate-section').classList.remove('hidden');
    
    // Update three-way selector
    updateThreeWayEstimateSelector();
    
    showToast('AI estimate generated successfully! Click "View Breakdown" to review details.', 'success');
    await loadRateLimitStatus();
    
  } catch (error) {
    console.error('Error generating estimate:', error);
    if (error.response?.status === 429) {
      showToast('Rate limit exceeded. Please try again later.', 'error');
    } else {
      showToast(error.response?.data?.error || 'Failed to generate estimate', 'error');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
});

let hybridSelectionState = { tasks: [], totalHours: 0, selectedCount: 0 };

document.getElementById('edit-issue-view-breakdown')?.addEventListener('click', async function() {
  if (!currentEstimateData) return;
  
  const { itemId, itemType } = currentEstimateData;
  const endpoint = itemType === 'issue' ? 'issues' : 'action-items';
  
  try {
    // Load AI breakdown
    const response = await axios.get(`/api/${endpoint}/${itemId}/estimate/breakdown`, 
      { withCredentials: true }
    );
    
    const breakdown = response.data;
    
    // Initialize hybrid selection state with all tasks
    hybridSelectionState.tasks = breakdown.tasks.map(task => ({
      ...task,
      selected: false,
      editedHours: task.hours,
      originalHours: task.hours
    }));
    hybridSelectionState.totalHours = 0;
    hybridSelectionState.selectedCount = 0;
    
    // Try to load saved hybrid data and hydrate
    try {
      const hybridResponse = await axios.get(`/api/${endpoint}/${itemId}/estimate/breakdown?type=hybrid`, 
        { withCredentials: true }
      );
      
      if (hybridResponse.data && hybridResponse.data.selectedTasks) {
        // Hydrate saved hybrid selections
        const savedSelections = hybridResponse.data.selectedTasks;
        
        savedSelections.forEach(savedTask => {
          // Find matching task in current breakdown
          const taskIndex = hybridSelectionState.tasks.findIndex(t => 
            t.task === savedTask.task || t.task === savedTask.description
          );
          
          if (taskIndex !== -1) {
            hybridSelectionState.tasks[taskIndex].selected = true;
            hybridSelectionState.tasks[taskIndex].editedHours = savedTask.editedHours || savedTask.hours;
          }
        });
        
        // Recalculate totals
        const selectedTasks = hybridSelectionState.tasks.filter(t => t.selected);
        hybridSelectionState.totalHours = selectedTasks.reduce((sum, task) => sum + task.editedHours, 0);
        hybridSelectionState.selectedCount = selectedTasks.length;
      }
    } catch (hybridError) {
      // No saved hybrid data, that's okay
      console.log('No saved hybrid data found, starting fresh');
    }
    
    renderBreakdownModal(breakdown, itemId, itemType);
    document.getElementById('estimateBreakdownModal').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error loading breakdown:', error);
    showToast('Failed to load estimate breakdown', 'error');
  }
});

function renderBreakdownModal(breakdown, itemId, itemType) {
  const contentDiv = document.getElementById('breakdown-content');
  
  // Check if breakdown has incomplete data (old estimate format)
  const hasIncompleteData = !breakdown.confidence || !breakdown.tasks || breakdown.tasks.length === 0;
  
  if (hasIncompleteData) {
    // Show message for old/incomplete estimates
    contentDiv.innerHTML = `
      <div class="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6 mb-4">
        <div class="flex items-start gap-3">
          <div class="text-3xl">⚠️</div>
          <div class="flex-1">
            <h3 class="text-lg font-bold text-yellow-800 mb-2">Incomplete Estimate Data</h3>
            <p class="text-sm text-gray-700 mb-3">
              This estimate was created before the detailed breakdown feature was added. 
              It shows <strong>${breakdown.totalHours} hours</strong> but doesn't include:
            </p>
            <ul class="list-disc list-inside text-sm text-gray-700 mb-4 space-y-1">
              <li>Task breakdown with individual estimates</li>
              <li>Confidence level</li>
              <li>Ability to create hybrid estimates</li>
            </ul>
            <p class="text-sm text-gray-700 mb-4">
              <strong>Solution:</strong> Regenerate the AI estimate to get the full breakdown with all features.
            </p>
            <button onclick="document.getElementById('estimateBreakdownModal').classList.add('hidden'); document.getElementById('edit-${itemType === 'issue' ? 'issue' : 'action-item'}-generate-estimate').click()" 
                    class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              🔄 Regenerate AI Estimate
            </button>
          </div>
        </div>
      </div>
    `;
    return;
  }
  
  contentDiv.innerHTML = `
    <div class="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg mb-4">
      <div class="grid grid-cols-4 gap-4 text-center">
        <div>
          <div class="text-sm text-gray-600">AI Total</div>
          <div class="text-2xl font-bold text-blue-600">${breakdown.totalHours} hrs</div>
        </div>
        <div>
          <div class="text-sm text-gray-600">Confidence</div>
          <div class="text-2xl font-bold ${
            breakdown.confidence === 'high' ? 'text-green-600' :
            breakdown.confidence === 'low' ? 'text-red-600' : 'text-blue-600'
          }">${breakdown.confidence || 'medium'}</div>
        </div>
        <div>
          <div class="text-sm text-gray-600">Selected</div>
          <div class="text-2xl font-bold text-purple-600" id="hybrid-selected-count">0/${breakdown.tasks.length}</div>
        </div>
        <div>
          <div class="text-sm text-gray-600">Hybrid Total</div>
          <div class="text-2xl font-bold text-green-600" id="hybrid-total-hours">0 hrs</div>
        </div>
      </div>
    </div>
    
    <div class="mb-4">
      <div class="flex justify-between items-center mb-3">
        <h3 class="text-lg font-semibold">📋 Select Tasks for Hybrid Estimate</h3>
        <button id="select-all-tasks" class="text-sm px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded">
          Select All
        </button>
      </div>
      <div class="space-y-2" id="tasks-list">
        ${breakdown.tasks.map((task, idx) => `
          <div class="border-2 ${hybridSelectionState.tasks[idx]?.selected ? 'border-green-300 bg-green-50' : 'border-gray-200'} rounded-lg p-3 hover:border-blue-300 transition-colors task-item" data-task-index="${idx}">
            <div class="flex items-start gap-3">
              <input type="checkbox" 
                     id="task-${idx}" 
                     class="task-checkbox mt-1 w-5 h-5 cursor-pointer" 
                     data-index="${idx}"
                     ${hybridSelectionState.tasks[idx]?.selected ? 'checked' : ''}>
              <div class="flex-1">
                <label for="task-${idx}" class="font-medium cursor-pointer block">
                  ${idx + 1}. ${task.task || task.description || 'Task'}
                </label>
                ${task.reasoning ? `
                  <div class="text-xs text-gray-500 mt-1">
                    <strong>Reasoning:</strong> ${task.reasoning}
                  </div>
                ` : ''}
                ${task.complexity || task.category ? `
                  <div class="flex gap-2 mt-2">
                    ${task.complexity ? `<span class="text-xs px-2 py-1 rounded bg-gray-100">${task.complexity}</span>` : ''}
                    ${task.category ? `<span class="text-xs px-2 py-1 rounded bg-blue-100">${task.category}</span>` : ''}
                  </div>
                ` : ''}
              </div>
              <div class="flex items-center gap-2">
                <input type="number" 
                       id="hours-${idx}" 
                       class="task-hours w-20 px-2 py-1 border rounded text-center font-bold"
                       value="${hybridSelectionState.tasks[idx]?.editedHours || task.hours}" 
                       min="0.5" 
                       step="0.5"
                       ${hybridSelectionState.tasks[idx]?.selected ? '' : 'disabled'}
                       data-index="${idx}">
                <span class="text-gray-500">hrs</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    
    ${breakdown.assumptions && breakdown.assumptions.length > 0 ? `
      <div class="mb-4">
        <h3 class="text-lg font-semibold mb-2">💭 Key Assumptions</h3>
        <ul class="list-disc list-inside space-y-1 text-sm text-gray-700">
          ${breakdown.assumptions.map(a => `<li>${a}</li>`).join('')}
        </ul>
      </div>
    ` : ''}
    
    <div class="text-xs text-gray-500 mt-4 p-3 bg-gray-50 rounded">
      <strong>Tip:</strong> Select tasks you want to include in your hybrid estimate. Edit hours if needed. Click Save Changes to apply.
      <br>Generated on ${new Date(breakdown.timestamp).toLocaleString()}
    </div>
    
    <!-- Save/Cancel Buttons -->
    <div class="flex gap-3 mt-6 pt-4 border-t">
      <button id="save-hybrid-estimate" class="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg hover:from-green-700 hover:to-blue-700 transition-all font-medium flex items-center justify-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
        </svg>
        Save Changes
      </button>
      <button id="cancel-hybrid-estimate" class="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
        Cancel
      </button>
    </div>
  `;
  
  // Attach event listeners
  attachBreakdownEventListeners(itemId, itemType);
}

function attachBreakdownEventListeners(itemId, itemType) {
  // Store original state for Cancel functionality
  const originalState = JSON.parse(JSON.stringify(hybridSelectionState));
  
  // Select all button
  document.getElementById('select-all-tasks')?.addEventListener('click', function() {
    const allSelected = hybridSelectionState.selectedCount === hybridSelectionState.tasks.length;
    
    hybridSelectionState.tasks.forEach((task, idx) => {
      task.selected = !allSelected;
      document.getElementById(`task-${idx}`).checked = !allSelected;
      document.getElementById(`hours-${idx}`).disabled = allSelected;
    });
    
    recalculateHybridTotal();
    // REMOVED: auto-save - now only saves on "Save Changes" button click
    
    this.textContent = allSelected ? 'Select All' : 'Deselect All';
  });
  
  // Task checkbox listeners
  document.querySelectorAll('.task-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
      const idx = parseInt(this.dataset.index);
      hybridSelectionState.tasks[idx].selected = this.checked;
      document.getElementById(`hours-${idx}`).disabled = !this.checked;
      
      // Update visual styling
      const taskItem = this.closest('.task-item');
      if (this.checked) {
        taskItem.classList.remove('border-gray-200');
        taskItem.classList.add('border-green-300', 'bg-green-50');
      } else {
        taskItem.classList.remove('border-green-300', 'bg-green-50');
        taskItem.classList.add('border-gray-200');
      }
      
      // If unchecked, reset to original hours
      if (!this.checked) {
        hybridSelectionState.tasks[idx].editedHours = hybridSelectionState.tasks[idx].originalHours;
        document.getElementById(`hours-${idx}`).value = hybridSelectionState.tasks[idx].originalHours;
      }
      
      recalculateHybridTotal();
      // REMOVED: auto-save - now only saves on "Save Changes" button click
    });
  });
  
  // Hours input listeners
  document.querySelectorAll('.task-hours').forEach(input => {
    input.addEventListener('input', function() {
      const idx = parseInt(this.dataset.index);
      const newHours = parseFloat(this.value) || 0;
      hybridSelectionState.tasks[idx].editedHours = newHours;
      
      recalculateHybridTotal();
      // REMOVED: auto-save - now only saves on "Save Changes" button click
    });
  });
  
  // Save Changes button
  document.getElementById('save-hybrid-estimate')?.addEventListener('click', async function() {
    const btn = this;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-pulse">Saving...</span>';
    
    try {
      await saveHybridEstimate(itemId, itemType);
      showToast('Hybrid estimate saved successfully!', 'success');
      document.getElementById('estimateBreakdownModal').classList.add('hidden');
    } catch (error) {
      console.error('Error saving hybrid estimate:', error);
      showToast('Failed to save hybrid estimate', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });
  
  // Cancel button
  document.getElementById('cancel-hybrid-estimate')?.addEventListener('click', function() {
    // Restore original state
    hybridSelectionState.tasks = originalState.tasks;
    hybridSelectionState.totalHours = originalState.totalHours;
    hybridSelectionState.selectedCount = originalState.selectedCount;
    
    // Close modal without saving
    document.getElementById('estimateBreakdownModal').classList.add('hidden');
  });
}

function recalculateHybridTotal() {
  const selectedTasks = hybridSelectionState.tasks.filter(t => t.selected);
  const total = selectedTasks.reduce((sum, task) => sum + task.editedHours, 0);
  
  hybridSelectionState.totalHours = total;
  hybridSelectionState.selectedCount = selectedTasks.length;
  
  // Update UI
  document.getElementById('hybrid-selected-count').textContent = `${selectedTasks.length}/${hybridSelectionState.tasks.length}`;
  document.getElementById('hybrid-total-hours').textContent = `${total.toFixed(1)} hrs`;
  
  // Update select all button
  const selectAllBtn = document.getElementById('select-all-tasks');
  if (selectAllBtn) {
    selectAllBtn.textContent = hybridSelectionState.selectedCount === hybridSelectionState.tasks.length ? 'Deselect All' : 'Select All';
  }
}

async function saveHybridEstimate(itemId, itemType) {
  if (hybridSelectionState.selectedCount === 0) {
    // Clear hybrid if nothing selected
    if (currentEstimateData) {
      currentEstimateData.hasHybrid = false;
      currentEstimateData.hybridHours = 0;
      currentEstimateData.hybridSelectedCount = 0;
      currentEstimateData.hybridTotalTasks = 0;
      updateThreeWayEstimateSelector();
    }
    return;
  }
  
  const endpoint = itemType === 'issue' ? 'issues' : 'action-items';
  
  try {
    await axios.post(`/api/${endpoint}/${itemId}/estimate/hybrid`, {
      selectedTasks: hybridSelectionState.tasks,
      totalHours: hybridSelectionState.totalHours
    }, { withCredentials: true });
    
    console.log('✅ Hybrid estimate saved:', {
      totalHours: hybridSelectionState.totalHours,
      selectedCount: hybridSelectionState.selectedCount,
      totalTasks: hybridSelectionState.tasks.length
    });
    
    // Update global estimate data to trigger UI refresh
    if (currentEstimateData) {
      currentEstimateData.hybridHours = hybridSelectionState.totalHours;
      currentEstimateData.hasHybrid = true;
      currentEstimateData.hybridSelectedCount = hybridSelectionState.selectedCount;
      currentEstimateData.hybridTotalTasks = hybridSelectionState.tasks.length;
    }
    
    // Update EDIT modal elements (if they exist - for Edit Issue/Action modal context)
    const prefix = itemType === 'issue' ? 'edit-issue' : 'edit-action-item';
    const hybridHoursElement = document.getElementById(`${prefix}-hybrid-hours`);
    const hybridCountElement = document.getElementById(`${prefix}-hybrid-count`);
    const hybridSectionElement = document.getElementById(`${prefix}-hybrid-estimate-section`);
    
    if (hybridHoursElement) {
      hybridHoursElement.textContent = hybridSelectionState.totalHours.toFixed(1);
    }
    if (hybridCountElement) {
      hybridCountElement.textContent = `${hybridSelectionState.selectedCount}/${hybridSelectionState.tasks.length} tasks`;
    }
    if (hybridSectionElement) {
      hybridSectionElement.classList.remove('hidden');
    }
    
    // Update three-way selector (Edit modals)
    updateThreeWayEstimateSelector(itemType);
    
    // ALSO refresh Detail modal's Effort Estimates tab (if it exists - for Detail modal context)
    if (typeof loadEstimateForm === 'function') {
      await loadEstimateForm();
      console.log('✅ Detail modal Effort Estimates tab refreshed');
    }
    
  } catch (error) {
    console.error('Error saving hybrid estimate:', error);
    showToast('Failed to save hybrid estimate', 'error');
  }
}

function updateThreeWayEstimateSelector(itemType = null) {
  // Determine item type from currentEstimateData if not provided
  const type = itemType || (currentEstimateData ? currentEstimateData.itemType : 'issue');
  const prefix = type === 'issue' ? 'edit-issue' : 'edit-action-item';
  const radioPrefix = type === 'issue' ? 'planning' : 'action-planning';
  
  const manualInput = document.getElementById(`${prefix}-estimated-hours`);
  const manualHours = parseFloat(manualInput?.value) || 0;
  
  const selector = document.getElementById(`${prefix}-estimate-selector`);
  const manualLabel = document.getElementById(`${radioPrefix}-manual-label`);
  const aiLabel = document.getElementById(`${radioPrefix}-ai-label`);
  const hybridLabel = document.getElementById(`${radioPrefix}-hybrid-label`);
  
  if (!selector || !manualLabel) return;
  
  // Update manual hours display
  const manualHoursElement = document.getElementById(`${radioPrefix}-manual-hours`);
  if (manualHoursElement) {
    manualHoursElement.textContent = manualHours > 0 ? `${manualHours} hours` : '0 hours';
  }
  
  // Show/hide AI option
  if (currentEstimateData && currentEstimateData.hours) {
    const aiHoursElement = document.getElementById(`${radioPrefix}-ai-hours`);
    const aiConfidenceElement = document.getElementById(`${radioPrefix}-ai-confidence`);
    if (aiHoursElement) {
      aiHoursElement.textContent = `${currentEstimateData.hours} hours`;
    }
    if (aiConfidenceElement) {
      aiConfidenceElement.textContent = currentEstimateData.confidence;
      aiConfidenceElement.className = `ml-2 text-xs px-2 py-1 rounded ${
        currentEstimateData.confidence === 'high' ? 'bg-green-200 text-green-800' :
        currentEstimateData.confidence === 'low' ? 'bg-red-200 text-red-800' :
        'bg-blue-200 text-blue-800'
      }`;
    }
    aiLabel.classList.remove('hidden');
  } else {
    aiLabel.classList.add('hidden');
  }
  
  // Show/hide hybrid option
  if (currentEstimateData && currentEstimateData.hasHybrid && currentEstimateData.hybridHours > 0) {
    const hybridHoursElement = document.getElementById(`${radioPrefix}-hybrid-hours`);
    const hybridTasksElement = document.getElementById(`${radioPrefix}-hybrid-tasks`);
    if (hybridHoursElement) {
      hybridHoursElement.textContent = `${currentEstimateData.hybridHours.toFixed(1)} hours`;
    }
    if (hybridTasksElement) {
      hybridTasksElement.textContent = `${currentEstimateData.hybridSelectedCount}/${currentEstimateData.hybridTotalTasks} tasks`;
    }
    hybridLabel.classList.remove('hidden');
  } else {
    hybridLabel.classList.add('hidden');
  }
  
  // Show selector if AI or Hybrid exists
  if ((currentEstimateData && currentEstimateData.hours) || (currentEstimateData && currentEstimateData.hasHybrid)) {
    selector.classList.remove('hidden');
  } else {
    selector.classList.add('hidden');
  }
  
  // Update border colors based on selection
  document.querySelectorAll(`[name="${radioPrefix}-estimate"]`).forEach(radio => {
    const label = radio.closest('label');
    if (radio.checked) {
      label.classList.add('border-blue-500', 'bg-blue-50');
      label.classList.remove('border-gray-200');
    } else {
      label.classList.remove('border-blue-500', 'bg-blue-50');
      label.classList.add('border-gray-200');
    }
  });
}

document.getElementById('closeBreakdownModal')?.addEventListener('click', function() {
  document.getElementById('estimateBreakdownModal').classList.add('hidden');
  // Update the three-way selector to reflect any hybrid selections made
  if (currentEstimateData) {
    updateThreeWayEstimateSelector(currentEstimateData.itemType);
  }
});

// Handle View Breakdown for ACTION ITEMS
document.getElementById('edit-action-item-view-breakdown')?.addEventListener('click', async function() {
  if (!currentEstimateData) return;
  
  const { itemId, itemType } = currentEstimateData;
  const endpoint = itemType === 'issue' ? 'issues' : 'action-items';
  
  try {
    // Load AI breakdown
    const response = await axios.get(`/api/${endpoint}/${itemId}/estimate/breakdown`, 
      { withCredentials: true }
    );
    
    const breakdown = response.data;
    
    // Initialize hybrid selection state with all tasks
    hybridSelectionState.tasks = breakdown.tasks.map(task => ({
      ...task,
      selected: false,
      editedHours: task.hours,
      originalHours: task.hours
    }));
    hybridSelectionState.totalHours = 0;
    hybridSelectionState.selectedCount = 0;
    
    // Try to load saved hybrid data and hydrate
    try {
      const hybridResponse = await axios.get(`/api/${endpoint}/${itemId}/estimate/breakdown?type=hybrid`, 
        { withCredentials: true }
      );
      
      if (hybridResponse.data && hybridResponse.data.selectedTasks) {
        // Hydrate saved hybrid selections
        const savedSelections = hybridResponse.data.selectedTasks;
        
        savedSelections.forEach(savedTask => {
          // Find matching task in current breakdown
          const taskIndex = hybridSelectionState.tasks.findIndex(t => 
            t.task === savedTask.task || t.task === savedTask.description
          );
          
          if (taskIndex !== -1) {
            hybridSelectionState.tasks[taskIndex].selected = true;
            hybridSelectionState.tasks[taskIndex].editedHours = savedTask.editedHours || savedTask.hours;
          }
        });
        
        // Recalculate totals
        const selectedTasks = hybridSelectionState.tasks.filter(t => t.selected);
        hybridSelectionState.totalHours = selectedTasks.reduce((sum, task) => sum + task.editedHours, 0);
        hybridSelectionState.selectedCount = selectedTasks.length;
      }
    } catch (hybridError) {
      // No saved hybrid data, that's okay
      console.log('No saved hybrid data found, starting fresh');
    }
    
    renderBreakdownModal(breakdown, itemId, itemType);
    document.getElementById('estimateBreakdownModal').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error loading breakdown:', error);
    showToast('Failed to load estimate breakdown', 'error');
  }
});

// Handle View Hybrid Breakdown
document.getElementById('edit-issue-view-hybrid-breakdown')?.addEventListener('click', async function() {
  if (!currentEstimateData || !currentEstimateData.hasHybrid) {
    console.warn('No hybrid estimate data available', currentEstimateData);
    showToast('No hybrid estimate found', 'error');
    return;
  }
  
  const { itemId, itemType } = currentEstimateData;
  const endpoint = itemType === 'issue' ? 'issues' : 'action-items';
  
  console.log('Loading hybrid breakdown for:', { itemId, itemType, endpoint });
  
  try {
    const response = await axios.get(`/api/${endpoint}/${itemId}/estimate/breakdown?type=hybrid`, 
      { withCredentials: true }
    );
    
    console.log('Hybrid breakdown response:', response.data);
    const hybridBreakdown = response.data;
    const contentDiv = document.getElementById('breakdown-content');
    
    contentDiv.innerHTML = `
      <div class="bg-green-50 p-4 rounded-lg mb-4">
        <div class="grid grid-cols-2 gap-4 text-center">
          <div>
            <div class="text-sm text-gray-600">Hybrid Total</div>
            <div class="text-2xl font-bold text-green-600">${hybridBreakdown.totalHours.toFixed(1)} hrs</div>
          </div>
          <div>
            <div class="text-sm text-gray-600">Tasks Selected</div>
            <div class="text-2xl font-bold text-purple-600">${hybridBreakdown.selectedTasks.length}</div>
          </div>
        </div>
      </div>
      
      <div class="mb-4">
        <h3 class="text-lg font-semibold mb-2">✅ Selected Tasks</h3>
        <div class="space-y-2">
          ${hybridBreakdown.selectedTasks.map((task, idx) => `
            <div class="border-2 border-green-200 bg-green-50 rounded-lg p-3">
              <div class="flex justify-between items-start mb-2">
                <span class="font-medium">${idx + 1}. ${task.task || task.description || 'Task'}</span>
                <span class="text-green-600 font-bold">${task.editedHours || task.hours}h</span>
              </div>
              ${task.complexity || task.category ? `
                <div class="flex gap-2 mt-2">
                  ${task.complexity ? `<span class="text-xs px-2 py-1 rounded bg-gray-100">${task.complexity}</span>` : ''}
                  ${task.category ? `<span class="text-xs px-2 py-1 rounded bg-blue-100">${task.category}</span>` : ''}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="text-xs text-gray-500 mt-4 p-3 bg-gray-50 rounded">
        <strong>Note:</strong> This hybrid estimate was created by selecting specific tasks from the AI breakdown.
        <br>Created on ${new Date(hybridBreakdown.timestamp).toLocaleString()}
      </div>
    `;
    
    document.getElementById('estimateBreakdownModal').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error loading hybrid breakdown:', error);
    showToast('No hybrid estimate found', 'info');
  }
});

// Handle View Hybrid Breakdown for ACTION ITEMS
document.getElementById('edit-action-item-view-hybrid-breakdown')?.addEventListener('click', async function() {
  if (!currentEstimateData || !currentEstimateData.hasHybrid) {
    console.warn('No hybrid estimate data available', currentEstimateData);
    showToast('No hybrid estimate found', 'error');
    return;
  }
  
  const { itemId, itemType } = currentEstimateData;
  const endpoint = itemType === 'issue' ? 'issues' : 'action-items';
  
  console.log('Loading hybrid breakdown for:', { itemId, itemType, endpoint });
  
  try {
    const response = await axios.get(`/api/${endpoint}/${itemId}/estimate/breakdown?type=hybrid`, 
      { withCredentials: true }
    );
    
    console.log('Hybrid breakdown response:', response.data);
    const hybridBreakdown = response.data;
    const contentDiv = document.getElementById('breakdown-content');
    
    contentDiv.innerHTML = `
      <div class="bg-green-50 p-4 rounded-lg mb-4">
        <div class="grid grid-cols-2 gap-4 text-center">
          <div>
            <div class="text-sm text-gray-600">Hybrid Total</div>
            <div class="text-2xl font-bold text-green-600">${hybridBreakdown.totalHours.toFixed(1)} hrs</div>
          </div>
          <div>
            <div class="text-sm text-gray-600">Tasks Selected</div>
            <div class="text-2xl font-bold text-purple-600">${hybridBreakdown.selectedTasks.length}</div>
          </div>
        </div>
      </div>
      
      <div class="mb-4">
        <h3 class="text-lg font-semibold mb-2">✅ Selected Tasks</h3>
        <div class="space-y-2">
          ${hybridBreakdown.selectedTasks.map((task, idx) => `
            <div class="border-2 border-green-200 bg-green-50 rounded-lg p-3">
              <div class="flex justify-between items-start mb-2">
                <span class="font-medium">${idx + 1}. ${task.task || task.description || 'Task'}</span>
                <span class="text-green-600 font-bold">${task.editedHours || task.hours}h</span>
              </div>
              ${task.complexity || task.category ? `
                <div class="flex gap-2 mt-2">
                  ${task.complexity ? `<span class="text-xs px-2 py-1 rounded bg-gray-100">${task.complexity}</span>` : ''}
                  ${task.category ? `<span class="text-xs px-2 py-1 rounded bg-blue-100">${task.category}</span>` : ''}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="text-xs text-gray-500 mt-4 p-3 bg-gray-50 rounded">
        <strong>Note:</strong> This hybrid estimate was created by selecting specific tasks from the AI breakdown.
        <br>Created on ${new Date(hybridBreakdown.timestamp).toLocaleString()}
      </div>
    `;
    
    document.getElementById('estimateBreakdownModal').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error loading hybrid breakdown:', error);
    showToast('No hybrid estimate found', 'info');
  }
});

// Handle radio button selection for planning estimate (Issues)
document.querySelectorAll('[name="planning-estimate"]').forEach(radio => {
  radio.addEventListener('change', function() {
    updateThreeWayEstimateSelector('issue');
    showToast(`Using ${this.value} estimate for planning`, 'success');
  });
});

// Handle radio button selection for planning estimate (Action Items)
document.querySelectorAll('[name="action-planning-estimate"]').forEach(radio => {
  radio.addEventListener('change', function() {
    updateThreeWayEstimateSelector('action-item');
    showToast(`Using ${this.value} estimate for planning`, 'success');
  });
});

// Update manual estimate input listener to refresh selector (Issues)
document.getElementById('edit-issue-estimated-hours')?.addEventListener('input', function() {
  updateThreeWayEstimateSelector('issue');
});

// Update manual estimate input listener to refresh selector (Action Items)
document.getElementById('edit-action-item-estimated-hours')?.addEventListener('input', function() {
  updateThreeWayEstimateSelector('action-item');
});

// ==================== EFFORT ESTIMATES TAB (DETAIL MODAL) ====================

let estimateHistoryData = [];
let showAllEstimates = false;
let currentUserCanEdit = false; // Permission flag set by detail modal

async function loadEffortEstimatesTab() {
  if (!currentItemId || !currentItemType) {
    console.error('No current item selected');
    return;
  }
  
  // Reset show all estimates flag for each new item (UX requirement: default to top 3 versions)
  showAllEstimates = false;
  
  try {
    // Load both history and form concurrently
    await Promise.all([
      loadEstimateHistory(),
      loadEstimateForm()
    ]);
  } catch (error) {
    console.error('Error loading effort estimates tab:', error);
    showToast('Failed to load effort estimates', 'error');
  }
}

async function loadEstimateHistory() {
  const container = document.getElementById('estimate-history-container');
  if (!container) return;
  
  container.innerHTML = '<div class="text-center py-8 text-gray-500">Loading estimate history...</div>';
  
  try {
    const endpoint = currentItemType === 'issue' ? 'issues' : 'action-items';
    const response = await axios.get(`/api/${endpoint}/${currentItemId}/effort-estimate-history`, { withCredentials: true });
    
    estimateHistoryData = response.data.history || [];
    const currentVersion = response.data.currentVersion;
    const planningSource = response.data.planningSource;
    
    if (estimateHistoryData.length === 0) {
      container.innerHTML = '<div class="text-center py-8 text-gray-500">No estimate history yet. Generate your first AI estimate!</div>';
      document.getElementById('estimate-history-expand-container').classList.add('hidden');
      return;
    }
    
    renderEstimateHistory(currentVersion, planningSource);
    
  } catch (error) {
    console.error('Error loading estimate history:', error);
    container.innerHTML = '<div class="text-center py-8 text-red-500">Failed to load estimate history</div>';
  }
}

function renderEstimateHistory(currentVersion, planningSource) {
  const container = document.getElementById('estimate-history-container');
  const expandContainer = document.getElementById('estimate-history-expand-container');
  
  const visibleHistory = showAllEstimates ? estimateHistoryData : estimateHistoryData.slice(0, 3);
  
  let html = '';
  
  visibleHistory.forEach((version, index) => {
    const isCurrent = version.version === currentVersion;
    const prevVersion = index > 0 ? visibleHistory[index - 1] : null;
    
    // Source icon mapping
    const sourceIcons = {
      'initial_analysis': '🎯',
      'transcript_update': '📝',
      'manual_regenerate': '🔄',
      'manual_edit': '✏️',
      'hybrid_selection': '⚡'
    };
    
    const sourceLabels = {
      'initial_analysis': 'Initial Analysis',
      'transcript_update': 'Transcript Update',
      'manual_regenerate': 'Manual Regeneration',
      'manual_edit': 'Manual Edit',
      'hybrid_selection': 'Hybrid Selection'
    };
    
    const sourceIcon = sourceIcons[version.source] || '📊';
    const sourceLabel = sourceLabels[version.source] || version.source;
    
    // Confidence badge colors
    const confidenceColors = {
      'high': 'bg-green-100 text-green-800 border-green-300',
      'medium': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'low': 'bg-red-100 text-red-800 border-red-300'
    };
    
    const confidenceClass = confidenceColors[version.confidence] || 'bg-gray-100 text-gray-800 border-gray-300';
    
    // Parse hybrid data
    let hybridTaskInfo = '';
    if (version.source === 'hybrid_selection' && version.hybrid_estimate_data) {
      try {
        const hybridData = typeof version.hybrid_estimate_data === 'string' 
          ? JSON.parse(version.hybrid_estimate_data) 
          : version.hybrid_estimate_data;
        const selectedCount = hybridData.selectedTasks?.filter(t => t.selected !== false).length || 0;
        const totalTasks = hybridData.totalTasks || hybridData.selectedTasks?.length || 0;
        hybridTaskInfo = ` (${selectedCount}/${totalTasks} tasks)`;
      } catch (e) {
        console.error('Error parsing hybrid data:', e);
      }
    }
    
    // Comparison highlights
    let comparison = '';
    if (prevVersion) {
      const changes = [];
      
      if (parseFloat(version.estimate_hours) !== parseFloat(prevVersion.estimate_hours)) {
        const diff = parseFloat(version.estimate_hours) - parseFloat(prevVersion.estimate_hours);
        const arrow = diff > 0 ? '↑' : '↓';
        const color = diff > 0 ? 'text-red-600' : 'text-green-600';
        changes.push(`<span class="${color}">AI ${arrow} ${Math.abs(diff).toFixed(1)}h</span>`);
      }
      
      if (version.confidence !== prevVersion.confidence && version.confidence && prevVersion.confidence) {
        changes.push(`<span class="text-blue-600">Confidence: ${prevVersion.confidence} → ${version.confidence}</span>`);
      }
      
      if (changes.length > 0) {
        comparison = `<div class="mt-2 text-sm flex flex-wrap gap-2">${changes.join(' • ')}</div>`;
      }
    }
    
    html += `
      <div class="border-b border-gray-200 pb-4 mb-4 ${isCurrent ? 'bg-blue-50 -mx-4 px-4 py-3 rounded-lg border-2 border-blue-300' : ''}">
        ${isCurrent ? '<div class="text-xs font-semibold text-blue-600 mb-2">⭐ CURRENT PLANNING ESTIMATE (Source: ' + (planningSource || 'manual').toUpperCase() + ')</div>' : ''}
        <div class="flex justify-between items-start mb-2">
          <div class="flex items-center gap-2">
            <span class="text-2xl">${sourceIcon}</span>
            <div>
              <div class="font-semibold text-gray-800">Version ${version.version}</div>
              <div class="text-sm text-gray-500">${sourceLabel}</div>
            </div>
          </div>
          <div class="text-sm text-gray-500">
            ${new Date(version.created_at).toLocaleString()}
          </div>
        </div>
        
        <div class="grid grid-cols-1 gap-4 mt-3">
          ${version.source === 'hybrid_selection' ? `
          <div class="bg-green-50 rounded p-3 border border-green-200">
            <div class="text-xs text-green-600 font-semibold mb-1">⚡ Hybrid Estimate</div>
            <div class="text-lg font-bold text-green-900">${parseFloat(version.estimate_hours).toFixed(1)} hrs</div>
            ${hybridTaskInfo ? `<div class="text-xs text-green-700 mt-1">${hybridTaskInfo}</div>` : ''}
          </div>
          ` : version.source === 'manual_edit' ? `
          <div class="bg-blue-50 rounded p-3 border border-blue-200">
            <div class="text-xs text-blue-600 font-semibold mb-1">✏️ Manual Estimate</div>
            <div class="text-lg font-bold text-blue-900">${parseFloat(version.estimate_hours).toFixed(1)} hrs</div>
          </div>
          ` : `
          <div class="bg-purple-50 rounded p-3 border border-purple-200">
            <div class="text-xs text-purple-600 font-semibold mb-1">💜 AI Estimate</div>
            <div class="text-lg font-bold text-purple-900">${parseFloat(version.estimate_hours).toFixed(2)} hrs</div>
            ${version.confidence ? `<span class="inline-block mt-1 text-xs px-2 py-0.5 rounded border ${confidenceClass}">${version.confidence}</span>` : ''}
          </div>
          `}
        </div>
        
        ${comparison}
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Show/hide expand button
  if (estimateHistoryData.length > 3) {
    expandContainer.classList.remove('hidden');
    const btn = document.getElementById('show-all-estimates-btn');
    btn.textContent = showAllEstimates ? 'Show Less' : `Show All Versions (${estimateHistoryData.length})`;
  } else {
    expandContainer.classList.add('hidden');
  }
}

async function loadEstimateForm() {
  const container = document.getElementById('effort-estimate-form-container');
  if (!container) return;
  
  try {
    const endpoint = currentItemType === 'issue' ? 'issues' : 'action-items';
    const response = await axios.get(`/api/${endpoint}/${currentItemId}`, { withCredentials: true });
    const item = response.data;
    
    // Parse estimates
    const aiHours = parseFloat(item.ai_effort_estimate_hours) || 0;
    const hybridHours = parseFloat(item.hybrid_effort_estimate_hours) || 0;
    const manualHours = parseFloat(item.estimated_effort_hours || item.estimated_hours) || 0;
    const aiConfidence = item.ai_estimate_confidence || 'medium';
    const planningSource = item.planning_estimate_source || 'manual';
    
    // Fetch AI reasoning from latest estimate history
    let aiReasoning = '';
    if (aiHours > 0) {
      try {
        const historyResponse = await axios.get(`/api/${endpoint}/${currentItemId}/estimate/history`, { withCredentials: true });
        if (historyResponse.data && historyResponse.data.history && historyResponse.data.history.length > 0) {
          // Find the most recent AI estimate
          const latestAIEstimate = historyResponse.data.history.find(h => h.source === 'ai');
          if (latestAIEstimate && latestAIEstimate.reasoning) {
            aiReasoning = latestAIEstimate.reasoning;
          }
        }
      } catch (err) {
        console.warn('Could not fetch AI reasoning:', err);
      }
    }
    
    // Parse hybrid task count
    let hybridTaskInfo = '';
    let hybridSelectedCount = 0;
    let hybridTotalTasks = 0;
    
    if (hybridHours > 0 && item.hybrid_estimate_data) {
      try {
        const hybridData = typeof item.hybrid_estimate_data === 'string' 
          ? JSON.parse(item.hybrid_estimate_data) 
          : item.hybrid_estimate_data;
        hybridSelectedCount = hybridData.selectedTasks?.filter(t => t.selected !== false).length || 0;
        hybridTotalTasks = hybridData.totalTasks || hybridData.selectedTasks?.length || 0;
        hybridTaskInfo = ` <span class="ml-2 text-sm bg-green-100 text-green-800 px-2 py-0.5 rounded">${hybridSelectedCount}/${hybridTotalTasks} tasks</span>`;
      } catch (e) {
        console.error('Error parsing hybrid data:', e);
      }
    }
    
    // Confidence badge
    const confidenceColors = {
      'high': 'bg-green-200 text-green-800',
      'medium': 'bg-blue-200 text-blue-800',
      'low': 'bg-red-200 text-red-800'
    };
    const confidenceClass = confidenceColors[aiConfidence] || 'bg-gray-200 text-gray-800';
    
    container.innerHTML = `
      <div class="space-y-4">
        <!-- Manual Estimate -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Manual Estimate (hours)</label>
          <input 
            type="number" 
            id="detail-manual-estimate"
            ${!currentUserCanEdit ? 'disabled' : ''}
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${!currentUserCanEdit ? 'bg-gray-100 cursor-not-allowed' : ''}" 
            placeholder="e.g., 50"
            value="${manualHours || ''}"
            step="0.5"
            min="0">
        </div>
        
        <!-- AI Estimate Display -->
        ${aiHours > 0 ? `
        <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div class="flex justify-between items-center">
            <div>
              <span class="text-sm font-medium text-purple-700">AI Estimate:</span>
              <span class="ml-2 text-lg font-bold text-purple-900">${aiHours.toFixed(2)} hours</span>
              <span class="ml-2 text-xs px-2 py-1 rounded ${confidenceClass}">${aiConfidence}</span>
            </div>
            <button 
              id="detail-view-ai-breakdown"
              class="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex items-center gap-1">
              View Breakdown ↗
            </button>
          </div>
          ${aiReasoning ? `
          <div class="mt-3 pt-3 border-t border-purple-200">
            <p class="text-xs text-gray-600 mb-1">AI Reasoning:</p>
            <p class="text-sm text-gray-700">${aiReasoning.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </div>
          ` : ''}
        </div>
        ` : ''}
        
        <!-- Hybrid Estimate Display -->
        ${hybridHours > 0 ? `
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <div class="flex justify-between items-center">
            <div>
              <span class="text-sm font-medium text-green-700">Hybrid Estimate:</span>
              <span class="ml-2 text-lg font-bold text-green-900">${hybridHours.toFixed(1)} hours</span>
              ${hybridTaskInfo}
            </div>
            <button 
              id="detail-view-hybrid-breakdown"
              class="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-1">
              View Breakdown ↗
            </button>
          </div>
        </div>
        ` : ''}
        
        <!-- Select Estimate for Planning -->
        ${(aiHours > 0 || hybridHours > 0) ? `
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <label class="block text-sm font-semibold text-gray-700 mb-3">Select Estimate for Planning:</label>
          <div class="space-y-2">
            <label class="flex items-center p-3 border-2 rounded-lg ${currentUserCanEdit ? 'cursor-pointer hover:bg-white' : 'cursor-not-allowed'} transition-colors ${planningSource === 'manual' ? 'border-blue-500 bg-white' : 'border-gray-200'}">
              <input 
                type="radio" 
                name="detail-planning-estimate" 
                value="manual"
                ${planningSource === 'manual' ? 'checked' : ''}
                ${!currentUserCanEdit ? 'disabled' : ''}
                class="mr-3">
              <span class="flex-1">
                <span class="text-xl mr-2">✏️</span>
                <span class="font-medium">Manual Estimate:</span>
                <span id="detail-manual-hours-display" class="ml-2 font-bold">${manualHours || 0} hours</span>
              </span>
            </label>
            
            ${aiHours > 0 ? `
            <label class="flex items-center p-3 border-2 rounded-lg ${currentUserCanEdit ? 'cursor-pointer hover:bg-white' : 'cursor-not-allowed'} transition-colors ${planningSource === 'ai' ? 'border-blue-500 bg-white' : 'border-gray-200'}">
              <input 
                type="radio" 
                name="detail-planning-estimate" 
                value="ai"
                ${planningSource === 'ai' ? 'checked' : ''}
                ${!currentUserCanEdit ? 'disabled' : ''}
                class="mr-3">
              <span class="flex-1">
                <span class="text-xl mr-2">💜</span>
                <span class="font-medium">AI Estimate:</span>
                <span class="ml-2 font-bold">${aiHours.toFixed(0)} hours</span>
                <span class="ml-2 text-xs px-2 py-1 rounded ${confidenceClass}">${aiConfidence}</span>
              </span>
            </label>
            ` : ''}
            
            ${hybridHours > 0 ? `
            <label class="flex items-center p-3 border-2 rounded-lg ${currentUserCanEdit ? 'cursor-pointer hover:bg-white' : 'cursor-not-allowed'} transition-colors ${planningSource === 'hybrid' ? 'border-blue-500 bg-white' : 'border-gray-200'}">
              <input 
                type="radio" 
                name="detail-planning-estimate" 
                value="hybrid"
                ${planningSource === 'hybrid' ? 'checked' : ''}
                ${!currentUserCanEdit ? 'disabled' : ''}
                class="mr-3">
              <span class="flex-1">
                <span class="text-xl mr-2">⚡</span>
                <span class="font-medium">Hybrid Estimate:</span>
                <span class="ml-2 font-bold">${hybridHours.toFixed(1)} hours</span>
                ${hybridTaskInfo}
              </span>
            </label>
            ` : ''}
          </div>
        </div>
        ` : ''}
        
        <!-- Generate AI Estimate Button -->
        ${!currentUserCanEdit ? '<div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3 text-sm text-yellow-800">ℹ️ You do not have permission to edit estimates for this item.</div>' : ''}
        <div class="flex gap-3">
          <button 
            id="detail-generate-estimate"
            ${!currentUserCanEdit ? 'disabled' : ''}
            class="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all font-medium flex items-center justify-center gap-2 ${!currentUserCanEdit ? 'opacity-50 cursor-not-allowed' : ''}">
            <span class="text-xl">🤖</span>
            Generate AI Estimate
          </button>
          
          <button 
            id="detail-save-estimate"
            ${!currentUserCanEdit ? 'disabled' : ''}
            class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 ${!currentUserCanEdit ? 'opacity-50 cursor-not-allowed' : ''}">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            Save Changes
          </button>
          
          <button 
            type="button"
            id="detail-close-estimate"
            class="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            Close
          </button>
        </div>
      </div>
    `;
    
    // Attach event listeners
    setupEstimateFormListeners();
    
  } catch (error) {
    console.error('Error loading estimate form:', error);
    container.innerHTML = '<div class="text-center py-8 text-red-500">Failed to load estimation form</div>';
  }
}

function setupEstimateFormListeners() {
  // Generate AI Estimate button
  document.getElementById('detail-generate-estimate')?.addEventListener('click', async function() {
    const btn = this;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-pulse">🤖 Generating...</span>';
    
    try {
      const endpoint = currentItemType === 'issue' ? 'issues' : 'action-items';
      const response = await axios.post(`/api/${endpoint}/${currentItemId}/effort-estimate`, 
        { model: 'gpt-4o' },
        { 
          withCredentials: true,
          timeout: 120000 // 120 seconds timeout for AI requests (they take time!)
        }
      );
      
      showToast('AI estimate generated successfully!', 'success');
      
      // Reload both history and form to show the new reasoning
      await Promise.all([
        loadEstimateHistory(),
        loadEstimateForm()
      ]);
      
    } catch (error) {
      console.error('Error generating estimate:', error);
      if (error.response?.status === 429) {
        showToast('Rate limit exceeded. Please try again later.', 'error');
      } else {
        showToast(error.response?.data?.error || 'Failed to generate estimate', 'error');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });
  
  // Save Changes button
  document.getElementById('detail-save-estimate')?.addEventListener('click', async function() {
    const btn = this;
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-pulse">Saving...</span>';
    
    try {
      const manualEstimate = parseFloat(document.getElementById('detail-manual-estimate').value) || null;
      const planningSource = document.querySelector('[name="detail-planning-estimate"]:checked')?.value || 'manual';
      
      const endpoint = currentItemType === 'issue' ? 'issues' : 'action-items';
      await axios.patch(`/api/${endpoint}/${currentItemId}`, 
        { 
          estimated_effort_hours: manualEstimate,
          planning_estimate_source: planningSource
        },
        { withCredentials: true }
      );
      
      showToast('Estimate saved successfully!', 'success');
      
      // Reload both history and form to show changes
      await Promise.all([
        loadEstimateHistory(),
        loadEstimateForm()
      ]);
      
      // Refresh the kanban/table view if needed
      if (typeof loadProjectItems === 'function') {
        loadProjectItems();
      }
      
    } catch (error) {
      console.error('Error saving estimate:', error);
      showToast(error.response?.data?.error || 'Failed to save estimate', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  });
  
  // Close button - switch back to Details tab
  document.getElementById('detail-close-estimate')?.addEventListener('click', function() {
    // Switch to Details tab
    const detailsTab = document.querySelector('[data-tab="details"]');
    if (detailsTab) {
      detailsTab.click();
    }
  });
  
  // Manual Estimate auto-update: when manual field changes, update the radio button display
  document.getElementById('detail-manual-estimate')?.addEventListener('blur', function() {
    const manualHours = parseFloat(this.value) || 0;
    const displayElement = document.getElementById('detail-manual-hours-display');
    if (displayElement) {
      displayElement.textContent = `${manualHours} hours`;
    }
  });
  
  // View AI Breakdown button - Use the same interactive hybrid selector as Edit modals
  document.getElementById('detail-view-ai-breakdown')?.addEventListener('click', async function() {
    const endpoint = currentItemType === 'issue' ? 'issues' : 'action-items';
    
    try {
      // Load AI breakdown
      const response = await axios.get(`/api/${endpoint}/${currentItemId}/estimate/breakdown`, 
        { withCredentials: true }
      );
      
      const breakdown = response.data;
      
      // Initialize hybrid selection state with all tasks
      hybridSelectionState.tasks = breakdown.tasks.map(task => ({
        ...task,
        selected: false,
        editedHours: task.hours,
        originalHours: task.hours
      }));
      hybridSelectionState.totalHours = 0;
      hybridSelectionState.selectedCount = 0;
      
      // Try to load saved hybrid data and hydrate
      try {
        const hybridResponse = await axios.get(`/api/${endpoint}/${currentItemId}/estimate/breakdown?type=hybrid`, 
          { withCredentials: true }
        );
        
        if (hybridResponse.data && hybridResponse.data.selectedTasks) {
          // Hydrate saved hybrid selections
          const savedSelections = hybridResponse.data.selectedTasks;
          
          savedSelections.forEach(savedTask => {
            // Find matching task in current breakdown
            const taskIndex = hybridSelectionState.tasks.findIndex(t => 
              t.task === savedTask.task || t.task === savedTask.description
            );
            
            if (taskIndex !== -1) {
              hybridSelectionState.tasks[taskIndex].selected = true;
              hybridSelectionState.tasks[taskIndex].editedHours = savedTask.editedHours || savedTask.hours;
            }
          });
          
          // Recalculate totals
          const selectedTasks = hybridSelectionState.tasks.filter(t => t.selected);
          hybridSelectionState.totalHours = selectedTasks.reduce((sum, task) => sum + task.editedHours, 0);
          hybridSelectionState.selectedCount = selectedTasks.length;
        }
      } catch (hybridError) {
        // No saved hybrid data, that's okay
        console.log('No saved hybrid data found, starting fresh');
      }
      
      renderBreakdownModal(breakdown, currentItemId, currentItemType);
      document.getElementById('estimateBreakdownModal').classList.remove('hidden');
      
    } catch (error) {
      console.error('Error loading AI breakdown:', error);
      if (error.response?.status === 404) {
        showToast('This estimate was created before detailed breakdowns were available. Generate a new AI estimate to see the task breakdown.', 'info');
      } else {
        showToast('Failed to load AI breakdown', 'error');
      }
    }
  });
  
  // View Hybrid Breakdown button - Use the same interactive hybrid selector as Edit modals
  document.getElementById('detail-view-hybrid-breakdown')?.addEventListener('click', async function() {
    // Same as AI breakdown - opens the interactive selector
    document.getElementById('detail-view-ai-breakdown')?.click();
  });
}

// Export estimate history to CSV
document.getElementById('export-estimate-history-btn')?.addEventListener('click', function() {
  if (estimateHistoryData.length === 0) {
    showToast('No estimate history to export', 'info');
    return;
  }
  
  try {
    // Build CSV content
    const headers = ['Version', 'Source', 'Created At', 'Estimate (hrs)', 'Confidence', 'Hybrid Tasks', 'Reasoning'];
    let csv = headers.join(',') + '\n';
    
    estimateHistoryData.forEach(version => {
      let hybridTasks = '';
      if (version.source === 'hybrid_selection' && version.hybrid_estimate_data) {
        try {
          const hybridData = typeof version.hybrid_estimate_data === 'string' 
            ? JSON.parse(version.hybrid_estimate_data) 
            : version.hybrid_estimate_data;
          const selectedCount = hybridData.selectedTasks?.filter(t => t.selected !== false).length || 0;
          const totalTasks = hybridData.totalTasks || hybridData.selectedTasks?.length || 0;
          hybridTasks = `${selectedCount}/${totalTasks}`;
        } catch (e) {
          console.error('Error parsing hybrid data:', e);
        }
      }
      
      const row = [
        version.version,
        version.source,
        new Date(version.created_at).toLocaleString(),
        version.estimate_hours || '',
        version.confidence || '',
        hybridTasks,
        (version.reasoning || '').replace(/"/g, '""') // Escape quotes in reasoning
      ];
      
      csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });
    
    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estimate-history-${currentItemType}-${currentItemId}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showToast('Estimate history exported successfully!', 'success');
    
  } catch (error) {
    console.error('Error exporting estimate history:', error);
    showToast('Failed to export estimate history', 'error');
  }
});

// Show all estimates toggle
document.getElementById('show-all-estimates-btn')?.addEventListener('click', function() {
  showAllEstimates = !showAllEstimates;
  const currentVersion = estimateHistoryData.find(v => v.version === estimateHistoryData[0]?.version)?.version;
  renderEstimateHistory(currentVersion, '');
});

// ============================================================================
// QUICK LOG TIME FUNCTIONALITY
// ============================================================================

let quickLogContext = null;

// Normalize item type for API endpoints
function normalizeItemTypeForAPI(itemType) {
  // Handle various input formats from kanban cards
  if (itemType === 'action' || itemType === 'action-item') {
    return 'action-items';
  }
  if (itemType === 'issue') {
    return 'issues';
  }
  // Already normalized
  if (itemType === 'action-items' || itemType === 'issues') {
    return itemType;
  }
  console.warn('Unknown item type:', itemType, 'defaulting to issues');
  return 'issues'; // Fallback
}

// Open Quick Log Modal
function openQuickLogModal(itemId, itemType) {
  quickLogContext = { itemId, itemType };
  
  // Find the item to get its title safely and creation date
  const allItems = [...issues, ...actionItems];
  const item = allItems.find(i => i.id === itemId && i.type === itemType);
  
  if (item) {
    // Set title using textContent (safe - no XSS)
    const displayTitle = item.title.length > 60 
      ? item.title.substring(0, 60) + '...' 
      : item.title;
    document.getElementById('quickLogItemTitle').textContent = displayTitle;
  }
  
  // Reset and clear form
  document.getElementById('quickLogHours').value = '';
  document.getElementById('quickLogNotes').value = '';
  
  // Set up date field
  const dateInput = document.getElementById('quickLogDate');
  const today = new Date().toISOString().split('T')[0];
  
  // Set default to today
  dateInput.value = today;
  
  // Set min date (item creation date) and max date (today)
  if (item && item.created_at) {
    const createdDate = new Date(item.created_at).toISOString().split('T')[0];
    dateInput.min = createdDate;
  }
  dateInput.max = today;
  
  // Show modal
  document.getElementById('quickLogModal').classList.remove('hidden');
  
  // Focus on hours input
  setTimeout(() => {
    document.getElementById('quickLogHours').focus();
  }, 100);
}

// Close Quick Log Modal
function closeQuickLogModal() {
  document.getElementById('quickLogModal').classList.add('hidden');
  
  // Clear form inputs
  document.getElementById('quickLogHours').value = '';
  document.getElementById('quickLogNotes').value = '';
  document.getElementById('quickLogDate').value = '';
  
  // Clear context
  quickLogContext = null;
}

// Validate Quick Log Input
function validateQuickLogInput() {
  const hoursInput = document.getElementById('quickLogHours');
  const hours = parseFloat(hoursInput.value);
  
  // Check if value exists and is a valid number
  if (!hoursInput.value || isNaN(hours)) {
    AuthManager.showNotification('Please enter the number of hours worked', 'error');
    hoursInput.focus();
    return null;
  }
  
  // Check minimum (UX preference - 15 minutes)
  if (hours < 0.25) {
    AuthManager.showNotification('Minimum time entry is 0.25 hours (15 minutes)', 'error');
    hoursInput.focus();
    return null;
  }
  
  // Check maximum (reasonable daily limit)
  if (hours > 24) {
    AuthManager.showNotification('Maximum time entry is 24 hours per log', 'error');
    hoursInput.focus();
    return null;
  }
  
  return hours;
}

// Submit Quick Log
async function submitQuickLog() {
  if (!quickLogContext) {
    console.error('No quick log context');
    return;
  }
  
  // Validate input
  const hours = validateQuickLogInput();
  if (hours === null) return; // Validation failed
  
  const notes = document.getElementById('quickLogNotes').value.trim();
  const workDate = document.getElementById('quickLogDate').value;
  
  // Validate date is selected
  if (!workDate) {
    AuthManager.showNotification('Please select a date', 'error');
    document.getElementById('quickLogDate').focus();
    return;
  }
  
  // Get submit button and show loading state
  const submitBtn = document.getElementById('submitQuickLog');
  const originalHTML = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span>Logging...</span>
  `;
  
  try {
    // Normalize item type for API
    const apiItemType = normalizeItemTypeForAPI(quickLogContext.itemType);
    
    // Make API call
    const response = await fetch(`/api/${apiItemType}/${quickLogContext.itemId}/log-time`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        hours: hours,  // Send as number, not string
        notes: notes || null,
        work_date: workDate
      })
    });
    
    const data = await response.json();
    
    // Check if request failed
    if (!response.ok) {
      const errorMessage = data.error || data.message || 'Failed to log time';
      throw new Error(errorMessage);
    }
    
    // Success!
    AuthManager.showNotification(`✅ Successfully logged ${hours}h!`, 'success');
    
    // Close modal
    closeQuickLogModal();
    
    // Refresh the project data to show updated hours on cards
    if (typeof currentProject !== 'undefined' && currentProject && currentProject.id) {
      if (typeof loadProjectData === 'function') {
        await loadProjectData(currentProject.id);
      } else if (typeof renderKanbanBoard === 'function') {
        renderKanbanBoard();
      }
    }
    
  } catch (error) {
    console.error('Error logging time:', error);
    
    // Show error message from server or generic message
    const errorMsg = error.message || 'Failed to log time. Please try again.';
    AuthManager.showNotification(errorMsg, 'error');
    
  } finally {
    // Re-enable button and restore original text
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalHTML;
  }
}

// Event Listeners for Quick Log Modal
document.getElementById('closeQuickLogModal')?.addEventListener('click', closeQuickLogModal);
document.getElementById('cancelQuickLog')?.addEventListener('click', closeQuickLogModal);
document.getElementById('submitQuickLog')?.addEventListener('click', submitQuickLog);

// Handle Enter key in hours input
document.getElementById('quickLogHours')?.addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitQuickLog();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const modal = document.getElementById('quickLogModal');
    if (modal && !modal.classList.contains('hidden')) {
      closeQuickLogModal();
    }
  }
});

// Close modal when clicking outside
document.getElementById('quickLogModal')?.addEventListener('click', function(e) {
  if (e.target === this) {
    closeQuickLogModal();
  }
});

// Event delegation for Quick Log buttons on kanban cards
document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-action="quick-log"]');
  if (btn) {
    e.stopPropagation(); // Prevent card click event
    const itemId = parseInt(btn.dataset.itemId);
    const itemType = btn.dataset.itemType;
    openQuickLogModal(itemId, itemType);
  }
});



// ===== SCHEDULE DEPENDENCIES MANAGEMENT =====

/**
 * View and manage schedule dependencies for current item
 */
async function showScheduleDependencies() {
  if (!currentDetailItem) return;
  
  const modal = document.getElementById('schedule-dependencies-modal');
  modal.classList.remove('hidden');
  
  await loadScheduleDependencies();
}

/**
 * Load schedule dependencies for current item
 */
async function loadScheduleDependencies() {
  if (!currentDetailItem) return;
  
  const content = document.getElementById('schedule-deps-content');
  content.innerHTML = '<div class="flex justify-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>';
  
  try {
    const response = await axios.get(
      `/api/schedules/dependencies/${currentDetailItem.type}/${currentDetailItem.id}`,
      { withCredentials: true }
    );
    
    const { item, outgoing, incoming } = response.data;
    
    // Render dependencies
    let html = '';
    
    // Get the current item name
    const itemName = currentDetailItem?.title || 'This task';
    
    // Outgoing dependencies (this task depends on...)
    if (outgoing && outgoing.length > 0) {
      html += `
        <div class="border-b pb-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">${escapeHtml(itemName)} depends on:</h3>
          <div class="space-y-2">
            ${outgoing.map(dep => `
              <div class="flex justify-between items-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex-1">
                  <p class="font-medium text-gray-900">${escapeHtml(dep.prerequisite_title || 'Unknown')}</p>
                  <p class="text-sm text-gray-600">${dep.prerequisite_item_type}#${dep.prerequisite_item_id}</p>
                  <span class="text-xs px-2 py-1 rounded ${dep.prerequisite_status === 'done' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                    ${dep.prerequisite_status || 'unknown'}
                  </span>
                </div>
                <button 
                  class="remove-dependency-btn ml-4 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm transition-colors"
                  data-item-type="${currentDetailItem.type}"
                  data-dependency-id="${dep.dependency_id}"
                >
                  Remove
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="border-b pb-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">${escapeHtml(itemName)} depends on:</h3>
          <p class="text-gray-500 italic">No dependencies</p>
        </div>
      `;
    }
    
    // Incoming dependencies (other tasks depend on this one)
    if (incoming && incoming.length > 0) {
      html += `
        <div class="mt-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">Tasks that depend on ${escapeHtml(itemName)}:</h3>
          <div class="space-y-2">
            ${incoming.map(dep => `
              <div class="flex justify-between items-center p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div class="flex-1">
                  <p class="font-medium text-gray-900">${escapeHtml(dep.dependent_title || 'Unknown')}</p>
                  <p class="text-sm text-gray-600">${dep.dependent_item_type}#${dep.dependent_item_id}</p>
                  <span class="text-xs px-2 py-1 rounded ${dep.dependent_status === 'done' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">
                    ${dep.dependent_status || 'unknown'}
                  </span>
                </div>
                <button 
                  class="remove-dependency-btn ml-4 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm transition-colors"
                  data-item-type="${dep.dependent_item_type}"
                  data-dependency-id="${dep.dependency_id}"
                >
                  Remove
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="mt-4">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">Tasks that depend on ${escapeHtml(itemName)}:</h3>
          <p class="text-gray-500 italic">No dependent tasks</p>
        </div>
      `;
    }
    
    content.innerHTML = html;
    
  } catch (error) {
    console.error('Error loading dependencies:', error);
    content.innerHTML = `
      <div class="text-center py-8">
        <p class="text-red-600">${error.response?.data?.error || 'Failed to load dependencies'}</p>
      </div>
    `;
  }
}

/**
 * Delete a schedule dependency
 */
async function deleteScheduleDependency(itemType, dependencyId) {
  if (!confirm('Remove this dependency? This cannot be undone.')) {
    return;
  }
  
  try {
    await axios.delete(
      `/api/schedules/dependencies/${itemType}/${dependencyId}`,
      { withCredentials: true }
    );
    
    showToast('Dependency removed successfully', 'success');
    await loadScheduleDependencies();
    
  } catch (error) {
    console.error('Error deleting dependency:', error);
    showToast(error.response?.data?.error || 'Failed to delete dependency', 'error');
  }
}

// Close modal handler
document.addEventListener('DOMContentLoaded', function() {
  const closeBtn = document.getElementById('close-schedule-deps-modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      document.getElementById('schedule-dependencies-modal').classList.add('hidden');
    });
  }
  
  // Dependencies button handler
  const depsBtn = document.getElementById('item-detail-dependencies-btn');
  if (depsBtn) {
    depsBtn.addEventListener('click', showScheduleDependencies);
  }
  
  // Event delegation for remove dependency buttons (CSP-compliant)
  const depsContent = document.getElementById('schedule-deps-content');
  if (depsContent) {
    depsContent.addEventListener('click', function(e) {
      const removeBtn = e.target.closest('.remove-dependency-btn');
      if (removeBtn) {
        const itemType = removeBtn.dataset.itemType;
        const dependencyId = removeBtn.dataset.dependencyId;
        deleteScheduleDependency(itemType, dependencyId);
      }
    });
  }
});

// Make functions globally accessible
window.showScheduleDependencies = showScheduleDependencies;
window.deleteScheduleDependency = deleteScheduleDependency;

// ============= MULTI-DOCUMENT PROCESSING =============

function displayMultiDocFiles() {
  const fileList = document.getElementById('multi-doc-file-list');
  const fileNames = document.getElementById('multi-doc-files');
  
  if (!fileList || mdSelectedFiles.length === 0) {
    if (fileList) fileList.classList.add('hidden');
    return;
  }
  
  fileList.classList.remove('hidden');
  if (fileNames) {
    fileNames.innerHTML = mdSelectedFiles.map(file => `
      <li class="text-gray-600">
        <span class="font-medium">${file.name}</span>
        <span class="text-xs text-gray-500 ml-2">(${(file.size / 1024).toFixed(1)} KB)</span>
      </li>
    `).join('');
  }
}

async function processMultiDocuments() {
  if (!currentProject || mdSelectedFiles.length === 0) return;
  
  const processBtn = document.getElementById('multi-doc-process-btn');
  const progress = document.getElementById('multi-doc-progress');
  const progressText = document.getElementById('multi-doc-progress-text');
  const reviewSection = document.getElementById('multi-doc-review');
  const resultsDiv = document.getElementById('multi-doc-results');
  
  if (processBtn) processBtn.disabled = true;
  if (progress) progress.classList.remove('hidden');
  
  // Clear console and initialize
  clearConsole();
  addConsoleLog('🔹 Connecting to real-time progress stream...', 'info');
  
  // Generate unique session ID for this upload
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Connect to SSE stream FIRST
  let eventSource;
  try {
    eventSource = new EventSource(`/api/multi-document/progress-stream/${sessionId}`);
    
    // Handle real-time events from server
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'connected') {
          addConsoleLog('✓ Real-time streaming connected', 'success');
        } else if (data.type === 'step') {
          // Advance stepper in real-time based on server progress
          updateMultiDocStep(data.step);
          if (progressText) progressText.textContent = `Step ${data.step}/7: ${data.title}...`;
        } else if (data.type === 'log') {
          // Display server console messages in real-time
          const level = data.message.includes('✓') ? 'success' : 
                       data.message.includes('⚠️') ? 'warning' :
                       data.message.includes('✗') || data.message.includes('❌') ? 'error' :
                       data.message.includes('Step') || data.message.includes('╔') ? 'step' : 'info';
          addConsoleLog(data.message, level);
        } else if (data.type === 'error') {
          addConsoleLog(data.message, 'error');
        } else if (data.type === 'complete') {
          // Processing complete
          if (progressText) progressText.textContent = 'Processing complete!';
          updateMultiDocStep(8);
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      // Don't show error to user if processing completes normally
    };
    
    // Wait a moment for SSE connection to establish
    await sleep(500);
    
    const formData = new FormData();
    mdSelectedFiles.forEach(file => formData.append('documents', file));
    formData.append('projectId', currentProject.id);
    formData.append('sessionId', sessionId);  // Pass session ID to backend
    
    // Show upload progress
    updateMultiDocStep(0);
    addConsoleLog('Uploading documents to server...', 'info');
    
    const response = await axios.post('/api/multi-document/analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      withCredentials: true,
      onUploadProgress: (progressEvent) => {
        const percentComplete = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        if (progressText) progressText.textContent = `Uploading files... ${percentComplete}%`;
      }
    });
    
    // Close SSE connection
    if (eventSource) {
      eventSource.close();
    }
    
    // All console logs were shown in real-time via SSE
    // Just display the results UI now
    if (progress) progress.classList.add('hidden');
    displayMultiDocResults(response.data);
    
  } catch (error) {
    console.error('Error:', error);
    
    // Close SSE connection on error
    if (eventSource) {
      eventSource.close();
    }
    
    addConsoleLog('', 'error');
    addConsoleLog('✗ Error during processing:', 'error');
    addConsoleLog(`  ${error.response?.data?.error || error.message}`, 'error');
    
    if (progress) progress.classList.add('hidden');
    if (processBtn) processBtn.disabled = false;
    alert('Error: ' + (error.response?.data?.error || error.message));
  }
}

// Helper function for delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function displayMultiDocResults(results) {
  const reviewSection = document.getElementById('multi-doc-review');
  const resultsDiv = document.getElementById('multi-doc-results');
  const importBtn = document.getElementById('multi-doc-import-btn');
  
  if (reviewSection) reviewSection.classList.remove('hidden');
  
  const workstreams = results.workstreams || results.issues || [];
  const totalItems = results.totalItems || 0;
  const totalCost = results.totalCost || 0;
  const schedule = results.schedule || { created: false };
  
  // Build schedule card HTML if schedule was created
  const deadlineWarning = schedule.deadlineWarning || null;
  const hasWarning = deadlineWarning && deadlineWarning.hasOverrun;
  
  const scheduleCard = schedule.created ? `
    <div class="col-span-3 p-3 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-300 rounded-lg">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <div class="text-sm font-semibold text-indigo-900">📅 Schedule Auto-Created</div>
          <div class="text-xs text-indigo-700 mt-1">${schedule.message || 'Project schedule with Gantt chart ready to view'}</div>
          ${hasWarning ? `
            <div class="mt-2 flex items-start gap-2 p-2 bg-amber-50 border border-amber-300 rounded text-xs">
              <i class="fas fa-exclamation-triangle text-amber-600 mt-0.5"></i>
              <div class="flex-1">
                <div class="font-semibold text-amber-900">${deadlineWarning.message}</div>
                <div class="text-amber-700 mt-1">View schedule for suggestions to meet deadline</div>
              </div>
            </div>
          ` : deadlineWarning && !deadlineWarning.hasOverrun ? `
            <div class="mt-2 flex items-center gap-2 text-xs text-green-700">
              <i class="fas fa-check-circle"></i>
              <span>Fits within project deadline</span>
            </div>
          ` : ''}
        </div>
        <button id="view-auto-schedule-btn" 
                data-schedule-id="${schedule.scheduleId}"
                class="btn-primary text-xs px-4 py-2 ml-4 flex-shrink-0">
          View Schedule & Gantt Chart →
        </button>
      </div>
    </div>
  ` : '';
  
  if (resultsDiv) {
    resultsDiv.innerHTML = `
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="text-center p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div class="text-2xl font-bold text-blue-600">${workstreams.length}</div>
          <div class="text-xs text-gray-600">Workstreams</div>
        </div>
        <div class="text-center p-3 bg-green-50 border border-green-200 rounded-lg">
          <div class="text-2xl font-bold text-green-600">${totalItems}</div>
          <div class="text-xs text-gray-600">Total Items</div>
        </div>
        <div class="text-center p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <div class="text-2xl font-bold text-purple-600">$${totalCost.toFixed(3)}</div>
          <div class="text-xs text-gray-600">AI Cost</div>
        </div>
        ${scheduleCard}
      </div>
      <div class="space-y-2">
        ${workstreams.map(ws => `
          <div class="p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <h5 class="font-semibold text-sm text-gray-900">${ws.title || ws.name}</h5>
                <p class="text-xs text-gray-600 mt-1">${ws.description || ''}</p>
              </div>
              <input type="checkbox" checked class="mt-1" data-workstream-id="${ws.id || ''}">
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  if (importBtn) importBtn.disabled = false;
  window.mdProcessingResults = results;
  
  // Add event listener for schedule view button (CSP-compliant)
  setTimeout(() => {
    const viewScheduleBtn = document.getElementById('view-auto-schedule-btn');
    if (viewScheduleBtn) {
      viewScheduleBtn.addEventListener('click', () => {
        const scheduleId = viewScheduleBtn.dataset.scheduleId;
        window.location.href = `schedules.html?projectId=${currentProject.id}&scheduleId=${scheduleId}`;
      });
    }
  }, 0);
}

async function createMultiDocResults() {
  if (!window.mdProcessingResults) return;
  const btn = document.getElementById('multi-doc-import-btn');
  if (!btn) return;
  
  btn.disabled = true;
  btn.textContent = 'Closing...';
  
  try {
    await loadProjectData(currentProject.id);
    closeAIAnalysisModal();
    showToast('Multi-document import complete!', 'success');
  } catch (error) {
    alert('Error: ' + (error.response?.data?.error || error.message));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Close & View Project';
  }
}

function resetMultiDocWorkflow() {
  mdSelectedFiles = [];
  const fileInput = document.getElementById('multi-doc-file-input');
  const fileList = document.getElementById('multi-doc-file-list');
  const fileNames = document.getElementById('multi-doc-files');
  const processBtn = document.getElementById('multi-doc-process-btn');
  const progress = document.getElementById('multi-doc-progress');
  const reviewSection = document.getElementById('multi-doc-review');
  const resultsDiv = document.getElementById('multi-doc-results');
  const importBtn = document.getElementById('multi-doc-import-btn');
  
  if (fileInput) fileInput.value = '';
  if (fileList) fileList.classList.add('hidden');
  if (fileNames) fileNames.innerHTML = '';
  if (processBtn) processBtn.disabled = true;
  if (progress) progress.classList.add('hidden');
  if (reviewSection) reviewSection.classList.add('hidden');
  if (importBtn) importBtn.disabled = true;
  if (resultsDiv) {
    resultsDiv.innerHTML = '<p class="text-sm text-gray-500">Upload documents to view AI results.</p>';
  }
  
  // Clear console and reset steps
  clearConsole();
  updateMultiDocStep(1);
  
  window.mdProcessingResults = null;
}

// Update complexity info for multi-document mode
function updateMultiDocComplexityInfo() {
  if (!currentProject) return;
  
  const badge = document.getElementById('md-complexity-badge');
  const maxFiles = document.getElementById('md-max-files');
  
  if (badge && maxFiles) {
    const complexity = currentProject.complexity_level || 'standard';
    const maxFileCount = currentProject.max_file_uploads || 5;
    
    badge.textContent = complexity.charAt(0).toUpperCase() + complexity.slice(1);
    badge.className = `text-sm font-semibold px-2 py-1 rounded ${
      complexity === 'enterprise' ? 'bg-purple-100 text-purple-800' :
      complexity === 'complex' ? 'bg-blue-100 text-blue-800' :
      'bg-green-100 text-green-800'
    }`;
    
    maxFiles.textContent = maxFileCount;
  }
}

// ==================== HIERARCHY: EXPAND/COLLAPSE STATE PERSISTENCE ====================

/**
 * Save expanded/collapsed state for an issue
 * Delegates to KanbanState utility (loaded from kanban-state.js)
 * @param {number} issueId - The issue ID
 * @param {boolean} isExpanded - Whether the issue is expanded
 */
function saveExpandedState(issueId, isExpanded) {
  if (window.KanbanState) {
    window.KanbanState.saveExpandedState(issueId, isExpanded);
  } else {
    console.warn('[KANBAN STATE] KanbanState utility not loaded');
  }
}

/**
 * Get expanded state for an issue
 * Delegates to KanbanState utility (loaded from kanban-state.js)
 * @param {number} issueId - The issue ID
 * @returns {boolean} Whether the issue is expanded
 */
function getExpandedState(issueId) {
  if (window.KanbanState) {
    return window.KanbanState.getExpandedState(issueId);
  } else {
    console.warn('[KANBAN STATE] KanbanState utility not loaded');
    return false;
  }
}

/**
 * Clear all expanded states for the current project
 * Delegates to KanbanState utility (loaded from kanban-state.js)
 */
function clearExpandedStates() {
  if (window.KanbanState) {
    window.KanbanState.clearExpandedStates();
  } else {
    console.warn('[KANBAN STATE] KanbanState utility not loaded');
  }
}

/**
 * Expand all issues with children
 * @returns {Promise<void>}
 */
async function expandAllKanbanCards() {
  if (!window.KanbanState) {
    console.warn('[KANBAN STATE] KanbanState utility not loaded');
    return;
  }
  
  if (!currentProject) {
    console.warn('[KANBAN STATE] No current project');
    return;
  }
  
  // Fetch hierarchy data to determine which issues have children
  try {
    const hierarchyResponse = await axios.get(
      `/api/projects/${currentProject.id}/hierarchy`,
      { withCredentials: true }
    );
    const hierarchyData = hierarchyResponse.data || [];
    
    // Find all issues that have children (i.e., issues that are parents)
    const expandedSet = new Set();
    const childrenMap = new Map();
    
    // Build map of parent IDs to children
    hierarchyData.forEach(item => {
      if (item.parent_issue_id) {
        if (!childrenMap.has(item.parent_issue_id)) {
          childrenMap.set(item.parent_issue_id, []);
        }
        childrenMap.get(item.parent_issue_id).push(item.id);
      }
    });
    
    // Add all parent IDs to expanded set
    childrenMap.forEach((children, parentId) => {
      expandedSet.add(parentId);
    });
    
    // Save expanded states
    window.KanbanState.saveAllExpandedStates(expandedSet);
    
    console.log(`[KANBAN STATE] Expanded ${expandedSet.size} issues with children`);
  } catch (error) {
    console.error('[KANBAN STATE] Error fetching hierarchy:', error);
  }
  
  // Re-render Kanban board to reflect expanded states
  await renderKanbanBoard();
}

/**
 * Collapse all issues
 * @returns {Promise<void>}
 */
async function collapseAllKanbanCards() {
  if (!window.KanbanState) {
    console.warn('[KANBAN STATE] KanbanState utility not loaded');
    return;
  }
  
  // Collapse all
  window.KanbanState.collapseAllIssues();
  
  // Re-render Kanban board
  await renderKanbanBoard();
}
