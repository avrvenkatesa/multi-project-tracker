/**
 * Resource Parser Service
 * 
 * Extracts resource assignments (names, roles, effort) from document text.
 * Supports multiple formats: tables, lists, and narrative paragraphs.
 * Matches extracted names to project users using fuzzy matching.
 * 
 * @module services/resource-parser
 */

const { pool } = require('../db');

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy name matching
 * 
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  const matrix = Array(s2.length + 1).fill(null).map(() => 
    Array(s1.length + 1).fill(null)
  );

  for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= s2.length; j++) {
    for (let i = 1; i <= s1.length; i++) {
      const substitutionCost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + substitutionCost
      );
    }
  }

  return matrix[s2.length][s1.length];
}

/**
 * Normalize effort to hours
 * Converts days to hours (1 day = 8 hours)
 * 
 * @param {number} value - Effort value
 * @param {string} unit - Unit (hours, days, h, d)
 * @returns {number} Effort in hours
 */
function normalizeEffortToHours(value, unit) {
  const normalizedUnit = unit.toLowerCase().replace(/s$/, ''); // Remove plural 's'
  
  switch (normalizedUnit) {
    case 'day':
    case 'd':
      return value * 8; // 1 day = 8 hours
    case 'hour':
    case 'h':
    case 'hr':
      return value;
    default:
      console.warn(`⚠️  Unknown effort unit: ${unit}, assuming hours`);
      return value;
  }
}

/**
 * Parse resource allocation table from markdown or plain text
 * 
 * @param {string} text - Document text
 * @returns {Array} Array of resource objects
 */
function parseResourceTable(text) {
  const resources = [];
  const lines = text.split('\n');
  
  // Find table header
  let headerIndex = -1;
  let headers = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('|') && 
        (line.toLowerCase().includes('resource') || 
         line.toLowerCase().includes('task') ||
         line.toLowerCase().includes('effort'))) {
      headers = line.split('|')
        .map(h => h.trim().toLowerCase())
        .filter(h => h.length > 0);
      headerIndex = i;
      break;
    }
  }
  
  if (headerIndex === -1) {
    return resources;
  }
  
  console.log(`📊 Found resource table with headers: ${headers.join(', ')}`);
  
  // Find column indices
  const taskCol = headers.findIndex(h => 
    h.includes('task') || h.includes('component') || h.includes('activity')
  );
  const resourceCol = headers.findIndex(h => 
    h.includes('resource') || h.includes('name') || h.includes('assignee')
  );
  const roleCol = headers.findIndex(h => 
    h.includes('role') || h.includes('position')
  );
  const effortCol = headers.findIndex(h => 
    h.includes('effort') || h.includes('hour') || h.includes('time')
  );
  
  // Parse data rows (skip header and separator)
  for (let i = headerIndex + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Stop at empty line or non-table line
    if (!line || !line.includes('|')) {
      break;
    }
    
    const cells = line.split('|')
      .map(c => c.trim())
      .filter(c => c.length > 0);
    
    if (cells.length < 2) continue;
    
    // Extract effort value and unit
    let effort = null;
    let unit = 'hours';
    
    if (effortCol >= 0 && cells[effortCol]) {
      const effortText = cells[effortCol];
      const match = effortText.match(/(\d+(?:\.\d+)?)\s*(hours?|days?|h|d)?/i);
      if (match) {
        effort = parseFloat(match[1]);
        unit = match[2] || 'hours';
      }
    }
    
    const resource = {
      task: taskCol >= 0 ? cells[taskCol] : null,
      name: resourceCol >= 0 ? cells[resourceCol] : null,
      role: roleCol >= 0 ? cells[roleCol] : null,
      effort: effort,
      unit: unit
    };
    
    if (resource.name && resource.effort) {
      resources.push(resource);
      console.log(`  ✓ Parsed: ${resource.name} (${resource.role || 'N/A'}) - ${resource.effort} ${resource.unit} on ${resource.task || 'N/A'}`);
    }
  }
  
  return resources;
}

/**
 * Parse resource allocation from bullet lists
 * Format: "- Task: Name (Role) - X hours"
 * 
 * @param {string} text - Document text
 * @returns {Array} Array of resource objects
 */
function parseResourceList(text) {
  const resources = [];
  const lines = text.split('\n');
  
  // Pattern: "- Task: Name (Role) - X hours/days"
  const pattern = /^[-*]\s*([^:]+):\s*([^(]+)\(([^)]+)\)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(hours?|days?|h|d)/i;
  
  for (const line of lines) {
    const match = line.trim().match(pattern);
    if (match) {
      const resource = {
        task: match[1].trim(),
        name: match[2].trim(),
        role: match[3].trim(),
        effort: parseFloat(match[4]),
        unit: match[5]
      };
      
      resources.push(resource);
      console.log(`  ✓ Parsed list: ${resource.name} (${resource.role}) - ${resource.effort} ${resource.unit} on ${resource.task}`);
    }
  }
  
  return resources;
}

