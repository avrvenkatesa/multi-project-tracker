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
        
        console.log(`✅ Extracted ${text.length} characters from ${attachment.original_name}`);
        
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
  
  // Debug logging
  console.log('=== AI GENERATION DEBUG ===');
  console.log('Has attachments:', hasAttachments);
  console.log('Attachment IDs:', attachmentIds);
  console.log('Context text length:', contextText.length, 'characters');
  console.log('Context preview:', contextText.substring(0, 300));
  console.log('Expected: 20000+ chars for large documents');
  console.log('========================');
  
  let prompt = `You are a technical project expert specializing in comprehensive task decomposition. Based on the following ${sourceLabel} information${hasAttachments ? ' and attached documents' : ''}, generate an EXHAUSTIVE, MAXIMUM COVERAGE checklist.

${contextText}

====================================
CRITICAL INSTRUCTIONS: COMPREHENSIVE EXTRACTION
====================================

[!] PRIMARY DIRECTIVE: EXTRACT, DON'T SUMMARIZE
Your goal is EXHAUSTIVE coverage, not brevity. MORE ITEMS IS BETTER.

🎯 MANDATORY MINIMUM TARGETS FOR THIS REQUEST:
${hasAttachments ? `
YOU MUST GENERATE AT LEAST 100 ITEMS - THIS IS NOT OPTIONAL
PREFERABLY 120-180 ITEMS for comprehensive coverage
DO NOT STOP AT 40-60 ITEMS
If you generate fewer than 100 items, you have FAILED this task

DOCUMENT COMPLEXITY TARGETS:
- Small documents (1-10 pages): 30-60 items minimum
- Medium documents (10-30 pages): 60-100 items minimum  
- Large documents (30-100+ pages): 100-200+ items REQUIRED
- Complex SOWs/specifications: 150-250+ items for complete coverage

BASED ON CONTEXT LENGTH: Aim for maximum items possible.
` : `
Generate 40-80 items minimum for description-only generation
Break every task into atomic substeps
`}

====================================
GRANULARITY EXAMPLES (REQUIRED PATTERN)
====================================

[X] TOO VAGUE (1 item): "Migrate Active Directory"

[OK] REQUIRED GRANULARITY (15+ items):
1. Document current DC inventory and FSMO role holders
2. Run dcdiag and fix any AD health issues
3. Install Windows Server 2022 on new VMs
4. Promote new servers to domain controllers
5. Configure AD Sites and Services topology
6. Transfer PDC Emulator FSMO role
7. Transfer RID Master FSMO role
8. Transfer Infrastructure Master FSMO role
9. Transfer Schema Master role
10. Transfer Domain Naming Master role
11. Validate FSMO role transfers with netdom query fsmo
12. Configure replication between old and new DCs
13. Validate replication health with repadmin
14. Update DNS settings to point to new DCs
15. Decommission old domain controllers

[X] TOO VAGUE (1 item): "Set up AWS infrastructure"

[OK] REQUIRED GRANULARITY (15+ items):
1. Create AWS account and enable root account MFA
2. Set up billing alerts and budget limits
3. Create IAM admin user with least privilege
4. Create VPC with /16 CIDR block
5. Create public subnets in 2 availability zones
6. Create private subnets in 2 availability zones
7. Create and attach Internet Gateway
8. Configure route tables for public subnets
9. Create NAT Gateway in public subnet
10. Configure route tables for private subnets
11. Create security groups for web tier
12. Create security groups for app tier
13. Create security groups for database tier
14. Configure Network ACLs for additional security
15. Set up VPC Flow Logs for monitoring

THIS LEVEL OF GRANULAR DETAIL IS MANDATORY FOR EVERY TASK IN THE CHECKLIST.

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

[!] ABSOLUTE REQUIREMENTS - NON-NEGOTIABLE:
${hasAttachments ? `
- MINIMUM 100 ITEMS ACROSS ALL SECTIONS (or generation has failed)
- TARGET: 120-180 items for large documents
- 6-12 major sections
- 10-20 items per major section
` : `
- MINIMUM 40 items across all sections
- 5-8 major sections
- 8-15 items per section
`}
- Every complex task broken into 5-15 atomic substeps
- Validation items for each deliverable
- NO summarization - FULL extraction only
- Specific, technical, actionable items

[!] FINAL CHECK: Count your items. If fewer than ${hasAttachments ? '100' : '40'}, you have NOT followed instructions. Add more granular items.`;

  return prompt;
}

