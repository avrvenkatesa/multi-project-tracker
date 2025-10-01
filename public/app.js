// Global state
let currentProject = null;
let projects = [];
let issues = [];
let actionItems = [];

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

// Initialize app
document.addEventListener("DOMContentLoaded", async function () {
    console.log("Multi-Project Tracker initialized");
    await AuthManager.init();
    loadProjects();
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
    document.getElementById('create-issue-btn')?.addEventListener('click', showCreateIssue);
    document.getElementById('create-action-item-btn')?.addEventListener('click', showCreateActionItem);
    document.getElementById('ai-analysis-btn')?.addEventListener('click', showAIAnalysisModal);
    
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
            (project) => `
        <div class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow cursor-pointer"
             data-project-id="${project.id}">
            <h3 class="text-lg font-semibold mb-2">${project.name}</h3>
            <p class="text-gray-600 text-sm mb-3">${project.description}</p>
            <div class="flex items-center justify-between">
                <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                    ${project.template}
                </span>
                <span class="text-xs text-gray-500">
                    ${new Date(project.createdAt).toLocaleDateString()}
                </span>
            </div>
        </div>
    `,
        )
        .join("");

    // Add click listeners to project cards
    document.querySelectorAll("[data-project-id]").forEach((card) => {
        card.addEventListener("click", function () {
            selectProject(parseInt(this.dataset.projectId));
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
        ]);

        issues = issuesResponse.data;
        actionItems = actionItemsResponse.data;

        await renderKanbanBoard();
        displayActiveFilters();
        displayResultsCount();
        populateAssigneeFilter();
    } catch (error) {
        console.error("Error loading project data:", error);
    }
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
    
    // Load relationship counts for ALL items first (BEFORE rendering)
    const relationshipCounts = {};
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
    }));
    
    const columns = ["To Do", "In Progress", "Blocked", "Done"];

    columns.forEach((status) => {
        const columnItems = allItems.filter((item) => item.status === status);
        const columnId = status.toLowerCase().replace(/ /g, "");
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
                        
                        return `
                    <div class="kanban-card ${getAICardBackgroundClass(item)} rounded p-3 shadow-sm ${getAICardBorderClass(item)} border-l-4 ${!item.created_by_ai ? getBorderColor(item.priority || "medium") : ''} cursor-move hover:shadow-md transition-shadow"
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
                            <span>${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : ""}</span>
                        </div>
                        <div class="mt-2 pt-2 border-t border-gray-100">
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
            
            // Add drop zone listeners to column (always, even if empty)
            container.addEventListener('dragover', handleDragOver);
            container.addEventListener('drop', handleDrop);
        }
    });
}

// Drag and drop handlers
let draggedItem = null;

function handleDragStart(e) {
    draggedItem = {
        id: e.target.dataset.itemId,
        type: e.target.dataset.itemType
    };
    e.target.style.opacity = '0.5';
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
                    <option value="">Unassigned</option>
                    <option value="Demo User">Demo User</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Technical Lead">Technical Lead</option>
                </select>
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Due Date</label>
                <input type="date" id="issue-due-date"
                       class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
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
    
    // Add event listeners
    document.getElementById('cancel-issue-btn').addEventListener('click', hideModal);
    document.getElementById('create-issue-form').addEventListener('submit', createIssue);
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
                    <option value="">Unassigned</option>
                    <option value="Demo User">Demo User</option>
                    <option value="Project Manager">Project Manager</option>
                    <option value="Technical Lead">Technical Lead</option>
                </select>
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Due Date</label>
                <input type="date" id="action-item-due-date"
                       class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
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
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
          <div class="flex-1">
            <span class="text-xs font-semibold text-blue-600 uppercase">${r.relationship_type.replace(/_/g, ' ')}</span>
            <p class="text-sm">${r.target_title}</p>
            <span class="text-xs text-gray-500">${r.target_type} - ${r.target_status}</span>
          </div>
          <button class="delete-relationship-btn text-red-600 hover:text-red-700" data-relationship-id="${r.id}">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      `),
      ...incoming.map(r => `
        <div class="flex items-center justify-between p-3 bg-yellow-50 rounded">
          <div class="flex-1">
            <span class="text-xs font-semibold text-yellow-600 uppercase">${r.relationship_type.replace(/_/g, ' ')} (incoming)</span>
            <p class="text-sm">${r.source_title}</p>
            <span class="text-xs text-gray-500">${r.source_type} - ${r.source_status}</span>
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
    alert(error.response?.data?.error || 'Failed to analyze transcript. Please check your OpenAI API key.');
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
    
    // Display unmatched updates
    if (statusUpdateResults.unmatched.length > 0) {
      unmatchedContainer.innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h6 class="font-semibold text-yellow-900 mb-2 text-sm">
            ⚠️ Needs Manual Review (${statusUpdateResults.unmatched.length})
          </h6>
          <p class="text-xs text-yellow-800 mb-3">
            These status updates couldn't be automatically matched. Please review and update manually.
          </p>
          <div class="space-y-2">
            ${statusUpdateResults.unmatched.map(unmatched => `
              <div class="bg-white border border-yellow-300 rounded-lg p-3">
                <p class="font-medium text-sm text-gray-900 mb-1">${escapeHtml(unmatched.update.itemDescription)}</p>
                <p class="text-xs text-gray-600 mb-2">"${escapeHtml(unmatched.update.evidence)}"</p>
                <p class="text-xs text-yellow-700">Reason: ${escapeHtml(unmatched.reason)}</p>
                ${unmatched.closestMatch ? `<p class="text-xs text-gray-500 mt-1">Closest match: ${escapeHtml(unmatched.closestMatch)}</p>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      unmatchedContainer.innerHTML = '';
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
    alert(error.response?.data?.error || 'Failed to create items');
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
  const viewTranscriptsBtn = document.getElementById('view-transcripts-btn');
  if (viewTranscriptsBtn) {
    viewTranscriptsBtn.addEventListener('click', openTranscriptsModal);
  }
  
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