/**
 * Parse resource allocation from narrative paragraphs
 * Format: "Name (Role) will spend X hours on Task"
 * 
 * @param {string} text - Document text
 * @returns {Array} Array of resource objects
 */
function parseResourceParagraphs(text) {
  const resources = [];
  
  // Pattern: "Name (Role) will spend X hours on Task"
  const pattern1 = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\(([^)]+)\)\s+(?:will\s+)?spend\s+(\d+(?:\.\d+)?)\s*(hours?|days?|h|d)\s+on\s+([^.]+)/gi;
  
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    const resource = {
      name: match[1].trim(),
      role: match[2].trim(),
      effort: parseFloat(match[3]),
      unit: match[4],
      task: match[5].trim()
    };
    
    resources.push(resource);
    console.log(`  ✓ Parsed paragraph: ${resource.name} (${resource.role}) - ${resource.effort} ${resource.unit} on ${resource.task}`);
  }
  
  // Pattern: "Task will be handled by Name (Role) - X hours"
  const pattern2 = /([^.]+?)\s+will\s+be\s+handled\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*\(([^)]+)\)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(hours?|days?|h|d)/gi;
  
  while ((match = pattern2.exec(text)) !== null) {
    const resource = {
      task: match[1].trim(),
      name: match[2].trim(),
      role: match[3].trim(),
      effort: parseFloat(match[4]),
      unit: match[5]
    };
    
    resources.push(resource);
    console.log(`  ✓ Parsed paragraph: ${resource.name} (${resource.role}) - ${resource.effort} ${resource.unit} on ${resource.task}`);
  }
  
  return resources;
}

/**
 * Remove duplicate resources based on name + task
 * 
 * @param {Array} resources - Array of resource objects
 * @returns {Array} Deduplicated resources
 */
