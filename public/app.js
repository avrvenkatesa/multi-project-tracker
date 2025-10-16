// Global state
let currentProject = null;
let projects = [];
let issues = [];
let actionItems = [];
let teamMembers = [];

// Filter state
let currentFilters = {
  search: '',
  type: '',
  status: '',
  priority: '',
  assignee: '',
  category: ''
};

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
});

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
    document.getElementById('view-checklists-btn')?.addEventListener('click', () => {
        if (currentProject) {
            window.location.href = `checklists.html?project=${currentProject.id}`;
        } else {
            window.location.href = 'checklists.html';
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
                <div class="flex items-center justify-between">
                    <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        ${project.template}
                    </span>
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
        // Build query params with filters
        const params = new URLSearchParams({ projectId: projectId.toString() });
        
        if (currentFilters.status) params.append('status', currentFilters.status);
        if (currentFilters.priority) params.append('priority', currentFilters.priority);
        if (currentFilters.assignee) params.append('assignee', currentFilters.assignee);
        if (currentFilters.category) params.append('category', currentFilters.category);
        if (currentFilters.search) params.append('search', currentFilters.search);
        
        const [issuesResponse, actionItemsResponse] = await Promise.all([
            axios.get(`/api/issues?${params.toString()}`),
            axios.get(`/api/action-items?${params.toString()}`),
            loadTeamMembers(projectId),
        ]);

        issues = issuesResponse.data;
        actionItems = actionItemsResponse.data;

        await renderKanbanBoard();
        displayActiveFilters();
        displayResultsCount();
        populateAssigneeFilter();
        
        // Load review queue
        await loadReviewQueue(projectId);
    } catch (error) {
        console.error("Error loading project data:", error);
    }
}

// Load team members for the current project
async function loadTeamMembers(projectId) {
    try {
        const response = await axios.get(`/api/projects/${projectId}/team`);
        teamMembers = response.data;
    } catch (error) {
        console.error("Error loading team members:", error);
        teamMembers = [];
    }
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

// Render Kanban board
async function renderKanbanBoard() {
    // Filter by type if selected
    let itemsToDisplay = [];
    if (currentFilters.type === 'issue') {
        itemsToDisplay = [...issues];
    } else if (currentFilters.type === 'action') {
        itemsToDisplay = [...actionItems];
    } else {
        itemsToDisplay = [...issues, ...actionItems];
    }
    
    const allItems = itemsToDisplay;
    
    // Load relationship counts and comment counts for ALL items first (BEFORE rendering)
    const relationshipCounts = {};
    const commentCounts = {};
    
    await Promise.all(allItems.map(async (item) => {
        try {
            const endpoint = item.type === 'issue' ? 'issues' : 'action-items';
            const response = await axios.get(
                `/api/${endpoint}/${item.id}/relationships`,
                { withCredentials: true }
            );
            
            const { outgoing, incoming } = response.data;
            const count = (outgoing?.length || 0) + (incoming?.length || 0);
            relationshipCounts[`${item.type}-${item.id}`] = count;
        } catch (error) {
            console.error(`Error loading relationships for ${item.type} ${item.id}:`, error);
            relationshipCounts[`${item.type}-${item.id}`] = 0;
        }
        
        try {
            const endpoint = item.type === 'issue' ? 'issues' : 'action-items';
            const commentResponse = await axios.get(
                `/api/${endpoint}/${item.id}/comments`,
                { withCredentials: true }
            );
            commentCounts[`${item.type}-${item.id}`] = commentResponse.data.length;
        } catch (error) {
            console.error(`Error loading comments for ${item.type} ${item.id}:`, error);
            commentCounts[`${item.type}-${item.id}`] = 0;
        }
    }));
    
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
                container.innerHTML = columnItems
                    .map((item) => {
                        const relCount = relationshipCounts[`${item.type}-${item.id}`] || 0;
                        const commentCount = commentCounts[`${item.type}-${item.id}`] || 0;
                        
                        // Check permissions for edit/delete
                        const currentUser = AuthManager.currentUser;
                        const isOwner = currentUser && parseInt(item.created_by, 10) === parseInt(currentUser.id, 10);
                        const isAssignee = currentUser && item.assignee === currentUser.username;
                        
                        // Role hierarchy: System Administrator (5), Project Manager (4), Team Lead (3), Team Member (2), Stakeholder (1), External Viewer (0)
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
                        
                        return `
                    <div class="kanban-card ${getAICardBackgroundClass(item)} rounded p-3 shadow-sm ${getAICardBorderClass(item)} border-l-4 ${!item.created_by_ai ? getBorderColor(item.priority || "medium") : ''} cursor-pointer hover:shadow-md transition-shadow"
                         draggable="true"
                         data-item-id="${item.id}"
                         data-item-type="${item.type || 'issue'}">
                        <div class="flex justify-between items-start mb-2 gap-2">
                            <div class="flex items-center gap-1">
                                <span class="text-xs font-medium ${getTextColor(item.type || "issue")}">${item.type || "Issue"}</span>
                                <span class="text-xs text-gray-500">·</span>
                                <span class="text-xs text-gray-500">${item.priority || "Medium"}</span>
                            </div>
                            ${getAISourceBadge(item)}
                        </div>
                        <h5 class="font-medium text-sm mb-1">${item.title}</h5>
                        <p class="text-xs text-gray-600 mb-2">${(item.description || "").substring(0, 80)}...</p>
                        ${
                            item.progress !== undefined
                                ? `<div class="w-full bg-gray-200 rounded-full h-1 mb-2">
                                <div class="bg-blue-600 h-1 rounded-full" style="width: ${item.progress}%"></div>
                            </div>`
                                : ""
                        }
                        <div class="flex justify-between items-center text-xs text-gray-500 mb-2">
                            <span>${item.assignee || "Unassigned"}</span>
                        </div>
                        ${createDueDateBadge(item.due_date, item.status, item.completed_at)}
                        ${item.tags && item.tags.length > 0 ? `
                            <div class="flex flex-wrap gap-1 mb-2">
                                ${item.tags.map(tag => `
                                    <span class="px-2 py-0.5 text-xs rounded-full font-medium" style="background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}40;">
                                        ${tag.name}
                                    </span>
                                `).join('')}
                            </div>
                        ` : ''}
                        <div class="mt-2 pt-2 border-t border-gray-100 space-y-1">
                            <button class="manage-relationships-btn flex items-center text-xs ${relCount > 0 ? 'text-blue-600 font-medium' : 'text-gray-600'} hover:text-blue-700 transition-colors w-full" 
                                    data-item-id="${item.id}" 
                                    data-item-type="${item.type || 'issue'}" 
                                    data-item-title="${item.title.replace(/"/g, '&quot;')}">
                                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                                </svg>
                                <span>Relationships</span>
                                ${relCount > 0 ? `<span class="ml-auto px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">${relCount}</span>` : ''}
                            </button>
                            <button class="view-comments-btn flex items-center text-xs ${commentCount > 0 ? 'text-indigo-600 font-medium' : 'text-gray-600'} hover:text-indigo-700 transition-colors w-full" 
                                    data-item-id="${item.id}" 
                                    data-item-type="${item.type || 'issue'}">
                                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                                </svg>
                                <span>Comments</span>
                                ${commentCount > 0 ? `<span class="ml-auto px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">${commentCount}</span>` : ''}
                            </button>
                            <button class="copy-link-btn flex items-center text-xs text-gray-600 hover:text-purple-600 transition-colors w-full" 
                                    data-item-id="${item.id}" 
                                    data-item-type="${item.type || 'issue'}">
                                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                                <span>Copy Link</span>
                            </button>
                            <button class="generate-checklist-btn flex items-center text-xs text-gray-600 hover:text-blue-600 transition-colors w-full group relative" 
                                    data-item-id="${item.id}" 
                                    data-item-type="${item.type || 'issue'}"
                                    data-item-title="${item.title.replace(/"/g, '&quot;')}"
                                    title="AI will analyze this ${item.type || 'issue'} and create a comprehensive checklist (10-30s)">
                                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                </svg>
                                <span>🤖 Generate Checklist</span>
                                <span class="absolute left-0 bottom-full mb-1 px-2 py-1 text-xs bg-gray-900 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                    ✨ AI analyzes & creates checklist (Limit: 10/hour)
                                </span>
                            </button>
                            ${canEdit || canDelete ? `
                                <div class="flex gap-1 pt-1">
                                    ${canEdit ? `
                                        <button class="edit-item-btn flex-1 flex items-center justify-center text-xs text-gray-600 hover:text-green-600 transition-colors py-1 px-2 rounded hover:bg-green-50" 
                                                data-item-id="${item.id}" 
                                                data-item-type="${item.type || 'issue'}">
                                            <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                            </svg>
                                            <span>Edit</span>
                                        </button>
                                    ` : ''}
                                    ${canDelete ? `
                                        <button class="delete-item-btn flex-1 flex items-center justify-center text-xs text-gray-600 hover:text-red-600 transition-colors py-1 px-2 rounded hover:bg-red-50" 
                                                data-item-id="${item.id}" 
                                                data-item-type="${item.type || 'issue'}">
                                            <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                            </svg>
                                            <span>Delete</span>
                                        </button>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
                    })
                    .join("");
                container.style.minHeight = 'auto';
            }
            
            // Add drag and drop event listeners to cards
            container.querySelectorAll('.kanban-card').forEach(card => {
                card.addEventListener('dragstart', handleDragStart);
                card.addEventListener('dragend', handleDragEnd);
                
                // Add click handler to open item detail modal
                card.addEventListener('click', function(e) {
                    // Don't open modal if we just finished dragging
                    if (isDragging) return;
                    
                    // Only open modal if clicking on the card itself, not buttons
                    if (!e.target.closest('button')) {
                        const itemId = parseInt(this.getAttribute('data-item-id'));
                        const itemType = this.getAttribute('data-item-type');
                        openItemDetailModal(itemId, itemType);
                    }
                });
            });
            
            // Add relationship button listeners
            container.querySelectorAll('.manage-relationships-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation(); // Prevent drag start
                    const itemId = parseInt(this.getAttribute('data-item-id'));
                    const itemType = this.getAttribute('data-item-type');
                    const itemTitle = this.getAttribute('data-item-title');
                    showRelationshipModal(itemId, itemType, itemTitle);
                });
            });
            
            // Add comment button listeners
            container.querySelectorAll('.view-comments-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation(); // Prevent drag start
                    const itemId = parseInt(this.getAttribute('data-item-id'));
                    const itemType = this.getAttribute('data-item-type');
                    openItemDetailModal(itemId, itemType);
                });
            });
            
            // Add copy link button listeners
            container.querySelectorAll('.copy-link-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation(); // Prevent drag start and card click
                    const itemId = parseInt(this.getAttribute('data-item-id'));
                    const itemType = this.getAttribute('data-item-type');
                    copyItemLink(itemId, itemType);
                });
            });
            
            // Add generate checklist button listeners
            container.querySelectorAll('.generate-checklist-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation(); // Prevent drag start and card click
                    const itemId = parseInt(this.getAttribute('data-item-id'));
                    const itemType = this.getAttribute('data-item-type');
                    const itemTitle = this.getAttribute('data-item-title');
                    openAIChecklistModal(itemId, itemType, itemTitle);
                });
            });
            
            // Add edit button listeners
            container.querySelectorAll('.edit-item-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation(); // Prevent drag start and card click
                    const itemId = parseInt(this.getAttribute('data-item-id'));
                    const itemType = this.getAttribute('data-item-type');
                    openEditModal(itemId, itemType);
                });
            });
            
            // Add delete button listeners
            container.querySelectorAll('.delete-item-btn').forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation(); // Prevent drag start and card click
                    const itemId = parseInt(this.getAttribute('data-item-id'));
                    const itemType = this.getAttribute('data-item-type');
                    confirmDeleteItem(itemId, itemType);
                });
            });
            
            // Add drop zone listeners to column (always, even if empty)
            container.addEventListener('dragover', handleDragOver);
            container.addEventListener('drop', handleDrop);
        }
    });
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
        
        renderKanbanBoard();
        showSuccessMessage('Status updated successfully!');
    } catch (error) {
        console.error('Error updating status:', error);
        showErrorMessage('Failed to update status');
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
        assignee: document.getElementById('issue-assignee').value,
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
        assignee: document.getElementById('action-item-assignee').value,
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
      applyFilters();
      updateURL();
    });
  }
  
  // Priority filter
  const priorityFilter = document.getElementById('priority-filter');
  if (priorityFilter) {
    priorityFilter.addEventListener('change', (e) => {
      currentFilters.priority = e.target.value;
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
  
  // Populate assignee dropdown
  populateAssigneeFilter();
}

// Apply filters - reload data with filter params
async function applyFilters() {
  if (!currentProject) return;
  
  await loadProjectData(currentProject.id);
}

// Clear all filters
function clearAllFilters() {
  currentFilters = {
    search: '',
    type: '',
    status: '',
    priority: '',
    assignee: '',
    category: ''
  };
  
  // Reset form inputs
  const searchInput = document.getElementById('search-input');
  const typeFilter = document.getElementById('type-filter');
  const statusFilter = document.getElementById('status-filter');
  const priorityFilter = document.getElementById('priority-filter');
  const assigneeFilter = document.getElementById('assignee-filter');
  
  if (searchInput) searchInput.value = '';
  if (typeFilter) typeFilter.value = '';
  if (statusFilter) statusFilter.value = '';
  if (priorityFilter) priorityFilter.value = '';
  if (assigneeFilter) assigneeFilter.value = '';
  
  // Reload data
  applyFilters();
  updateURL();
  
  // Hide active filters display
  const activeFiltersDiv = document.getElementById('active-filters');
  const resultsCountDiv = document.getElementById('results-count');
  
  if (activeFiltersDiv) activeFiltersDiv.classList.add('hidden');
  if (resultsCountDiv) resultsCountDiv.classList.add('hidden');
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
    activeFilters.push({ key: 'status', label: `Status: ${currentFilters.status}` });
  }
  if (currentFilters.priority) {
    activeFilters.push({ key: 'priority', label: `Priority: ${currentFilters.priority}` });
  }
  if (currentFilters.assignee) {
    activeFilters.push({ key: 'assignee', label: `Assignee: ${currentFilters.assignee}` });
  }
  if (currentFilters.category) {
    activeFilters.push({ key: 'category', label: `Category: ${currentFilters.category}` });
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
    btn.addEventListener('click', () => {
      removeFilter(btn.getAttribute('data-remove-filter'));
    });
  });
}

// Remove a single filter
function removeFilter(filterKey) {
  currentFilters[filterKey] = '';
  
  // Update UI
  if (filterKey === 'search') {
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
  } else {
    const filterElement = document.getElementById(`${filterKey}-filter`);
    if (filterElement) filterElement.value = '';
  }
  
  applyFilters();
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
  
  // Get unique assignees from issues and action items
  const assignees = new Set();
  [...issues, ...actionItems].forEach(item => {
    if (item.assignee && item.assignee.trim()) {
      assignees.add(item.assignee);
    }
  });
  
  // Add assignee options (keep existing options)
  const existingOptions = select.innerHTML;
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

// Update URL with current filters (for shareable links)
function updateURL() {
  if (!currentProject) return;
  
  const params = new URLSearchParams();
  params.set('project', currentProject.id);
  
  if (currentFilters.search) params.set('search', currentFilters.search);
  if (currentFilters.type) params.set('type', currentFilters.type);
  if (currentFilters.status) params.set('status', currentFilters.status);
  if (currentFilters.priority) params.set('priority', currentFilters.priority);
  if (currentFilters.assignee) params.set('assignee', currentFilters.assignee);
  if (currentFilters.category) params.set('category', currentFilters.category);
  
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
  
  // Update form inputs
  const searchInput = document.getElementById('search-input');
  const typeFilter = document.getElementById('type-filter');
  const statusFilter = document.getElementById('status-filter');
  const priorityFilter = document.getElementById('priority-filter');
  const assigneeFilter = document.getElementById('assignee-filter');
  
  if (searchInput && currentFilters.search) searchInput.value = currentFilters.search;
  if (typeFilter && currentFilters.type) typeFilter.value = currentFilters.type;
  if (statusFilter && currentFilters.status) statusFilter.value = currentFilters.status;
  if (priorityFilter && currentFilters.priority) priorityFilter.value = currentFilters.priority;
  if (assigneeFilter && currentFilters.assignee) assigneeFilter.value = currentFilters.assignee;
}

// ============= RELATIONSHIP MANAGEMENT =============

// Global state for relationships
let currentRelationshipItem = null;

// Show relationship modal
async function showRelationshipModal(itemId, itemType, itemTitle) {
  currentRelationshipItem = { id: itemId, type: itemType, title: itemTitle };
  
  // Show modal
  document.getElementById('relationship-modal').classList.remove('hidden');
  
  // Display item info
  document.getElementById('relationship-item-info').innerHTML = `
    <p class="font-medium">${itemTitle}</p>
    <p class="text-sm text-gray-600">${itemType === 'issue' ? 'Issue' : 'Action Item'} #${itemId}</p>
  `;
  
  // Load relationships
  await loadRelationships();
  
  // Populate target dropdown
  await populateTargetDropdown();
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
  document.getElementById('file-name').classList.add('hidden');
  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('analysis-progress').classList.add('hidden');
  selectedFile = null;
  currentAIAnalysis = null;
}

// Handle file selection
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  selectedFile = file;
  
  // Show file name and size
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
  document.getElementById('file-name').textContent = `Selected: ${file.name} (${fileSizeMB} MB)`;
  document.getElementById('file-name').classList.remove('hidden');
  
  // Enable analyze button
  document.getElementById('analyze-btn').disabled = false;
}

// Analyze transcript with AI
async function analyzeTranscript() {
  if (!selectedFile || !currentProject) return;
  
  const analyzeBtn = document.getElementById('analyze-btn');
  const progressDiv = document.getElementById('analysis-progress');
  
  try {
    // Show progress
    analyzeBtn.disabled = true;
    progressDiv.classList.remove('hidden');
    
    // Create FormData
    const formData = new FormData();
    formData.append('transcript', selectedFile);
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
  
  const { actionItems, issues, metadata } = currentAIAnalysis;
  
  // Calculate statistics
  const totalItems = actionItems.length + issues.length;
  const allItems = [...actionItems, ...issues];
  const avgConfidence = totalItems > 0 
    ? Math.round(allItems.reduce((sum, item) => sum + item.confidence, 0) / totalItems)
    : 0;
  const assignedCount = actionItems.filter(item => item.assignee && item.assignee !== 'Unassigned').length;
  
  // Update cost info
  document.getElementById('analysis-cost').textContent = 
    `Cost: ${metadata.estimatedCost} | Tokens: ${metadata.tokensUsed.total}`;
  
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
    const response = await axios.post('/api/meetings/create-items', {
      projectId: currentProject.id,
      transcriptId: currentAIAnalysis.transcriptId,
      analysisId: currentAIAnalysis.analysisId,
      actionItems: selectedActionItems,
      issues: selectedIssues
    }, { withCredentials: true });
    
    alert(`Created ${response.data.actionItems.length} action items and ${response.data.issues.length} issues!`);
    
    // Close modal and reload data
    closeAIAnalysisModal();
    await loadProjectData(currentProject.id);
    
  } catch (error) {
    console.error('Error creating items:', error);
    const errorMessage = error.response?.data?.message || error.response?.data?.error;
    
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
  
  // Transcripts modal event listeners
  const closeTranscriptsBtn = document.getElementById('close-transcripts-modal-btn');
  if (closeTranscriptsBtn) {
    closeTranscriptsBtn.addEventListener('click', closeTranscriptsModal);
  }
  
  const backToListBtn = document.getElementById('back-to-list-btn');
  if (backToListBtn) {
    backToListBtn.addEventListener('click', showTranscriptsList);
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
  
  // Show modal and loading
  modal.classList.remove('hidden');
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
      document.getElementById('no-transcripts').classList.remove('hidden');
      document.getElementById('transcripts-list').innerHTML = '';
    } else {
      document.getElementById('no-transcripts').classList.add('hidden');
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
      document.getElementById('edit-action-item-progress').value = item.progress || 0;
      
      // Load team members for assignee dropdown
      if (currentProject) {
        await loadTeamMembersForEdit('action-item', item.assignee || '');
      }
      
      // Load tags and pre-select current ones
      await loadTagsForEditActionItem(item.id);
      
      // Load attachments
      await loadEditAttachments(item.id, 'action-item');
      
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
    assignee: document.getElementById('edit-issue-assignee').value,
    due_date: document.getElementById('edit-issue-due-date').value,
    priority: document.getElementById('edit-issue-priority').value,
    status: document.getElementById('edit-issue-status').value,
    category: document.getElementById('edit-issue-category').value
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
    assignee: document.getElementById('edit-action-item-assignee').value,
    due_date: document.getElementById('edit-action-item-due-date').value,
    priority: document.getElementById('edit-action-item-priority').value,
    status: document.getElementById('edit-action-item-status').value,
    progress: parseInt(document.getElementById('edit-action-item-progress').value) || 0
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
  } catch (error) {
    console.error('Error updating action item:', error);
    alert(error.response?.data?.error || 'Failed to update action item');
  }
});

// Close edit modals
document.getElementById('closeEditIssueModal').addEventListener('click', function() {
  document.getElementById('editIssueModal').classList.add('hidden');
});

document.getElementById('cancelEditIssue').addEventListener('click', function() {
  document.getElementById('editIssueModal').classList.add('hidden');
});

document.getElementById('closeEditActionItemModal').addEventListener('click', function() {
  document.getElementById('editActionItemModal').classList.add('hidden');
});

document.getElementById('cancelEditActionItem').addEventListener('click', function() {
  document.getElementById('editActionItemModal').classList.add('hidden');
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
  const countText = document.getElementById('batch-count-text');
  
  const successfulChecklists = batchData.results?.filter(r => r.success) || [];
  countText.textContent = successfulChecklists.length;
  
  // Initialize all checklists as selected
  selectedChecklistIndices = successfulChecklists.map((_, index) => index);
  
  container.innerHTML = successfulChecklists.map((result, index) => {
    const preview = result.preview;
    const totalItems = preview.sections.reduce((sum, sec) => sum + sec.items.length, 0);
    
    return `
      <div class="border rounded-lg p-4 bg-white">
        <div class="flex items-start gap-3 mb-3">
          <input type="checkbox" 
                 id="checklist-select-${index}" 
                 data-index="${index}"
                 class="checklist-select-checkbox mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500" 
                 checked>
          <div class="flex-1">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">${index + 1}</span>
                <h5 class="font-semibold text-gray-900">${preview.title}</h5>
              </div>
              <span class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">${totalItems} items</span>
            </div>
            
            ${preview.description ? `
              <p class="text-xs text-gray-600 mb-3">${preview.description}</p>
            ` : ''}
            
            <details class="text-xs">
              <summary class="cursor-pointer text-blue-600 hover:text-blue-700 font-medium">View sections (${preview.sections.length})</summary>
              <div class="mt-2 pl-4 space-y-2">
                ${preview.sections.map((section, sIdx) => `
                  <div class="border-l-2 border-gray-300 pl-3">
                    <div class="font-medium text-gray-700">${sIdx + 1}. ${section.title}</div>
                    <div class="text-gray-500">${section.items.length} items</div>
                  </div>
                `).join('')}
              </div>
            </details>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add event listeners to checkboxes
  document.querySelectorAll('.checklist-select-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateChecklistSelection);
  });
  
  // Update button text
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

