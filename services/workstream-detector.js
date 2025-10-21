// services/workstream-detector.js
// Phase 4 Mode 2: Workstream Detection for Multi-Checklist Generation

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
 * Analyze document and identify distinct workstreams
 * @param {string} documentText - Full document text
 * @param {object} context - Project context
 * @returns {object} Identified workstreams with metadata
 */
async function detectWorkstreams(documentText, context) {
  console.log('🔍 Analyzing document for workstreams...');
  
  try {
    const maxLength = 30000;
    const text = documentText.length > maxLength 
      ? documentText.substring(0, maxLength) + '\n\n[Document truncated for analysis...]'
      : documentText;
    
    const prompt = buildWorkstreamDetectionPrompt(text, context);
    
    let rawResponse;
    
    if (AI_PROVIDER === 'openai') {
      const response = await aiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert project analyst specializing in document analysis and work breakdown structure. You identify distinct, non-overlapping work areas in project documents.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.5,
        max_tokens: 3000
      });
      
      rawResponse = response.choices[0].message.content;
      console.log('📄 Raw AI response length:', rawResponse.length);
      console.log('🔢 Tokens used:', response.usage?.total_tokens || 0);
      
      const parsed = parseWorkstreamResponse(rawResponse);
      
      console.log(`✅ Identified ${parsed.workstreams.length} workstreams`);
      
      return {
        success: true,
        workstreams: parsed.workstreams,
        summary: parsed.summary,
        documentLength: documentText.length,
        tokensUsed: response.usage?.total_tokens || 0
      };
      
    } else if (AI_PROVIDER === 'anthropic') {
      const response = await aiClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 3000,
        temperature: 0.5,
        system: 'You are an expert project analyst specializing in document analysis and work breakdown structure. You identify distinct, non-overlapping work areas in project documents.',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });
      
      rawResponse = response.content[0].text;
      console.log('📄 Raw AI response length:', rawResponse.length);
      console.log('🔢 Tokens used:', response.usage?.input_tokens + response.usage?.output_tokens || 0);
      
      const parsed = parseWorkstreamResponse(rawResponse);
      
      console.log(`✅ Identified ${parsed.workstreams.length} workstreams`);
      
      return {
        success: true,
        workstreams: parsed.workstreams,
        summary: parsed.summary,
        documentLength: documentText.length,
        tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
      };
    } else {
      throw new Error(`Unsupported AI provider: ${AI_PROVIDER}`);
    }
    
  } catch (error) {
    console.error('Error detecting workstreams:', error);
    throw error;
  }
}

/**
 * Build AI prompt for workstream detection
 */
function buildWorkstreamDetectionPrompt(documentText, context) {
  return `Analyze this document and identify distinct work areas, phases, or workstreams.

PROJECT CONTEXT:
- Project: ${context.projectName || 'Unknown'}
- Document: ${context.documentFilename || 'Unknown'}
${context.projectDescription ? `- Description: ${context.projectDescription}` : ''}

DOCUMENT CONTENT:
${documentText}

TASK:
Identify 3-10 distinct workstreams or work areas from this document. Each workstream should represent a logically separate area of work that could be managed independently.

GUIDELINES:
1. Look for natural divisions: phases, components, functional areas, deliverables, stages
2. Each workstream should be substantial enough for 5-15 actionable tasks
3. Avoid excessive granularity - combine related small sections
4. Avoid overlapping workstreams - each should be distinct and non-redundant
5. Use clear, descriptive names (e.g., "Infrastructure Setup and Configuration", not "Section 1" or "Phase 1")
6. Extract key information and requirements for each workstream from the document
7. Identify logical dependencies (which workstreams should be completed before others)

OUTPUT FORMAT (JSON):
{
  "workstreams": [
    {
      "id": "workstream-1",
      "name": "Clear descriptive name (e.g., 'Infrastructure Assessment and Planning')",
      "description": "2-3 sentence description of this work area and its scope",
      "documentSections": ["Section 2.1: Current State Analysis", "Section 2.3: Infrastructure Inventory"],
      "keyRequirements": [
        "Specific requirement or deliverable 1",
        "Specific requirement or deliverable 2",
        "Specific requirement or deliverable 3"
      ],
      "estimatedComplexity": "low" | "medium" | "high",
      "dependencies": ["workstream-2"], 
      "suggestedPhase": "Planning" | "Implementation" | "Testing" | "Deployment" | "Post-Deployment"
    }
  ],
  "summary": {
    "totalWorkstreams": 5,
    "documentType": "SOW" | "Requirements Document" | "Technical Specification" | "Project Plan" | "Other",
    "overallScope": "2-3 sentence summary of the overall document scope and purpose"
  }
}

CRITICAL RULES:
- Return ONLY valid JSON (no markdown, no code blocks, no explanations)
- Each workstream MUST be distinct and substantial
- Each workstream MUST have at least 3 keyRequirements
- Dependencies must reference valid workstream IDs
- Minimum 3 workstreams, maximum 10 workstreams

Analyze the document now and return the JSON.`;
}

