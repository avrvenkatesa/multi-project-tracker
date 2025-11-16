/**
 * Test Page for Kanban Card Component
 * Story 4.5 - Hierarchical Kanban Enhancement
 */

// Card Registry for expand/collapse management
const cardRegistry = new Map();
let consoleEntryCount = 0;

// Console logging function
function logToConsole(message, type = 'info') {
  const consoleOutput = document.getElementById('console-output');
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  logEntry.innerHTML = `
    <span class="timestamp">[${timestamp}]</span>
    <span class="log-${type}">${message}</span>
  `;
  consoleOutput.appendChild(logEntry);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
  consoleEntryCount++;
  
  // Also log to browser console
  console.log(`[Test Page] ${message}`);
}

// Sample Data
const sampleData = {
  // Test Case 1: Epic with Progress
  epicWithProgress: {
    id: 1,
    title: 'Discovery Phase Epic',
    is_epic: true,
    status: 'In Progress',
    priority: 'High',
    effort_hours: 40,
    assignee: 'John Doe',
    parent_issue_id: null,
    hierarchy_level: 0,
    children: [
      {
        id: 2,
        title: 'Backup Validation',
        is_epic: false,
        status: 'Done',
        priority: 'High',
        effort_hours: 8,
        assignee: 'Alice Smith',
        parent_issue_id: 1,
        hierarchy_level: 1,
        children: []
      },
      {
        id: 3,
        title: 'NTDS Extraction',
        is_epic: false,
        status: 'In Progress',
        priority: 'Medium',
        effort_hours: 16,
        assignee: 'Bob Johnson',
        parent_issue_id: 1,
        hierarchy_level: 1,
        children: []
      },
      {
        id: 4,
        title: 'Initial Assessment',
        is_epic: false,
        status: 'Done',
        priority: 'High',
        effort_hours: 16,
        assignee: 'Carol Williams',
        parent_issue_id: 1,
        hierarchy_level: 1,
        children: []
      }
    ]
  },

  // Test Case 2: Deep Nesting
  deepNesting: {
    id: 10,
    title: 'Infrastructure Modernization',
    is_epic: true,
    status: 'In Progress',
    priority: 'Critical',
    effort_hours: 120,
    assignee: 'Tech Lead',
    parent_issue_id: null,
    hierarchy_level: 0,
    children: [
      {
        id: 11,
        title: 'Database Migration',
        is_epic: false,
        status: 'In Progress',
        priority: 'High',
        effort_hours: 40,
        assignee: 'Database Admin',
        parent_issue_id: 10,
        hierarchy_level: 1,
        children: [
          {
            id: 12,
            title: 'Schema Design',
            is_epic: false,
            status: 'Done',
            priority: 'High',
            effort_hours: 16,
            assignee: 'Senior Dev',
            parent_issue_id: 11,
            hierarchy_level: 2,
            children: []
          },
          {
            id: 13,
            title: 'Data Migration Script',
            is_epic: false,
            status: 'In Progress',
            priority: 'Medium',
            effort_hours: 24,
            assignee: 'Junior Dev',
            parent_issue_id: 11,
            hierarchy_level: 2,
            children: []
          }
        ]
      }
    ]
  },

  // Test Case 3: Multiple Epics
  epic1: {
    id: 20,
    title: 'Frontend Modernization',
    is_epic: true,
    status: 'In Progress',
    priority: 'High',
    effort_hours: 80,
    assignee: 'Sarah Chen',
    parent_issue_id: null,
    hierarchy_level: 0,
    children: [
      {
        id: 21,
        title: 'UI Redesign',
        is_epic: false,
        status: 'In Progress',
        priority: 'High',
        effort_hours: 40,
        assignee: 'Designer',
        parent_issue_id: 20,
        hierarchy_level: 1,
        children: []
      },
      {
        id: 22,
        title: 'Component Library',
        is_epic: false,
        status: 'To Do',
        priority: 'Medium',
        effort_hours: 40,
        assignee: 'Frontend Dev',
        parent_issue_id: 20,
        hierarchy_level: 1,
        children: []
      }
    ]
  },

  epic2: {
    id: 30,
    title: 'API Integration',
    is_epic: true,
    status: 'To Do',
    priority: 'Medium',
    effort_hours: 60,
    assignee: 'Mike Johnson',
    parent_issue_id: null,
    hierarchy_level: 0,
    children: [
      {
        id: 31,
        title: 'REST Endpoints',
        is_epic: false,
        status: 'To Do',
        priority: 'Medium',
        effort_hours: 30,
        assignee: 'Backend Dev',
        parent_issue_id: 30,
        hierarchy_level: 1,
        children: []
      },
      {
        id: 32,
        title: 'GraphQL Schema',
        is_epic: false,
        status: 'To Do',
        priority: 'Low',
        effort_hours: 30,
        assignee: 'Backend Dev',
        parent_issue_id: 30,
        hierarchy_level: 1,
        children: []
      }
    ]
  },

  // Test Case 4: Edge Cases
  edgeCases: [
    {
      id: 40,
      title: 'Task without Assignee',
      is_epic: false,
      status: 'To Do',
      priority: 'Medium',
      effort_hours: 8,
      assignee: null,
      parent_issue_id: null,
      hierarchy_level: 0,
      children: []
    },
    {
      id: 41,
      title: 'Task without Effort',
      is_epic: false,
      status: 'In Progress',
      priority: 'High',
      effort_hours: null,
      assignee: 'Developer',
      parent_issue_id: null,
      hierarchy_level: 0,
      children: []
    },
    {
      id: 42,
      title: 'Epic without Children',
      is_epic: true,
      status: 'To Do',
      priority: 'Low',
      effort_hours: 0,
      assignee: 'Project Manager',
      parent_issue_id: null,
      hierarchy_level: 0,
      children: []
    }
  ],

  // Test Case 5: All Priorities
  priorities: [
    {
      id: 50,
      title: 'Critical Priority Task',
      is_epic: false,
      status: 'In Progress',
      priority: 'Critical',
      effort_hours: 16,
      assignee: 'On-Call Dev',
      parent_issue_id: null,
      hierarchy_level: 0,
      children: []
    },
    {
      id: 51,
      title: 'High Priority Task',
      is_epic: false,
      status: 'To Do',
      priority: 'High',
      effort_hours: 12,
      assignee: 'Senior Dev',
      parent_issue_id: null,
      hierarchy_level: 0,
      children: []
    },
    {
      id: 52,
      title: 'Medium Priority Task',
      is_epic: false,
      status: 'In Progress',
      priority: 'Medium',
      effort_hours: 8,
      assignee: 'Mid Dev',
      parent_issue_id: null,
      hierarchy_level: 0,
      children: []
    },
    {
      id: 53,
      title: 'Low Priority Task',
      is_epic: false,
      status: 'To Do',
      priority: 'Low',
      effort_hours: 4,
      assignee: 'Junior Dev',
      parent_issue_id: null,
      hierarchy_level: 0,
      children: []
    }
  ]
};

