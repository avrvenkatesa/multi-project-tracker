#!/usr/bin/env node

/**
 * KanbanCard Component Test Suite
 * 
 * Tests the KanbanCard component functionality including:
 * - Component initialization
 * - HTML rendering
 * - Hierarchy rendering
 * - Expand/collapse
 * - Progress calculation
 * - Edge cases
 * 
 * Run with: node test/test-kanban-component.js
 */

// Minimal DOM mocking for Node.js environment
global.document = {
  createElement: function(tag) {
    return {
      textContent: '',
      get innerHTML() {
        return this.textContent
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }
    };
  },
  getElementById: function(id) {
    return null;
  },
  querySelector: function(selector) {
    return null;
  },
  dispatchEvent: function(event) {}
};

global.window = {
  KanbanCard: null,
  toggleKanbanCard: function(issueId) {}
};

global.CustomEvent = class CustomEvent {
  constructor(name, options) {
    this.name = name;
    this.detail = options?.detail;
  }
};

// Load the KanbanCard component
const fs = require('fs');
const path = require('path');

const componentPath = path.join(__dirname, '../public/js/components/KanbanCard.js');
const componentCode = fs.readFileSync(componentPath, 'utf8');

// Extract just the class definition (remove window assignments)
eval(componentCode.replace(/window\./g, 'global.'));

const KanbanCard = global.KanbanCard;

// Test Runner
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.currentSuite = null;
  }

  describe(suiteName, fn) {
    this.currentSuite = suiteName;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 ${suiteName}`);
    console.log('='.repeat(60));
    fn();
    this.currentSuite = null;
  }

  it(testName, fn) {
    try {
      fn();
      this.passed++;
      console.log(`  ✅ ${testName}`);
    } catch (error) {
      this.failed++;
      console.log(`  ❌ ${testName}`);
      console.log(`     Error: ${error.message}`);
      if (error.expected !== undefined) {
        console.log(`     Expected: ${JSON.stringify(error.expected)}`);
        console.log(`     Received: ${JSON.stringify(error.actual)}`);
      }
    }
  }

  assert(condition, message, expected, actual) {
    if (!condition) {
      const error = new Error(message);
      error.expected = expected;
      error.actual = actual;
      throw error;
    }
  }

  assertEqual(actual, expected, message) {
    this.assert(
      actual === expected,
      message || `Expected ${expected} but got ${actual}`,
      expected,
      actual
    );
  }

  assertDeepEqual(actual, expected, message) {
    this.assert(
      JSON.stringify(actual) === JSON.stringify(expected),
      message || 'Objects are not equal',
      expected,
      actual
    );
  }

  assertContains(haystack, needle, message) {
    this.assert(
      haystack.includes(needle),
      message || `Expected string to contain "${needle}"`,
      needle,
      haystack
    );
  }

  assertNotContains(haystack, needle, message) {
    this.assert(
      !haystack.includes(needle),
      message || `Expected string to NOT contain "${needle}"`,
      `not containing ${needle}`,
      haystack
    );
  }

  summary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${this.passed + this.failed}`);
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`Success Rate: ${((this.passed / (this.passed + this.failed)) * 100).toFixed(1)}%`);
    console.log('='.repeat(60));
    
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

const test = new TestRunner();

