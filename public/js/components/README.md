# KanbanCard Component

A reusable hierarchical Kanban card component for displaying issues with parent-child relationships, expandable/collapsible children, and visual hierarchy indicators.

## 📁 Files

- **`KanbanCard.js`** - Main component class (231 lines)
- **`kanban-hierarchy.css`** - Styling for hierarchical cards (277 lines)
- **`KanbanCard.demo.html`** - Demo page with usage examples

## 🚀 Quick Start

### 1. Include Dependencies

```html
<!-- Font Awesome for icons -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

<!-- Kanban Hierarchy CSS -->
<link rel="stylesheet" href="/css/kanban-hierarchy.css">

<!-- KanbanCard Component -->
<script src="/js/components/KanbanCard.js"></script>
```

### 2. Create an Issue Object

```javascript
const issue = {
  id: 101,
  title: 'Phase 1: Frontend Modernization',
  description: 'Modernize the frontend architecture',
  status: 'In Progress',
  priority: 'High',              // Critical, High, Medium, Low
  parent_issue_id: null,         // null for top-level issues
  hierarchy_level: 0,
  is_epic: true,                 // true for epics
  effort_hours: 120,
  assignee: 'Sarah Chen',
  children: [                     // Array of child issues
    {
      id: 102,
      title: 'User Interface Redesign',
      status: 'In Progress',
      priority: 'High',
      parent_issue_id: 101,
      hierarchy_level: 1,
      is_epic: false,
      effort_hours: 40,
      assignee: 'Mike Johnson',
      children: []
    }
    // More children...
  ]
};
```

### 3. Render the Card

```javascript
// Create card instance
const card = new KanbanCard(issue, {
  showChildren: true,
  indentLevel: 0,
  onExpand: (issue) => console.log('Expanded:', issue.title),
  onCollapse: (issue) => console.log('Collapsed:', issue.title)
});

// Render to HTML
const html = card.render();
document.getElementById('kanban-column').innerHTML = html;

// Store card reference for toggle functionality
cardRegistry.set(issue.id, card);
```

### 4. Handle Toggle Events

```javascript
// Create a card registry
const cardRegistry = new Map();

// Listen for toggle events
document.addEventListener('kanban-card-toggle', (e) => {
  const issueId = e.detail.issueId;
  const card = cardRegistry.get(issueId);
  if (card) {
    card.toggle();
  }
});
```

## 📖 API Reference

### Constructor

```javascript
new KanbanCard(issue, options)
```

#### Parameters

**`issue`** (Object) - Issue data with the following properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | number | Yes | Unique issue ID |
| `title` | string | Yes | Issue title |
| `description` | string | No | Issue description |
| `status` | string | Yes | Issue status (To Do, In Progress, Blocked, Done) |
| `priority` | string | Yes | Priority level (Critical, High, Medium, Low) |
| `parent_issue_id` | number | No | Parent issue ID (null for top-level) |
| `hierarchy_level` | number | Yes | Hierarchy depth level |
| `is_epic` | boolean | Yes | Whether this is an epic issue |
| `effort_hours` | number | No | Estimated effort in hours |
| `assignee` | string | No | Assigned user name |
| `children` | Array | Yes | Array of child issues |

**`options`** (Object) - Configuration options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `showChildren` | boolean | `true` | Whether to show children |
| `indentLevel` | number | `0` | Indentation level (0-based) |
| `onExpand` | Function | `null` | Callback when card is expanded |
| `onCollapse` | Function | `null` | Callback when card is collapsed |

### Methods

#### `render()`

Renders the card and returns HTML string.

```javascript
const html = card.render();
```

**Returns:** `string` - HTML markup

#### `toggle()`

Toggles the expanded/collapsed state of the card.

```javascript
card.toggle();
```

**Returns:** `void`

#### `renderChildren()`

Recursively renders child cards.

```javascript
const childrenHtml = card.renderChildren();
```

**Returns:** `string` - HTML markup of children

#### `calculateChildProgress()`

Calculates completion percentage from children.

```javascript
const percentage = card.calculateChildProgress();
```

**Returns:** `number` - Percentage (0-100)

#### `escapeHtml(text)`

Escapes HTML to prevent XSS attacks.

```javascript
const safe = card.escapeHtml('<script>alert("xss")</script>');
```

**Returns:** `string` - Sanitized text

## 🎨 Visual Features

### Epic Badge
- Purple gradient badge for epic issues
- Automatically shown when `is_epic: true`

### Progress Bar
- Shows completion percentage for epics
- Calculates based on child issue statuses
- Format: "X% Complete (Y/Z tasks)"

### Expand/Collapse Button
- Chevron icon (right/down)
- Only shown for issues with children
- Toggles children visibility

### Indentation
- 16px per hierarchy level
- Visual connector lines for nested children
- Supports up to 5 levels of nesting