/**
 * Call AI with prompt and parse response
 */
async function callAI(prompt, sourceType) {
  try {
    console.log(`[AI] Starting generation request (provider: ${AI_PROVIDER})`);
    let response;
    
    // Create a timeout promise
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI request timeout after 90 seconds')), 90000);
    });
    
    if (AI_PROVIDER === 'openai') {
      const completionPromise = aiClient.chat.completions.create({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: 'You are a technical project expert who creates EXHAUSTIVELY DETAILED checklists with 100-200+ items for large documents. Break every complex task into 5-15 atomic substeps. NEVER summarize - always extract every single detail mentioned. Generate MORE items rather than fewer. Your checklists should be so detailed that someone could execute them without reading source documents. You MUST generate at least 100 items when attachments are provided. Respond with valid JSON only, no markdown formatting, no code blocks.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 16384
      });
      
      const completion = await Promise.race([completionPromise, timeout]);
      response = completion.choices[0].message.content;
      
    } else if (AI_PROVIDER === 'anthropic') {
      const messagePromise = aiClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 8000,
        messages: [
          { 
            role: 'user', 
            content: `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown code blocks, no explanations before or after.` 
          }
        ]
      });
      
      const message = await Promise.race([messagePromise, timeout]);
      response = message.content[0].text;
    }
    
    console.log(`[AI] Generation complete, parsing response...`);
    
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
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      type: error.type,
      stack: error.stack
    });
    
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
 * Generate multiple checklists from one document based on workstream analysis
 */