function deduplicateResources(resources) {
  const seen = new Set();
  const unique = [];
  
  for (const resource of resources) {
    const key = `${resource.name}::${resource.task || 'unknown'}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(resource);
    } else {
      console.log(`  ⚠️  Skipping duplicate: ${resource.name} on ${resource.task}`);
    }
  }
  
  return unique;
}

/**
 * Get all users assigned to a project
 * 
 * @param {number} projectId - Project ID
 * @returns {Promise<Array>} Array of user objects
 */
async function getProjectUsers(projectId) {
  try {
    const result = await pool.query(
      `SELECT DISTINCT u.id, u.username, u.email
       FROM users u
       INNER JOIN project_members pm ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY u.username`,
      [projectId]
    );
    
    console.log(`👥 Found ${result.rows.length} users in project ${projectId}`);
    return result.rows;
  } catch (error) {
    console.error('❌ Error fetching project users:', error);
    return [];
  }
}

/**
 * Find matching user for a resource name
 * Uses multiple matching strategies with confidence scoring
 * 
 * @param {string} resourceName - Extracted resource name
 * @param {Array} users - Array of user objects
 * @returns {Object|null} { user, confidence } or null
 */
function findMatchingUser(resourceName, users) {
  const normalized = resourceName.toLowerCase().trim();
  
  // Strategy 1: Exact match on username
  for (const user of users) {
    if (user.username && user.username.toLowerCase() === normalized) {
      return { user, confidence: 1.0 };
    }
  }
  
  // Strategy 2: Partial match (first name from resource matches first part of username)
  // "Sultan" matches "sultan.abc"
  const parts = normalized.split(/\s+/);
  if (parts.length >= 1) {
    const firstName = parts[0];
    
    for (const user of users) {
      if (user.username) {
        const usernameParts = user.username.toLowerCase().split(/[\.\-_]/);
        if (usernameParts[0] === firstName) {
          return { user, confidence: 0.8 };
        }
      }
    }
  }
  
  // Strategy 3: Fuzzy match using Levenshtein distance on username
  let bestMatch = null;
  let bestDistance = Infinity;
  
  for (const user of users) {
    if (user.username) {
      const distance = levenshteinDistance(normalized, user.username.toLowerCase());
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = user;
      }
    }
  }
  
  // Accept fuzzy match if distance is small enough
  if (bestMatch && bestDistance <= 3) {
    const confidence = 1 - (bestDistance / Math.max(normalized.length, bestMatch.username.length));
    return { user: bestMatch, confidence: Math.max(0.6, confidence) };
  }
  
  return null;
}

/**
 * Match extracted resources to actual project users
 * 
 * @param {Array} resources - Array of resource objects
 * @param {Array} users - Array of user objects
 * @returns {Array} Resources with userId and matchConfidence
 */
function matchResourcesToUsers(resources, users) {
  console.log(`🔍 Matching ${resources.length} resources to ${users.length} users`);
  
  for (const resource of resources) {
    const match = findMatchingUser(resource.name, users);
    
    if (match) {
      resource.userId = match.user.id;
      resource.matchConfidence = match.confidence;
      resource.needsReview = match.confidence < 0.9;
      
      const reviewFlag = resource.needsReview ? '⚠️' : '✓';
      console.log(`  ${reviewFlag} Matched "${resource.name}" → ${match.user.full_name} (confidence: ${(match.confidence * 100).toFixed(0)}%)`);
    } else {
      resource.userId = null;
      resource.matchConfidence = 0;
      resource.needsReview = true;
      console.warn(`  ⚠️  No match found for: ${resource.name}`);
    }
  }
  
  return resources;
}

/**
 * Assign resources to issues in the database
 * 
 * @param {Array} resources - Array of resource objects with userId
 * @param {number} projectId - Project ID
 * @returns {Promise<Array>} Array of assignments created
 */
async function assignResourcesToIssues(resources, projectId) {
  const assignments = [];
  
  console.log(`📝 Assigning ${resources.length} resources to issues in project ${projectId}`);
  
  for (const resource of resources) {
    try {
      // Skip if no task name or no user ID
      if (!resource.task || !resource.userId) {
        console.warn(`  ⚠️  Skipping assignment: ${resource.name} (missing task or userId)`);
        continue;
      }
      
      // Find matching issue by fuzzy title match
      const issueResult = await pool.query(
        `SELECT id, title FROM issues 
         WHERE project_id = $1 
         AND LOWER(title) LIKE $2
         LIMIT 1`,
        [projectId, `%${resource.task.toLowerCase()}%`]
      );
      
      if (issueResult.rows.length === 0) {
        console.warn(`  ⚠️  No issue found for task: ${resource.task}`);
        continue;
      }
      
      const issue = issueResult.rows[0];
      const effortHours = normalizeEffortToHours(resource.effort, resource.unit);
      
      // Update issue with assignment
      await pool.query(
        `UPDATE issues 
         SET assigned_to_id = $1, effort_hours = $2
         WHERE id = $3`,
        [resource.userId, effortHours, issue.id]
      );
      
      assignments.push({
        issueId: issue.id,
        issueTitle: issue.title,
        userId: resource.userId,
        userName: resource.name,
        effortHours: effortHours
      });
      
      console.log(`  ✓ Assigned: ${resource.name} to "${issue.title}" (${effortHours} hours)`);
      
    } catch (error) {
      console.error(`  ❌ Error assigning ${resource.name}:`, error.message);
    }
  }
  
  return assignments;
}

/**
 * Main function: Parse resources from document text
 * 
 * @param {string} documentText - Full document text
 * @param {Object} options - Options { projectId }
 * @returns {Promise<Object>} { resources, users, assignments }
 */
async function parseResources(documentText, options = {}) {
  console.log('🔍 RESOURCE PARSER - Starting extraction\n');
  
  const allResources = [];
  
  // Try all parsing strategies
  console.log('Strategy 1: Parsing tables...');
  const tableResources = parseResourceTable(documentText);
  allResources.push(...tableResources);
  
  console.log('\nStrategy 2: Parsing lists...');
  const listResources = parseResourceList(documentText);
  allResources.push(...listResources);
  
  console.log('\nStrategy 3: Parsing paragraphs...');
  const paragraphResources = parseResourceParagraphs(documentText);
  allResources.push(...paragraphResources);
  
  console.log(`\n📊 Total resources extracted: ${allResources.length}`);
  
  // Deduplicate
  console.log('\nDeduplicating resources...');
  const uniqueResources = deduplicateResources(allResources);
  console.log(`✓ Unique resources: ${uniqueResources.length}\n`);
  
  // Normalize effort to hours
  for (const resource of uniqueResources) {
    if (resource.effort && resource.unit) {
      const normalizedEffort = normalizeEffortToHours(resource.effort, resource.unit);
      resource.originalEffort = resource.effort;
      resource.originalUnit = resource.unit;
      resource.effort = normalizedEffort;
      resource.unit = 'hours';
    }
  }
  
  // Match to project users if projectId provided
  let users = [];
  let assignments = [];
  
  if (options.projectId) {
    console.log('Fetching project users...');
    users = await getProjectUsers(options.projectId);
    
    if (users.length > 0) {
      console.log('\nMatching resources to users...');
      matchResourcesToUsers(uniqueResources, users);
      
      // Optionally assign to issues
      if (options.assignToIssues) {
        console.log('\nAssigning resources to issues...');
        assignments = await assignResourcesToIssues(uniqueResources, options.projectId);
      }
    } else {
      console.warn('⚠️  No users found in project - skipping user matching');
    }
  }
  
  console.log('\n✅ Resource parsing complete!');
  console.log(`   Resources: ${uniqueResources.length}`);
  console.log(`   Matched: ${uniqueResources.filter(r => r.userId).length}`);
  console.log(`   Need review: ${uniqueResources.filter(r => r.needsReview).length}`);
  if (assignments.length > 0) {
    console.log(`   Assignments: ${assignments.length}`);
  }
  
  return {
    resources: uniqueResources,
    users,
    assignments
  };
}

module.exports = {
  parseResources,
  parseResourceTable,
  parseResourceList,
  parseResourceParagraphs,
  getProjectUsers,
  matchResourcesToUsers,
  findMatchingUser,
  assignResourcesToIssues,
  deduplicateResources,
  normalizeEffortToHours,
  levenshteinDistance
};