### Priority Badges
- **Critical** - Red
- **High** - Orange
- **Medium** - Blue
- **Low** - Green

## 🎯 Usage Examples

### Example 1: Simple Epic with Children

```javascript
const epic = {
  id: 1,
  title: 'Build E-commerce Platform',
  is_epic: true,
  priority: 'Critical',
  assignee: 'Project Manager',
  effort_hours: 200,
  children: [
    {
      id: 2,
      title: 'Product Catalog',
      is_epic: false,
      priority: 'High',
      assignee: 'Developer 1',
      effort_hours: 80,
      children: []
    },
    {
      id: 3,
      title: 'Shopping Cart',
      is_epic: false,
      priority: 'High',
      assignee: 'Developer 2',
      effort_hours: 60,
      children: []
    }
  ]
};

const card = new KanbanCard(epic);
document.getElementById('column').innerHTML = card.render();
```

### Example 2: Nested Hierarchy (3 Levels)

```javascript
const deepEpic = {
  id: 1,
  title: 'Epic',
  is_epic: true,
  children: [
    {
      id: 2,
      title: 'Task Level 1',
      children: [
        {
          id: 3,
          title: 'Subtask Level 2',
          children: []
        }
      ]
    }
  ]
};
```

### Example 3: Expand/Collapse All

```javascript
// Expand all cards
cardRegistry.forEach(card => {
  if (!card.expanded && card.issue.children?.length > 0) {
    card.toggle();
  }
});

// Collapse all cards
cardRegistry.forEach(card => {
  if (card.expanded) {
    card.toggle();
  }
});
```

## 🔧 Integration with Existing Kanban

### Step 1: Update Data Fetching

Modify your API endpoint to include hierarchy data:

```javascript
const response = await fetch(`/api/projects/${projectId}/issues?includeChildren=true`);
const issues = await response.json();
```

### Step 2: Build Issue Tree

```javascript
function buildIssueTree(flatIssues) {
  const issueMap = new Map();
  const roots = [];

  // First pass: create map
  flatIssues.forEach(issue => {
    issueMap.set(issue.id, { ...issue, children: [] });
  });

  // Second pass: build tree
  flatIssues.forEach(issue => {
    const node = issueMap.get(issue.id);
    if (issue.parent_issue_id) {
      const parent = issueMap.get(issue.parent_issue_id);
      if (parent) {
        parent.children.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  return roots;
}
```

### Step 3: Render with KanbanCard

```javascript
const rootIssues = buildIssueTree(issues);
const cardRegistry = new Map();

const html = rootIssues.map(issue => {
  const card = new KanbanCard(issue);
  cardRegistry.set(issue.id, card);
  return card.render();
}).join('');

document.getElementById('kanban-column').innerHTML = html;
```

## 🎨 Customization

### Custom Styling

Override CSS variables in your stylesheet:

```css
/* Custom epic color */
.kanban-card-epic {
  border-left-color: #10b981;
  background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
}

/* Custom progress bar color */
.progress-bar-fill {
  background: linear-gradient(90deg, #10b981 0%, #059669 100%);
}

/* Custom indentation */
.kanban-card-children .kanban-card {
  margin-left: 24px; /* Instead of 16px */
}
```

### Custom Icons

Replace Font Awesome with custom SVG icons:

```javascript
// Modify the render() method
const expandIcon = this.expanded 
  ? '<svg>...</svg>'  // Custom collapse icon
  : '<svg>...</svg>'; // Custom expand icon
```

## 🧪 Testing

View the demo page:

```bash
# Open in browser
http://localhost:5000/js/components/KanbanCard.demo.html
```

The demo includes:
1. Epic with 3 child tasks
2. Multiple epics with various states
3. Deeply nested hierarchy (3 levels)

## 📝 Notes

- **XSS Protection**: All text content is escaped via `escapeHtml()`
- **Performance**: Efficient recursive rendering with minimal DOM manipulation
- **Accessibility**: Includes ARIA labels and keyboard navigation support
- **Responsive**: Mobile-friendly with responsive font sizes
- **Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge)

## 🐛 Troubleshooting

### Children not expanding

Ensure you're maintaining a card registry and listening for toggle events:

```javascript
const cardRegistry = new Map();
document.addEventListener('kanban-card-toggle', (e) => {
  const card = cardRegistry.get(e.detail.issueId);
  if (card) card.toggle();
});
```

### Progress bar not showing

Ensure the issue has `is_epic: true` and `children` array with at least one child.

### Styling not applied

Include the CSS file before the JavaScript:

```html
<link rel="stylesheet" href="/css/kanban-hierarchy.css">
<script src="/js/components/KanbanCard.js"></script>
```

## 📄 License

Part of the Multi-Project Tracker application.