// =============================================================================
// TEST SUITE 1: Component Initialization
// =============================================================================
test.describe('Component Initialization', () => {
  
  test.it('Creates instance with valid data', () => {
    const issue = {
      id: 1,
      title: 'Test Issue',
      description: 'Test description',
      status: 'In Progress',
      priority: 'High',
      assignee: 'john.doe',
      effort_hours: 8
    };

    const card = new KanbanCard(issue);
    
    test.assertEqual(card.issue.id, 1);
    test.assertEqual(card.issue.title, 'Test Issue');
    test.assertEqual(card.expanded, false, 'Card should start collapsed');
  });

  test.it('Handles missing optional fields', () => {
    const issue = {
      id: 2,
      title: 'Minimal Issue',
      status: 'Todo'
    };

    const card = new KanbanCard(issue);
    
    test.assertEqual(card.issue.id, 2);
    test.assertEqual(card.issue.assignee, undefined);
    test.assertEqual(card.issue.effort_hours, undefined);
  });

  test.it('Sets default options correctly', () => {
    const issue = { id: 3, title: 'Test', status: 'Todo' };
    const card = new KanbanCard(issue);
    
    test.assertEqual(card.options.showChildren, true);
    test.assertEqual(card.options.indentLevel, 0);
    test.assertEqual(card.options.onExpand, null);
    test.assertEqual(card.options.onCollapse, null);
  });

  test.it('Accepts custom options', () => {
    const issue = { id: 4, title: 'Test', status: 'Todo' };
    const onExpand = () => {};
    const card = new KanbanCard(issue, {
      showChildren: false,
      indentLevel: 2,
      onExpand: onExpand
    });
    
    test.assertEqual(card.options.showChildren, false);
    test.assertEqual(card.options.indentLevel, 2);
    test.assertEqual(card.options.onExpand, onExpand);
  });
});

// =============================================================================
// TEST SUITE 2: HTML Rendering
// =============================================================================
test.describe('HTML Rendering', () => {

  test.it('Renders card HTML correctly', () => {
    const issue = {
      id: 5,
      title: 'Render Test',
      status: 'In Progress',
      priority: 'High',
      assignee: 'jane.smith',
      effort_hours: 5
    };

    const card = new KanbanCard(issue);
    const html = card.render();
    
    test.assertContains(html, 'data-issue-id="5"');
    test.assertContains(html, 'Render Test');
    test.assertContains(html, 'jane.smith');
    test.assertContains(html, '5h');
  });

  test.it('Shows epic badge for epics', () => {
    const epic = {
      id: 6,
      title: 'Epic Issue',
      status: 'In Progress',
      is_epic: true
    };

    const card = new KanbanCard(epic);
    const html = card.render();
    
    test.assertContains(html, 'badge-epic');
    test.assertContains(html, 'Epic');
    test.assertContains(html, 'kanban-card-epic');
  });

  test.it('Displays priority badges', () => {
    const priorities = ['Critical', 'High', 'Medium', 'Low'];
    
    priorities.forEach(priority => {
      const issue = {
        id: 7,
        title: 'Priority Test',
        status: 'Todo',
        priority: priority
      };

      const card = new KanbanCard(issue);
      const html = card.render();
      
      test.assertContains(html, priority);
    });
  });

  test.it('Shows assignee and effort', () => {
    const issue = {
      id: 8,
      title: 'Metadata Test',
      status: 'Todo',
      assignee: 'bob.jones',
      effort_hours: 12
    };

    const card = new KanbanCard(issue);
    const html = card.render();
    
    test.assertContains(html, 'bob.jones');
    test.assertContains(html, '12h');
  });

  test.it('Applies correct indentation', () => {
    const issue = {
      id: 9,
      title: 'Indent Test',
      status: 'Todo'
    };

    const card0 = new KanbanCard(issue, { indentLevel: 0 });
    const card1 = new KanbanCard(issue, { indentLevel: 1 });
    const card2 = new KanbanCard(issue, { indentLevel: 2 });
    
    test.assertContains(card0.render(), 'margin-left: 0px');
    test.assertContains(card1.render(), 'margin-left: 16px');
    test.assertContains(card2.render(), 'margin-left: 32px');
  });

  test.it('Shows expand button for items with children', () => {
    const issueWithChildren = {
      id: 10,
      title: 'Parent',
      status: 'In Progress',
      children: [
        { id: 11, title: 'Child', status: 'Todo' }
      ]
    };

    const card = new KanbanCard(issueWithChildren);
    const html = card.render();
    
    test.assertContains(html, 'kanban-card-expand-btn');
    test.assertContains(html, 'fa-chevron-right');
  });

  test.it('Shows placeholder for items without children', () => {
    const issueNoChildren = {
      id: 12,
      title: 'No Children',
      status: 'Todo'
    };

    const card = new KanbanCard(issueNoChildren);
    const html = card.render();
    
    test.assertContains(html, 'kanban-card-expand-placeholder');
  });
});

