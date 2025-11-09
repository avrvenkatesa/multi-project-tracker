/**
 * Dependency Mapper Service
 * 
 * Extracts dependency relationships from workstream detector output
 * and maps them to database records in issue_relationships table.
 * 
 * Features:
 * - Fuzzy name matching using Levenshtein distance
 * - Circular dependency detection using DFS
 * - Safe batch creation with duplicate prevention
 */

const { pool } = require('../db');

/**
 * Create dependencies from workstream detector output
 * 
 * @param {Array} workstreams - Array of workstream objects with dependencies
 * @param {number} projectId - Project ID to scope the mapping
 * @returns {Object} Result object with dependencies, errors, and warnings
 */
async function createDependencies(workstreams, projectId) {
  console.log(`🔗 Creating dependencies for ${workstreams.length} workstreams in project ${projectId}`);
  
  const result = {
    dependencies: [],
    errors: [],
    warnings: []
  };

  try {
    // Fetch all issues for this project
    const issuesQuery = await pool.query(
      `SELECT id, title, status FROM issues WHERE project_id = $1 ORDER BY id`,
      [projectId]
    );
    const issues = issuesQuery.rows;
    
    console.log(`  → Found ${issues.length} issues in project`);

    if (issues.length === 0) {
      result.warnings.push('No issues found in project - cannot create dependencies');
      return result;
    }

    // Build workstream to issue mapping
    const workstreamMapping = new Map();
    const unmatchedWorkstreams = [];

    for (const workstream of workstreams) {
      const matchedIssue = findMatchingIssue(workstream.name, issues);
      
      if (matchedIssue) {
        workstreamMapping.set(workstream.name, matchedIssue);
        console.log(`  ✓ Mapped "${workstream.name}" → Issue #${matchedIssue.id} "${matchedIssue.title}"`);
      } else {
        unmatchedWorkstreams.push(workstream.name);
        console.log(`  ⚠ No match found for workstream "${workstream.name}"`);
      }
    }

    if (unmatchedWorkstreams.length > 0) {
      result.warnings.push(
        `Could not match ${unmatchedWorkstreams.length} workstream(s) to issues: ${unmatchedWorkstreams.join(', ')}`
      );
    }

    // Extract and create dependencies
    const dependenciesToCreate = [];

    for (const workstream of workstreams) {
      const targetIssue = workstreamMapping.get(workstream.name);
      
      if (!targetIssue) {
        continue; // Skip if target workstream not matched
      }

      // Process each dependency
      if (workstream.dependencies && Array.isArray(workstream.dependencies)) {
        for (const dependencyName of workstream.dependencies) {
          const sourceIssue = workstreamMapping.get(dependencyName);
          
          if (!sourceIssue) {
            result.warnings.push(
              `Dependency "${dependencyName}" for "${workstream.name}" not found in issues`
            );
            continue;
          }

          // Prevent self-references
          if (sourceIssue.id === targetIssue.id) {
            result.warnings.push(
              `Self-reference detected: "${workstream.name}" depends on itself`
            );
            continue;
          }

          dependenciesToCreate.push({
            source_id: sourceIssue.id,
            source_type: 'issue',
            target_id: targetIssue.id,
            target_type: 'issue',
            source_name: sourceIssue.title,
            target_name: targetIssue.title,
            relationship_type: 'dependency'
          });
        }
      }
    }

    console.log(`  → ${dependenciesToCreate.length} dependencies to create`);

    // Check for circular dependencies before creating
    if (dependenciesToCreate.length > 0) {
      const cycles = detectCircularDependencies(dependenciesToCreate);
      
      if (cycles.length > 0) {
        result.errors.push(
          `Circular dependencies detected: ${cycles.join('; ')}`
        );
        console.error('  ❌ Circular dependencies found:', cycles);
        return result; // Don't create any dependencies if cycles detected
      }
    }

    // Create dependencies in database
    for (const dep of dependenciesToCreate) {
      try {
        const insertResult = await pool.query(
          `INSERT INTO issue_relationships 
           (source_id, source_type, target_id, target_type, relationship_type, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (source_id, source_type, target_id, target_type, relationship_type) 
           DO NOTHING
           RETURNING id`,
          [dep.source_id, dep.source_type, dep.target_id, dep.target_type, dep.relationship_type]
        );

        if (insertResult.rows.length > 0) {
          result.dependencies.push({
            id: insertResult.rows[0].id,
            source_issue_id: dep.source_id,
            target_issue_id: dep.target_id,
            source_name: dep.source_name,
            target_name: dep.target_name,
            relationship_type: dep.relationship_type
          });
          console.log(`  ✓ Created: "${dep.source_name}" → "${dep.target_name}"`);
        } else {
          result.warnings.push(
            `Dependency already exists: "${dep.source_name}" → "${dep.target_name}"`
          );
        }
      } catch (error) {
        result.errors.push(
          `Failed to create dependency "${dep.source_name}" → "${dep.target_name}": ${error.message}`
        );
        console.error(`  ❌ Error creating dependency:`, error);
      }
    }

    console.log(`✅ Created ${result.dependencies.length} dependencies`);
    if (result.warnings.length > 0) {
      console.log(`⚠ ${result.warnings.length} warnings`);
    }
    if (result.errors.length > 0) {
      console.log(`❌ ${result.errors.length} errors`);
    }

    return result;

  } catch (error) {
    console.error('❌ Error in createDependencies:', error);
    result.errors.push(`Fatal error: ${error.message}`);
    return result;
  }
}

/**
 * Find issue that best matches the search name
 * Uses exact match, partial match, and fuzzy matching
 * 
 * @param {string} searchName - Workstream name to search for
 * @param {Array} issues - Array of issue objects with id and title
 * @returns {Object|null} Matching issue or null
 */
