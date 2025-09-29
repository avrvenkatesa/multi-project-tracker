// Global state
let currentProject = null;
let projects = [];
let issues = [];
let actionItems = [];

// Global variable to track dragged item
let draggedItem = null;

// Drag and Drop Functions
function allowDrop(ev) {
    ev.preventDefault();
    // Add visual feedback
    const column = ev.currentTarget;
    if (!column.classList.contains('drag-over')) {
        column.classList.add('drag-over', 'ring-2', 'ring-blue-400', 'ring-opacity-50');
    }
}

function drag(ev, itemId, itemType) {
    draggedItem = { id: itemId, type: itemType };
    ev.dataTransfer.effectAllowed = 'move';
    
    // Set data for cross-browser compatibility (required for Firefox)
    ev.dataTransfer.setData('text/plain', JSON.stringify({id: itemId, type: itemType}));
    
    // Add dragging class for visual feedback
    ev.target.classList.add('opacity-50', 'scale-95');
}

function dragEnd(ev) {
    ev.target.classList.remove('opacity-50', 'scale-95');
    
    // Remove drag-over styling from all columns
    document.querySelectorAll('[data-status]').forEach(col => {
        col.classList.remove('drag-over', 'ring-2', 'ring-blue-400', 'ring-opacity-50');
    });
    
    // Clear dragged item to prevent stuck state
    draggedItem = null;
}

function dragLeave(ev) {
    const column = ev.currentTarget;
    column.classList.remove('drag-over', 'ring-2', 'ring-blue-400', 'ring-opacity-50');
}