// =============================================================================
// TEST SUITE 3: Hierarchy Rendering
// =============================================================================
test.describe('Hierarchy Rendering', () => {

  test.it('Renders children correctly', () => {
    const parent = {
      id: 13,
      title: 'Parent Task',
      status: 'In Progress',
      children: [
        { id: 14, title: 'Child 1', status: 'Done' },
        { id: 15, title: 'Child 2', status: 'Todo' }
      ]
    };

    const card = new KanbanCard(parent);
    card.expanded = true;
    const html = card.render();
    
    test.assertContains(html, 'Child 1');
    test.assertContains(html, 'Child 2');
    test.assertContains(html, 'kanban-card-children');
  });

  test.it('Applies incremental indentation', () => {
    const parent = {
      id: 16,
      title: 'Level 0',
      status: 'Todo',
      children: [
        { 
          id: 17, 
          title: 'Level 1', 
          status: 'Todo',
          children: [
            { id: 18, title: 'Level 2', status: 'Todo' }
          ]
        }
      ]
    };

    const card = new KanbanCard(parent, { indentLevel: 0 });
    card.expanded = true;
    const html = card.render();
    
    test.assertContains(html, 'margin-left: 0px');
    test.assertContains(html, 'margin-left: 16px');
  });

  test.it('Calculates child progress', () => {
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

    const card = new KanbanCard(epic);
    const progress = card.calculateChildProgress();
    
    test.assertEqual(progress, 50, 'Should calculate 50% (2/4 done)');
  });

  test.it('Handles nested hierarchies (3+ levels)', () => {
    const level3 = { id: 27, title: 'Level 3', status: 'Todo' };
    const level2 = {
      id: 26,
      title: 'Level 2',
      status: 'Todo',
      children: [level3]
    };
    const level1 = {
      id: 25,
      title: 'Level 1',
      status: 'Todo',
      children: [level2]
    };
    const level0 = {
      id: 24,
      title: 'Level 0',
      status: 'Todo',
      children: [level1]
    };

    // Create cards with nested structure and verify indentation increases
    const card0 = new KanbanCard(level0, { indentLevel: 0 });
    const card1 = new KanbanCard(level1, { indentLevel: 1 });
    const card2 = new KanbanCard(level2, { indentLevel: 2 });
    const card3 = new KanbanCard(level3, { indentLevel: 3 });
    
    // Verify each level renders correctly
    test.assertContains(card0.render(), 'Level 0');
    test.assertContains(card0.render(), 'margin-left: 0px');
    
    test.assertContains(card1.render(), 'Level 1');
    test.assertContains(card1.render(), 'margin-left: 16px');
    
    test.assertContains(card2.render(), 'Level 2');
    test.assertContains(card2.render(), 'margin-left: 32px');
    
    test.assertContains(card3.render(), 'Level 3');
    test.assertContains(card3.render(), 'margin-left: 48px');
  });

  test.it('Hides children when collapsed', () => {
    const parent = {
      id: 28,
      title: 'Parent',
      status: 'Todo',
      children: [
        { id: 29, title: 'Child', status: 'Todo' }
      ]
    };

    const card = new KanbanCard(parent);
    card.expanded = false;
    const html = card.render();
    
    test.assertContains(html, 'display: none');
  });

  test.it('Shows children when expanded', () => {
    const parent = {
      id: 30,
      title: 'Parent',
      status: 'Todo',
      children: [
        { id: 31, title: 'Child', status: 'Todo' }
      ]
    };

    const card = new KanbanCard(parent);
    card.expanded = true;
    const html = card.render();
    
    test.assertContains(html, 'display: block');
    test.assertContains(html, 'Child');
  });
});

