const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Topological Sort Service
 * Orders tasks based on their dependencies using Kahn's algorithm
 */

/**
 * Load dependencies for a set of items
 * @param {Array} items - Array of {type, id} objects
 * @returns {Array} - Array of dependency relationships
 */
async function loadDependencies(items) {
  if (!items || items.length === 0) {
    return [];
  }

  // Build conditions for both source and target items
  const issueIds = items.filter(item => item.type === 'issue').map(item => item.id);
  const actionItemIds = items.filter(item => item.type === 'action-item').map(item => item.id);

  if (issueIds.length === 0 && actionItemIds.length === 0) {
    return [];
  }

  const dependencies = [];

  // Load from issue_dependencies table
  if (issueIds.length > 0) {
    const issueDepsQuery = `
      SELECT 
        'issue' as source_type,
        issue_id as source_id,
        prerequisite_item_type as target_type,
        prerequisite_item_id as target_id,
        'depends_on' as relationship_type
      FROM issue_dependencies
      WHERE issue_id = ANY($1::int[])
    `;
    const issueDepsResult = await pool.query(issueDepsQuery, [issueIds]);
    dependencies.push(...issueDepsResult.rows);
  }

  // Load from action_item_dependencies table
  if (actionItemIds.length > 0) {
    const actionDepsQuery = `
      SELECT 
        'action-item' as source_type,
        action_item_id as source_id,
        prerequisite_item_type as target_type,
        prerequisite_item_id as target_id,
        'depends_on' as relationship_type
      FROM action_item_dependencies
      WHERE action_item_id = ANY($1::int[])
    `;
    const actionDepsResult = await pool.query(actionDepsQuery, [actionItemIds]);
    dependencies.push(...actionDepsResult.rows);
  }

  // Also load from issue_relationships table for backwards compatibility
  const relationshipsQuery = `
    SELECT 
      source_type,
      source_id,
      target_type,
      target_id,
      relationship_type
    FROM issue_relationships
    WHERE 
      (
        (source_type = 'issue' AND source_id = ANY($1::int[]))
        OR
        (source_type = 'action-item' AND source_id = ANY($2::int[]))
      )
      AND
      (
        (target_type = 'issue' AND target_id = ANY($1::int[]))
        OR
        (target_type = 'action-item' AND target_id = ANY($2::int[]))
      )
      AND relationship_type IN ('blocks', 'blocked_by', 'depends_on', 'dependency')
  `;

  const relationshipsResult = await pool.query(relationshipsQuery, [issueIds, actionItemIds]);
  dependencies.push(...relationshipsResult.rows);

  return dependencies;
}

/**
 * Build dependency graph
 * @param {Array} items - Array of {type, id} objects
 * @param {Array} dependencies - Array of dependency relationships
 * @returns {Object} - Graph structure with adjacency lists
 */
function buildDependencyGraph(items, dependencies) {
  const graph = {
    nodes: new Map(),  // Map of "type:id" -> item
    edges: new Map(),  // Map of "type:id" -> Array of dependents
    inDegree: new Map() // Map of "type:id" -> incoming edge count
  };

  // Initialize nodes
  items.forEach(item => {
    const key = `${item.type}:${item.id}`;
    graph.nodes.set(key, item);
    graph.edges.set(key, []);
    graph.inDegree.set(key, 0);
  });

  // Build edges based on dependencies
  dependencies.forEach(dep => {
    const sourceKey = `${dep.source_type}:${dep.source_id}`;
    const targetKey = `${dep.target_type}:${dep.target_id}`;

    // Skip if either node is not in our item set
    if (!graph.nodes.has(sourceKey) || !graph.nodes.has(targetKey)) {
      return;
    }

    // Handle different relationship types
    if (dep.relationship_type === 'blocks') {
      // Source blocks target -> target depends on source
      // Edge: source -> target (target must wait for source)
      const edges = graph.edges.get(sourceKey) || [];
      if (!edges.includes(targetKey)) {
        edges.push(targetKey);
        graph.edges.set(sourceKey, edges);
        graph.inDegree.set(targetKey, (graph.inDegree.get(targetKey) || 0) + 1);
      }
    } else if (dep.relationship_type === 'blocked_by') {
      // Source is blocked by target -> source depends on target
      // Edge: target -> source (source must wait for target)
      const edges = graph.edges.get(targetKey) || [];
      if (!edges.includes(sourceKey)) {
        edges.push(sourceKey);
        graph.edges.set(targetKey, edges);
        graph.inDegree.set(sourceKey, (graph.inDegree.get(sourceKey) || 0) + 1);
      }
    } else if (dep.relationship_type === 'depends_on' || dep.relationship_type === 'dependency') {
      // Source depends on target (both 'depends_on' and 'dependency' mean the same thing)
      // Edge: target -> source (source must wait for target)
      const edges = graph.edges.get(targetKey) || [];
      if (!edges.includes(sourceKey)) {
        edges.push(sourceKey);
        graph.edges.set(targetKey, edges);
        graph.inDegree.set(sourceKey, (graph.inDegree.get(sourceKey) || 0) + 1);
      }
    }
  });

  return graph;
}

