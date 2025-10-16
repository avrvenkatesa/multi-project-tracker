const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('@neondatabase/serverless');
const { extractTextFromFile, truncateToTokenLimit } = require('./file-processor');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';

// Initialize AI client
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
 * Lookup template ID by name (no hardcoding)
 */
async function getTemplateByName(templateName) {
  try {
    const result = await pool.query(
      'SELECT id FROM checklist_templates WHERE name = $1 AND is_active = true LIMIT 1',
      [templateName]
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    console.error('Template lookup error:', error);
    return null;
  }
}

/**
 * Generate checklist from issue
 */
async function generateChecklistFromIssue(issue, attachmentIds = [], useDescription = true) {
  let contextText = '';
  
  if (useDescription) {
    contextText += buildDescriptionContext('issue', issue);
  }
  
  if (attachmentIds && attachmentIds.length > 0) {
    const attachmentContent = await getAttachmentContent(attachmentIds);
    contextText += attachmentContent;
  }
  
  if (!contextText.trim()) {
    throw new Error('No source content provided for generation');
  }
  
  const prompt = buildEnhancedPrompt('issue', issue, contextText, attachmentIds);
  return await callAI(prompt, 'issue');
}

/**
 * Generate checklist from action item
 */
async function generateChecklistFromActionItem(actionItem, attachmentIds = [], useDescription = true) {
  let contextText = '';
  
  if (useDescription) {
    contextText += buildDescriptionContext('action-item', actionItem);
  }
  
  if (attachmentIds && attachmentIds.length > 0) {
    const attachmentContent = await getAttachmentContent(attachmentIds);
    contextText += attachmentContent;
  }
  
  if (!contextText.trim()) {
    throw new Error('No source content provided for generation');
  }
  
  const prompt = buildEnhancedPrompt('action-item', actionItem, contextText, attachmentIds);
  return await callAI(prompt, 'action-item');
}

/**
 * Build context from description
 */
function buildDescriptionContext(type, data) {
  if (type === 'issue') {
    return `
====================================
SOURCE: Issue Description
====================================

Issue Title: ${data.title}
Description: ${data.description || 'No description provided'}
Type: ${data.type || 'Unknown'}
Priority: ${data.priority || 'Medium'}
Status: ${data.status || 'Open'}
Tags: ${data.tags || 'None'}

`;
  } else {
    return `
====================================
SOURCE: Action Item Description
====================================

Title: ${data.title}
Description: ${data.description || 'No description provided'}
Priority: ${data.priority || 'Medium'}
Status: ${data.status || 'Open'}
Due Date: ${data.due_date || 'Not set'}
Assigned To: ${data.assigned_to_name || 'Unassigned'}

`;
  }
}

/**
 * Get and process attachment content
 */
async function getAttachmentContent(attachmentIds) {
  const result = await pool.query(
    `SELECT id, original_name, file_path, file_type, extracted_text, file_size
     FROM attachments 
     WHERE id = ANY($1)
     ORDER BY id`,
    [attachmentIds]
  );
  
  if (result.rows.length === 0) {
    throw new Error('No attachments found with provided IDs');
  }
  
  let content = '\n====================================\n';
  content += 'SOURCE: Attached Documents\n';
  content += '====================================\n\n';
  
  for (const attachment of result.rows) {
    if (attachment.file_size > 10 * 1024 * 1024) {
      content += `--- Document: ${attachment.original_name} ---\n`;
      content += '[File too large to process (>10MB)]\n\n';
      continue;
    }
    
    let text = attachment.extracted_text;
    
    if (!text) {
      try {
        console.log(`Extracting text from attachment ${attachment.id}: ${attachment.original_name}`);
        text = await extractTextFromFile(attachment.file_path, attachment.file_type);
        
        await pool.query(
          `UPDATE attachments 
           SET extracted_text = $1, 
               is_processed = true,
               processing_error = NULL
           WHERE id = $2`,
          [text, attachment.id]
        );
      } catch (error) {
        console.error(`Failed to extract text from ${attachment.original_name}:`, error);
        
        await pool.query(
          `UPDATE attachments 
           SET processing_error = $1,
               is_processed = false
           WHERE id = $2`,
          [error.message, attachment.id]
        );
        
        text = `[Could not extract text from ${attachment.original_name}: ${error.message}]`;
      }
    }
    
    text = truncateToTokenLimit(text, 3000);
    
    content += `--- Document: ${attachment.original_name} ---\n${text}\n\n`;
  }
  
  return content;
}

/**
 * Build enhanced prompt with context
 */
function buildEnhancedPrompt(type, data, contextText, attachmentIds = []) {
  const sourceLabel = type === 'issue' ? 'issue' : 'action item';
  const hasAttachments = attachmentIds && attachmentIds.length > 0;
  
  let prompt = `You are a technical project expert specializing in comprehensive task decomposition. Based on the following ${sourceLabel} information${hasAttachments ? ' and attached documents' : ''}, generate an EXHAUSTIVE, MAXIMUM COVERAGE checklist.

${contextText}

====================================
CRITICAL INSTRUCTIONS: COMPREHENSIVE EXTRACTION
====================================

[!] PRIMARY DIRECTIVE: EXTRACT, DON'T SUMMARIZE
Your goal is EXHAUSTIVE coverage, not brevity. MORE ITEMS IS BETTER.

${hasAttachments ? `
DOCUMENT SIZE ANALYSIS & TARGETS:
Estimate the document complexity and aim for:
- Small documents (1-10 pages): 30-60 checklist items minimum
- Medium documents (10-30 pages): 60-100 checklist items minimum  
- Large documents (30-100+ pages): 100-200+ checklist items minimum
- Complex SOWs/specifications: 150-250+ items for complete coverage

FOR THIS REQUEST: Aim for the MAXIMUM items based on content volume.
` : `
DESCRIPTION-BASED TARGETS:
- Simple tasks: 20-40 items with granular steps
- Complex tasks: 40-80+ items breaking down every detail
`}

====================================
EXTRACTION RULES (MANDATORY)
====================================

1. GRANULARITY: Break complex tasks into atomic, single-action steps
   [X] Bad: "Migrate Active Directory"
   [OK] Good: Create 12+ items: "Document current DC inventory", "Validate AD health checks", "Install Windows 2022 DCs", "Transfer PDC Emulator FSMO role", "Transfer RID Master role", "Validate replication health", "Decommission old DCs", etc.

2. DECOMPOSITION: Every deliverable needs pre/during/post steps
   - Prerequisites and setup (before)
   - Execution steps (during) 
   - Validation and verification (after)
   - Documentation and handoff

3. COMPLETENESS: Extract ALL mentioned items, don't skip intermediate steps
   - Include every requirement, deliverable, milestone
   - Add validation steps for each deliverable
   - Include dependencies, prerequisites, acceptance criteria
   - Add sign-off and approval points

4. VALIDATION: Each major task needs verification items
   - Pre-task validation (readiness checks)
   - In-progress validation (quality checks)
   - Post-task validation (acceptance criteria)
   - Rollback planning items

5. SECTIONS: Create 5-12 comprehensive sections for complex documents
   - Each section should have 8-20 items minimum
   - Use logical phases: Planning → Preparation → Execution → Validation → Documentation

====================================
INSTRUCTIONS
====================================

1. Analyze ALL provided information with extreme detail
2. Extract EVERY requirement, task, deliverable, and milestone
3. Break complex tasks into 5-15 granular substeps each
4. Create 5-12 logical sections (for substantial documents)
5. Generate 8-20 specific items per major section
6. Use appropriate field types for each item
7. Mark critical validation items as required

${hasAttachments ? `
For SOWs, Requirements, Specifications, Contracts:
- Extract EVERY deliverable mentioned (don't group or summarize)
- Break each deliverable into setup → execution → validation steps
- Include all dependencies, prerequisites, and constraints
- Add acceptance criteria as separate checklist items
- Include project milestones, reviews, and sign-off points
- Cover pre-project planning, ongoing execution, and post-project closeout
` : ''}

Field types to use:
- "checkbox" for yes/no confirmations and completion checks
- "text" for capturing specific values, names, IDs, hostnames
- "textarea" for detailed notes, observations, descriptions
- "date" for deadlines, milestones, and timestamps
- "radio" for multiple choice selections (include 2-5 options in field_options array)

${type === 'issue' ? `
IMPORTANT TEMPLATE MATCHING:
- If this issue is about verifying server access, checking credentials, or validating permissions/connectivity, set use_template=true and template_name="Access Verification Checklist"
- Otherwise, generate a custom checklist structure with use_template=false and template_name=null
` : ''}

====================================
CRITICAL REMINDERS
====================================
[OK] MORE IS BETTER - Aim for exhaustive coverage
[OK] EXTRACT DON'T SUMMARIZE - Include all details from source
[OK] BE GRANULAR - Break complex tasks into atomic substeps  
[OK] ADD VALIDATION - Every deliverable needs pre/during/post checks
${hasAttachments ? '[OK] TARGET: 100+ items for substantial documents (30+ pages)' : '[OK] TARGET: 40+ items for complex tasks'}

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
{
  "title": "Clear, action-oriented checklist title",
  "description": "Brief description of checklist purpose and scope",
  "use_template": ${type === 'issue' ? 'true or false' : 'false'},
  "template_name": ${type === 'issue' ? '"Access Verification Checklist" or null' : 'null'},
  "confidence": 75,
  "sections": [
    {
      "title": "Section name (e.g., 'Initial Setup', 'Validation Steps')",
      "description": "Brief description of this section's purpose",
      "items": [
        {
          "text": "Clear, actionable item description",
          "field_type": "checkbox|text|textarea|date|radio",
          "field_options": ["Option 1", "Option 2", "Option 3"] or null,
          "is_required": true or false,
          "help_text": "Optional guidance for completing this item"
        }
      ]
    }
  ],
  "reasoning": "1-2 sentence explanation of why this checklist structure was chosen"
}

Requirements:
- Minimum ${hasAttachments ? '100' : '40'} total items across all sections for comprehensive coverage
- 5-12 sections for complex documents, at least 3 sections minimum
- 8-20 items per major section
- Mix of field types (not all checkboxes)
- Specific, atomic, and actionable items
- Professional language
- EXHAUSTIVE, MAXIMUM COVERAGE approach`;

  return prompt;
}

/**
 * Call AI with prompt and parse response
 */
async function callAI(prompt, sourceType) {
  try {
    let response;
    
    if (AI_PROVIDER === 'openai') {
      const completion = await aiClient.chat.completions.create({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: 'You are a technical project expert specializing in comprehensive task decomposition. Create exhaustive, detailed checklists with maximum coverage. Always respond with valid JSON only, no markdown formatting, no code blocks.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 16000
      });
      
      response = completion.choices[0].message.content;
      
    } else if (AI_PROVIDER === 'anthropic') {
      const message = await aiClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 8000,
        messages: [
          { 
            role: 'user', 
            content: `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown code blocks, no explanations before or after.` 
          }
        ]
      });
      
      response = message.content[0].text;
    }
    
    // Clean response - remove markdown code blocks if AI included them
    response = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Parse JSON
    const checklistData = JSON.parse(response);
    
    // Validate structure
    if (!checklistData.title || !checklistData.sections || !Array.isArray(checklistData.sections)) {
      throw new Error('Invalid checklist structure from AI');
    }
    
    // Validate sections have items
    if (checklistData.sections.length === 0 || !checklistData.sections[0].items) {
      throw new Error('Checklist must have sections with items');
    }
    
    // If AI suggests using a template, look up the ID dynamically
    if (checklistData.use_template && checklistData.template_name) {
      const templateId = await getTemplateByName(checklistData.template_name);
      checklistData.template_id = templateId;
      
      if (!templateId) {
        console.warn(`Template "${checklistData.template_name}" not found, generating custom checklist instead`);
        checklistData.use_template = false;
      }
    } else {
      checklistData.template_id = null;
    }
    
    // Add metadata
    checklistData.generation_source = sourceType;
    
    return checklistData;
    
  } catch (error) {
    console.error('AI generation error:', error);
    
    // Enhanced error handling with specific types
    if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      throw new Error('Connection failed. Please check your internet connection and try again.');
    }
    
    if (error.status === 401 || error.message?.includes('API key')) {
      throw new Error('AI service configuration error. Please contact your administrator.');
    }
    
    if (error.status === 429) {
      throw new Error('AI service rate limit exceeded. Please try again in a few minutes.');
    }
    
    if (error.code === 'context_length_exceeded' || error.message?.includes('token')) {
      throw new Error('Request too large. Try with a shorter description or fewer details.');
    }
    
    if (error instanceof SyntaxError) {
      throw new Error('AI returned invalid response. Please try again.');
    }
    
    // Generic fallback
    throw new Error(`Failed to generate checklist: ${error.message}`);
  }
}

/**
 * Rate limiting check
 * TODO Phase 2b: Move rate limiting to database or Redis for persistence
 * Current in-memory approach resets on server restart
 */
const rateLimitMap = new Map();

function checkRateLimit(userId) {
  const key = `ai-gen-${userId}`;
  const now = Date.now();
  const userRequests = rateLimitMap.get(key) || [];
  
  // Remove requests older than 1 hour
  const recentRequests = userRequests.filter(time => now - time < 3600000);
  
  if (recentRequests.length >= 10) {
    const oldestRequest = Math.min(...recentRequests);
    const minutesUntilReset = Math.ceil((3600000 - (now - oldestRequest)) / 60000);
    return { allowed: false, minutesUntilReset };
  }
  
  recentRequests.push(now);
  rateLimitMap.set(key, recentRequests);
  return { allowed: true, remaining: 10 - recentRequests.length };
}

module.exports = {
  generateChecklistFromIssue,
  generateChecklistFromActionItem,
  checkRateLimit
};
