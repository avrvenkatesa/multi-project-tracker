# HierarchicalGanttEnhancer Usage Guide

## Overview

The `HierarchicalGanttEnhancer` is a wrapper component that adds hierarchical visualization features to Frappe Gantt charts. It enhances existing Gantt instances with epic badges, expand/collapse controls, tree lines, and visual indentation markers.

## Installation

Include the component and CSS in your HTML:

```html
<!-- Frappe Gantt (required dependency) -->
<script src="https://cdn.jsdelivr.net/npm/frappe-gantt@0.6.1/dist/frappe-gantt.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/frappe-gantt@0.6.1/dist/frappe-gantt.min.css">

<!-- HierarchicalGanttEnhancer -->
<script src="/js/components/HierarchicalGanttEnhancer.js"></script>
<link rel="stylesheet" href="/css/gantt-hierarchy.css">
```

## Basic Usage

### Step 1: Create Frappe Gantt Instance

```javascript
const container = document.getElementById('gantt-container');

const tasks = [
  {
    id: 'issue-1',
    name: 'Epic: User Authentication',
    start: '2025-01-15',
    end: '2025-01-30',
    progress: 40,
    item_type: 'issue',
    item_id: 1,
    parent_issue_id: null
  },
  {
    id: 'issue-2',
    name: 'Task: Login Form',
    start: '2025-01-15',
    end: '2025-01-20',
    progress: 100,
    item_type: 'issue',
    item_id: 2,
    parent_issue_id: 1
  },
  {
    id: 'issue-3',
    name: 'Task: Password Reset',
    start: '2025-01-21',
    end: '2025-01-30',
    progress: 0,
    item_type: 'issue',
    item_id: 3,
    parent_issue_id: 1
  }
];

const gantt = new Gantt(container, tasks, {
  view_mode: 'Day',
  bar_height: 30,
  padding: 18
});
```

### Step 2: Enhance with Hierarchy

```javascript
// Create enhancer instance
const enhancer = new HierarchicalGanttEnhancer(gantt, {
  showEpicBadges: true,
  showTreeLines: true,
  indentWidth: 20,
  allowCollapse: true
});

// Apply hierarchy enhancements
const enhancedTasks = enhancer.enhance(tasks);

// Refresh Gantt with filtered tasks
gantt.refresh(enhancedTasks);
```

## Configuration Options

### Constructor Options

```javascript
const enhancer = new HierarchicalGanttEnhancer(ganttInstance, {
  // Show "EPIC" badges on parent tasks (default: true)
  showEpicBadges: true,
  
  // Show visual tree lines connecting parent-child tasks (default: true)
  showTreeLines: true,
  
  // Pixel width for indentation per hierarchy level (default: 20)
  indentWidth: 20,
  
  // Allow expand/collapse of parent tasks (default: true)
  allowCollapse: true,
  
  // Optional callback when expand/collapse is toggled
  onToggle: (taskId, isExpanded) => {
    console.log(`Task ${taskId} is now ${isExpanded ? 'expanded' : 'collapsed'}`);
  }
});
```

## API Methods

### enhance(tasks)

Main method to add hierarchy features. Builds tree structure, adds visual elements, and returns filtered task array.

```javascript
const enhancedTasks = enhancer.enhance(tasks);
gantt.refresh(enhancedTasks);
```

### expandAll()

Expand all parent tasks to show all children.

```javascript
enhancer.expandAll();
const enhancedTasks = enhancer.enhance(tasks);
gantt.refresh(enhancedTasks);
```

### collapseAll()

Collapse all parent tasks to hide children.

```javascript
enhancer.collapseAll();
const enhancedTasks = enhancer.enhance(tasks);
gantt.refresh(enhancedTasks);
```

### toggleExpand(taskId)

Toggle expand/collapse state for a specific task.

```javascript
enhancer.toggleExpand('issue-1');
const enhancedTasks = enhancer.enhance(tasks);
gantt.refresh(enhancedTasks);
```

### destroy()

Remove all hierarchy enhancements from the Gantt chart.

```javascript
enhancer.destroy();
```

## Task Data Structure

Each task object should include hierarchy information:

```javascript
{
  id: 'issue-123',              // Unique identifier (format: 'type-id')
  name: 'Task Title',            // Display name
  start: '2025-01-15',           // Start date (YYYY-MM-DD)
  end: '2025-01-20',             // End date (YYYY-MM-DD)
  progress: 50,                  // Progress percentage (0-100)
  item_type: 'issue',            // Item type ('issue' or 'action-item')
  item_id: 123,                  // Numeric ID
  parent_issue_id: 122           // Parent issue ID (null for root tasks)
}
```

## Visual Features

### Epic Badges

Parent tasks (epics) automatically receive a purple "EPIC" badge:

