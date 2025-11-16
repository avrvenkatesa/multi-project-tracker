/**
 * Hierarchy Tree Builder Utility
 * Story 4.5 - Hierarchical Kanban Enhancement
 * 
 * Utility functions for building and manipulating hierarchical issue trees
 * from flat issue lists with parent-child relationships.
 */

/**
 * Builds a hierarchical tree structure from a flat array of issues.
 * 
 * @param {Array<Object>} issues - Flat array of issue objects with parent_issue_id
 * @returns {Array<Object>} Array of root issues with nested children
 * 
 * @example
 * const flatIssues = [
 *   { id: 1, title: 'Epic', parent_issue_id: null },
 *   { id: 2, title: 'Task 1', parent_issue_id: 1 },
 *   { id: 3, title: 'Task 2', parent_issue_id: 1 }
 * ];
 * const tree = buildHierarchyTree(flatIssues);
 * // Returns: [{ id: 1, title: 'Epic', children: [{ id: 2, ... }, { id: 3, ... }] }]
 */
function buildHierarchyTree(issues) {
  if (!issues || !Array.isArray(issues)) {
    return [];
  }

  // Step 1: Create a Map of id -> issue for O(1) lookup
  const issueMap = new Map();
  
  // Clone issues and add children array to each
  issues.forEach(issue => {
    const clone = { ...issue, children: [] };
    issueMap.set(issue.id, clone);
  });

  // Step 2: Build parent-child links
  const roots = [];
  
  issueMap.forEach(issue => {
    if (issue.parent_issue_id === null || issue.parent_issue_id === undefined) {
      // Root issue (no parent)
      roots.push(issue);
    } else {
      // Child issue - add to parent's children array
      const parent = issueMap.get(issue.parent_issue_id);
      if (parent) {
        parent.children.push(issue);
      } else {
        // Parent not found - treat as root (orphaned issue)
        roots.push(issue);
      }
    }
  });

  return roots;
}

/**
 * Flattens a hierarchical tree structure back into a flat array.
 * Preserves hierarchy information in each issue object.
 * 
 * @param {Array<Object>} tree - Array of root issues with nested children
 * @param {number} depth - Current depth level (used internally for recursion)
 * @returns {Array<Object>} Flat array of all issues with hierarchy_level property
 * 
 * @example
 * const tree = [{ id: 1, title: 'Epic', children: [{ id: 2, title: 'Task', children: [] }] }];
 * const flat = flattenHierarchyTree(tree);
 * // Returns: [
 * //   { id: 1, title: 'Epic', hierarchy_level: 0, ... },
 * //   { id: 2, title: 'Task', hierarchy_level: 1, ... }
 * // ]
 */
function flattenHierarchyTree(tree, depth = 0) {
  if (!tree || !Array.isArray(tree)) {
    return [];
  }

  const result = [];

  tree.forEach(issue => {
    // Add current issue with hierarchy level
    const flatIssue = { 
      ...issue, 
      hierarchy_level: depth 
    };
    
    // Store children reference before removing
    const children = issue.children || [];
    
    // Add issue to result
    result.push(flatIssue);

    // Recursively flatten children
    if (children.length > 0) {
      const flatChildren = flattenHierarchyTree(children, depth + 1);
      result.push(...flatChildren);
    }
  });

  return result;
}

/**
 * Recursively searches a tree structure for an issue by ID.
 * 
 * @param {Array<Object>} tree - Array of root issues with nested children
 * @param {number} issueId - The ID of the issue to find
 * @returns {Object|null} The issue object if found, null otherwise
 * 
 * @example
 * const tree = [{ id: 1, children: [{ id: 2, children: [] }] }];
 * const issue = findIssueInTree(tree, 2);
 * // Returns: { id: 2, children: [] }
 */
