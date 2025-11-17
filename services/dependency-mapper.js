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
 * Calculate realistic start and due dates based on hierarchy and position
 * @param {Object} issue - The issue/task object with hierarchy_level
 * @param {number} index - Index in the array of all issues
 * @param {Array} allIssues - All previously created issues (to check for parent dates)
 * @param {Date} baseStartDate - Project start date
 * @returns {Object} - Object with start_date, due_date, and duration
 */
function calculateTaskDates(issue, index, allIssues, baseStartDate) {
  const now = baseStartDate || new Date();
  const level = issue.hierarchy_level || 0;

  // Default durations by hierarchy level (in days)
  const durations = {
    0: 30, // Epics: 30 days
    1: 10, // Tasks: 10 days
    2: 5,  // Subtasks: 5 days
    3: 3   // Sub-subtasks: 3 days
  };

  const duration = durations[level] || 7;

  // Calculate start date based on parent or sequential ordering
  let startDate = new Date(now);

  // If has parent, start on or after parent's start date
  if (issue.parent_issue_id) {
    const parent = allIssues.find(i => i.id === issue.parent_issue_id);
    if (parent && parent.start_date) {
      // Parse parent's start date
      startDate = new Date(parent.start_date);

      // Add offset for siblings to cascade tasks
      const siblings = allIssues.filter(i => i.parent_issue_id === issue.parent_issue_id);
      const siblingIndex = siblings.length; // Current position among siblings

      // Tasks under same parent start with 2-day offset
      startDate.setDate(startDate.getDate() + (siblingIndex * 2));
    }
  } else {
    // Top-level tasks (epics): space them out significantly
    const epicIndex = allIssues.filter(i => i.hierarchy_level === 0).length;
    startDate.setDate(startDate.getDate() + (epicIndex * 5)); // 5 days between epic starts
  }

  // Calculate due date
  const dueDate = new Date(startDate);
  dueDate.setDate(dueDate.getDate() + duration);

  // Format as YYYY-MM-DD
  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return {
    start_date: formatDate(startDate),
    due_date: formatDate(dueDate),
    duration: duration
  };
}