/**
 * Perform topological sort using Kahn's algorithm
 * @param {Object} graph - Dependency graph
 * @returns {Object} - {sorted: Array, hasCycle: boolean, unreachable: Array, cycleInfo: Object}
 */
function topologicalSort(graph) {
  const sorted = [];
  const queue = [];
  const inDegree = new Map(graph.inDegree);

  // Start with nodes that have no dependencies (in-degree = 0)
  for (const [key, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(key);
    }
  }

  // Process queue
  while (queue.length > 0) {
    const current = queue.shift();
    sorted.push(current);

    // Reduce in-degree for all dependents
    const edges = graph.edges.get(current) || [];
    edges.forEach(dependent => {
      const newDegree = inDegree.get(dependent) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    });
  }

  // Check for cycles
  const hasCycle = sorted.length < graph.nodes.size;
  const unreachable = [];
  let cycleInfo = null;
  
  if (hasCycle) {
    // Find nodes that couldn't be sorted (part of cycle or unreachable)
    for (const key of graph.nodes.keys()) {
      if (!sorted.includes(key)) {
        unreachable.push(key);
      }
    }
    
    // Find the actual cycle path using DFS
    cycleInfo = findCyclePath(graph, unreachable);
  }

  return { sorted, hasCycle, unreachable, cycleInfo };
}

/**
 * Find the actual cycle path in the graph using DFS
 * @param {Object} graph - Dependency graph
 * @param {Array} unreachableNodes - Nodes involved in the cycle
 * @returns {Object} - {cycle: Array, dependencies: Array} describing the cycle
 */
function findCyclePath(graph, unreachableNodes) {
  const visited = new Set();
  const recursionStack = new Set();
  
  function dfs(node, path = []) {
    if (recursionStack.has(node)) {
      // Found a cycle - extract the cycle path
      const cycleStart = path.indexOf(node);
      const cyclePath = path.slice(cycleStart).concat([node]);
      
      // Build dependency information
      const dependencies = [];
      for (let i = 0; i < cyclePath.length - 1; i++) {
        const from = cyclePath[i];
        const to = cyclePath[i + 1];
        dependencies.push({ from, to });
      }
      
      return { cycle: cyclePath, dependencies };
    }
    
    if (visited.has(node)) {
      return null;
    }
    
    visited.add(node);
    recursionStack.add(node);
    path.push(node);
    
    const edges = graph.edges.get(node) || [];
    for (const neighbor of edges) {
      const result = dfs(neighbor, [...path]);
      if (result) {
        return result;
      }
    }
    
    recursionStack.delete(node);
    return null;
  }
  
  // Try DFS from each unreachable node
  for (const node of unreachableNodes) {
    if (!visited.has(node)) {
      const result = dfs(node);
      if (result) {
        return result;
      }
    }
  }
  
  return null;
}

/**
 * Calculate critical path
 * The critical path is the longest path through the dependency graph
 * @param {Array} sortedKeys - Topologically sorted task keys
 * @param {Object} graph - Dependency graph
 * @param {Map} estimatesMap - Map of task key -> estimated hours
 * @returns {Object} - {criticalPath: Array, totalHours: number}
 */