/**
 * Parse AI response into structured workstreams
 */
function parseWorkstreamResponse(rawResponse) {
  try {
    let jsonText = rawResponse.trim();
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const parsed = JSON.parse(jsonText);
    
    if (!parsed.workstreams || !Array.isArray(parsed.workstreams)) {
      throw new Error('Invalid workstream structure from AI - missing workstreams array');
    }
    
    const workstreams = parsed.workstreams
      .filter(ws => {
        if (!ws.name || !ws.description) {
          console.warn('Skipping workstream without name or description');
          return false;
        }
        return true;
      })
      .map((ws, index) => ({
        id: ws.id || `workstream-${index + 1}`,
        name: ws.name.trim(),
        description: ws.description.trim(),
        documentSections: Array.isArray(ws.documentSections) ? ws.documentSections : [],
        keyRequirements: Array.isArray(ws.keyRequirements) ? ws.keyRequirements : [],
        estimatedComplexity: ['low', 'medium', 'high'].includes(ws.estimatedComplexity) 
          ? ws.estimatedComplexity 
          : 'medium',
        dependencies: Array.isArray(ws.dependencies) ? ws.dependencies : [],
        suggestedPhase: ws.suggestedPhase || 'Implementation'
      }));
    
    if (workstreams.length === 0) {
      throw new Error('No valid workstreams generated by AI');
    }
    
    if (workstreams.length < 3) {
      throw new Error(`Insufficient workstreams detected: AI generated only ${workstreams.length} workstream(s), but Phase 4 Mode 2 requires at least 3 distinct workstreams. Please provide a more detailed document or try again.`);
    }
    
    if (workstreams.length > 10) {
      console.warn(`AI generated ${workstreams.length} workstreams, limiting to maximum of 10 as per Phase 4 Mode 2 specification`);
      workstreams.splice(10);
    }
    
    const summary = {
      totalWorkstreams: workstreams.length,
      documentType: parsed.summary?.documentType || 'Unknown',
      overallScope: parsed.summary?.overallScope || 'Document analysis completed'
    };
    
    return {
      workstreams,
      summary
    };
    
  } catch (error) {
    console.error('Error parsing workstream response:', error);
    console.error('Raw response preview:', rawResponse.substring(0, 500));
    
    if (error.message && error.message.includes('Insufficient workstreams detected')) {
      throw error;
    }
    
    if (error.message && error.message.includes('No valid workstreams generated')) {
      throw error;
    }
    
    if (error instanceof SyntaxError) {
      throw new Error(`AI returned invalid JSON: ${error.message}`);
    }
    
    throw new Error(`Failed to parse AI workstream response: ${error.message}`);
  }
}

/**
 * Generate checklists for identified workstreams
 * @param {array} workstreams - Detected workstreams
 * @param {string} documentText - Original document
 * @returns {array} Generated checklists with workstream metadata
 */
