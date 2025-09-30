// Global state
let currentProject = null;
let projects = [];
let issues = [];
let actionItems = [];

// Initialize app
document.addEventListener("DOMContentLoaded", async function () {
    console.log("Multi-Project Tracker initialized");
    await AuthManager.init();
    loadProjects();
    setupEventListeners();
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
    const columns = ["To Do", "In Progress", "Blocked", "Done"];

    columns.forEach((status) => {
        const columnItems = allItems.filter((item) => item.status === status);
        const columnId = status.toLowerCase().replace(" ", "");
        const container = document.getElementById(`${columnId}-column`);

        if (container) {
            container.innerHTML = columnItems
                .map(
                    (item) => `
                <div class="kanban-card bg-white rounded p-3 shadow-sm border-l-4 ${getBorderColor(item.priority || "medium")} cursor-move"
                     draggable="true"
                     data-item-id="${item.id}"
                     data-item-type="${item.type || 'issue'}">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-xs font-medium ${getTextColor(item.type || "issue")}">${item.type || "Issue"}</span>
                        <span class="text-xs text-gray-500">${item.priority || "Medium"}</span>
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
                    <div class="flex justify-between items-center text-xs text-gray-500">
                        <span>${item.assignee || "Unassigned"}</span>
                        <span>${item.dueDate ? new Date(item.dueDate).toLocaleDateString() : ""}</span>
                    </div>
                </div>
            `,
                )
                .join("");
            
            // Add drag and drop event listeners to cards
            container.querySelectorAll('.kanban-card').forEach(card => {
                card.addEventListener('dragstart', handleDragStart);
            });
            
            // Add drop zone listeners to column
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
        'todocolumn': 'To Do',
        'inprogresscolumn': 'In Progress',
        'blockedcolumn': 'Blocked',
        'donecolumn': 'Done'
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

