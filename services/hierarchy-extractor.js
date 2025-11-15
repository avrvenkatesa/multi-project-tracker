/**
 * Hierarchy Extractor Service
 * 
 * Uses Claude AI to extract hierarchical task structures from documents.
 * Supports multiple hierarchy formats: indentation, numbering, headings, bullets.
 * 
 * Features:
 * - Extract epics, tasks, subtasks from document text
 * - Build nested tree structures
 * - Validate hierarchy consistency
 * - Track AI costs
 */

const Anthropic = require('@anthropic-ai/sdk');
const aiCostTracker = require('./ai-cost-tracker');

/**
 * Extract hierarchical task structure from document text using Claude AI
 * 
 * @param {string} documentText - The document text to analyze
 * @param {Object} options - Extraction options
 * @param {boolean} [options.includeEffort=true] - Whether to extract effort estimates
 * @param {string} [options.projectContext=''] - Additional context about the project
 * @param {number} [options.userId] - User ID for cost tracking
 * @param {number} [options.projectId] - Project ID for cost tracking
 * @returns {Promise<Object>} Extracted hierarchy with array and summary
 */
async function extractHierarchy(documentText, options = {}) {
  const {
    includeEffort = true,
    projectContext = '',
    userId = null,
    projectId = null
  } = options;

  console.log('🔍 [Hierarchy Extractor] Starting document analysis...');
  console.log(`📄 [Hierarchy Extractor] Document length: ${documentText.length} characters`);

  try {
    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Build the analysis prompt
    const prompt = buildExtractionPrompt(documentText, projectContext, includeEffort);

    console.log('🤖 [Hierarchy Extractor] Calling Claude Sonnet 4...');

    const startTime = Date.now();
    
    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0.3,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    const duration = Date.now() - startTime;
    console.log(`✅ [Hierarchy Extractor] Claude response received in ${duration}ms`);

    // Extract JSON from response
    const responseText = message.content[0].text;
    const hierarchy = extractJSON(responseText);

    if (!hierarchy || !hierarchy.tasks) {
      throw new Error('Invalid response format from Claude - missing tasks array');
    }

    console.log(`📊 [Hierarchy Extractor] Extracted ${hierarchy.tasks.length} items`);
    console.log(`📈 [Hierarchy Extractor] Summary: ${JSON.stringify(hierarchy.summary)}`);

    // Track AI cost
    if (userId && projectId) {
      const inputTokens = message.usage.input_tokens;
      const outputTokens = message.usage.output_tokens;
      const totalTokens = inputTokens + outputTokens;
      
      // Claude Sonnet 4 pricing: $3/MTok input, $15/MTok output
      const costUsd = (inputTokens / 1000000 * 3) + (outputTokens / 1000000 * 15);

      await aiCostTracker.trackAIUsage({
        userId,
        projectId,
        feature: 'hierarchy_extraction',
        operationType: 'extract',
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens,
        costUsd,
        model: 'claude-sonnet-4-20250514',
        metadata: {
          documentLength: documentText.length,
          extractedItems: hierarchy.tasks.length,
          duration
        }
      });

      console.log(`💰 [Hierarchy Extractor] Cost: $${costUsd.toFixed(6)} (${totalTokens} tokens)`);
    }

    return {
      hierarchy: hierarchy.tasks,
      summary: hierarchy.summary,
      metadata: {
        tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
        model: 'claude-sonnet-4-20250514',
        duration
      }
    };

  } catch (error) {
    console.error('❌ [Hierarchy Extractor] Error:', error.message);
    throw new Error(`Failed to extract hierarchy: ${error.message}`);
  }
}

/**
 * Build the Claude prompt for hierarchy extraction
 * 
 * @param {string} documentText - Document to analyze
 * @param {string} projectContext - Additional project context
 * @param {boolean} includeEffort - Whether to extract effort estimates
 * @returns {string} Formatted prompt
 */
