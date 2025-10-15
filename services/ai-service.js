const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { Pool } = require('@neondatabase/serverless');

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
async function generateChecklistFromIssue(issue) {
  const prompt = `You are a project management expert. Analyze this issue and generate a detailed checklist to address it.

Issue Title: ${issue.title}
Issue Description: ${issue.description || 'No description provided'}
Issue Type: ${issue.type || 'Unknown'}
Priority: ${issue.priority || 'Medium'}
Status: ${issue.status || 'Open'}
Tags: ${issue.tags || 'None'}

Based on this issue, generate a comprehensive checklist with:
1. A descriptive checklist title that clearly indicates the purpose
2. 3-7 main sections (logical groupings of related tasks)
3. 5-15 checklist items per section
4. Appropriate field types for each item
5. Mark critical items as required

For field types, use:
- "checkbox" for yes/no confirmations and completion checks
- "text" for short answers (names, IDs, hostnames, single values)
- "textarea" for detailed notes, descriptions, or long-form content
- "date" for dates, deadlines, and timestamps
- "radio" for multiple choice selections (include 2-5 options in field_options array)

IMPORTANT TEMPLATE MATCHING:
- If this issue is about verifying server access, checking credentials, or validating permissions/connectivity, set use_template=true and template_name="Access Verification Checklist"
- Otherwise, generate a custom checklist structure with use_template=false and template_name=null

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
{
  "title": "Clear, action-oriented checklist title",
  "description": "Brief description of checklist purpose and scope",
  "use_template": true or false,
  "template_name": "Access Verification Checklist" or null,
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
- Minimum 20 total items across all sections
- At least 3 sections
- Mix of field types (not all checkboxes)
- Specific and actionable items
- Professional language`;

  return await callAI(prompt, 'issue');
}

/**
 * Generate checklist from action item
 */
async function generateChecklistFromActionItem(actionItem) {
  const prompt = `You are a project management expert. Analyze this action item and generate a detailed checklist to complete it.

Action Title: ${actionItem.title}
Description: ${actionItem.description || 'No description provided'}
Priority: ${actionItem.priority || 'Medium'}
Status: ${actionItem.status || 'Open'}
Due Date: ${actionItem.due_date || 'Not set'}
Assigned To: ${actionItem.assigned_to_name || 'Unassigned'}

Based on this action item, generate a comprehensive checklist that breaks down this action into concrete, executable steps:

1. A descriptive checklist title
2. 2-5 main sections representing major phases or categories of work
3. 3-10 specific, actionable items per section
4. Appropriate field types for each item
5. Mark critical items as required

For field types, use:
- "checkbox" for completion checks and confirmations
- "text" for capturing specific values, names, or identifiers
- "textarea" for notes, observations, or detailed responses
- "date" for deadlines, completion dates, or timestamps
- "radio" for selecting between predefined options

Think about:
- What are the prerequisite steps?
- What are the main execution steps?
- What validation/verification is needed?
- What documentation or follow-up is required?

Respond ONLY with valid JSON (no markdown formatting):
{
  "title": "Action-oriented checklist title",
  "description": "Brief description of how this checklist helps complete the action",
  "use_template": false,
  "template_name": null,
  "confidence": 80,
  "sections": [
    {
      "title": "Section name",
      "description": "What this section accomplishes",
      "items": [
        {
          "text": "Specific, actionable task description",
          "field_type": "checkbox|text|textarea|date|radio",
          "field_options": ["Option A", "Option B"] or null,
          "is_required": true or false,
          "help_text": "How to complete this step"
        }
      ]
    }
  ],
  "reasoning": "Why this breakdown makes sense for completing the action"
}

Requirements:
- Minimum 10 total items
- At least 2 sections
- Concrete, actionable steps
- Logical sequence`;

  return await callAI(prompt, 'action-item');
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
            content: 'You are a project management expert who creates detailed, actionable checklists. Always respond with valid JSON only, no markdown formatting, no code blocks.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 2000
      });
      
      response = completion.choices[0].message.content;
      
    } else if (AI_PROVIDER === 'anthropic') {
      const message = await aiClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: parseInt(process.env.AI_MAX_TOKENS) || 2000,
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