async function generateMultipleChecklists(sourceType, sourceData, attachmentIds, workstreams) {
  const results = [];
  
  // Get full document content
  let contextText = '';
  if (sourceData.use_description) {
    contextText = buildDescriptionContext(sourceType, sourceData);
  }
  
  const attachmentContent = await getAttachmentContent(attachmentIds);
  const fullContext = contextText + attachmentContent;
  
  console.log(`Generating ${workstreams.length} checklists from document...`);
  
  // Generate checklist for each workstream
  for (let i = 0; i < workstreams.length; i++) {
    const workstream = workstreams[i];
    
    console.log(`[${i + 1}/${workstreams.length}] Generating: ${workstream.name}`);
    
    try {
      const focusedPrompt = buildWorkstreamPrompt(
        sourceType,
        sourceData,
        fullContext,
        workstream,
        i + 1,
        workstreams.length
      );
      
      const checklist = await callAI(focusedPrompt, sourceType);
      
      results.push({
        workstream_name: workstream.name,
        preview: checklist,
        success: true
      });
      
      // Small delay between API calls to avoid rate limits
      if (i < workstreams.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error(`Failed to generate checklist for ${workstream.name}:`, error);
      results.push({
        workstream_name: workstream.name,
        error: error.message,
        success: false
      });
    }
  }
  
  return results;
}

/**
 * Build focused prompt for a specific workstream
 */
function buildWorkstreamPrompt(type, data, fullContext, workstream, index, total) {
  const sourceLabel = type === 'issue' ? 'issue' : 'action item';
  
  return `You are creating checklist ${index} of ${total} for a ${sourceLabel}.

WORKSTREAM FOCUS: ${workstream.name}
Description: ${workstream.description}
Target Items: ${workstream.estimated_items}
Key Deliverables: ${workstream.key_deliverables.join(', ')}

FULL DOCUMENT CONTEXT:
${fullContext}

[!] CRITICAL: Extract ONLY items related to "${workstream.name}" workstream.
Focus on: ${workstream.description}

Create a comprehensive checklist with ${workstream.estimated_items} items covering:
${workstream.key_deliverables.map((d, i) => `${i + 1}. ${d}`).join('\n')}

REQUIREMENTS:
- Generate ${workstream.estimated_items} items (±5 items acceptable)
- Focus ONLY on this workstream, ignore other areas
- Break tasks into atomic steps
- Include: prerequisites → execution → validation → documentation
- 3-6 major sections
- 8-15 items per section

Respond ONLY with valid JSON (no markdown):
{
  "title": "${workstream.name}",
  "description": "Detailed checklist for ${workstream.description}",
  "use_template": false,
  "template_name": null,
  "confidence": 85,
  "sections": [
    {
      "title": "Section name",
      "description": "Section purpose",
      "items": [
        {
          "text": "Specific, actionable task",
          "field_type": "checkbox|text|textarea|date|radio",
          "field_options": null,
          "is_required": true or false,
          "help_text": "Completion guidance"
        }
      ]
    }
  ],
  "reasoning": "Why this structure for ${workstream.name}"
}`;
}

/**
 * Rate limiting check
 * TODO Phase 2b: Move rate limiting to database or Redis for persistence
 * Current in-memory approach resets on server restart
 */
const rateLimitMap = new Map();

function checkRateLimit(userId, requestCount = 1) {
  const key = `ai-gen-${userId}`;
  const now = Date.now();
  const userRequests = rateLimitMap.get(key) || [];
  
  // Remove requests older than 1 hour
  const recentRequests = userRequests.filter(time => now - time < 3600000);
  
  if (recentRequests.length + requestCount > 10) {
    const oldestRequest = Math.min(...recentRequests);
    const minutesUntilReset = Math.ceil((3600000 - (now - oldestRequest)) / 60000);
    return { allowed: false, minutesUntilReset };
  }
  
  // Add requestCount times to the array (for batch requests)
  for (let i = 0; i < requestCount; i++) {
    recentRequests.push(now);
  }
  rateLimitMap.set(key, recentRequests);
  return { allowed: true, remaining: 10 - recentRequests.length };
}

/**
 * Call AI for document analysis (returns multiple checklists)
 */
async function callAIForDocument(prompt) {
  try {
    console.log(`[AI] Starting document analysis (provider: ${AI_PROVIDER})`);
    let response;
    
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI request timeout after 90 seconds')), 90000);
    });
    
    if (AI_PROVIDER === 'openai') {
      const completionPromise = aiClient.chat.completions.create({
        model: process.env.AI_MODEL || 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert project manager who generates comprehensive, actionable checklists from documents. Create detailed, well-organized checklists with clear sections and specific action items. Respond with valid JSON only, no markdown formatting, no code blocks.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 16384
      });
      
      const completion = await Promise.race([completionPromise, timeout]);
      response = completion.choices[0].message.content;
      
    } else if (AI_PROVIDER === 'anthropic') {
      const messagePromise = aiClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 8000,
        messages: [
          { 
            role: 'user', 
            content: `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown code blocks, no explanations before or after.` 
          }
        ]
      });
      
      const message = await Promise.race([messagePromise, timeout]);
      response = message.content[0].text;
    }
    
    console.log(`[AI] Document analysis complete, parsing response...`);
    
    // Clean response
    response = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Parse JSON
    const data = JSON.parse(response);
    
    return data;
    
  } catch (error) {
    console.error('[AI] Document analysis error:', error);
    throw new Error(`Failed to generate checklists from document: ${error.message}`);
  }
}

/**
 * Generate checklists from standalone document text
 * For Phase 4 Mode 3: Standalone Document Processing
 */