function buildExtractionPrompt(documentText, projectContext, includeEffort) {
  const contextSection = projectContext ? `\n\nProject Context:\n${projectContext}` : '';
  const effortInstruction = includeEffort 
    ? 'Extract effort estimates in hours if mentioned (numeric values only, e.g., 8 for "8 hours" or "1 day").'
    : 'Do not extract effort estimates.';

  return `You are analyzing a project document to extract a hierarchical task structure.

${contextSection}

Document to analyze:
---
${documentText}
---

Please extract all tasks, subtasks, and epics from this document. Detect hierarchy from:
- Indentation levels (spaces or tabs)
- Numbering patterns (1.1, 1.2, 1.2.1, etc.)
- Heading levels (# Epic, ## Task, ### Subtask)
- Bullet point nesting (-, *, +)
- Section structure

For each item, extract:
- name: Concise title (under 100 characters)
- description: Additional details if available (or empty string if none)
- hierarchyLevel: 0=epic/parent, 1=task, 2=subtask, 3=sub-subtask, etc.
- parent: Name of parent task (null for top-level epics)
- isEpic: true if this is a top-level epic/parent item, false otherwise
- effort: Estimated hours as a number (null if not mentioned). ${effortInstruction}
- priority: "High", "Medium", or "Low" if mentioned (null if not mentioned)
- dependencies: Array of task names this depends on (empty array if none mentioned)

Return ONLY valid JSON in this exact format:
{
  "tasks": [
    {
      "name": "Task name",
      "description": "Task description",
      "hierarchyLevel": 0,
      "parent": null,
      "isEpic": true,
      "effort": null,
      "priority": null,
      "dependencies": []
    }
  ],
  "summary": {
    "totalItems": 10,
    "epics": 2,
    "tasks": 5,
    "subtasks": 3,
    "totalEffort": 40
  }
}

Rules:
1. Preserve the hierarchy structure from the document
2. Use exact task names (do not paraphrase)
3. Only include tasks explicitly mentioned in the document
4. If no hierarchy is clear, treat all items as tasks (hierarchyLevel: 1, isEpic: false)
5. Parent name must match exactly with another task's name
6. Effort should be numeric (hours) or null
7. Dependencies should only reference tasks that exist in the extracted list
8. Return ONLY the JSON object, no markdown formatting or additional text

Analyze the document and extract the hierarchy now.`;
}

/**
 * Extract JSON from Claude's response text
 * Handles markdown code blocks and raw JSON
 * 
 * @param {string} responseText - Claude's response
 * @returns {Object} Parsed JSON object
 */
function extractJSON(responseText) {
  console.log('🔍 [Hierarchy Extractor] Extracting JSON from response...');
  
  try {
    // Try to extract JSON from markdown code block
    const codeBlockMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1]);
    }

    // Try to extract JSON object directly
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Try parsing the entire response as JSON
    return JSON.parse(responseText);

  } catch (error) {
    console.error('❌ [Hierarchy Extractor] JSON parsing failed:', error.message);
    throw new Error('Failed to parse Claude response as JSON');
  }
}

/**
 * Convert flat hierarchy list to nested tree structure
 * 
 * @param {Array} flatHierarchy - Flat array of tasks with parent references
 * @returns {Array} Array of root nodes with nested children
 */
function buildTree(flatHierarchy) {
  console.log(`🌳 [Hierarchy Extractor] Building tree from ${flatHierarchy.length} items...`);

  if (!Array.isArray(flatHierarchy) || flatHierarchy.length === 0) {
    return [];
  }

  // Create a map for quick lookup by name
  const itemMap = new Map();
  const tree = [];

  // First pass: create map and add children arrays
  flatHierarchy.forEach(item => {
    itemMap.set(item.name, {
      ...item,
      children: []
    });
  });

  // Second pass: build parent-child relationships
  flatHierarchy.forEach(item => {
    const node = itemMap.get(item.name);
    
    if (item.parent === null || item.parent === undefined || item.parent === '') {
      // Root level item
      tree.push(node);
    } else {
      // Child item - find parent and add to its children
      const parent = itemMap.get(item.parent);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent not found - treat as root
        console.warn(`⚠️  [Hierarchy Extractor] Parent "${item.parent}" not found for "${item.name}", treating as root`);
        tree.push(node);
      }
    }
  });

  console.log(`✅ [Hierarchy Extractor] Built tree with ${tree.length} root nodes`);
  return tree;
}

/**
 * Convert tree structure back to flat list with parent references
 * 
 * @param {Array} tree - Array of tree nodes with children
 * @param {string|null} parentName - Name of parent (for recursion)
 * @returns {Array} Flat array with parent references
 */
function flattenTree(tree, parentName = null) {
  console.log(`📋 [Hierarchy Extractor] Flattening tree...`);

  if (!Array.isArray(tree) || tree.length === 0) {
    return [];
  }

  const flat = [];

  tree.forEach(node => {
    // Add current node (without children array)
    const { children, ...nodeWithoutChildren } = node;
    flat.push({
      ...nodeWithoutChildren,
      parent: parentName
    });

    // Recursively flatten children
    if (children && children.length > 0) {
      const childFlat = flattenTree(children, node.name);
      flat.push(...childFlat);
    }
  });

  console.log(`✅ [Hierarchy Extractor] Flattened to ${flat.length} items`);
  return flat;
}

