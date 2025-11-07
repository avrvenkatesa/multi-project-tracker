/**
 * Timeline Extractor Service
 * 
 * Extracts project timeline information (phases, milestones, tasks) from document text using AI.
 * Supports both AI-powered extraction (GPT-4o) and heuristic fallback methods.
 */

const OpenAI = require('openai');
const aiCostTracker = require('./ai-cost-tracker');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// GPT-4o pricing per 1M tokens (as of 2025)
const GPT4O_PRICING = {
  prompt: 5.00 / 1_000_000,      // $5.00 per 1M input tokens
  completion: 15.00 / 1_000_000   // $15.00 per 1M output tokens
};

/**
 * Extract timeline information from document text
 * 
 * @param {string} documentText - The document text to analyze
 * @param {Object} options - Extraction options
 * @param {number} options.projectId - Project ID for cost tracking
 * @param {number} options.userId - User ID for cost tracking
 * @param {string|Date} options.projectStartDate - Project start date (defaults to today)
 * @param {boolean} options.useAI - Whether to use AI (defaults to true)
 * @returns {Promise<Object>} Extracted timeline with phases, milestones, tasks
 */
async function extractTimeline(documentText, options = {}) {
  const {
    projectId,
    userId,
    projectStartDate = new Date(),
    useAI = true
  } = options;

  const startDate = typeof projectStartDate === 'string' 
    ? new Date(projectStartDate) 
    : projectStartDate;

  // Try AI extraction first if enabled
  if (useAI && process.env.OPENAI_API_KEY) {
    try {
      const aiResult = await extractTimelineWithAI(documentText, {
        projectId,
        userId,
        projectStartDate: startDate
      });
      return aiResult;
    } catch (error) {
      console.error('AI timeline extraction failed, falling back to heuristic:', error);
      // Fall through to heuristic extraction
    }
  }

  // Fallback to heuristic extraction
  return {
    success: true,
    method: 'heuristic',
    timeline: extractTimelineHeuristic(documentText, startDate),
    cost: {
      tokens: 0,
      costUsd: 0
    }
  };
}

/**
 * Extract timeline using AI (GPT-4o)
 * 
 * @param {string} documentText - Document text to analyze
 * @param {Object} options - Extraction options
 * @returns {Promise<Object>} AI-extracted timeline
 */
