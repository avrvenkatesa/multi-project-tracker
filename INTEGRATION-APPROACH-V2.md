# Kanban Hierarchy Integration - Revised Approach

## Problem
The KanbanCard component is too minimal and missing:
- data-item-id, data-item-type attributes
- draggable="true"
- All metadata badges (checklist, tags, due date, etc.)
- Action buttons (quick log)
- Existing CSS styling

## Solution: Enhance Existing Template
Instead of replacing the card rendering, enhance the existing inline template to support hierarchy:

### 1. Keep the Existing Card Markup
- Preserve all data attributes (data-item-id, data-item-type)
- Keep all metadata badges and buttons
- Maintain all CSS classes and styling

### 2. Add Hierarchy Features
- Add chevron button for epics with children
- Add indentation based on hierarchy_level
- Add epic badge
- Add children container
- Add progress bar for epics

### 3. Render Root Items Only
- Filter to root items (parent_issue_id === null)
- Recursively render children within parent cards
- Children use the same template with +1 indentation

### 4. Event Handlers
- Handle chevron clicks for expand/collapse
- Save state to localStorage
- Preserve existing drag-and-drop, modal, checkbox handlers

## Implementation
1. Modify the existing card template to add hierarchy features
2. Create a recursive rendering function
3. Add state management for expand/collapse
4. Test with real data