- **Color**: Indigo (#6366f1)
- **Position**: Left side of task bar
- **Size**: Adjusts based on compact view mode

### Expand/Collapse Buttons

Tasks with children get clickable expand/collapse buttons:

- **Icon**: Chevron (down = expanded, right = collapsed)
- **Color**: Indigo outline with white background
- **Behavior**: Click to toggle, updates automatically

### Tree Lines

Visual hierarchy connections between parent and child tasks:

- **Style**: Dashed lines
- **Color**: Uses `--gantt-border` CSS variable
- **Opacity**: 60% (brightens on hover)

### Indentation

Child tasks are visually connected to parents with indentation markers:

- **Width**: Configurable (default 20px per level)
- **Max Depth**: Unlimited
- **Lines**: Horizontal connector to task bar

## State Persistence

Expand/collapse state is automatically saved to localStorage:

```javascript
// State is saved under key: 'gantt-hierarchy-state'
// Format: { expanded: ['issue-1', 'issue-2', ...] }

// Clear saved state
localStorage.removeItem('gantt-hierarchy-state');

// Default behavior: All tasks expanded on first load
```

## Integration with Existing Features

### Swim Lanes

The enhancer works seamlessly with existing swim lanes (assignee grouping):

```javascript
// Swim lanes are preserved - no conflicts
const { sortedTasks, metadata } = sortTasksByAssignee(tasks);
const enhancedTasks = enhancer.enhance(sortedTasks);
```

### Dependency Highlighting

Dependency highlighting is preserved and works with hierarchy:

```javascript
// Dependencies remain functional
// Parent/child relationships don't affect dependency arrows
buildDependencyHighlighting(tasks, container);
```

### Compact View

The enhancer automatically adapts to compact view mode:

```javascript
// Badges and buttons scale down in compact mode
// Detected via .gantt-expanded class on container
```

### Critical Path

Critical path highlighting works with hierarchical tasks:

```javascript
// Add custom_class to tasks
{
  id: 'issue-1',
  custom_class: 'bar-critical',
  // ... other properties
}
```

## Complete Integration Example

```javascript
// Full integration with existing schedules.js pattern
function renderGanttChartWithHierarchy(tasks, schedule) {
  const { sortedTasks, metadata } = sortTasksByAssignee(tasks);
  
  const ganttContainer = document.getElementById('gantt-container');
  ganttContainer.innerHTML = '';
  
  const ganttTasks = sortedTasks.map(task => ({
    id: `${task.item_type}-${task.item_id}`,
    name: task.title,
    start: task.scheduled_start,
    end: task.scheduled_end,
    progress: task.status === 'Done' ? 100 : task.status === 'In Progress' ? 50 : 0,
    dependencies: task.dependencies?.map(d => `${d.item_type}-${d.item_id}`).join(',') || '',
    custom_class: task.is_critical_path ? 'bar-critical' : '',
    item_type: task.item_type,
    item_id: task.item_id,
    parent_issue_id: task.parent_issue_id
  }));
  
  const gantt = new Gantt(ganttContainer, ganttTasks, {
    view_mode: 'Day',
    bar_height: 30,
    padding: 18,
    custom_popup_html: function(task) {
      return `<div>${task.name}</div>`;
    }
  });
  
  // Add hierarchy enhancements
  const enhancer = new HierarchicalGanttEnhancer(gantt, {
    showEpicBadges: true,
    showTreeLines: true,
    allowCollapse: true
  });
  
  setTimeout(() => {
    const enhancedTasks = enhancer.enhance(ganttTasks);
    gantt.refresh(enhancedTasks);
    
    // Add swim lanes
    if (metadata.length > 1) {
      buildSwimLanes(metadata, ganttContainer, false);
    }
    
    // Add dependency highlighting
    buildDependencyHighlighting(sortedTasks, ganttContainer);
  }, 100);
  
  window.currentGanttInstance = gantt;
  window.currentGanttEnhancer = enhancer;
}
```

## Styling Customization

Override CSS variables to customize appearance:

```css
/* Custom epic badge color */
.epic-badge-group rect {
  fill: #8b5cf6 !important;
}

/* Custom tree line color */
.tree-line-group line {
  stroke: #3b82f6 !important;
  stroke-width: 2;
}

/* Custom expand/collapse button */
.expand-collapse-group circle {
  stroke: #10b981 !important;
}
```

## Browser Compatibility

- **Modern Browsers**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- **Features Used**: SVG, localStorage, ES6 classes, Set
- **Fallback**: Gracefully degrades if localStorage unavailable

## Performance Considerations

- **Task Limit**: Tested with up to 500 tasks
- **Re-render**: Use `gantt.refresh()` instead of recreating instance
- **Debouncing**: Consider debouncing expand/collapse actions for large datasets
- **Memory**: State cleared on `destroy()`

## Troubleshooting

### Epic badges not showing

```javascript
// Ensure tasks have children
console.log(tasks.filter(t => t.item_id === parentId).length);

// Check setTimeout delay
setTimeout(() => enhancer.enhance(tasks), 200); // Increase delay
```

### Tree lines misaligned

```javascript
// Ensure parent bars are visible before calculating positions
// Re-enhance after Gantt re-renders
gantt.refresh(tasks);
setTimeout(() => enhancer.enhance(tasks), 150);
```

### State not persisting

```javascript
// Check localStorage availability
if (typeof localStorage === 'undefined') {
  console.warn('localStorage not available');
}

// Clear corrupted state
localStorage.removeItem('gantt-hierarchy-state');
```

## Advanced Usage

### Custom Expand/Collapse Controls

```javascript
// Add global controls
document.getElementById('expand-all').addEventListener('click', () => {
  enhancer.expandAll();
  const enhancedTasks = enhancer.enhance(tasks);
  gantt.refresh(enhancedTasks);
});

document.getElementById('collapse-all').addEventListener('click', () => {
  enhancer.collapseAll();
  const enhancedTasks = enhancer.enhance(tasks);
  gantt.refresh(enhancedTasks);
});
```

### Programmatic Hierarchy Manipulation

```javascript
// Filter to show only specific hierarchy branch
const rootTask = tasks.find(t => t.id === 'issue-1');
const branch = enhancer.buildHierarchyTree([rootTask, ...getAllDescendants(rootTask)]);
const visibleTasks = enhancer.getVisibleTasks(branch);
gantt.refresh(visibleTasks);
```

## License

Part of Multi-Project Tracker - MIT License
