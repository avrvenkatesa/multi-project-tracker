/**
 * Document Analyzer Service
 * Analyzes documents to detect workstreams/phases for multi-checklist generation
 */

const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai';
let aiClient;

if (AI_PROVIDER === 'openai') {
  aiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else if (AI_PROVIDER === 'anthropic') {
  aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * Analyze document to identify workstreams for multi-checklist generation
 */
async function analyzeDocumentForWorkstreams(documentText, documentName) {
  const prompt = `Analyze this document and identify distinct workstreams, phases, or major areas that should each have their own separate checklist.

Document: ${documentName}
Content:
${documentText.substring(0, 10000)}

Identify 3-8 distinct workstreams that meet these criteria:
- Each represents a separate major area of work
- Each has at least 10-15 distinct tasks/requirements
- Logical separation (e.g., Infrastructure Setup, Data Migration, Testing, Training)
- Could be executed by different teams or in different phases

Common patterns to look for:
- Project phases (Planning, Execution, Validation, Closeout)
- Technical domains (Infrastructure, Applications, Security, Network)
- Migration stages (Assessment, Setup, Migration, Validation, Cutover)
- Workstreams by system (AD Migration, File Server, Database, Application)

Respond ONLY with valid JSON:
{
  "document_type": "SOW|Requirements|Specification|Project Plan|Other",
  "complexity": "Simple|Medium|Complex",
  "total_estimated_items": 120,
  "recommendation": "multiple|single",
  "workstreams": [
    {
      "name": "Infrastructure & Network Setup",
      "description": "AWS account setup, VPC, networking, security groups",
      "estimated_items": 35,
      "priority": "high|medium|low",
      "dependencies": ["None"] or ["Infrastructure Setup"],
      "key_deliverables": ["VPC configured", "VPN established", "Security groups created"]
    }
  ],
  "reasoning": "Why this breakdown makes sense for the document"
}

Requirements:
- Identify 3-8 workstreams for complex documents
- Each workstream should have 15-40 estimated items
- Total estimated items should be 100-200 for large documents
- Workstreams should be logically independent where possible
- Use "single" recommendation only if document is very simple (<30 items total)`;

  try {
    let response;
    
    if (AI_PROVIDER === 'openai') {
      const completion = await aiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { 
            role: 'system', 
            content: 'You are a technical project analyst who identifies distinct workstreams in documents. Respond with valid JSON only, no markdown formatting.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 2000
      });
      response = completion.choices[0].message.content;
    } else if (AI_PROVIDER === 'anthropic') {
      const message = await aiClient.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [
          { 
            role: 'user', 
            content: `${prompt}\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown code blocks.` 
          }
        ]
      });
      response = message.content[0].text;
    }
    
    // Clean response
    response = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const analysis = JSON.parse(response);
    
    // Validate structure
    if (!analysis.workstreams || !Array.isArray(analysis.workstreams)) {
      throw new Error('Invalid analysis structure');
    }
    
    console.log(`Document analysis complete: ${analysis.workstreams.length} workstreams detected`);
    
    return analysis;
    
  } catch (error) {
    console.error('Document analysis error:', error);
    throw new Error(`Failed to analyze document: ${error.message}`);
  }
}

module.exports = {
  analyzeDocumentForWorkstreams
};