// =============================================================================
// TEST SUITE 4: Expand/Collapse
// =============================================================================
test.describe('Expand/Collapse', () => {

  test.it('Toggles expanded state', () => {
    const issue = {
      id: 32,
      title: 'Toggle Test',
      status: 'Todo',
      children: [
        { id: 33, title: 'Child', status: 'Todo' }
      ]
    };

    const card = new KanbanCard(issue);
    
    test.assertEqual(card.expanded, false);
    card.toggle();
    test.assertEqual(card.expanded, true);
    card.toggle();
    test.assertEqual(card.expanded, false);
  });

  test.it('Updates button icon on toggle', () => {
    const issue = {
      id: 34,
      title: 'Icon Test',
      status: 'Todo',
      children: [
        { id: 35, title: 'Child', status: 'Todo' }
      ]
    };

    const card = new KanbanCard(issue);
    
    let html = card.render();
    test.assertContains(html, 'fa-chevron-right');
    
    card.expanded = true;
    html = card.render();
    test.assertContains(html, 'fa-chevron-down');
  });

  test.it('Triggers onExpand callback', () => {
    let expandCalled = false;
    let expandedIssue = null;

    const issue = {
      id: 36,
      title: 'Callback Test',
      status: 'Todo',
      children: [
        { id: 37, title: 'Child', status: 'Todo' }
      ]
    };

    const card = new KanbanCard(issue, {
      onExpand: (iss) => {
        expandCalled = true;
        expandedIssue = iss;
      }
    });

    card.toggle();
    
    test.assertEqual(expandCalled, true);
    test.assertEqual(expandedIssue.id, 36);
  });

  test.it('Triggers onCollapse callback', () => {
    let collapseCalled = false;
    let collapsedIssue = null;

    const issue = {
      id: 38,
      title: 'Callback Test',
      status: 'Todo',
      children: [
        { id: 39, title: 'Child', status: 'Todo' }
      ]
    };

    const card = new KanbanCard(issue, {
      onCollapse: (iss) => {
        collapseCalled = true;
        collapsedIssue = iss;
      }
    });

    card.expanded = true;
    card.toggle();
    
    test.assertEqual(collapseCalled, true);
    test.assertEqual(collapsedIssue.id, 38);
  });
});

// =============================================================================
// TEST SUITE 5: Progress Calculation
// =============================================================================
test.describe('Progress Calculation', () => {

  test.it('Calculates percentage correctly', () => {
    const testCases = [
      { done: 0, total: 4, expected: 0 },
      { done: 1, total: 4, expected: 25 },
      { done: 2, total: 4, expected: 50 },
      { done: 3, total: 4, expected: 75 },
      { done: 4, total: 4, expected: 100 }
    ];

    testCases.forEach(tc => {
      const children = [];
      for (let i = 0; i < tc.done; i++) {
        children.push({ id: i, title: `Done ${i}`, status: 'Done' });
      }
      for (let i = tc.done; i < tc.total; i++) {
        children.push({ id: i, title: `Todo ${i}`, status: 'Todo' });
      }

      const issue = {
        id: 40,
        title: 'Progress Test',
        status: 'In Progress',
        children: children
      };

      const card = new KanbanCard(issue);
      const progress = card.calculateChildProgress();
      
      test.assertEqual(progress, tc.expected, 
        `${tc.done}/${tc.total} should be ${tc.expected}%`);
    });
  });

  test.it('Counts completed children', () => {
    const issue = {
      id: 41,
      title: 'Count Test',
      status: 'In Progress',
      children: [
        { id: 42, title: 'Done 1', status: 'Done' },
        { id: 43, title: 'Done 2', status: 'Done' },
        { id: 44, title: 'In Progress', status: 'In Progress' },
        { id: 45, title: 'Todo', status: 'Todo' }
      ]
    };

    const card = new KanbanCard(issue);
    const progress = card.calculateChildProgress();
    
    test.assertEqual(progress, 50);
  });

  test.it('Handles no children case', () => {
    const issue = {
      id: 46,
      title: 'No Children',
      status: 'Todo'
    };

    const card = new KanbanCard(issue);
    const progress = card.calculateChildProgress();
    
    test.assertEqual(progress, 0);
  });

  test.it('Handles empty children array', () => {
    const issue = {
      id: 47,
      title: 'Empty Array',
      status: 'Todo',
      children: []
    };

    const card = new KanbanCard(issue);
    const progress = card.calculateChildProgress();
    
    test.assertEqual(progress, 0);
  });
});

