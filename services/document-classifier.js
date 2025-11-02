const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Base categories that downstream processors expect
const BASE_CATEGORIES = [
  'requirements',    // Functional/technical specs, user stories
  'timeline',        // Project schedules, milestones, deadlines
  'resources',       // Team assignments, roles, capacity planning
  'dependencies',    // Technical dependencies, blockers, prerequisites
  'risks',          // Risk registers, mitigation plans
  'architecture',   // System diagrams, technical design docs
  'other'           // Miscellaneous documents
];

/**
 * Classify a document using hybrid AI approach
 * @param {string} text - Document text content
 * @param {string} filename - Document filename
 * @returns {Promise<{category: string, confidence: number, reasoning: string, is_custom_category: boolean, text_length: number}>}
 */
async function classifyDocument(text, filename) {
  try {
    console.log(`\n🔍 Classifying document: ${filename}`);
    console.log(`   Text length: ${text.length} characters`);

    // Truncate very long documents to save API costs
    const maxLength = 8000;
    const truncatedText = text.length > maxLength 
      ? text.substring(0, maxLength) + '\n\n[... truncated for classification ...]'
      : text;

    const systemPrompt = `You are a document classifier for project management documents.

Your task is to classify documents using a HYBRID approach:

1. First, check if the document fits ONE of these base categories:
   - requirements: Functional/technical specs, user stories, specifications
   - timeline: Project schedules, milestones, Gantt charts, project timelines
   - resources: Team assignments, roles, staffing plans, resource allocation
   - dependencies: Technical dependencies, integration requirements, blockers
   - risks: Risk registers, mitigation plans, RAID logs
   - architecture: System designs, technical architecture, diagrams
   - other: General documentation that doesn't fit above categories

2. If the document fits a base category with HIGH confidence (>0.7), use that category.

3. If NO base category is a good fit (confidence ≤0.7), CREATE a NEW category that accurately describes the document type.

New categories should be:
- Lowercase with hyphens (e.g., "migration-procedure", "test-plan", "cost-estimate")
- Specific and descriptive (1-3 words)
- Project management or technical domain related

Respond ONLY with valid JSON in this exact format:
{
  "category": "category-name",
  "confidence": 0.85,
  "reasoning": "Brief explanation of why this category was chosen",
  "is_new_category": false
}`;

    const userPrompt = `Filename: ${filename}

Document content:
${truncatedText}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,  // Lower temperature for more consistent classification
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);

    // Validate and sanitize confidence score
    let confidence = parseFloat(result.confidence);
    if (isNaN(confidence) || confidence < 0 || confidence > 1) {
      console.warn(`   ⚠️  Invalid confidence ${result.confidence}, using fallback 0.5`);
      confidence = 0.5;
    }
    
    // Validate and sanitize category (max 50 chars for VARCHAR(50))
    let category = (result.category || 'other').toLowerCase().trim();
    if (category.length > 50) {
      console.warn(`   ⚠️  Category too long (${category.length} chars), truncating`);
      category = category.substring(0, 50);
    }
    
    // Ensure reasoning doesn't exceed reasonable length
    const reasoning = (result.reasoning || 'AI classification').substring(0, 1000);

    console.log(`   ✅ Classification: ${category}`);
    console.log(`   📊 Confidence: ${confidence}`);
    console.log(`   🆕 Custom category: ${result.is_new_category}`);
    console.log(`   💭 Reasoning: ${reasoning.substring(0, 100)}...`);

    return {
      category,
      confidence,
      reasoning,
      is_custom_category: result.is_new_category || false,
      text_length: text.length
    };

  } catch (error) {
    console.error('❌ Classification error:', error.message);
    
    // Fallback to filename-based heuristic
    return fallbackClassification(filename, text);
  }
}

/**
 * Fallback classification based on filename heuristics
 */
function fallbackClassification(filename, text) {
  const lower = filename.toLowerCase();
  
  const patterns = {
    'timeline': ['timeline', 'schedule', 'gantt', 'milestone', 'deadline'],
    'requirements': ['requirements', 'req', 'spec', 'user-story', 'functional'],
    'resources': ['resource', 'team', 'staff', 'role', 'capacity'],
    'dependencies': ['dependency', 'dependencies', 'integration', 'blocker'],
    'risks': ['risk', 'raid', 'mitigation', 'issue'],
    'architecture': ['architecture', 'design', 'diagram', 'technical', 'system']
  };

  for (const [category, keywords] of Object.entries(patterns)) {
    if (keywords.some(keyword => lower.includes(keyword))) {
      console.log(`   ⚠️  Using fallback classification: ${category}`);
      return {
        category,
        confidence: 0.6,
        reasoning: `Fallback classification based on filename pattern`,
        is_custom_category: false,
        text_length: text.length
      };
    }
  }

  return {
    category: 'other',
    confidence: 0.5,
    reasoning: 'Could not determine specific category',
    is_custom_category: false,
    text_length: text.length
  };
}

module.exports = {
  classifyDocument,
  BASE_CATEGORIES
};
