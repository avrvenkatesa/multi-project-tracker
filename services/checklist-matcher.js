// services/checklist-matcher.js
// Phase 4 Mode 2: Intelligent Checklist-to-Issue Matching

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';

let aiClient;
if (AI_PROVIDER === 'openai') {
  aiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
} else if (AI_PROVIDER === 'anthropic') {
  aiClient = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
}

/**
 * Match generated checklists to existing project issues
 * @param {array} checklists - Generated checklists from workstreams
 * @param {number} projectId - Project ID
 * @param {object} pool - Database connection pool
 * @returns {object} Matching results with confidence scores
 */
async function matchChecklistsToIssues(checklists, projectId, pool) {
  console.log(`🔗 Matching ${checklists.length} checklists to project issues...`);
  
  try {
    const issuesResult = await pool.query(
      `SELECT 
        id, 
        title, 
        description, 
        type, 
        priority, 
        status,
        tags
      FROM issues 
      WHERE project_id = $1 
      ORDER BY created_at DESC`,
      [projectId]
    );
    
    const issues = issuesResult.rows;
    
    if (issues.length === 0) {
      console.log('⚠️ No issues found in project - all checklists will be unmatched');
      return {
        matches: checklists.map(checklist => ({
          checklist: checklist,
          matchedIssue: null,
          confidence: 0,
          reasoning: 'No issues exist in this project',
          suggestedNewIssue: generateNewIssueSuggestion(checklist)
        })),
        summary: {
          totalChecklists: checklists.length,
          matched: 0,
          unmatched: checklists.length,
          averageConfidence: 0,
          highConfidence: 0,
          mediumConfidence: 0,
          lowConfidence: 0
        }
      };
    }
    
    console.log(`📋 Found ${issues.length} issues in project`);
    
    const matches = [];
    
    for (const checklist of checklists) {
      console.log(`  → Matching: ${checklist.workstreamName}`);
      
      const match = await findBestMatch(checklist, issues);
      matches.push(match);
      
      if (match.matchedIssue) {
        console.log(`    ✓ Matched to Issue #${match.matchedIssue.id} (${match.confidence}% confidence)`);
      } else {
        console.log(`    ○ No match found - suggest creating new issue`);
      }
    }
    
    const matchedCount = matches.filter(m => m.matchedIssue !== null).length;
    const totalConfidence = matches.reduce((sum, m) => sum + m.confidence, 0);
    const avgConfidence = matchedCount > 0 ? Math.round(totalConfidence / matches.length) : 0;
    
    console.log(`✅ Matching complete: ${matchedCount}/${checklists.length} matched (${avgConfidence}% avg confidence)`);
    
    return {
      matches: matches,
      summary: {
        totalChecklists: checklists.length,
        matched: matchedCount,
        unmatched: checklists.length - matchedCount,
        averageConfidence: avgConfidence,
        highConfidence: matches.filter(m => m.confidence >= 80).length,
        mediumConfidence: matches.filter(m => m.confidence >= 50 && m.confidence < 80).length,
        lowConfidence: matches.filter(m => m.confidence < 50 && m.matchedIssue !== null).length
      }
    };
    
  } catch (error) {
    console.error('Error matching checklists:', error);
    throw error;
  }
}

/**
 * Find best matching issue for a checklist
 */