/**
 * Validate hierarchy structure for consistency and correctness
 * 
 * @param {Array} hierarchy - Flat hierarchy array to validate
 * @returns {Object} Validation result with errors and warnings
 */
function validateHierarchy(hierarchy) {
  console.log(`🔍 [Hierarchy Extractor] Validating hierarchy with ${hierarchy.length} items...`);

  const errors = [];
  const warnings = [];

  if (!Array.isArray(hierarchy)) {
    errors.push('Hierarchy must be an array');
    return { valid: false, errors, warnings };
  }

  if (hierarchy.length === 0) {
    warnings.push('Hierarchy is empty');
    return { valid: true, errors, warnings };
  }

  // Check 1: Duplicate names
  const nameSet = new Set();
  const duplicates = new Set();
  
  hierarchy.forEach(item => {
    if (!item.name) {
      errors.push('Item missing name property');
      return;
    }
    
    if (nameSet.has(item.name)) {
      duplicates.add(item.name);
    }
    nameSet.add(item.name);
  });

  if (duplicates.size > 0) {
    errors.push(`Duplicate task names found: ${Array.from(duplicates).join(', ')}`);
  }

  // Check 2: Parent references exist
  const allNames = new Set(hierarchy.map(item => item.name));
  
  hierarchy.forEach(item => {
    if (item.parent && !allNames.has(item.parent)) {
      errors.push(`Parent "${item.parent}" not found for task "${item.name}"`);
    }
  });

  // Check 3: Hierarchy level consistency
  hierarchy.forEach(item => {
    if (item.hierarchyLevel === undefined || item.hierarchyLevel === null) {
      errors.push(`Task "${item.name}" missing hierarchyLevel`);
      return;
    }

    if (!Number.isInteger(item.hierarchyLevel) || item.hierarchyLevel < 0) {
      errors.push(`Task "${item.name}" has invalid hierarchyLevel: ${item.hierarchyLevel}`);
    }

    // Epics should be level 0
    if (item.isEpic && item.hierarchyLevel !== 0) {
      warnings.push(`Task "${item.name}" is marked as epic but hierarchyLevel is ${item.hierarchyLevel}, should be 0`);
    }

    // Non-epics with parent=null should probably be epics
    if (!item.isEpic && !item.parent && item.hierarchyLevel === 0) {
      warnings.push(`Task "${item.name}" has no parent and level 0 but isEpic=false`);
    }
  });

  // Check 4: Effort values are reasonable
  hierarchy.forEach(item => {
    if (item.effort !== null && item.effort !== undefined) {
      if (typeof item.effort !== 'number') {
        errors.push(`Task "${item.name}" has non-numeric effort: ${item.effort}`);
      } else if (item.effort < 0) {
        errors.push(`Task "${item.name}" has negative effort: ${item.effort}`);
      } else if (item.effort > 10000) {
        warnings.push(`Task "${item.name}" has very large effort estimate: ${item.effort} hours`);
      }
    }
  });

  // Check 5: Circular dependencies
  hierarchy.forEach(item => {
    if (item.dependencies && Array.isArray(item.dependencies)) {
      // Check if any dependency is the item itself
      if (item.dependencies.includes(item.name)) {
        errors.push(`Task "${item.name}" depends on itself (circular dependency)`);
      }

      // Check if dependencies exist
      item.dependencies.forEach(dep => {
        if (!allNames.has(dep)) {
          warnings.push(`Task "${item.name}" depends on "${dep}" which is not in the hierarchy`);
        }
      });
    }
  });

  // Check 6: Priority values
  const validPriorities = ['High', 'Medium', 'Low', null];
  hierarchy.forEach(item => {
    if (item.priority !== undefined && !validPriorities.includes(item.priority)) {
      warnings.push(`Task "${item.name}" has invalid priority: ${item.priority}`);
    }
  });

  const valid = errors.length === 0;

  console.log(`✅ [Hierarchy Extractor] Validation complete: ${valid ? 'VALID' : 'INVALID'}`);
  console.log(`   Errors: ${errors.length}, Warnings: ${warnings.length}`);

  return {
    valid,
    errors,
    warnings,
    stats: {
      totalItems: hierarchy.length,
      uniqueNames: nameSet.size,
      itemsWithEffort: hierarchy.filter(i => i.effort !== null && i.effort !== undefined).length,
      itemsWithPriority: hierarchy.filter(i => i.priority !== null && i.priority !== undefined).length,
      itemsWithDependencies: hierarchy.filter(i => i.dependencies && i.dependencies.length > 0).length
    }
  };
}

module.exports = {
  extractHierarchy,
  buildTree,
  flattenTree,
  validateHierarchy
};