function findMatchingIssue(searchName, issues) {
  if (!searchName || !issues || issues.length === 0) {
    return null;
  }

  const normalizedSearch = searchName.toLowerCase().trim();

  // 1. Try exact match (case-insensitive)
  const exactMatch = issues.find(
    issue => issue.title.toLowerCase().trim() === normalizedSearch
  );
  if (exactMatch) {
    return exactMatch;
  }

  // 2. Try partial match - search name contained in issue title
  const partialMatch = issues.find(
    issue => issue.title.toLowerCase().includes(normalizedSearch)
  );
  if (partialMatch) {
    return partialMatch;
  }

  // 3. Try fuzzy match using Levenshtein distance
  let bestMatch = null;
  let bestDistance = Infinity;
  const maxDistance = 3; // Maximum edit distance to consider a match

  for (const issue of issues) {
    const distance = levenshteinDistance(
      normalizedSearch,
      issue.title.toLowerCase().trim()
    );
    
    if (distance <= maxDistance && distance < bestDistance) {
      bestDistance = distance;
      bestMatch = issue;
    }
  }

  return bestMatch;
}

/**
 * Calculate Levenshtein distance between two strings
 * (minimum number of single-character edits needed to transform one string into another)
 * 
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;

  // Create 2D array for dynamic programming
  const dp = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= len1; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    dp[0][j] = j;
  }

  // Fill the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]; // No change needed
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // Deletion
          dp[i][j - 1] + 1,     // Insertion
          dp[i - 1][j - 1] + 1  // Substitution
        );
      }
    }
  }

  return dp[len1][len2];
}

/**
 * Detect circular dependencies using DFS (Depth-First Search)
 * 
 * @param {Array} dependencies - Array of dependency objects with source_id and target_id
 * @returns {Array} Array of circular dependency descriptions
 */
function detectCircularDependencies(dependencies) {
  console.log('  🔍 Checking for circular dependencies...');
  
  const cycles = [];
  
  // Build adjacency list (graph representation)
  const graph = new Map();
  const nodeNames = new Map();

  for (const dep of dependencies) {
    // Add nodes
    if (!graph.has(dep.source_id)) {
      graph.set(dep.source_id, []);
      nodeNames.set(dep.source_id, dep.source_name);
    }
    if (!graph.has(dep.target_id)) {
      graph.set(dep.target_id, []);
      nodeNames.set(dep.target_id, dep.target_name);
    }
    
    // Add edge: source → target (source must complete before target)
    graph.get(dep.source_id).push(dep.target_id);
  }

  // DFS cycle detection
  const visited = new Set();
  const recursionStack = new Set();
  const path = [];

  function dfs(node) {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) {
          return true; // Cycle found in deeper recursion
        }
      } else if (recursionStack.has(neighbor)) {
        // Cycle detected! Build cycle description
        const cycleStart = path.indexOf(neighbor);
        const cyclePath = path.slice(cycleStart).concat(neighbor);
        const cycleNames = cyclePath.map(id => nodeNames.get(id) || `#${id}`);
        cycles.push(`${cycleNames.join(' → ')}`);
        return true;
      }
    }

    path.pop();
    recursionStack.delete(node);
    return false;
  }

  // Check all nodes
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  if (cycles.length > 0) {
    console.log(`  ❌ Found ${cycles.length} circular dependency cycle(s)`);
  } else {
    console.log('  ✓ No circular dependencies detected');
  }

  return cycles;
}

/**
 * Get dependency graph for a project
 * 
 * @param {number} projectId - Project ID
 * @returns {Array} Array of dependency objects with full details
 */
async function getDependencyGraph(projectId) {
  console.log(`📊 Fetching dependency graph for project ${projectId}`);

  try {
    const result = await pool.query(
      `SELECT 
         ir.id,
         ir.source_id,
         si.title as source_title,
         si.status as source_status,
         ir.target_id,
         ti.title as target_title,
         ti.status as target_status,
         ir.relationship_type,
         ir.created_at,
         ir.created_by,
         ir.created_by_ai,
         ir.ai_confidence
       FROM issue_relationships ir
       JOIN issues si ON ir.source_id = si.id
       JOIN issues ti ON ir.target_id = ti.id
       WHERE si.project_id = $1 
         AND ir.source_type = 'issue'
         AND ir.target_type = 'issue'
         AND ir.relationship_type = 'dependency'
       ORDER BY ir.created_at DESC`,
      [projectId]
    );

    console.log(`  → Found ${result.rows.length} dependencies`);
    
    return result.rows.map(row => ({
      id: row.id,
      source_issue_id: row.source_id,
      source_title: row.source_title,
      source_status: row.source_status,
      target_issue_id: row.target_id,
      target_title: row.target_title,
      target_status: row.target_status,
      relationship_type: row.relationship_type,
      created_at: row.created_at,
      created_by: row.created_by,
      created_by_ai: row.created_by_ai,
      ai_confidence: row.ai_confidence
    }));

  } catch (error) {
    console.error('❌ Error fetching dependency graph:', error);
    throw error;
  }
}

/**
 * Delete a dependency
 * 
 * @param {number} dependencyId - Dependency ID to delete
 * @returns {boolean} Success status
 */
async function deleteDependency(dependencyId) {
  try {
    const result = await pool.query(
      `DELETE FROM issue_relationships WHERE id = $1 RETURNING id`,
      [dependencyId]
    );
    
    return result.rows.length > 0;
  } catch (error) {
    console.error('❌ Error deleting dependency:', error);
    throw error;
  }
}

module.exports = {
  createDependencies,
  findMatchingIssue,
  levenshteinDistance,
  detectCircularDependencies,
  getDependencyGraph,
  deleteDependency
};