async function findBestMatch(checklist, issues) {
  try {
    const checklistSummary = {
      name: checklist.workstreamName,
      description: checklist.workstreamDescription,
      phase: checklist.suggestedPhase,
      complexity: checklist.estimatedComplexity,
      itemCount: checklist.checklist.sections?.reduce(
        (sum, s) => sum + (s.items?.length || 0), 0
      ) || 0,
      sampleItems: extractSampleItems(checklist.checklist, 5)
    };
    
    const issuesSummary = issues.map(issue => ({
      id: issue.id,
      title: issue.title,
      description: issue.description?.substring(0, 200) || '',
      type: issue.type,
      priority: issue.priority,
      status: issue.status
    }));
    
    const aiMatch = await analyzeMatchWithAI(checklistSummary, issuesSummary);
    
    if (aiMatch.issueId && aiMatch.confidence >= 40) {
      const targetId = Number(aiMatch.issueId);
      
      if (isNaN(targetId)) {
        console.warn(`AI returned non-numeric issue ID "${aiMatch.issueId}" - treating as unmatched`);
        return {
          checklist: checklist,
          matchedIssue: null,
          confidence: 0,
          reasoning: `AI returned invalid issue ID format "${aiMatch.issueId}". Creating new issue is recommended.`,
          suggestedNewIssue: generateNewIssueSuggestion(checklist)
        };
      }
      
      const matchedIssue = issues.find(i => i.id === targetId);
      
      if (!matchedIssue) {
        console.warn(`AI returned issue ID ${targetId} which does not exist in project - treating as unmatched`);
        return {
          checklist: checklist,
          matchedIssue: null,
          confidence: 0,
          reasoning: `AI suggested issue #${targetId} but it does not exist in the project. Creating new issue is recommended.`,
          suggestedNewIssue: generateNewIssueSuggestion(checklist)
        };
      }
      
      return {
        checklist: checklist,
        matchedIssue: matchedIssue,
        confidence: aiMatch.confidence,
        reasoning: aiMatch.reasoning,
        suggestedNewIssue: null
      };
    }
    
    return {
      checklist: checklist,
      matchedIssue: null,
      confidence: 0,
      reasoning: aiMatch.reasoning || 'No suitable match found in existing issues',
      suggestedNewIssue: generateNewIssueSuggestion(checklist)
    };
    
  } catch (error) {
    console.error(`Error finding match for ${checklist.workstreamName}:`, error);
    
    return {
      checklist: checklist,
      matchedIssue: null,
      confidence: 0,
      reasoning: `Error during matching: ${error.message}`,
      suggestedNewIssue: generateNewIssueSuggestion(checklist)
    };
  }
}

/**
 * Use AI to analyze and find best match
 */
async function analyzeMatchWithAI(checklistSummary, issues) {
  const prompt = `You are an intelligent project management assistant. Match a checklist to the most appropriate existing issue.

CHECKLIST TO MATCH:
Name: ${checklistSummary.name}
Description: ${checklistSummary.description}
Phase: ${checklistSummary.phase}
Complexity: ${checklistSummary.complexity}
Items (${checklistSummary.itemCount}):
${checklistSummary.sampleItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

AVAILABLE ISSUES:
${issues.map((issue, i) => `
Issue ${i + 1}:
  ID: ${issue.id}
  Title: ${issue.title}
  Description: ${issue.description}
  Type: ${issue.type}
  Priority: ${issue.priority}
  Status: ${issue.status}
`).join('\n')}

TASK:
Analyze the checklist and determine which issue (if any) it best matches.

MATCHING CRITERIA:
1. Semantic similarity between checklist name/items and issue title/description
2. Alignment of work scope and deliverables
3. Phase or category matching
4. Avoid forcing matches - only match if there's genuine alignment

CONFIDENCE SCORING:
- 90-100%: Very strong match (nearly identical scope)
- 80-89%: Strong match (clear alignment, some differences)
- 70-79%: Good match (significant overlap)
- 60-69%: Moderate match (partial alignment)
- 50-59%: Weak match (some relevance)
- Below 50%: Not a good match (suggest new issue instead)

OUTPUT FORMAT (JSON):
{
  "issueId": 123 | null,
  "confidence": 85,
  "reasoning": "Detailed explanation of why this is the best match, or why no match was found. Be specific about what aligns or doesn't align."
}

CRITICAL:
- Return ONLY valid JSON (no markdown, no code blocks)
- If no issue is a good match (confidence would be <40%), return issueId: null
- Provide clear, specific reasoning
- Don't force low-quality matches

Analyze and return the JSON now.`;

  let rawResponse;
  
  if (AI_PROVIDER === 'openai') {
    const response = await aiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing project scope and matching work items to issues. You provide honest assessments and only suggest matches with genuine alignment.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });
    
    rawResponse = response.choices[0].message.content;
    
  } else if (AI_PROVIDER === 'anthropic') {
    const response = await aiClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      temperature: 0.3,
      system: 'You are an expert at analyzing project scope and matching work items to issues. You provide honest assessments and only suggest matches with genuine alignment.',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });
    
    rawResponse = response.content[0].text;
  } else {
    throw new Error(`Unsupported AI provider: ${AI_PROVIDER}`);
  }
  
  let jsonText = rawResponse.trim();
  jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  const result = JSON.parse(jsonText);
  
  return {
    issueId: result.issueId || null,
    confidence: Math.min(100, Math.max(0, result.confidence || 0)),
    reasoning: result.reasoning || 'No reasoning provided'
  };
}

