/**
 * Kanban State Management Utility
 * Manages expand/collapse state persistence for hierarchical Kanban cards
 */

const STORAGE_KEY = 'kanban-expanded-cards';

/**
 * Get the storage key for current project
 * @returns {string} Project-scoped storage key
 */
function getProjectStorageKey() {
    // Access currentProject from global scope (defined in app.js)
    const projectId = window.currentProject?.id || 'default';
    return `${STORAGE_KEY}-${projectId}`;
}

/**
 * Load all expanded states from localStorage
 * @returns {Object} Object mapping issue IDs to boolean expand states
 */
function loadExpandedStates() {
    try {
        const key = getProjectStorageKey();
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : {};
    } catch (error) {
        console.error('[KANBAN STATE] Error loading expanded states:', error);
        return {};
    }
}

/**
 * Save all expanded states to localStorage
 * @param {Object} states - Object mapping issue IDs to boolean expand states
 */
function saveExpandedStates(states) {
    try {
        const key = getProjectStorageKey();
        localStorage.setItem(key, JSON.stringify(states));
    } catch (error) {
        console.error('[KANBAN STATE] Error saving expanded states:', error);
    }
}

/**
 * Save expand state for a single issue
 * @param {number} issueId - The issue ID
 * @param {boolean} isExpanded - Whether the issue is expanded
 */
function saveExpandedState(issueId, isExpanded) {
    const states = loadExpandedStates();
    states[issueId] = isExpanded;
    saveExpandedStates(states);
}

/**
 * Get expand state for a single issue
 * @param {number} issueId - The issue ID
 * @returns {boolean} Whether the issue is expanded (default false)
 */
function getExpandedState(issueId) {
    const states = loadExpandedStates();
    return states[issueId] === true;
}

/**
 * Save multiple expanded states from a Set
 * @param {Set<number>} expandedSet - Set of expanded issue IDs
 */
function saveAllExpandedStates(expandedSet) {
    const states = {};
    expandedSet.forEach(id => {
        states[id] = true;
    });
    saveExpandedStates(states);
}

/**
 * Get all expanded issue IDs as a Set
 * @returns {Set<number>} Set of expanded issue IDs
 */
function getAllExpandedStates() {
    const states = loadExpandedStates();
    const expandedSet = new Set();
    
    Object.entries(states).forEach(([id, isExpanded]) => {
        if (isExpanded === true) {
            expandedSet.add(parseInt(id, 10));
        }
    });
    
    return expandedSet;
}

/**
 * Clear all saved expand/collapse states
 */
function clearExpandedStates() {
    try {
        const key = getProjectStorageKey();
        localStorage.removeItem(key);
        console.log('[KANBAN STATE] Cleared all expanded states');
    } catch (error) {
        console.error('[KANBAN STATE] Error clearing expanded states:', error);
    }
}

/**
 * Expand all issues with children
 * @param {Array} allItems - All issues/action items to expand
 * @returns {Set<number>} Set of expanded issue IDs
 */
function expandAllIssues(allItems) {
    const expandedSet = new Set();
    
    // Find all items that have children
    allItems.forEach(item => {
        if (item.children && item.children.length > 0) {
            expandedSet.add(item.id);
            
            // Recursively expand children
            const expandChildren = (children) => {
                children.forEach(child => {
                    if (child.children && child.children.length > 0) {
                        expandedSet.add(child.id);
                        expandChildren(child.children);
                    }
                });
            };
            expandChildren(item.children);
        }
    });
    
    saveAllExpandedStates(expandedSet);
    return expandedSet;
}

/**
 * Collapse all issues
 */
function collapseAllIssues() {
    clearExpandedStates();
}

// Export functions to global scope for use in app.js
window.KanbanState = {
    saveExpandedState,
    getExpandedState,
    saveAllExpandedStates,
    getAllExpandedStates,
    clearExpandedStates,
    expandAllIssues,
    collapseAllIssues
};