// =============================================================================
// TEST SUITE 6: Edge Cases
// =============================================================================
test.describe('Edge Cases', () => {

  test.it('Handles missing effort_hours', () => {
    const issue = {
      id: 48,
      title: 'No Effort',
      status: 'Todo'
    };

    const card = new KanbanCard(issue);
    const html = card.render();
    
    test.assertNotContains(html, 'fa-clock');
  });

  test.it('Handles missing assignee', () => {
    const issue = {
      id: 49,
      title: 'No Assignee',
      status: 'Todo'
    };

    const card = new KanbanCard(issue);
    const html = card.render();
    
    test.assertContains(html, 'Unassigned');
  });

  test.it('Handles missing priority', () => {
    const issue = {
      id: 50,
      title: 'No Priority',
      status: 'Todo'
    };

    const card = new KanbanCard(issue);
    const html = card.render();
    
    test.assertContains(html, 'Medium');
  });

  test.it('Handles very long titles', () => {
    const longTitle = 'A'.repeat(500);
    const issue = {
      id: 51,
      title: longTitle,
      status: 'Todo'
    };

    const card = new KanbanCard(issue);
    const html = card.render();
    
    test.assertContains(html, longTitle);
  });

  test.it('Escapes special characters in title', () => {
    const issue = {
      id: 52,
      title: '<script>alert("XSS")</script>',
      status: 'Todo'
    };

    const card = new KanbanCard(issue);
    const html = card.render();
    
    test.assertContains(html, '&lt;script&gt;');
    test.assertNotContains(html, '<script>alert');
  });

  test.it('Escapes HTML entities in assignee', () => {
    const issue = {
      id: 53,
      title: 'XSS Test',
      status: 'Todo',
      assignee: '<img src=x onerror=alert(1)>'
    };

    const card = new KanbanCard(issue);
    const html = card.render();
    
    test.assertContains(html, '&lt;img');
  });

  test.it('Handles zero effort hours', () => {
    const issue = {
      id: 54,
      title: 'Zero Effort',
      status: 'Todo',
      effort_hours: 0
    };

    const card = new KanbanCard(issue);
    const html = card.render();
    
    test.assertContains(html, '0h');
  });

  test.it('Returns correct priority class for unknown priority', () => {
    const card = new KanbanCard({ id: 55, title: 'Test', status: 'Todo' });
    const priorityClass = card.getPriorityClass('Unknown');
    
    test.assertEqual(priorityClass, 'badge-priority-medium');
  });

  test.it('Handles null children gracefully', () => {
    const issue = {
      id: 56,
      title: 'Null Children',
      status: 'Todo',
      children: null
    };

    const card = new KanbanCard(issue);
    const html = card.render();
    const childrenHtml = card.renderChildren();
    
    test.assertEqual(childrenHtml, '');
  });

  test.it('Does not render children when showChildren is false', () => {
    const issue = {
      id: 57,
      title: 'Hidden Children',
      status: 'Todo',
      children: [
        { id: 58, title: 'Child', status: 'Todo' }
      ]
    };

    const card = new KanbanCard(issue, { showChildren: false });
    card.expanded = true;
    const childrenHtml = card.renderChildren();
    
    test.assertEqual(childrenHtml, '');
  });
});

// =============================================================================
// Run Tests and Display Summary
// =============================================================================
test.summary();