// Render card and register it
function renderCard(issue, containerId) {
  const card = new KanbanCard(issue, {
    showChildren: true,
    indentLevel: 0,
    onExpand: (issue) => {
      logToConsole(`Expanded: ${issue.title}`, 'success');
      updateStats();
    },
    onCollapse: (issue) => {
      logToConsole(`Collapsed: ${issue.title}`, 'warning');
      updateStats();
    }
  });

  cardRegistry.set(issue.id, card);
  
  // Also register children
  if (issue.children && issue.children.length > 0) {
    registerChildren(issue.children);
  }

  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML += card.render();
  }

  return card;
}

function registerChildren(children) {
  children.forEach(child => {
    const card = new KanbanCard(child);
    cardRegistry.set(child.id, card);
    if (child.children && child.children.length > 0) {
      registerChildren(child.children);
    }
  });
}

// Update statistics
function updateStats() {
  let totalCards = 0;
  let epicCount = 0;
  let taskCount = 0;
  let expandedCount = 0;

  cardRegistry.forEach((card, id) => {
    totalCards++;
    if (card.issue.is_epic) {
      epicCount++;
    } else {
      taskCount++;
    }
    if (card.expanded) {
      expandedCount++;
    }
  });

  document.getElementById('total-cards').textContent = totalCards;
  document.getElementById('epic-count').textContent = epicCount;
  document.getElementById('task-count').textContent = taskCount;
  document.getElementById('expanded-count').textContent = expandedCount;
}