/**
 * Extract sample items from checklist for matching
 */
function extractSampleItems(checklist, count = 5) {
  const items = [];
  
  if (!checklist.sections || checklist.sections.length === 0) {
    return items;
  }
  
  for (const section of checklist.sections) {
    if (!section.items || section.items.length === 0) continue;
    
    for (const item of section.items) {
      items.push(item.text);
      if (items.length >= count) break;
    }
    if (items.length >= count) break;
  }
  
  return items;
}

/**
 * Generate suggestion for new issue based on checklist
 */
function generateNewIssueSuggestion(checklist) {
  const items = extractSampleItems(checklist.checklist, 3);
  
  return {
    title: checklist.workstreamName,
    description: `${checklist.workstreamDescription}\n\nKey tasks:\n${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}`,
    type: 'Task',
    priority: checklist.estimatedComplexity === 'high' ? 'high' : 'medium',
    suggestedPhase: checklist.suggestedPhase
  };
}

/**
 * Bulk operation: Create issues and link checklists
 * @param {array} approvedMatches - Matches approved by user
 * @param {number} projectId - Project ID
 * @param {number} userId - User creating items
 * @param {object} pool - Database connection pool
 */
async function createMatchedChecklists(approvedMatches, projectId, userId, pool) {
  console.log(`📦 Creating ${approvedMatches.length} matched checklists...`);
  
  const results = {
    created: [],
    failed: [],
    issuesCreated: 0
  };
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const match of approvedMatches) {
      try {
        let issueId = match.issueId;
        
        if (match.createNewIssue && match.suggestedNewIssue) {
          const issueResult = await client.query(
            `INSERT INTO issues 
               (title, description, type, priority, status, project_id, created_by)
             VALUES ($1, $2, $3, $4, 'To Do', $5, $6)
             RETURNING id`,
            [
              match.suggestedNewIssue.title,
              match.suggestedNewIssue.description,
              match.suggestedNewIssue.type || 'Task',
              match.suggestedNewIssue.priority || 'medium',
              projectId,
              userId
            ]
          );
          
          issueId = issueResult.rows[0].id;
          results.issuesCreated++;
          
          console.log(`  ✓ Created new issue #${issueId}: ${match.suggestedNewIssue.title}`);
        }
        
        const checklist = match.checklist.checklist;
        
        const checklistResult = await client.query(
          `INSERT INTO checklists 
             (title, description, project_id, related_issue_id, created_by, source_document)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            checklist.title,
            checklist.description,
            projectId,
            issueId,
            userId,
            'AI Generated from Document'
          ]
        );
        
        const checklistId = checklistResult.rows[0].id;
        
        for (let i = 0; i < checklist.sections.length; i++) {
          const section = checklist.sections[i];
          
          const sectionResult = await client.query(
            `INSERT INTO checklist_sections (checklist_id, title, display_order)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [checklistId, section.title, i]
          );
          
          const sectionId = sectionResult.rows[0].id;
          
          for (let j = 0; j < section.items.length; j++) {
            const item = section.items[j];
            await client.query(
              `INSERT INTO checklist_responses 
                 (section_id, item_text, notes, is_completed, display_order)
               VALUES ($1, $2, $3, FALSE, $4)`,
              [sectionId, item.text, item.notes || null, j]
            );
          }
        }
        
        results.created.push({
          checklistId: checklistId,
          issueId: issueId,
          workstreamName: match.checklist.workstreamName,
          newIssueCreated: match.createNewIssue || false
        });
        
        console.log(`  ✓ Created checklist #${checklistId} for issue #${issueId}`);
        
      } catch (error) {
        console.error(`  ✗ Failed to create checklist for ${match.checklist.workstreamName}:`, error);
        results.failed.push({
          workstreamName: match.checklist.workstreamName,
          error: error.message
        });
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`✅ Batch creation complete: ${results.created.length} created, ${results.failed.length} failed`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Batch creation error:', error);
    throw error;
  } finally {
    client.release();
  }
  
  return results;
}

module.exports = {
  matchChecklistsToIssues,
  createMatchedChecklists
};