// Add this test log after the function definition
console.log('✅ calculateTaskDates function defined');

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
    // Check if workstreams have issueId already (from multi-document import)
    const hasDirectIssueIds = workstreams.every(ws => ws.issueId);
    
    let workstreamMapping = new Map();
    let workstreamIdToIssueId = new Map();
    
    if (hasDirectIssueIds) {
      // Direct mapping: workstreams already have issueId
      console.log(`  → Using direct issue IDs from workstreams`);
      
      // Fetch issue details for logging and validation
      const issueIds = workstreams.map(ws => ws.issueId);
      const issuesQuery = await pool.query(
        `SELECT id, title FROM issues WHERE id = ANY($1::int[])`,
        [issueIds]
      );
      const issuesById = new Map(issuesQuery.rows.map(i => [i.id, i]));
      
      for (const workstream of workstreams) {
        const issue = issuesById.get(workstream.issueId);
        if (issue) {
          workstreamMapping.set(workstream.name, issue);
          if (workstream.id) {
            workstreamIdToIssueId.set(workstream.id, issue);
          }
          console.log(`  ✓ Mapped "${workstream.name}" → Issue #${issue.id} "${issue.title}"`);
        }
      }
    } else {
      // Fuzzy matching: need to match workstreams to existing issues
      console.log(`  → Using fuzzy matching to find issues`);
      
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

      const unmatchedWorkstreams = [];

      for (const workstream of workstreams) {
        const matchedIssue = findMatchingIssue(workstream.name, issues);
        
        if (matchedIssue) {
          workstreamMapping.set(workstream.name, matchedIssue);
          if (workstream.id) {
            workstreamIdToIssueId.set(workstream.id, matchedIssue);
          }
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
        for (const dependencyRef of workstream.dependencies) {
          // Resolve dependency reference to source issue
          // dependencyRef can be:
          // 1. A workstream ID (e.g., "workstream-1")
          // 2. A workstream name
          let sourceIssue = null;
          
          // Try to resolve by workstream ID first
          if (workstreamIdToIssueId.has(dependencyRef)) {
            sourceIssue = workstreamIdToIssueId.get(dependencyRef);
          } else {
            // Try direct name match
            sourceIssue = workstreamMapping.get(dependencyRef);
          }
          
          if (!sourceIssue) {
            result.warnings.push(
              `Dependency "${dependencyRef}" for "${workstream.name}" not found in issues`
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
            relationship_type: 'dependency' // Allowed by DB constraint
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
         AND ir.relationship_type IN ('depends_on', 'dependency')
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

/**
 * Create hierarchical issues from workstreams
 * Separates workstreams into epics and tasks, creating parent-child relationships
 * 
 * @param {Array} workstreams - Array of workstream objects
 * @param {number} projectId - Project ID
 * @param {number} userId - User ID creating the issues
 * @returns {Object} Result object with created, epics, tasks, and errors
 */
async function createHierarchicalIssues(workstreams, projectId, userId) {
  console.log(`🏗️  Creating hierarchical issues from ${workstreams.length} workstreams in project ${projectId}`);
  
  const result = {
    created: [],
    epics: [],
    tasks: [],
    subtasks: [],
    errors: []
  };

  if (!workstreams || workstreams.length === 0) {
    console.log('  ⚠ No workstreams provided');
    return result;
  }

  try {
    // Map to store ALL created issue IDs by name (not just epics)
    const issueIdsByName = new Map();
    
    // Track created issues with their dates for dependency calculation
    const createdIssues = [];
    const projectStartDate = new Date(); // Use current date as project start
    
    console.log(`📅 Project start date: ${projectStartDate.toISOString().split('T')[0]}`);
    
    // Sort workstreams by hierarchyLevel to ensure parents are created before children
    // Level 0 (epics) → Level 1 (tasks) → Level 2 (subtasks)
    const sortedWorkstreams = [...workstreams].sort((a, b) => {
      const levelA = a.hierarchyLevel ?? 0;
      const levelB = b.hierarchyLevel ?? 0;
      return levelA - levelB;
    });
    
    console.log(`  → Processing ${sortedWorkstreams.length} items in hierarchical order`);
    
    // Count items by type for logging
    const counts = { epics: 0, tasks: 0, subtasks: 0, standalone: 0 };

    // Process all items in hierarchical order
    for (const item of sortedWorkstreams) {
      try {
        const title = item.title || item.name;
        const description = item.description || '';
        const priority = item.priority || 'medium';
        const effortHours = item.effort || null;
        const assignee = item.assignee || item.createdBy || 'Demo User';
        const itemLevel = item.hierarchyLevel ?? 0;
        
        // Parent resolution - try multiple lookup strategies
        let parentIssueId = null;
        const parentRef = item.parent || item.parentName;
        
        if (parentRef) {
          // Strategy 1: Direct lookup by parent reference
          parentIssueId = issueIdsByName.get(parentRef);
          
          // Strategy 2: Try exact title match if direct lookup fails
          if (!parentIssueId) {
            for (const [key, id] of issueIdsByName.entries()) {
              if (key === item.parent || key === item.parentName) {
                parentIssueId = id;
                break;
              }
            }
          }
          
          // Strategy 3: Try case-insensitive match
          if (!parentIssueId) {
            const parentLower = parentRef.toLowerCase();
            for (const [key, id] of issueIdsByName.entries()) {
              if (key.toLowerCase() === parentLower) {
                parentIssueId = id;
                console.log(`  ✅ Found parent "${key}" for "${item.name}" via case-insensitive match`);
                break;
              }
            }
          }
          
          if (!parentIssueId) {
            console.log(`  ⚠ Parent "${parentRef}" not found for "${item.name}" (level ${itemLevel})`);
            console.log(`     Available parents:`, Array.from(issueIdsByName.keys()).slice(0, 5));
          } else {
            console.log(`  ✅ Linked "${item.name}" to parent "${parentRef}"`);
          }
        }
        
        // Use AI-extracted hierarchy level, regardless of parent lookup success
        // Parent lookup failure doesn't mean the item is top-level
        const dbHierarchyLevel = itemLevel;
        
        // ✅ SAFEGUARD: is_epic can ONLY be true for level-0 tasks
        // This prevents AI extraction errors from creating invalid data
        const isEpic = (item.isEpic === true) && (dbHierarchyLevel === 0);
        
        if (item.isEpic === true && dbHierarchyLevel !== 0) {
          console.warn(`  ⚠️ AI incorrectly marked "${item.name}" as epic at level ${dbHierarchyLevel}. Correcting to is_epic=false.`);
        }
        
        // Log hierarchy assignment for debugging
        console.log(`  📊 "${item.name}": hierarchyLevel=${dbHierarchyLevel}, parentId=${parentIssueId || 'none'}, hasParentRef=${!!parentRef}`);

        // Calculate realistic dates based on hierarchy and parent
        const calculatedDates = calculateTaskDates(
          {
            ...item,
            parent_issue_id: parentIssueId,
            hierarchy_level: dbHierarchyLevel
          },
          createdIssues.length,
          createdIssues,
          projectStartDate
        );

        // Build dependencies array
        const dependencies = [];

        // Dependency 1: Parent task (if exists)
        if (parentIssueId) {
          dependencies.push(parentIssueId);
        }

        // Dependency 2: Previous sibling (tasks with same parent, for sequential flow)
        if (parentIssueId) {
          const siblings = createdIssues.filter(ci => ci.parent_issue_id === parentIssueId);
          if (siblings.length > 0) {
            const previousSibling = siblings[siblings.length - 1];
            dependencies.push(previousSibling.id);
          }
        }

        const dependenciesString = dependencies.join(',');

        console.log(`📋 Scheduling: ${title}`);
        console.log(`   Level: ${dbHierarchyLevel}, Parent: ${parentIssueId || 'none'}`);
        console.log(`   Dates: ${calculatedDates.start_date} → ${calculatedDates.due_date} (${calculatedDates.duration}d)`);
        console.log(`   Dependencies: ${dependenciesString || 'none'}`);

        const insertResult = await pool.query(
          `INSERT INTO issues 
           (project_id, title, description, status, priority, 
            parent_issue_id, hierarchy_level, is_epic, ai_effort_estimate_hours, 
            ai_estimate_confidence, ai_estimate_version, created_via_ai_by, assignee, 
            start_date, due_date, dependencies, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
           RETURNING id, title, parent_issue_id, hierarchy_level, is_epic`,
          [projectId, title, description, 'To Do', priority, 
           parentIssueId, dbHierarchyLevel, isEpic, effortHours, '0.85', 1, userId, assignee,
           calculatedDates.start_date, calculatedDates.due_date, dependenciesString]
        );

        const createdItem = insertResult.rows[0];
        
        // Track created issue with dates for future calculations
        createdIssues.push({
          id: createdItem.id,
          title: createdItem.title,
          parent_issue_id: parentIssueId,
          hierarchy_level: dbHierarchyLevel,
          start_date: calculatedDates.start_date,
          due_date: calculatedDates.due_date
        });
        
        // Store in map for child lookups using BOTH name and title
        if (item.name) {
          issueIdsByName.set(item.name, createdItem.id);
        }
        if (item.title && item.title !== item.name) {
          issueIdsByName.set(item.title, createdItem.id);
        }
        
        // Track by type
        let itemType;
        if (isEpic) {
          itemType = 'epic';
          counts.epics++;
          result.epics.push({
            id: createdItem.id,
            title: createdItem.title,
            name: item.name
          });
        } else if (itemLevel === 2) {
          itemType = 'subtask';
          counts.subtasks++;
          result.subtasks.push({
            id: createdItem.id,
            title: createdItem.title,
            name: item.name,
            parentId: createdItem.parent_issue_id
          });
        } else if (itemLevel === 1 || parentIssueId) {
          itemType = 'task';
          counts.tasks++;
          result.tasks.push({
            id: createdItem.id,
            title: createdItem.title,
            name: item.name,
            parentId: createdItem.parent_issue_id
          });
        } else {
          itemType = 'standalone';
          counts.standalone++;
          result.tasks.push({
            id: createdItem.id,
            title: createdItem.title,
            name: item.name,
            parentId: null
          });
        }
        
        result.created.push({
          id: createdItem.id,
          title: createdItem.title,
          type: itemType,
          parentId: createdItem.parent_issue_id,
          hierarchyLevel: createdItem.hierarchy_level,
          isEpic: createdItem.is_epic
        });
        
        // Log creation with type and parent info
        console.log(`✅ Created ${itemType}: "${createdItem.title}" (ID: ${createdItem.id})`);
        if (createdItem.parent_issue_id) {
          console.log(`   → Parent: #${createdItem.parent_issue_id}, Level: ${dbHierarchyLevel}`);
        }
        
      } catch (error) {
        const errorMsg = `Failed to create item "${item.name}": ${error.message}`;
        result.errors.push(errorMsg);
        console.error(`  ❌ ${errorMsg}`);
      }
    }

    console.log(`✅ Created ${result.created.length} hierarchical issue(s):`);
    console.log(`   - ${counts.epics} epic(s)`);
    console.log(`   - ${counts.tasks} task(s)`);
    console.log(`   - ${counts.subtasks} subtask(s)`);
    console.log(`   - ${counts.standalone} standalone task(s)`);
    
    if (result.errors.length > 0) {
      console.log(`⚠ ${result.errors.length} error(s) occurred during creation`);
    }

    return result;

  } catch (error) {
    console.error('❌ Error in createHierarchicalIssues:', error);
    result.errors.push(`Fatal error: ${error.message}`);
    return result;
  }
}

module.exports = {
  createDependencies,
  findMatchingIssue,
  levenshteinDistance,
  detectCircularDependencies,
  getDependencyGraph,
  deleteDependency,
  createHierarchicalIssues
};