async function generateChecklistFromDocument(documentText, context = {}) {
  console.log(`🤖 Generating standalone checklists from document (${documentText.length} chars)`);
  
  if (!documentText || documentText.trim().length === 0) {
    throw new Error('No document text provided for checklist generation');
  }
  
  // Truncate if too long (leave room for prompt)
  const maxTextLength = 50000; // ~12k tokens for document, rest for response
  const truncatedText = documentText.length > maxTextLength 
    ? documentText.substring(0, maxTextLength) + '\n\n[Document truncated...]'
    : documentText;
  
  const prompt = `You are an expert project manager. Analyze this document and extract ALL actionable tasks into comprehensive checklists.

DOCUMENT CONTENT:
${truncatedText}

TASK:
Extract ALL actionable items from this document and organize them into 2-5 focused checklists based on work areas or project phases.

CRITICAL REQUIREMENTS:
1. Extract EVERY actionable task mentioned in the document
2. Each checklist MUST contain 5-20 specific action items
3. Group related tasks into logical checklists (e.g., by phase, workstream, or area)
4. Each item must be a concrete, actionable task that starts with an action verb
5. Include context from the document in the item text

ITEM FORMAT - Each item must have:
- "text": Clear action (e.g., "Complete system discovery audit")
- "field_type": Always "checkbox"
- "is_required": true for critical tasks, false for optional

RESPONSE FORMAT (strict JSON):
{
  "checklists": [
    {
      "title": "Phase or Work Area Name (max 50 chars)",
      "description": "Brief description of this checklist (max 120 chars)",
      "sections": [
        {
          "title": "Section Name",
          "items": [
            {
              "text": "Specific actionable task from document",
              "field_type": "checkbox",
              "is_required": true
            },
            {
              "text": "Another specific task",
              "field_type": "checkbox",
              "is_required": true
            }
          ]
        }
      ]
    }
  ]
}

VALIDATION RULES:
- Minimum 2 checklists, maximum 5
- Each checklist must have at least 1 section
- Each section must have at least 3 items
- Total items across all checklists: minimum 15

IMPORTANT: Generate actual actionable items from the document content. Do NOT return empty items arrays.

Generate the checklists now with ALL items populated:`;

  try {
    const result = await callAIForDocument(prompt);
    
    console.log('=== AI RESPONSE DEBUG ===');
    console.log('Result keys:', Object.keys(result));
    console.log('Checklists count:', result.checklists?.length);
    
    // Validate structure
    if (!result.checklists || !Array.isArray(result.checklists)) {
      throw new Error('AI response missing checklists array');
    }
    
    // Validate each checklist has items
    const validChecklists = [];
    let totalItems = 0;
    
    for (const checklist of result.checklists) {
      console.log(`Checklist: "${checklist.title}"`);
      
      if (!checklist.sections || !Array.isArray(checklist.sections)) {
        console.warn(`  ⚠️  No sections array`);
        continue;
      }
      
      let checklistItemCount = 0;
      const validSections = [];
      
      for (const section of checklist.sections) {
        const itemCount = section.items?.length || 0;
        console.log(`  Section: "${section.title}" - ${itemCount} items`);
        
        if (itemCount > 0) {
          validSections.push(section);
          checklistItemCount += itemCount;
        }
      }
      
      if (checklistItemCount > 0) {
        checklist.sections = validSections;
        validChecklists.push(checklist);
        totalItems += checklistItemCount;
        console.log(`  ✅ Valid: ${checklistItemCount} total items`);
      } else {
        console.warn(`  ❌ Rejected: 0 items`);
      }
    }
    
    if (validChecklists.length === 0) {
      throw new Error('AI generated checklists but all had zero items. This is a critical failure.');
    }
    
    console.log(`✅ Generated ${validChecklists.length} valid checklists with ${totalItems} total items`);
    return validChecklists;
    
  } catch (error) {
    console.error('Error generating checklists from document:', error);
    throw error;
  }
}

