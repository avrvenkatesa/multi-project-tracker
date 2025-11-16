// create-test-project.js - Test project creation for Story 4.6

const epic1Content = `# User Authentication Module

## Overview
Complete user authentication system with OAuth2 and JWT support.

## Tasks

### 1. Design Authentication Flow
- Duration: 5 days
- Priority: High
- Assignee: Sarah Chen
- Description: Design the complete authentication flow including login, signup, and password reset
- Dependencies: None

### 2. Backend API Development
- Duration: 10 days
- Priority: High
- Assignee: Mike Johnson
- Description: Implement RESTful API endpoints for authentication
- Dependencies: Design Authentication Flow

#### 2.1 User Model Implementation
- Duration: 3 days
- Priority: High
- Assignee: Mike Johnson
- Description: Create database schema and user model with password hashing

#### 2.2 JWT Token Service
- Duration: 4 days
- Priority: High
- Assignee: Mike Johnson
- Description: Implement JWT generation, validation, and refresh logic

#### 2.3 API Route Configuration
- Duration: 3 days
- Priority: Medium
- Assignee: Mike Johnson
- Description: Set up Express routes for auth endpoints

### 3. Frontend UI Components
- Duration: 8 days
- Priority: Medium
- Assignee: Emily Rodriguez
- Description: Build login, signup, and profile pages
- Dependencies: Backend API Development

### 4. Integration Testing
- Duration: 7 days
- Priority: High
- Assignee: David Park
- Description: E2E testing of authentication flows
- Dependencies: Frontend UI Components`;

const epic2Content = `# Database Migration Project

## Overview
Migrate legacy database to new schema with zero downtime.

## Tasks

### 1. Schema Design
- Duration: 4 days
- Priority: High
- Assignee: Sarah Chen
- Description: Design new database schema with proper indexes and relationships
- Dependencies: None

### 2. Migration Script Development
- Duration: 8 days
- Priority: High
- Assignee: Mike Johnson
- Description: Write migration scripts with rollback capability
- Dependencies: Schema Design

#### 2.1 Data Extraction Scripts
- Duration: 3 days
- Priority: High
- Assignee: Mike Johnson
- Description: Extract data from legacy tables

#### 2.2 Transformation Logic
- Duration: 3 days
- Priority: High
- Assignee: Mike Johnson
- Description: Transform data to match new schema

#### 2.3 Load and Validation
- Duration: 2 days
- Priority: Medium
- Assignee: Mike Johnson
- Description: Load transformed data and validate integrity

### 3. Data Validation & Testing
- Duration: 8 days
- Priority: High
- Assignee: David Park
- Description: Comprehensive validation of migrated data
- Dependencies: Migration Script Development`;

const standaloneContent = `# Standalone Tasks

## Code Review & Documentation
- Duration: 4 days
- Priority: Medium
- Assignee: Emily Rodriguez
- Description: Review all authentication and migration code, update documentation
- Dependencies: Integration Testing, Data Validation & Testing

## Performance Optimization
- Duration: 5 days
- Priority: Low
- Assignee: David Park
- Description: Optimize database queries and API response times
- Dependencies: Code Review & Documentation`;

let createdProjectId = null;