async function generateChecklistsForWorkstreams(workstreams, documentText) {
  console.log(`📋 Generating checklists for ${workstreams.length} workstreams...`);
  
  const checklists = [];
  
  for (const workstream of workstreams) {
    try {
      console.log(`  → Generating checklist for: ${workstream.name}`);
      const checklist = await generateWorkstreamChecklist(workstream, documentText);
      
      checklists.push({
        workstreamId: workstream.id,
        workstreamName: workstream.name,
        workstreamDescription: workstream.description,
        estimatedComplexity: workstream.estimatedComplexity,
        suggestedPhase: workstream.suggestedPhase,
        checklist: checklist
      });
      
      console.log(`  ✓ Generated ${checklist.sections?.reduce((sum, s) => sum + (s.items?.length || 0), 0) || 0} items`);
      
    } catch (error) {
      console.error(`  ✗ Error generating checklist for ${workstream.name}:`, error);
    }
  }
  
  console.log(`✅ Generated ${checklists.length}/${workstreams.length} checklists successfully`);
  
  return checklists;
}

/**
 * Generate single checklist for a workstream
 */
async function generateWorkstreamChecklist(workstream, documentText) {
  const prompt = `Generate a focused, actionable checklist for this specific work area.

WORKSTREAM DETAILS:
Name: ${workstream.name}
Description: ${workstream.description}
Phase: ${workstream.suggestedPhase}
Complexity: ${workstream.estimatedComplexity}

Key Requirements:
${workstream.keyRequirements.map((req, i) => `${i + 1}. ${req}`).join('\n')}

Document Sections Referenced:
${workstream.documentSections.join('\n')}

FULL DOCUMENT (for context):
${documentText.substring(0, 15000)}

TASK:
Generate a checklist with 5-15 actionable items specifically for the "${workstream.name}" workstream.

REQUIREMENTS:
1. Items must be specific to THIS workstream only (not general or overlapping with other workstreams)
2. Start each item with an action verb (Review, Implement, Configure, Test, Verify, Document, etc.)
3. Include relevant document section references in notes where applicable
4. Order items logically based on dependencies and workflow
5. Make items specific, measurable, and achievable
6. Group related items into logical sections (e.g., Planning, Execution, Validation)

OUTPUT FORMAT (JSON):
{
  "title": "${workstream.name} Checklist",
  "description": "Brief 1-2 sentence description of this checklist's purpose",
  "sections": [
    {
      "title": "Section name (e.g., 'Planning', 'Execution', 'Validation', 'Documentation')",
      "items": [
        {
          "text": "Specific actionable task with clear outcome",
          "notes": "Context, document reference (e.g., 'Per Section 2.1'), or additional details",
          "priority": "high" | "medium" | "low"
        }
      ]
    }
  ]
}

CRITICAL RULES:
- Return ONLY valid JSON (no markdown, no code blocks)
- Must have at least 2 sections
- Each section must have at least 2 items
- Total items must be between 5-15
- Items must be actionable and specific to this workstream

Generate the checklist now and return the JSON.`;

  let response, rawResponse;
  
  if (AI_PROVIDER === 'openai') {
    response = await aiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a project management expert creating focused, actionable checklists for specific work areas. Each checklist item should be clear, measurable, and achievable.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    rawResponse = response.choices[0].message.content;
    
  } else if (AI_PROVIDER === 'anthropic') {
    response = await aiClient.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      temperature: 0.7,
      system: 'You are a project management expert creating focused, actionable checklists for specific work areas. Each checklist item should be clear, measurable, and achievable.',
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
  
  const checklist = JSON.parse(jsonText);
  
  if (!checklist.sections || !Array.isArray(checklist.sections)) {
    throw new Error('Generated checklist missing sections array');
  }
  
  if (checklist.sections.length === 0) {
    throw new Error('Generated checklist has no sections');
  }
  
  const validSections = checklist.sections.filter(section => {
    if (!section.items || !Array.isArray(section.items) || section.items.length === 0) {
      console.warn(`Removing empty section: ${section.title}`);
      return false;
    }
    return true;
  });
  
  if (validSections.length === 0) {
    throw new Error('Generated checklist has no valid sections with items');
  }
  
  checklist.sections = validSections;
  
  const totalItems = checklist.sections.reduce((sum, s) => sum + s.items.length, 0);
  
  if (totalItems === 0) {
    throw new Error('Generated checklist has zero items');
  }
  
  console.log(`    → Checklist has ${checklist.sections.length} sections, ${totalItems} items`);
  
  return checklist;
}

module.exports = {
  detectWorkstreams,
  generateChecklistsForWorkstreams,
  generateWorkstreamChecklist
};