function findIssueInTree(tree, issueId) {
  if (!tree || !Array.isArray(tree)) {
    return null;
  }

  for (const issue of tree) {
    // Check if this is the issue we're looking for
    if (issue.id === issueId) {
      return issue;
    }

    // Recursively search in children
    if (issue.children && issue.children.length > 0) {
      const found = findIssueInTree(issue.children, issueId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

/**
 * Calculates progress statistics for an issue based on its descendants.
 * Counts total children and completed children recursively.
 * 
 * @param {Object} issue - The issue object with children array
 * @returns {Object} Object with { total, completed, percentage }
 * 
 * @example
 * const epic = {
 *   id: 1,
 *   status: 'In Progress',
 *   children: [
 *     { id: 2, status: 'Done', children: [] },
 *     { id: 3, status: 'In Progress', children: [] },
 *     { id: 4, status: 'Closed', children: [] }
 *   ]
 * };
 * const progress = calculateChildProgress(epic);
 * // Returns: { total: 3, completed: 2, percentage: 67 }
 */
function calculateChildProgress(issue) {
  if (!issue || !issue.children || issue.children.length === 0) {
    return { total: 0, completed: 0, percentage: 0 };
  }

  let total = 0;
  let completed = 0;

  // Completed statuses
  const completedStatuses = ['Done', 'Closed', 'Complete', 'Completed'];

  function countDescendants(items) {
    items.forEach(item => {
      total++;

      // Check if this item is completed
      if (completedStatuses.includes(item.status)) {
        completed++;
      }

      // Recursively count children
      if (item.children && item.children.length > 0) {
        countDescendants(item.children);
      }
    });
  }

  countDescendants(issue.children);

  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, percentage };
}

/**
 * Calculates the depth of an issue in the tree hierarchy.
 * Returns 0 for root issues, 1 for direct children, etc.
 * 
 * @param {Object} issue - The issue object
 * @returns {number} Depth level (0 for root)
 * 
 * @example
 * const issue = { id: 1, hierarchy_level: 2 };
 * const depth = getIssueDepth(issue);
 * // Returns: 2
 */
function getIssueDepth(issue) {
  if (!issue) {
    return 0;
  }

  // Use hierarchy_level if available
  if (typeof issue.hierarchy_level === 'number') {
    return issue.hierarchy_level;
  }

  // Count parents if hierarchy_level not available
  let depth = 0;
  let current = issue;

  while (current.parent_issue_id !== null && current.parent_issue_id !== undefined) {
    depth++;
    current = current.parent || {};
    
    // Prevent infinite loops
    if (depth > 100) {
      console.warn('Possible circular reference detected in issue hierarchy');
      break;
    }
  }

  return depth;
}

/**
 * Gets all descendant issues as a flat array.
 * Includes children, grandchildren, and all nested descendants.
 * 
 * @param {Object} issue - The issue object with children array
 * @returns {Array<Object>} Flat array of all descendant issues
 * 
 * @example
 * const epic = {
 *   id: 1,
 *   children: [
 *     { id: 2, children: [{ id: 4, children: [] }] },
 *     { id: 3, children: [] }
 *   ]
 * };
 * const descendants = getAllDescendants(epic);
 * // Returns: [{ id: 2, ... }, { id: 4, ... }, { id: 3, ... }]
 */
function getAllDescendants(issue) {
  if (!issue || !issue.children || issue.children.length === 0) {
    return [];
  }

  const descendants = [];

  function collectDescendants(items) {
    items.forEach(item => {
      descendants.push(item);

      // Recursively collect children
      if (item.children && item.children.length > 0) {
        collectDescendants(item.children);
      }
    });
  }

  collectDescendants(issue.children);

  return descendants;
}

/**
 * Finds the parent issue of a given issue in the tree.
 * 
 * @param {Array<Object>} tree - Array of root issues with nested children
 * @param {number} issueId - The ID of the issue to find the parent for
 * @returns {Object|null} The parent issue object if found, null otherwise
 * 
 * @example
 * const tree = [{ id: 1, children: [{ id: 2, children: [] }] }];
 * const parent = findParentIssue(tree, 2);
 * // Returns: { id: 1, children: [...] }
 */
function findParentIssue(tree, issueId) {
  if (!tree || !Array.isArray(tree)) {
    return null;
  }

  for (const issue of tree) {
    // Check if any direct child matches
    if (issue.children && issue.children.length > 0) {
      const child = issue.children.find(c => c.id === issueId);
      if (child) {
        return issue;
      }

      // Recursively search in children
      const found = findParentIssue(issue.children, issueId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

/**
 * Gets the root issue for a given issue by traversing up the tree.
 * 
 * @param {Array<Object>} tree - Array of root issues with nested children
 * @param {number} issueId - The ID of the issue to find the root for
 * @returns {Object|null} The root issue object if found, null otherwise
 * 
 * @example
 * const tree = [{ id: 1, children: [{ id: 2, children: [{ id: 3, children: [] }] }] }];
 * const root = getRootIssue(tree, 3);
 * // Returns: { id: 1, children: [...] }
 */
function getRootIssue(tree, issueId) {
  if (!tree || !Array.isArray(tree)) {
    return null;
  }

  // First, find the issue
  const issue = findIssueInTree(tree, issueId);
  if (!issue) {
    return null;
  }

  // If it has no parent, it is the root
  if (!issue.parent_issue_id) {
    return issue;
  }

  // Traverse up to find root
  let current = issue;
  let parent = findParentIssue(tree, current.id);

  while (parent) {
    current = parent;
    parent = findParentIssue(tree, current.id);
  }

  return current;
}

/**
 * Filters a tree to only include issues matching a predicate function.
 * Maintains tree structure with matching issues and their ancestors.
 * 
 * @param {Array<Object>} tree - Array of root issues with nested children
 * @param {Function} predicate - Function that returns true for issues to include
 * @returns {Array<Object>} Filtered tree structure
 * 
 * @example
 * const tree = [{ id: 1, status: 'Done', children: [{ id: 2, status: 'To Do', children: [] }] }];
 * const filtered = filterTree(tree, issue => issue.status === 'Done');
 * // Returns: [{ id: 1, status: 'Done', children: [] }]
 */
function filterTree(tree, predicate) {
  if (!tree || !Array.isArray(tree) || typeof predicate !== 'function') {
    return [];
  }

  const result = [];

  tree.forEach(issue => {
    // Recursively filter children first
    const filteredChildren = issue.children && issue.children.length > 0
      ? filterTree(issue.children, predicate)
      : [];

    // Include issue if it matches predicate OR has matching children
    if (predicate(issue) || filteredChildren.length > 0) {
      result.push({
        ...issue,
        children: filteredChildren
      });
    }
  });

  return result;
}

/**
 * Counts total number of issues in a tree structure.
 * 
 * @param {Array<Object>} tree - Array of root issues with nested children
 * @returns {number} Total count of all issues in the tree
 * 
 * @example
 * const tree = [{ id: 1, children: [{ id: 2, children: [] }, { id: 3, children: [] }] }];
 * const count = countIssuesInTree(tree);
 * // Returns: 3
 */
function countIssuesInTree(tree) {
  if (!tree || !Array.isArray(tree)) {
    return 0;
  }

  let count = 0;

  tree.forEach(issue => {
    count++; // Count current issue

    // Recursively count children
    if (issue.children && issue.children.length > 0) {
      count += countIssuesInTree(issue.children);
    }
  });

  return count;
}

// Export for browser compatibility (global namespace)
if (typeof window !== 'undefined') {
  window.HierarchyUtils = {
    buildHierarchyTree,
    flattenHierarchyTree,
    findIssueInTree,
    calculateChildProgress,
    getIssueDepth,
    getAllDescendants,
    findParentIssue,
    getRootIssue,
    filterTree,
    countIssuesInTree
  };
}

// Export for ES6 modules (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildHierarchyTree,
    flattenHierarchyTree,
    findIssueInTree,
    calculateChildProgress,
    getIssueDepth,
    getAllDescendants,
    findParentIssue,
    getRootIssue,
    filterTree,
    countIssuesInTree
  };
}
