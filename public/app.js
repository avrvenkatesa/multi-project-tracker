// Global state
let currentProject = null;
let projects = [];
let issues = [];
let actionItems = [];

// Initialize app
document.addEventListener("DOMContentLoaded", function () {
    console.log("Multi-Project Tracker initialized");
    loadProjects();
    setupEventListeners();
});

// Setup event listeners (replaces inline onclick handlers)
function setupEventListeners() {
    // Add event listeners after DOM is loaded
    document.addEventListener("click", function (e) {
        // Handle New Project button
        if (e.target.textContent.includes("+ New Project")) {
            showCreateProject();
        }

        // Handle Issue button
        if (e.target.textContent.includes("+ Issue")) {
            showCreateIssue();
        }

        // Handle Action Item button
        if (e.target.textContent.includes("+ Action Item")) {
            showCreateActionItem();
        }

        // Handle modal overlay clicks (to close modal)
        if (e.target.id === "modal-overlay") {
            hideModal();
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
                <div class="bg-white rounded p-3 shadow-sm border-l-4 ${getBorderColor(item.priority || "medium")}">
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
    alert("Action item creation modal coming soon!");
}