async function createTestProject() {
  const createBtn = document.getElementById('create-btn');
  const resetBtn = document.getElementById('reset-btn');
  const statusContainer = document.getElementById('status-container');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const resultContainer = document.getElementById('result-container');
  const resultContent = document.getElementById('result-content');
  const errorContainer = document.getElementById('error-container');
  const errorMessage = document.getElementById('error-message');

  createBtn.disabled = true;
  createBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creating...';
  statusContainer.style.display = 'none';
  progressContainer.style.display = 'block';
  resultContainer.style.display = 'none';
  errorContainer.style.display = 'none';

  try {
    // Step 1: Create project
    progressBar.style.width = '20%';
    progressText.textContent = 'Step 1/3: Creating project...';

    const projectResponse = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: 'Test Project - Hierarchical Gantt',
        description: 'Test project for Story 4.6 with hierarchical tasks',
        status: 'Active'
      })
    });

    if (!projectResponse.ok) {
      throw new Error(`Failed to create project: ${projectResponse.status}`);
    }

    const project = await projectResponse.json();
    createdProjectId = project.id;
    console.log('✅ Project created:', project);

    // Step 2: Analyze documents
    progressBar.style.width = '50%';
    progressText.textContent = 'Step 2/3: Analyzing documents with AI...';

    const analyzeResponse = await fetch(`/api/projects/${createdProjectId}/analyze-documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        documents: [
          { text: epic1Content, name: 'epic1-user-authentication.md' },
          { text: epic2Content, name: 'epic2-database-migration.md' },
          { text: standaloneContent, name: 'standalone-tasks.md' }
        ],
        options: {
          includeEffort: true,
          projectContext: 'Test project for hierarchical Gantt chart validation'
        }
      })
    });

    if (!analyzeResponse.ok) {
      const error = await analyzeResponse.text();
      throw new Error(`Failed to analyze documents: ${error}`);
    }

    const analysisResult = await analyzeResponse.json();
    console.log('✅ Analysis result:', analysisResult);

    // Step 3: Verify hierarchy
    progressBar.style.width = '80%';
    progressText.textContent = 'Step 3/3: Verifying hierarchy...';

    const hierarchyResponse = await fetch(`/api/projects/${createdProjectId}/hierarchy`, {
      credentials: 'include'
    });

    if (!hierarchyResponse.ok) {
      throw new Error('Failed to fetch hierarchy');
    }

    const hierarchyData = await hierarchyResponse.json();

    // Analyze hierarchy
    const epics = hierarchyData.filter(item => item.is_epic && !item.parent_issue_id);
    const tasks = hierarchyData.filter(item => item.parent_issue_id && !hierarchyData.some(h => h.parent_issue_id === item.item_id));
    const subtasks = hierarchyData.filter(item => {
      if (!item.parent_issue_id) return false;
      const parent = hierarchyData.find(h => h.item_id === item.parent_issue_id);
      return parent && parent.parent_issue_id;
    });
    const standalone = hierarchyData.filter(item => !item.is_epic && !item.parent_issue_id);

    progressBar.style.width = '100%';
    progressText.textContent = 'Complete!';

    // Display results
    resultContent.innerHTML = `
      <div class="space-y-4">
        <div>
          <h3 class="font-bold text-lg mb-2">Project Details</h3>
          <p class="text-sm"><strong>ID:</strong> ${createdProjectId}</p>
          <p class="text-sm"><strong>Name:</strong> ${project.name}</p>
        </div>

        <div>
          <h3 class="font-bold text-lg mb-2">Hierarchy Statistics</h3>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="bg-white p-3 rounded border">
              <div class="text-2xl font-bold text-indigo-600">${hierarchyData.length}</div>
              <div class="text-gray-600">Total Issues</div>
            </div>
            <div class="bg-white p-3 rounded border">
              <div class="text-2xl font-bold text-purple-600">${epics.length}</div>
              <div class="text-gray-600">Epics</div>
            </div>
            <div class="bg-white p-3 rounded border">
              <div class="text-2xl font-bold text-blue-600">${tasks.length}</div>
              <div class="text-gray-600">Tasks</div>
            </div>
            <div class="bg-white p-3 rounded border">
              <div class="text-2xl font-bold text-green-600">${subtasks.length}</div>
              <div class="text-gray-600">Subtasks</div>
            </div>
          </div>
        </div>

        <div>
          <h3 class="font-bold text-lg mb-2">Hierarchy Tree</h3>
          <div class="bg-white p-4 rounded border text-sm font-mono overflow-x-auto whitespace-pre-wrap">
${epics.map(epic => {
  const epicTasks = hierarchyData.filter(t => t.parent_issue_id === epic.item_id);
  let epicStr = `📁 EPIC: ${epic.title} (${epic.ai_effort_estimate_hours || 0}h)`;
  
  epicTasks.forEach((task, taskIdx) => {
    const taskSubtasks = hierarchyData.filter(st => st.parent_issue_id === task.item_id);
    const isLastTask = taskIdx === epicTasks.length - 1;
    const taskPrefix = isLastTask ? '└─' : '├─';
    const childPrefix = isLastTask ? '   ' : '│  ';
    
    epicStr += `\n  ${taskPrefix} 📋 ${task.title} (${task.ai_effort_estimate_hours || 0}h)`;
    
    if (taskSubtasks.length > 0) {
      taskSubtasks.forEach((subtask, stIdx) => {
        const isLastSubtask = stIdx === taskSubtasks.length - 1;
        const subtaskPrefix = isLastSubtask ? '└─' : '├─';
        epicStr += `\n  ${childPrefix}  ${subtaskPrefix} 📌 ${subtask.title} (${subtask.ai_effort_estimate_hours || 0}h)`;
      });
    }
  });
  
  return epicStr;
}).join('\n\n')}
${standalone.length > 0 ? '\n\n⭐ STANDALONE TASKS:' + standalone.map((t, i) => `\n  ${i === standalone.length - 1 ? '└─' : '├─'} 📋 ${t.title} (${t.ai_effort_estimate_hours || 0}h)`).join('') : ''}
          </div>
        </div>

        <div>
          <h3 class="font-bold text-lg mb-2">AI Analysis Cost</h3>
          <p class="text-sm">$${analysisResult.aiCost?.toFixed(4) || 'N/A'}</p>
        </div>

        <div class="flex gap-3 mt-4">
          <a href="/dashboard.html?projectId=${createdProjectId}" target="_blank" class="btn-primary">
            <i class="fas fa-external-link-alt mr-2"></i>
            Open Dashboard
          </a>
          <a href="/schedules.html?projectId=${createdProjectId}" target="_blank" class="btn-secondary">
            <i class="fas fa-chart-gantt mr-2"></i>
            Open Gantt Chart
          </a>
        </div>
      </div>
    `;

    progressContainer.style.display = 'none';
    resultContainer.style.display = 'block';
    resetBtn.style.display = 'inline-block';
    createBtn.style.display = 'none';

  } catch (error) {
    console.error('Error:', error);
    progressContainer.style.display = 'none';
    errorContainer.style.display = 'block';
    errorMessage.textContent = error.message;
    createBtn.disabled = false;
    createBtn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Create Test Project';
  }
}

function reset() {
  location.reload();
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('create-btn').addEventListener('click', createTestProject);
  document.getElementById('reset-btn').addEventListener('click', reset);
});