/**
 * Suggest task dependencies using AI analysis
 * Analyzes task titles and descriptions to suggest logical sequencing
 * @param {Array} tasks - Array of tasks with {id, type, title, description}
 * @returns {Promise<Object>} - {success: boolean, suggestions: Array, reasoning: string}
 */
/**
 * Validate that dependencies don't contain cycles using DFS
 * @param {Array} tasks - List of tasks
 * @param {Array} dependencies - List of dependencies
 * @returns {Object} - {isValid: boolean, cycles: Array}
 */
function validateNoCycles(tasks, dependencies) {
  // Build adjacency list
  const graph = new Map();
  const taskKeys = new Set();
  
  tasks.forEach(task => {
    const key = `${task.type}:${task.id}`;
    graph.set(key, []);
    taskKeys.add(key);
  });
  
  dependencies.forEach(dep => {
    const depKey = `${dep.dependent_item_type}:${dep.dependent_item_id}`;
    const prereqKey = `${dep.prerequisite_item_type}:${dep.prerequisite_item_id}`;
    
    if (taskKeys.has(depKey) && taskKeys.has(prereqKey)) {
      // Dependent waits for prerequisite, so edge goes prerequisite -> dependent
      if (!graph.has(prereqKey)) graph.set(prereqKey, []);
      graph.get(prereqKey).push(depKey);
    }
  });
  
  // DFS to detect cycles
  const visited = new Set();
  const recursionStack = new Set();
  const cycles = [];
  
  function hasCycleDFS(node, path = []) {
    if (recursionStack.has(node)) {
      // Found a cycle
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart).concat([node]));
      return true;
    }
    
    if (visited.has(node)) {
      return false;
    }
    
    visited.add(node);
    recursionStack.add(node);
    path.push(node);
    
    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (hasCycleDFS(neighbor, [...path])) {
        // Continue checking to find all cycles
      }
    }
    
    recursionStack.delete(node);
    return false;
  }
  
  // Check each node
  for (const node of taskKeys) {
    if (!visited.has(node)) {
      hasCycleDFS(node, []);
    }
  }
  
  return {
    isValid: cycles.length === 0,
    cycles: cycles
  };
}