async function extractTimelineWithAI(documentText, options) {
  const { projectId, userId, projectStartDate } = options;

  const systemPrompt = `You are a project timeline extraction expert. Analyze the provided document and extract:
1. **Phases**: Major project phases with timeframes and deliverables
2. **Milestones**: Key checkpoints with due dates
3. **Tasks**: Specific tasks with durations and phases

Return ONLY valid JSON with this exact structure:
{
  "phases": [
    {
      "name": "Phase name",
      "description": "Brief description",
      "timeframe": "Week 1-4" or "Month 2-3" or "Q1 2025" or "Jan 1 - Jan 31, 2025",
      "duration": "number of days (integer)",
      "deliverables": ["deliverable 1", "deliverable 2"]
    }
  ],
  "milestones": [
    {
      "name": "Milestone name",
      "description": "What is delivered",
      "timeframe": "Week 4" or "End of Phase 1" or "Jan 31, 2025",
      "dependencies": ["Phase 1", "Task X"]
    }
  ],
  "tasks": [
    {
      "name": "Task name",
      "phase": "Which phase this belongs to",
      "duration": "number of days or hours (integer)",
      "timeframe": "Week 2-3" or "Jan 15-20, 2025"
    }
  ]
}

Guidelines:
- Extract timeframes as they appear in the document (Week 1-4, Month 2, Q1 2025, specific dates, etc.)
- Duration should be numeric (days for phases/tasks, can specify unit)
- Link tasks to their parent phases
- Include all deliverables and dependencies mentioned
- If no timeline info found, return empty arrays`;

  const userPrompt = `Extract the project timeline from this document:\n\n${documentText}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: 2000
  });

  const usage = response.usage;
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const totalTokens = usage.total_tokens;
  const costUsd = (promptTokens * GPT4O_PRICING.prompt) + (completionTokens * GPT4O_PRICING.completion);

  // Parse AI response
  const content = response.choices[0].message.content.trim();
  let rawTimeline;
  
  try {
    // Try to extract JSON from code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    rawTimeline = JSON.parse(jsonMatch ? jsonMatch[1] : content);
  } catch (parseError) {
    throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
  }

  // Convert relative dates to absolute dates
  const timeline = convertRelativeDates(rawTimeline, projectStartDate);

  // Track AI usage with centralized service
  if (projectId && userId) {
    await aiCostTracker.trackAIUsage({
      userId,
      projectId,
      feature: 'timeline_extraction',
      operationType: 'extract_timeline',
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      model: 'gpt-4o',
      metadata: {
        phasesExtracted: timeline.phases?.length || 0,
        milestonesExtracted: timeline.milestones?.length || 0,
        tasksExtracted: timeline.tasks?.length || 0,
        documentLength: documentText.length
      }
    });
  }

  return {
    success: true,
    method: 'ai',
    timeline,
    cost: {
      tokens: totalTokens,
      promptTokens,
      completionTokens,
      costUsd
    }
  };
}

/**
 * Convert relative dates in timeline to absolute dates
 * 
 * @param {Object} rawTimeline - Timeline with relative dates
 * @param {Date} projectStartDate - Project start date for calculations
 * @returns {Object} Timeline with absolute dates
 */
function convertRelativeDates(rawTimeline, projectStartDate) {
  const timeline = {
    phases: [],
    milestones: [],
    tasks: []
  };

  // Convert phases
  if (rawTimeline.phases) {
    timeline.phases = rawTimeline.phases.map(phase => {
      const dateRange = parseDateRange(phase.timeframe, projectStartDate);
      return {
        ...phase,
        startDate: dateRange.start,
        endDate: dateRange.end,
        originalTimeframe: phase.timeframe
      };
    });
  }

  // Convert milestones
  if (rawTimeline.milestones) {
    timeline.milestones = rawTimeline.milestones.map(milestone => {
      const dueDate = parseMilestoneDate(milestone.timeframe, projectStartDate, timeline.phases);
      return {
        ...milestone,
        dueDate,
        originalTimeframe: milestone.timeframe
      };
    });
  }

  // Convert tasks
  if (rawTimeline.tasks) {
    timeline.tasks = rawTimeline.tasks.map(task => {
      const dateRange = parseDateRange(task.timeframe, projectStartDate);
      return {
        ...task,
        startDate: dateRange.start,
        endDate: dateRange.end,
        originalTimeframe: task.timeframe
      };
    });
  }

  return timeline;
}

/**
 * Parse date range from timeframe string
 * 
 * @param {string} timeframe - Timeframe string (e.g., "Week 1-4", "Month 2-3", "Q1 2025")
 * @param {Date} baseDate - Base date for relative calculations
 * @returns {Object} { start: Date, end: Date }
 */
function parseDateRange(timeframe, baseDate) {
  if (!timeframe) {
    return { start: null, end: null };
  }

  const base = new Date(baseDate);

  // Try to parse as absolute date range (e.g., "Jan 1 - Jan 31, 2025")
  const absoluteDateMatch = timeframe.match(/(\w+\s+\d+)(?:\s*-\s*(\w+\s+\d+))?,?\s*(\d{4})?/);
  if (absoluteDateMatch && timeframe.match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i)) {
    try {
      const year = absoluteDateMatch[3] || base.getFullYear();
      const startStr = `${absoluteDateMatch[1]}, ${year}`;
      const endStr = absoluteDateMatch[2] ? `${absoluteDateMatch[2]}, ${year}` : startStr;
      return {
        start: new Date(startStr),
        end: new Date(endStr)
      };
    } catch (e) {
      // Fall through to relative parsing
    }
  }

  // Parse "Week X" or "Week X-Y"
  const weekMatch = timeframe.match(/week\s+(\d+)(?:\s*-\s*(\d+))?/i);
  if (weekMatch) {
    const startWeek = parseInt(weekMatch[1]);
    const endWeek = weekMatch[2] ? parseInt(weekMatch[2]) : startWeek;
    
    const start = new Date(base);
    start.setDate(start.getDate() + (startWeek - 1) * 7);
    
    const end = new Date(base);
    end.setDate(end.getDate() + endWeek * 7 - 1);
    
    return { start, end };
  }

  // Parse "Month X" or "Month X-Y"
  const monthMatch = timeframe.match(/month\s+(\d+)(?:\s*-\s*(\d+))?/i);
  if (monthMatch) {
    const startMonth = parseInt(monthMatch[1]);
    const endMonth = monthMatch[2] ? parseInt(monthMatch[2]) : startMonth;
    
    const start = new Date(base);
    start.setMonth(start.getMonth() + startMonth - 1);
    start.setDate(1);
    
    const end = new Date(base);
    end.setMonth(end.getMonth() + endMonth);
    end.setDate(0); // Last day of previous month
    
    return { start, end };
  }

  // Parse "Q1", "Q2", "Q3", "Q4" with optional year
  const quarterMatch = timeframe.match(/q([1-4])(?:\s+(\d{4}))?/i);
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1]);
    const year = quarterMatch[2] ? parseInt(quarterMatch[2]) : base.getFullYear();
    
    const startMonth = (quarter - 1) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0); // Last day of quarter
    
    return { start, end };
  }

  // Default: treat as single date or return null
  return { start: null, end: null };
}

/**
 * Parse milestone date from timeframe string
 * 
 * @param {string} timeframe - Timeframe string (e.g., "Week 4", "End of Phase 1", "Jan 31, 2025")
 * @param {Date} baseDate - Base date for calculations
 * @param {Array} phases - Array of phases for reference
 * @returns {Date|null} Milestone due date
 */
function parseMilestoneDate(timeframe, baseDate, phases = []) {
  if (!timeframe) {
    return null;
  }

  const base = new Date(baseDate);

  // Try absolute date
  try {
    const absoluteDate = new Date(timeframe);
    if (!isNaN(absoluteDate.getTime()) && timeframe.match(/\d{4}/)) {
      return absoluteDate;
    }
  } catch (e) {
    // Not an absolute date
  }

  // Parse "End of Phase X" or "End of [Phase Name]"
  const endOfPhaseMatch = timeframe.match(/end\s+of\s+(?:phase\s+)?(.+)/i);
  if (endOfPhaseMatch) {
    const phaseName = endOfPhaseMatch[1].trim();
    const phase = phases.find(p => 
      p.name.toLowerCase().includes(phaseName.toLowerCase()) ||
      phaseName.toLowerCase().includes(p.name.toLowerCase())
    );
    if (phase && phase.endDate) {
      return phase.endDate;
    }
  }

  // Parse as date range and return end date
  const range = parseDateRange(timeframe, baseDate);
  return range.end || range.start;
}

/**
 * Heuristic extraction using regex patterns (fallback method)
 * 
 * @param {string} documentText - Document text to analyze
 * @param {Date} projectStartDate - Project start date
 * @returns {Object} Extracted timeline
 */
function extractTimelineHeuristic(documentText, projectStartDate) {
  const timeline = {
    phases: [],
    milestones: [],
    tasks: []
  };

  const lines = documentText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Extract phases (look for "Phase X:" or "Phase X -" patterns)
  const phaseRegex = /^(?:phase|stage|sprint)\s+(\d+|[IVX]+)?:?\s+([^(]+?)(?:\s*\(([^)]+)\))?$/i;
  
  lines.forEach((line, index) => {
    const match = line.match(phaseRegex);
    if (match) {
      const phaseName = match[2].trim();
      const timeframe = match[3];
      const dateRange = parseDateRange(timeframe, projectStartDate);
      
      // Look ahead for description/deliverables in next few lines
      let description = '';
      const deliverables = [];
      for (let i = index + 1; i < Math.min(index + 5, lines.length); i++) {
        const nextLine = lines[i];
        if (nextLine.match(/^(?:phase|stage|milestone|task)/i)) break;
        if (nextLine.startsWith('-') || nextLine.startsWith('•')) {
          const item = nextLine.replace(/^[-•]\s*/, '').trim();
          if (item.toLowerCase().includes('deliverable')) {
            deliverables.push(item.replace(/deliverable:?\s*/i, '').trim());
          }
        } else if (!description && !nextLine.match(/^[A-Z\s]+:$/)) {
          description = nextLine;
        }
      }
      
      timeline.phases.push({
        name: phaseName,
        description,
        timeframe: timeframe || 'TBD',
        startDate: dateRange.start,
        endDate: dateRange.end,
        deliverables,
        originalTimeframe: timeframe
      });
    }
  });

  // Extract milestones (look for "Milestone:" or "- MilestoneName (timeframe)")
  const milestoneRegex = /^[-•]?\s*(.+?)\s*\(([^)]+)\)\s*$/;
  const milestoneHeaderRegex = /^milestones?:?\s*$/i;
  
  let inMilestoneSection = false;
  lines.forEach((line) => {
    if (milestoneHeaderRegex.test(line)) {
      inMilestoneSection = true;
      return;
    }
    
    if (inMilestoneSection) {
      // Stop if we hit another section
      if (line.match(/^(?:phase|stage|task|key\s+task)s?:?/i)) {
        inMilestoneSection = false;
        return;
      }
      
      const match = line.match(milestoneRegex);
      if (match) {
        const milestoneName = match[1].trim();
        const timeframe = match[2].trim();
        const dueDate = parseMilestoneDate(timeframe, projectStartDate, timeline.phases);
        
        timeline.milestones.push({
          name: milestoneName,
          description: '',
          timeframe,
          dueDate,
          dependencies: [],
          originalTimeframe: timeframe
        });
      }
    }
  });

  // Extract tasks (look for "- Task: Name (timeframe, duration)")
  const taskRegex = /^[-•]?\s*(?:task:?\s+)?(.+?)\s*\(([^)]+)\)\s*$/i;
  const taskHeaderRegex = /^(?:key\s+)?tasks?:?\s*$/i;
  
  let inTaskSection = false;
  lines.forEach((line) => {
    if (taskHeaderRegex.test(line)) {
      inTaskSection = true;
      return;
    }
    
    if (inTaskSection) {
      const match = line.match(taskRegex);
      if (match) {
        const taskName = match[1].trim().replace(/^task:?\s+/i, '');
        const paramsStr = match[2];
        
        // Parse timeframe and duration from params
        const parts = paramsStr.split(',').map(p => p.trim());
        let timeframe = parts[0];
        let duration = null;
        
        // Check if second part is duration (e.g., "10 days")
        if (parts[1]) {
          const durationMatch = parts[1].match(/(\d+)\s*(day|hour|week)s?/i);
          if (durationMatch) {
            duration = durationMatch[1];
          } else {
            // Second part might be continuation of timeframe
            timeframe = paramsStr;
          }
        }
        
        const dateRange = parseDateRange(timeframe, projectStartDate);
        
        timeline.tasks.push({
          name: taskName,
          phase: timeline.phases[0]?.name || 'General',
          duration,
          timeframe,
          startDate: dateRange.start,
          endDate: dateRange.end,
          originalTimeframe: timeframe
        });
      }
    }
  });

  return timeline;
}

module.exports = {
  extractTimeline,
  extractTimelineWithAI,
  convertRelativeDates,
  parseDateRange,
  parseMilestoneDate,
  extractTimelineHeuristic
};