async function drop(ev) {
    ev.preventDefault();
    
    // Remove visual feedback
    const column = ev.currentTarget.closest('[data-status]');
    column.classList.remove('drag-over', 'ring-2', 'ring-blue-400', 'ring-opacity-50');
    
    if (!draggedItem) return;
    
    const newStatus = column.dataset.status;
    
    // Find the item in the appropriate array
    let item;
    if (draggedItem.type === 'issue') {
        item = issues.find(i => i.id === draggedItem.id);
    } else {
        item = actionItems.find(i => i.id === draggedItem.id);
    }
    
    if (!item) {
        console.error('Item not found');
        return;
    }
    
    const oldStatus = item.status;
    
    // Don't update if dropping in same column
    if (oldStatus === newStatus) {
        draggedItem = null;
        return;
    }
    
    // Optimistically update UI
    item.status = newStatus;
    renderKanbanBoard();
    
    // Update on server
    try {
        const endpoint = draggedItem.type === 'issue' ? '/api/issues' : '/api/action-items';
        console.log(`Updating ${draggedItem.type} ${draggedItem.id} to status: ${newStatus}`);
        const response = await fetch(`${endpoint}/${draggedItem.id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const updatedItem = await response.json();
        
        // Update local data with server response
        if (draggedItem.type === 'issue') {
            const index = issues.findIndex(i => i.id === draggedItem.id);
            if (index !== -1) issues[index] = updatedItem;
        } else {
            const index = actionItems.findIndex(i => i.id === draggedItem.id);
            if (index !== -1) actionItems[index] = updatedItem;
        }
        
        // Re-render to reflect server-side changes (like auto-updated progress)
        renderKanbanBoard();
        
        // Show success notification
        showSuccessMessage(`${item.title} moved to ${newStatus}`);
        
    } catch (error) {
        console.error('Error updating item status:', error);
        
        // Revert on error
        item.status = oldStatus;
        renderKanbanBoard();
        
        alert('Error updating status. Please try again.');
    }
    
    draggedItem = null;
}

// Initialize app
document.addEventListener("DOMContentLoaded", function () {
    console.log("Multi-Project Tracker initialized");
    loadProjects();
    setupEventListeners();
    setupDragDropEventListeners();
});

// Setup drag and drop event listeners for columns
function setupDragDropEventListeners() {
    document.querySelectorAll('[data-status]').forEach(column => {
        column.addEventListener('dragover', allowDrop);
        column.addEventListener('drop', drop);
        column.addEventListener('dragleave', dragLeave);
    });
}

// Setup event listeners for cards (called after each render)
function setupCardEventListeners(container) {
    const cards = container.querySelectorAll('[data-item-id]');
    cards.forEach(card => {
        const itemId = parseInt(card.dataset.itemId);
        const itemType = card.dataset.itemType;
        
        // Add drag event listeners
        card.addEventListener('dragstart', (e) => drag(e, itemId, itemType));
        card.addEventListener('dragend', dragEnd);
        
        // Add click event listener for viewing items
        card.addEventListener('click', (e) => {
            // Prevent click during drag
            if (!draggedItem) {
                viewItem(itemId, itemType);
            }
        });
    });
}

// Setup event listeners (replaces inline onclick handlers)
function setupEventListeners() {
    // Handle button clicks by ID
    document.addEventListener("click", function (e) {
        // Handle New Project button
        if (e.target.id === "new-project-btn" || e.target.textContent.includes("+ New Project")) {
            showCreateProject();
        }

        // Handle Issue button
        if (e.target.id === "new-issue-btn" || e.target.textContent.includes("+ Issue")) {
            showCreateIssue();
        }

        // Handle Action Item button
        if (e.target.id === "new-action-item-btn" || e.target.textContent.includes("+ Action Item")) {
            showCreateActionItem();
        }

        // Handle modal overlay clicks (to close modal)
        if (e.target.id === "modal-overlay") {
            hideModal();
        }
    });

    // Handle form submissions by form ID
    document.addEventListener("submit", function (e) {
        e.preventDefault();
        
        // Handle different form types by ID
        if (e.target.id === "create-project-form") {
            createProject(e);
        } else if (e.target.id === "create-issue-form") {
            createIssue(e);
        } else if (e.target.id === "create-action-item-form") {
            createActionItem(e);
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

// Load project data
async function loadProjectData(projectId) {
    try {
        const [issuesResponse, actionItemsResponse] = await Promise.all([
            axios.get(`/api/issues?projectId=${projectId}`),
            axios.get(`/api/action-items?projectId=${projectId}`),
        ]);

        issues = issuesResponse.data;
        actionItems = actionItemsResponse.data;

        renderKanbanBoard();
    } catch (error) {
        console.error("Error loading project data:", error);
    }
}

// Render Kanban board
function renderKanbanBoard() {
    const allItems = [...issues, ...actionItems];
    const columns = [
        { status: 'To Do', id: 'todo' },
        { status: 'In Progress', id: 'inprogress' },
        { status: 'Blocked', id: 'blocked' },
        { status: 'Done', id: 'done' }
    ];
    
    columns.forEach(({ status, id }) => {
        const columnItems = allItems.filter(item => item.status === status);
        const container = document.getElementById(`${id}-column`);
        const countElement = document.getElementById(`${id}-count`);
        
        // Update count badge
        if (countElement) {
            countElement.textContent = columnItems.length;
        }
        
        if (container) {
            if (columnItems.length === 0) {
                container.innerHTML = '<p class="text-gray-400 text-sm text-center py-4">Drop items here</p>';
                return;
            }
            
            container.innerHTML = columnItems.map(item => `
                <div class="bg-white rounded p-3 shadow-sm border-l-4 ${getBorderColor(item.priority || 'medium')} 
                     hover:shadow-md transition-all cursor-move" 
                     draggable="true"
                     data-item-id="${item.id}"
                     data-item-type="${item.type}">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-xs font-medium px-2 py-1 rounded ${getTypeColor(item.type || 'issue')}">
                            ${item.type === 'action-item' ? '⚡ Action' : '🐛 Issue'}
                        </span>
                        <span class="text-xs px-2 py-1 rounded ${getPriorityBadgeColor(item.priority || 'medium')}">
                            ${(item.priority || 'medium').toUpperCase()}
                        </span>
                    </div>
                    <h5 class="font-medium text-sm mb-2">${item.title}</h5>
                    <p class="text-xs text-gray-600 mb-2">${(item.description || '').substring(0, 80)}${(item.description || '').length > 80 ? '...' : ''}</p>
                    
                    ${item.type === 'action-item' && item.progress !== undefined ? 
                        `<div class="mb-2">
                            <div class="flex justify-between text-xs mb-1">
                                <span class="text-gray-500">Progress</span>
                                <span class="font-medium text-purple-600">${item.progress}%</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2">
                                <div class="bg-purple-600 h-2 rounded-full transition-all" 
                                     style="width: ${item.progress}%"></div>
                            </div>
                        </div>` : ''
                    }
                    
                    ${item.isDeliverable ? 
                        '<span class="inline-block text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded mb-2">📦 Deliverable</span>' 
                        : ''
                    }
                    
                    <div class="flex justify-between items-center text-xs text-gray-500 mt-2 pt-2 border-t">
                        <span class="flex items-center">
                            <span class="inline-block w-6 h-6 rounded-full bg-blue-500 text-white text-center leading-6 mr-1">
                                ${(item.assignee || 'U')[0].toUpperCase()}
                            </span>
                            <span class="truncate max-w-[100px]">${item.assignee || 'Unassigned'}</span>
                        </span>
                        ${item.dueDate ? 
                            `<span class="flex items-center ${isOverdue(item.dueDate) ? 'text-red-600 font-medium' : ''}">
                                📅 ${formatDate(item.dueDate)}
                            </span>` 
                            : ''
                        }
                    </div>
                    
                    ${item.milestone ? 
                        `<div class="text-xs text-gray-500 mt-2">
                            🎯 ${item.milestone}
                        </div>` 
                        : ''
                    }
                </div>
            `).join('');
            
            // Add event listeners to all cards after rendering
            setupCardEventListeners(container);
        }
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
    if (!currentProject) return '<option value="General">General</option>';
    
    return currentProject.categories.map(category => 
        `<option value="${category}">${category}</option>`
    ).join('');
}

function generatePhaseOptions() {
    if (!currentProject) return '<option value="Planning">Planning</option>';
    
    return currentProject.phases.map(phase => 
        `<option value="${phase}">${phase}</option>`
    ).join('');
}

function generateComponentOptions() {
    if (!currentProject) return '<option value="General">General</option>';
    
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
                <input type="text" id="action-title" required 
                       class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                       placeholder="What needs to be done?">
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Description</label>
                <textarea id="action-description" rows="3"
                          class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                          placeholder="Detailed steps or context for this action"></textarea>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium mb-2">Priority</label>
                    <select id="action-priority" 
                            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                        <option value="low">Low</option>
                        <option value="medium" selected>Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Category</label>
                    <select id="action-category" 
                            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                        ${generateCategoryOptions()}
                    </select>
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium mb-2">Phase</label>
                    <select id="action-phase" 
                            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                        ${generatePhaseOptions()}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Component</label>
                    <select id="action-component" 
                            class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                        ${generateComponentOptions()}
                    </select>
                </div>
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Assigned To</label>
                <select id="action-assignee" 
                        class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                    <option value="">Unassigned</option>
                    <option value="Demo User">Demo User</option>
                    <option value="Gajalakshmi Vaasan">Gajalakshmi Vaasan (PM)</option>
                    <option value="Srihari S">Srihari S (Solution Architect)</option>
                    <option value="Magesh Kumar Selvaraj">Magesh Kumar Selvaraj (Cloud Engineer)</option>
                    <option value="Sujay V">Sujay V (DBA)</option>
                </select>
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-sm font-medium mb-2">Due Date</label>
                    <input type="date" id="action-due-date"
                           class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                </div>
                <div>
                    <label class="block text-sm font-medium mb-2">Progress (%)</label>
                    <input type="number" id="action-progress" min="0" max="100" value="0"
                           class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
                </div>
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">Link to Milestone (Optional)</label>
                <input type="text" id="action-milestone" 
                       class="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                       placeholder="e.g., Phase 1 Completion, Pathfinder Migration">
            </div>
            
            <div class="mb-4">
                <label class="block text-sm font-medium mb-2">
                    <input type="checkbox" id="action-deliverable" class="mr-2">
                    This is a key deliverable
                </label>
            </div>
            
            <div class="flex justify-end space-x-3">
                <button type="button" id="cancel-action-btn" 
                        class="px-4 py-2 text-gray-600 border rounded hover:bg-gray-50">
                    Cancel
                </button>
                <button type="submit" 
                        class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
                    Create Action Item
                </button>
            </div>
        </form>
    `;
    
    showModal(modalContent);
    
    // Add event listeners
    document.getElementById('cancel-action-btn').addEventListener('click', hideModal);
    document.getElementById('create-action-item-form').addEventListener('submit', createActionItem);
    
    // Add real-time progress indicator
    const progressInput = document.getElementById('action-progress');
    progressInput.addEventListener('input', function() {
        this.style.background = `linear-gradient(to right, #9333EA ${this.value}%, #e5e7eb ${this.value}%)`;
    });
}

// Create action item function
async function createActionItem(event) {
    event.preventDefault();
    
    const actionItemData = {
        title: document.getElementById('action-title').value,
        description: document.getElementById('action-description').value,
        priority: document.getElementById('action-priority').value,
        category: document.getElementById('action-category').value,
        phase: document.getElementById('action-phase').value,
        component: document.getElementById('action-component').value,
        assignee: document.getElementById('action-assignee').value,
        dueDate: document.getElementById('action-due-date').value,
        progress: parseInt(document.getElementById('action-progress').value),
        milestone: document.getElementById('action-milestone').value,
        isDeliverable: document.getElementById('action-deliverable').checked,
        projectId: currentProject.id,
        type: 'action-item',
        status: 'To Do'
    };
    
    try {
        const response = await fetch('/api/action-items', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(actionItemData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const newActionItem = await response.json();
        actionItems.push(newActionItem);
        renderKanbanBoard();
        hideModal();
        
        showSuccessMessage(`Action item "${newActionItem.title}" created successfully!`);
        
    } catch (error) {
        console.error('Error creating action item:', error);
        alert('Error creating action item. Please try again.');
    }
}

// Helper functions for enhanced Kanban board
function getTypeColor(type) {
    return type === 'action-item' 
        ? 'bg-purple-100 text-purple-800' 
        : 'bg-red-100 text-red-800';
}

function getPriorityBadgeColor(priority) {
    const colors = {
        'critical': 'bg-red-100 text-red-800',
        'high': 'bg-orange-100 text-orange-800',
        'medium': 'bg-yellow-100 text-yellow-800',
        'low': 'bg-green-100 text-green-800'
    };
    return colors[priority.toLowerCase()] || colors['medium'];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = date - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays < 7) return `${diffDays}d`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
}

// Placeholder for viewing item details
function viewItem(itemId, itemType) {
    console.log(`View ${itemType} with ID: ${itemId}`);
    alert(`Item details view coming soon!\nItem ID: ${itemId}\nType: ${itemType}`);
}