// Initialize test cases
function initializeTests() {
  logToConsole('Initializing Kanban Card tests...', 'info');

  // Test Case 1
  renderCard(sampleData.epicWithProgress, 'test-epic-progress');
  logToConsole('Test Case 1: Epic with progress bar rendered', 'success');

  // Test Case 2
  renderCard(sampleData.deepNesting, 'test-deep-nesting');
  logToConsole('Test Case 2: Deep nesting (3 levels) rendered', 'success');

  // Test Case 3
  renderCard(sampleData.epic1, 'test-multiple-epics-1');
  renderCard(sampleData.epic2, 'test-multiple-epics-2');
  logToConsole('Test Case 3: Multiple epics rendered', 'success');

  // Test Case 4
  sampleData.edgeCases.forEach(issue => {
    renderCard(issue, 'test-edge-cases');
  });
  logToConsole('Test Case 4: Edge cases rendered', 'success');

  // Test Case 5
  sampleData.priorities.forEach(issue => {
    renderCard(issue, 'test-priorities');
  });
  logToConsole('Test Case 5: Priority badges rendered', 'success');

  updateStats();
  logToConsole(`Total cards created: ${cardRegistry.size}`, 'info');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  logToConsole('DOM loaded. Starting tests...', 'info');
  initializeTests();
});

// Listen for toggle events
document.addEventListener('kanban-card-toggle', (e) => {
  const card = cardRegistry.get(e.detail.issueId);
  if (card) {
    card.toggle();
    
    // Re-render the specific container
    const containers = ['test-epic-progress', 'test-deep-nesting', 'test-multiple-epics-1', 'test-multiple-epics-2'];
    containers.forEach(containerId => {
      const container = document.getElementById(containerId);
      if (container && container.querySelector(`[data-issue-id="${e.detail.issueId}"]`)) {
        // Find the root issue for this container and re-render
        cardRegistry.forEach((c, id) => {
          if (c.issue.parent_issue_id === null && container.innerHTML.includes(`data-issue-id="${id}"`)) {
            container.innerHTML = '';
            renderCard(c.issue, containerId);
          }
        });
      }
    });
  }
});

// Control buttons
document.getElementById('expand-all-btn').addEventListener('click', () => {
  logToConsole('Expanding all cards...', 'info');
  cardRegistry.forEach(card => {
    if (!card.expanded && card.issue.children && card.issue.children.length > 0) {
      card.toggle();
    }
  });
  
  // Re-render all
  document.querySelectorAll('.kanban-column').forEach(col => {
    col.innerHTML = '';
  });
  initializeTests();
  
  logToConsole('All cards expanded', 'success');
});

document.getElementById('collapse-all-btn').addEventListener('click', () => {
  logToConsole('Collapsing all cards...', 'info');
  cardRegistry.forEach(card => {
    if (card.expanded) {
      card.toggle();
    }
  });
  
  // Re-render all
  document.querySelectorAll('.kanban-column').forEach(col => {
    col.innerHTML = '';
  });
  initializeTests();
  
  logToConsole('All cards collapsed', 'success');
});

document.getElementById('refresh-btn').addEventListener('click', () => {
  logToConsole('Refreshing cards...', 'info');
  cardRegistry.clear();
  document.querySelectorAll('.kanban-column').forEach(col => {
    col.innerHTML = '';
  });
  initializeTests();
  logToConsole('Cards refreshed successfully', 'success');
});

document.getElementById('clear-console-btn').addEventListener('click', () => {
  const consoleOutput = document.getElementById('console-output');
  consoleOutput.innerHTML = `
    <div class="log-entry">
      <span class="timestamp">[${new Date().toLocaleTimeString()}]</span>
      <span class="log-info">Console cleared.</span>
    </div>
  `;
  console.clear();
});
