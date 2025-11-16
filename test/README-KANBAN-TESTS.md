# KanbanCard Component Test Suite

## Overview

Comprehensive automated test suite for the `KanbanCard` component, covering all functionality including initialization, rendering, hierarchy, expand/collapse, progress calculation, and edge cases.

## Test Framework

- **Custom Test Runner**: Lightweight custom test runner built for Node.js
- **DOM Mocking**: Minimal DOM API mocking for testing browser components in Node.js
- **Zero Dependencies**: No external testing frameworks required
- **Output Format**: Clear pass/fail indicators with detailed error reporting

## Running Tests

```bash
# Run all tests
node test/test-kanban-component.js

# Make executable (optional)
chmod +x test/test-kanban-component.js
./test/test-kanban-component.js
```

## Test Coverage

### Suite 1: Component Initialization (4 tests)
Tests the KanbanCard constructor and option handling:
- ✅ Creates instance with valid data
- ✅ Handles missing optional fields
- ✅ Sets default options correctly
- ✅ Accepts custom options

### Suite 2: HTML Rendering (7 tests)
Tests HTML generation and template rendering:
- ✅ Renders card HTML correctly
- ✅ Shows epic badge for epics
- ✅ Displays priority badges
- ✅ Shows assignee and effort
- ✅ Applies correct indentation
- ✅ Shows expand button for items with children
- ✅ Shows placeholder for items without children

### Suite 3: Hierarchy Rendering (6 tests)
Tests parent-child relationships and nested structures:
- ✅ Renders children correctly
- ✅ Applies incremental indentation (16px per level)
- ✅ Calculates child progress
- ✅ Handles nested hierarchies (3+ levels)
- ✅ Hides children when collapsed
- ✅ Shows children when expanded

### Suite 4: Expand/Collapse (4 tests)
Tests interactive expand/collapse functionality:
- ✅ Toggles expanded state
- ✅ Updates button icon on toggle
- ✅ Triggers onExpand callback
- ✅ Triggers onCollapse callback

### Suite 5: Progress Calculation (4 tests)
Tests epic progress tracking:
- ✅ Calculates percentage correctly (0%, 25%, 50%, 75%, 100%)
- ✅ Counts completed children
- ✅ Handles no children case
- ✅ Handles empty children array

### Suite 6: Edge Cases (10 tests)
Tests error handling and boundary conditions:
- ✅ Handles missing effort_hours
- ✅ Handles missing assignee (shows "Unassigned")
- ✅ Handles missing priority (defaults to "Medium")
- ✅ Handles very long titles (500+ characters)
- ✅ Escapes special characters in title (XSS prevention)
- ✅ Escapes HTML entities in assignee (XSS prevention)
- ✅ Handles zero effort hours
- ✅ Returns correct priority class for unknown priority
- ✅ Handles null children gracefully
- ✅ Does not render children when showChildren is false

## Test Results

```
============================================================
📊 TEST SUMMARY
============================================================
Total Tests: 35
✅ Passed: 35
❌ Failed: 0
Success Rate: 100.0%
============================================================
```

## Test Data Examples

### Basic Issue
```javascript
const issue = {
  id: 1,
  title: 'Test Issue',
  description: 'Test description',
  status: 'In Progress',
  priority: 'High',
  assignee: 'john.doe',
  effort_hours: 8
};
```

### Epic with Children
```javascript
const epic = {
  id: 19,
  title: 'Epic',
  status: 'In Progress',
  is_epic: true,
  children: [
    { id: 20, title: 'Task 1', status: 'Done' },
    { id: 21, title: 'Task 2', status: 'Done' },
    { id: 22, title: 'Task 3', status: 'In Progress' },
    { id: 23, title: 'Task 4', status: 'Todo' }
  ]
};
```

### Nested Hierarchy (3+ levels)
```javascript
const level0 = {
  id: 24,
  title: 'Level 0',
  status: 'Todo',
  children: [
    {
      id: 25,
      title: 'Level 1',
      status: 'Todo',
      children: [
        {
          id: 26,
          title: 'Level 2',
          status: 'Todo',
          children: [
            { id: 27, title: 'Level 3', status: 'Todo' }
          ]
        }
      ]
    }
  ]
};
```

## Security Testing

The test suite includes XSS prevention tests:

```javascript
// Test HTML escaping
const issue = {
  id: 52,
  title: '<script>alert("XSS")</script>',
  status: 'Todo'
};

// Verifies output contains: &lt;script&gt; instead of <script>
```

## Custom Test Runner API

### `describe(suiteName, fn)`
Groups related tests into a test suite.

### `it(testName, fn)`
Defines an individual test case.

### `assert(condition, message, expected, actual)`
Basic assertion with custom error reporting.

### `assertEqual(actual, expected, message)`
Asserts strict equality (===).

### `assertDeepEqual(actual, expected, message)`
Asserts deep equality using JSON comparison.

### `assertContains(haystack, needle, message)`
Asserts string contains substring.

### `assertNotContains(haystack, needle, message)`
Asserts string does NOT contain substring.

### `summary()`
Displays test results summary and exits with appropriate code.

## Future Enhancements

Potential improvements for the test suite:
1. Add browser-based integration tests using Cypress or Playwright
2. Add visual regression testing for rendered HTML
3. Test accessibility features (ARIA labels, keyboard navigation)
4. Add performance benchmarks for large hierarchies
5. Test drag-and-drop functionality (requires browser environment)
6. Add code coverage reporting

## Maintenance

- Tests should be run before any changes to `KanbanCard.js`
- All tests must pass before merging changes
- New features should include corresponding tests
- Update test documentation when adding new test suites

## Related Files

- **Component**: `public/js/components/KanbanCard.js`
- **Test File**: `test/test-kanban-component.js`
- **Documentation**: `test/README-KANBAN-TESTS.md` (this file)