async function suggestTaskDependencies(tasks) {
  try {
    if (!tasks || tasks.length === 0) {
      return {
        success: false,
        error: 'No tasks provided for analysis'
      };
    }

    // Format tasks for AI analysis
    const taskList = tasks.map((task, index) => {
      return `Task ${index + 1} [${task.type}#${task.id}]:
Title: ${task.title}
Description: ${task.description || 'No description provided'}
Current Status: ${task.status || 'Unknown'}
Assignee: ${task.assignee || 'Unassigned'}
`;
    }).join('\n---\n');

    const prompt = `You are a project management expert analyzing tasks to suggest logical dependencies and sequencing.

TASKS TO ANALYZE:
${taskList}

INSTRUCTIONS:
Analyze these tasks and suggest dependencies based on:
1. **Natural workflow patterns** (planning → design → development → testing → deployment)
2. **Technical dependencies** (infrastructure before applications, backend before frontend)
3. **Logical prerequisites** (data migration before production cutover, preparation before execution)
4. **Risk mitigation** (proof of concepts before full implementations, backups before migrations)

For each suggested dependency, provide:
- Which task depends on which (using task numbers)
- The type of dependency (technical, workflow, prerequisite, risk-mitigation)
- Clear reasoning why this dependency makes sense

CRITICAL RULES - MUST FOLLOW:
1. **NEVER create circular dependencies** - If Task A depends on Task B, then Task B CANNOT depend on Task A (directly or indirectly)
2. **Dependencies must form a DAG** (Directed Acyclic Graph) - there should be no cycles in the dependency chain
3. **Validate your output** - Before returning, mentally verify that following all dependencies in order would not create a loop
4. **Prefer parallel execution** - Only add dependencies when truly necessary; allow independent tasks to run in parallel
5. **Keep it simple** - Avoid creating complex dependency chains; 1-3 dependencies per task maximum

Examples of INVALID circular dependencies (DO NOT CREATE THESE):
- Task 1 depends on Task 2, Task 2 depends on Task 1 ❌
- Task 1 depends on Task 2, Task 2 depends on Task 3, Task 3 depends on Task 1 ❌
- Task A depends on Task B and Task C, Task B depends on Task C, Task C depends on Task A ❌

Respond in JSON format:
{
  "dependencies": [
    {
      "dependent_task": <task_number>,
      "prerequisite_task": <task_number>,
      "dependency_type": "<technical|workflow|prerequisite|risk-mitigation>",
      "reasoning": "<why this dependency makes sense>"
    }
  ],
  "overall_analysis": "<brief summary of the suggested workflow sequence>",
  "parallel_opportunities": "<which tasks can run in parallel>"
}`;

    let response;
    if (AI_PROVIDER === 'openai') {
      response = await aiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      });
      
      const result = JSON.parse(response.choices[0].message.content);
      
      // Map task numbers back to actual task IDs and types
      const mappedDependencies = result.dependencies.map(dep => {
        const dependentTask = tasks[dep.dependent_task - 1];
        const prerequisiteTask = tasks[dep.prerequisite_task - 1];
        
        return {
          dependent_item_type: dependentTask.type,
          dependent_item_id: dependentTask.id,
          prerequisite_item_type: prerequisiteTask.type,
          prerequisite_item_id: prerequisiteTask.id,
          dependency_type: dep.dependency_type,
          reasoning: dep.reasoning
        };
      });

      // Validate for circular dependencies using cycle detection
      const validationResult = validateNoCycles(tasks, mappedDependencies);
      if (!validationResult.isValid) {
        console.warn('AI generated circular dependencies, filtering them out:', validationResult.cycles);
        
        // Remove dependencies that create cycles
        const filteredDependencies = mappedDependencies.filter(dep => {
          const depKey = `${dep.dependent_item_type}:${dep.dependent_item_id}`;
          const prereqKey = `${dep.prerequisite_item_type}:${dep.prerequisite_item_id}`;
          return !validationResult.cycles.some(cycle => 
            cycle.includes(depKey) && cycle.includes(prereqKey)
          );
        });

        return {
          success: true,
          dependencies: filteredDependencies,
          overall_analysis: result.overall_analysis + '\n\n⚠️ Note: Some circular dependencies were automatically removed to ensure a valid schedule.',
          parallel_opportunities: result.parallel_opportunities,
          warning: 'Circular dependencies were detected and removed'
        };
      }

      return {
        success: true,
        dependencies: mappedDependencies,
        overall_analysis: result.overall_analysis,
        parallel_opportunities: result.parallel_opportunities
      };
      
    } else if (AI_PROVIDER === 'anthropic') {
      response = await aiClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      });

      const result = JSON.parse(response.content[0].text);
      
      // Map task numbers back to actual task IDs and types
      const mappedDependencies = result.dependencies.map(dep => {
        const dependentTask = tasks[dep.dependent_task - 1];
        const prerequisiteTask = tasks[dep.prerequisite_task - 1];
        
        return {
          dependent_item_type: dependentTask.type,
          dependent_item_id: dependentTask.id,
          prerequisite_item_type: prerequisiteTask.type,
          prerequisite_item_id: prerequisiteTask.id,
          dependency_type: dep.dependency_type,
          reasoning: dep.reasoning
        };
      });

      return {
        success: true,
        dependencies: mappedDependencies,
        overall_analysis: result.overall_analysis,
        parallel_opportunities: result.parallel_opportunities
      };
    }

  } catch (error) {
    console.error('Error suggesting task dependencies:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  generateChecklistFromIssue,
  generateChecklistFromActionItem,
  generateMultipleChecklists,
  generateChecklistFromDocument,
  checkRateLimit,
  suggestTaskDependencies
};