function calculateCriticalPath(sortedKeys, graph, estimatesMap) {
  // Calculate earliest start time for each task
  const earliestStart = new Map();
  const earliestFinish = new Map();
  const predecessors = new Map();

  sortedKeys.forEach(key => {
    const estimate = estimatesMap.get(key) || 0;
    
    // Find all predecessors (tasks that this task depends on)
    let maxFinishTime = 0;
    let criticalPredecessor = null;

    for (const [predKey, edges] of graph.edges.entries()) {
      if (edges.includes(key)) {
        const predFinish = earliestFinish.get(predKey) || 0;
        if (predFinish > maxFinishTime) {
          maxFinishTime = predFinish;
          criticalPredecessor = predKey;
        }
      }
    }

    earliestStart.set(key, maxFinishTime);
    earliestFinish.set(key, maxFinishTime + estimate);
    predecessors.set(key, criticalPredecessor);
  });

  // Find the task with the latest finish time (end of critical path)
  let maxFinish = 0;
  let endTask = null;

  for (const [key, finish] of earliestFinish.entries()) {
    if (finish > maxFinish) {
      maxFinish = finish;
      endTask = key;
    }
  }

  // Backtrack to build critical path
  const criticalPath = [];
  let current = endTask;
  let totalHours = 0;

  while (current !== null) {
    criticalPath.unshift(current);
    totalHours += estimatesMap.get(current) || 0;
    current = predecessors.get(current);
  }

  return { criticalPath, totalHours };
}

/**
 * Main function: Sort items by dependencies
 * @param {Array} items - Array of {type, id, estimate} objects
 * @returns {Object} - Sorted items with critical path analysis
 */
async function sortItemsByDependencies(items) {
  if (!items || items.length === 0) {
    return {
      sorted: [],
      hasCycle: false,
      unreachable: [],
      criticalPath: [],
      criticalPathHours: 0
    };
  }

  // Load dependencies
  const dependencies = await loadDependencies(items);

  // Build graph
  const graph = buildDependencyGraph(items, dependencies);

  // Perform topological sort
  const { sorted, hasCycle, unreachable, cycleInfo } = topologicalSort(graph);

  // Build estimates map
  const estimatesMap = new Map();
  items.forEach(item => {
    const key = `${item.type}:${item.id}`;
    // Defensive: Convert to number if string (PostgreSQL numeric columns)
    let estimate = item.estimate || 0;
    if (typeof estimate === 'string') {
      estimate = parseFloat(estimate);
      if (isNaN(estimate)) {
        console.warn(`[TOPOLOGICAL-SORT] Invalid estimate for ${key}: "${item.estimate}", using 0`);
        estimate = 0;
      }
    }
    estimatesMap.set(key, estimate);
  });

  // Calculate critical path (only if no cycle)
  let criticalPath = [];
  let criticalPathHours = 0;

  if (!hasCycle) {
    const criticalPathResult = calculateCriticalPath(sorted, graph, estimatesMap);
    criticalPath = criticalPathResult.criticalPath;
    criticalPathHours = criticalPathResult.totalHours;
  }

  // Convert sorted keys back to items with dependency info
  const sortedItems = sorted.map(key => {
    const [type, id] = key.split(':');
    const item = items.find(i => i.type === type && i.id === parseInt(id));
    
    // Get dependencies for this item
    const itemDependencies = [];
    for (const [predKey, edges] of graph.edges.entries()) {
      if (edges.includes(key)) {
        itemDependencies.push(predKey);
      }
    }

    return {
      ...item,
      dependencies: itemDependencies,
      isCriticalPath: criticalPath.includes(key)
    };
  });

  return {
    sorted: sortedItems,
    hasCycle,
    unreachable: unreachable.map(key => {
      const [type, id] = key.split(':');
      return { type, id: parseInt(id) };
    }),
    cycleInfo,
    criticalPath,
    criticalPathHours
  };
}

module.exports = {
  sortItemsByDependencies,
  loadDependencies,
  buildDependencyGraph,
  topologicalSort,
  calculateCriticalPath
};
