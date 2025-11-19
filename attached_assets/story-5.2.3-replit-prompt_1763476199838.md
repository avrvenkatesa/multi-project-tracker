# Story 5.2.3: Proactive Risk Detection - Replit Implementation Guide

## 🎯 Objective
Build the AI agent's ability to proactively detect risks by analyzing meetings, decisions, task dependencies, and patterns across the project knowledge graph.

---

## 📋 Prerequisites

Before starting, verify Stories 5.2.1-5.2.2 are complete:
- ✅ AI agent core engine operational
- ✅ PKG and RAG integration working
- ✅ Proposal workflow functional

---

## 🏗️ Implementation Tasks

### **Task 1: Create Risk Detection Service**

**File: `services/aiRiskDetector.js`**

```javascript
const { pool } = require('../db');
const aiAgentService = require('./aiAgent');
const aiDecisionMaker = require('./aiDecisionMaker');

/**
 * AI Risk Detector Service
 * Proactive risk identification using PKG and RAG analysis
 */

class AIRiskDetector {
  /**
   * Scan project for potential risks
   */
  async scanForRisks({ projectId, sessionId }) {
    const startTime = Date.now();

    // 1. Analyze meeting transcripts for risk indicators
    const meetingRisks = await this.detectRisksInMeetings(projectId);

    // 2. Analyze task dependencies for bottlenecks
    const dependencyRisks = await this.detectDependencyRisks(projectId);

    // 3. Analyze recent decisions for potential issues
    const decisionRisks = await this.detectDecisionRisks(projectId);

    // 4. Detect pattern anomalies in PKG
    const patternRisks = await this.detectPatternAnomalies(projectId);

    // 5. Check for overdue items
    const overdueRisks = await this.detectOverdueItems(projectId);

    const allRisks = [
      ...meetingRisks,
      ...dependencyRisks,
      ...decisionRisks,
      ...patternRisks,
      ...overdueRisks
    ];

    // Deduplicate and rank by severity
    const uniqueRisks = this.deduplicateRisks(allRisks);
    const rankedRisks = this.rankRisksBySeverity(uniqueRisks);

    const executionTime = Date.now() - startTime;

    if (sessionId) {
      await aiAgentService.logAction({
        sessionId,
        actionType: 'risk_scan',
        actionDescription: 'Scanned project for risks',
        inputData: { projectId },
        outputData: {
          totalRisksDetected: rankedRisks.length,
          highSeverity: rankedRisks.filter(r => r.severity >= 12).length,
          executionTimeMs: executionTime
        },
        executionTimeMs: executionTime
      });
    }

    return {
      risks: rankedRisks,
      metadata: {
        totalDetected: rankedRisks.length,
        highSeverity: rankedRisks.filter(r => r.severity >= 12).length,
        mediumSeverity: rankedRisks.filter(r => r.severity >= 6 && r.severity < 12).length,
        lowSeverity: rankedRisks.filter(r => r.severity < 6).length,
        executionTimeMs: executionTime
      }
    };
  }

  /**
   * Detect risks mentioned in meeting transcripts
   */
  async detectRisksInMeetings(projectId) {
    const riskKeywords = [
      'risk', 'concern', 'worry', 'problem', 'issue', 'blocker',
      'delay', 'budget', 'overrun', 'critical', 'urgent',
      'dependency', 'bottleneck', 'resource constraint'
    ];

    const query = riskKeywords.join(' | ');

    const meetings = await pool.query(`
      SELECT
        r.id as doc_id,
        r.source_id as meeting_id,
        r.content_text,
        r.metadata,
        m.title as meeting_title,
        m.meeting_date
      FROM rag_documents r
      INNER JOIN meetings m ON r.source_id = m.id
      WHERE r.project_id = $1
        AND r.source_type = 'meeting'
        AND r.content_vector @@ to_tsquery('english', $2)
        AND m.meeting_date >= NOW() - INTERVAL '30 days'
      ORDER BY m.meeting_date DESC
      LIMIT 10
    `, [projectId, query]);

    const risks = [];

    for (const meeting of meetings.rows) {
      // Extract risk context from transcript
      const riskContext = this.extractRiskContext(meeting.content_text, riskKeywords);

      if (riskContext.length > 0) {
        risks.push({
          type: 'meeting_mention',
          title: `Risk mentioned in ${meeting.meeting_title}`,
          description: riskContext[0],
          source: {
            type: 'meeting',
            id: meeting.meeting_id,
            title: meeting.meeting_title,
            date: meeting.meeting_date
          },
          probability: 3, // Medium probability (mentioned in meeting)
          impact: 3, // Default medium impact
          severity: 9,
          confidence: 0.7,
          detectedAt: new Date()
        });
      }
    }

    return risks;
  }

  /**
   * Detect risks from task dependencies
   */
  async detectDependencyRisks(projectId) {
    // Find tasks with many dependencies (potential bottlenecks)
    const bottlenecks = await pool.query(`
      SELECT
        n.id,
        n.attrs->>'title' as title,
        n.source_id,
        COUNT(e.id) as dependency_count
      FROM pkg_nodes n
      INNER JOIN pkg_edges e ON n.id = e.to_node_id
      WHERE n.project_id = $1
        AND n.type = 'Task'
        AND n.attrs->>'status' IN ('To Do', 'In Progress')
        AND e.type = 'depends_on'
      GROUP BY n.id, n.attrs, n.source_id
      HAVING COUNT(e.id) >= 5
      ORDER BY COUNT(e.id) DESC
      LIMIT 5
    `, [projectId]);

    const risks = bottlenecks.rows.map(task => ({
      type: 'dependency_bottleneck',
      title: `High dependency count for: ${task.title}`,
      description: `Task has ${task.dependency_count} dependencies, creating potential bottleneck`,
      source: {
        type: 'task',
        id: task.source_id,
        title: task.title
      },
      probability: 4, // High probability
      impact: 4, // High impact (blocks many tasks)
      severity: 16,
      confidence: 0.85,
      detectedAt: new Date()
    }));

    return risks;
  }

  /**
   * Detect risks from recent decisions
   */
  async detectDecisionRisks(projectId) {
    // Find high-impact decisions without sufficient alternatives considered
    const riskyDecisions = await pool.query(`
      SELECT
        d.id,
        d.decision_id,
        d.title,
        d.impact_level,
        d.alternatives_considered,
        d.decided_date
      FROM decisions d
      WHERE d.project_id = $1
        AND d.impact_level IN ('high', 'critical')
        AND (
          d.alternatives_considered IS NULL
          OR jsonb_array_length(d.alternatives_considered) < 2
        )
        AND d.decided_date >= NOW() - INTERVAL '30 days'
    `, [projectId]);

    const risks = riskyDecisions.rows.map(decision => ({
      type: 'insufficient_analysis',
      title: `High-impact decision with limited alternatives: ${decision.title}`,
      description: `Decision ${decision.decision_id} has high impact but fewer than 2 alternatives considered`,
      source: {
        type: 'decision',
        id: decision.id,
        decision_id: decision.decision_id,
        title: decision.title
      },
      probability: 3,
      impact: decision.impact_level === 'critical' ? 5 : 4,
      severity: decision.impact_level === 'critical' ? 15 : 12,
      confidence: 0.75,
      detectedAt: new Date()
    }));

    return risks;
  }

  /**
   * Detect pattern anomalies in PKG
   */
  async detectPatternAnomalies(projectId) {
    const risks = [];

    // 1. Detect tasks stuck in "In Progress" for too long
    const stuckTasks = await pool.query(`
      SELECT
        n.id,
        n.attrs->>'title' as title,
        n.source_id,
        n.created_at,
        EXTRACT(DAY FROM NOW() - n.created_at) as days_in_progress
      FROM pkg_nodes n
      WHERE n.project_id = $1
        AND n.type = 'Task'
        AND n.attrs->>'status' = 'In Progress'
        AND n.created_at < NOW() - INTERVAL '14 days'
      ORDER BY n.created_at ASC
      LIMIT 5
    `, [projectId]);

    stuckTasks.rows.forEach(task => {
      risks.push({
        type: 'stuck_task',
        title: `Task stuck in progress: ${task.title}`,
        description: `Task has been in progress for ${Math.floor(task.days_in_progress)} days`,
        source: {
          type: 'task',
          id: task.source_id,
          title: task.title
        },
        probability: 4,
        impact: 3,
        severity: 12,
        confidence: 0.8,
        detectedAt: new Date()
      });
    });

    // 2. Detect orphaned tasks (no parent, no assignee)
    const orphanedTasks = await pool.query(`
      SELECT
        n.id,
        n.attrs->>'title' as title,
        n.source_id
      FROM pkg_nodes n
      WHERE n.project_id = $1
        AND n.type = 'Task'
        AND n.attrs->>'status' != 'Done'
        AND NOT EXISTS (
          SELECT 1 FROM pkg_edges e
          WHERE e.to_node_id = n.id AND e.type = 'parent_of'
        )
        AND (n.attrs->>'assigned_to' IS NULL OR n.attrs->>'assigned_to' = '')
      LIMIT 5
    `, [projectId]);

    orphanedTasks.rows.forEach(task => {
      risks.push({
        type: 'orphaned_task',
        title: `Orphaned task without owner: ${task.title}`,
        description: `Task has no parent and no assigned owner`,
        source: {
          type: 'task',
          id: task.source_id,
          title: task.title
        },
        probability: 3,
        impact: 2,
        severity: 6,
        confidence: 0.9,
        detectedAt: new Date()
      });
    });

    return risks;
  }

  /**
   * Detect overdue items
   */
  async detectOverdueItems(projectId) {
    const overdue = await pool.query(`
      SELECT
        n.id,
        n.attrs->>'title' as title,
        n.source_id,
        n.attrs->>'due_date' as due_date,
        EXTRACT(DAY FROM NOW() - (n.attrs->>'due_date')::timestamp) as days_overdue
      FROM pkg_nodes n
      WHERE n.project_id = $1
        AND n.type = 'Task'
        AND n.attrs->>'status' != 'Done'
        AND n.attrs->>'due_date' IS NOT NULL
        AND (n.attrs->>'due_date')::timestamp < NOW()
      ORDER BY (n.attrs->>'due_date')::timestamp ASC
      LIMIT 10
    `, [projectId]);

    const risks = overdue.rows.map(task => ({
      type: 'overdue_task',
      title: `Overdue task: ${task.title}`,
      description: `Task is ${Math.floor(task.days_overdue)} days overdue`,
      source: {
        type: 'task',
        id: task.source_id,
        title: task.title,
        due_date: task.due_date
      },
      probability: 5, // Certain (already happened)
      impact: Math.min(Math.floor(task.days_overdue / 7) + 2, 5), // Impact increases with delay
      severity: null, // Will be calculated
      confidence: 1.0,
      detectedAt: new Date()
    }));

    // Calculate severity
    risks.forEach(r => {
      r.severity = r.probability * r.impact;
    });

    return risks;
  }

  /**
   * Create risk proposal from detected risk
   */
  async proposeRisk({ projectId, userId, sessionId, detectedRisk }) {
    // Use the decision maker's proposal system
    const proposal = await aiDecisionMaker.createProposal({
      sessionId,
      projectId,
      userId,
      decisionData: {
        title: detectedRisk.title,
        description: detectedRisk.description,
        decision_type: 'risk',
        impact_level: this.mapImpactToLevel(detectedRisk.impact),
        rationale: `AI-detected risk from ${detectedRisk.type}. Confidence: ${detectedRisk.confidence}`,
        alternatives: []
      },
      analysisResults: {
        relatedDecisions: [],
        impactedNodes: [],
        relatedRisks: [],
        potentialConflicts: [],
        analysisMetadata: { executionTimeMs: 0 }
      },
      confidence: detectedRisk.confidence
    });

    // Update proposal type to 'risk' and add risk-specific data
    await pool.query(`
      UPDATE ai_agent_proposals
      SET
        proposal_type = 'risk',
        proposed_data = proposed_data || $1::jsonb
      WHERE proposal_id = $2
    `, [
      JSON.stringify({
        category: detectedRisk.type,
        probability: detectedRisk.probability,
        impact: detectedRisk.impact,
        severity: detectedRisk.severity,
        source: detectedRisk.source
      }),
      proposal.proposal_id
    ]);

    return proposal;
  }

  /**
   * Auto-create high-confidence risks
   */
  async autoCreateHighConfidenceRisks({ projectId, detectedRisks, confidenceThreshold = 0.9 }) {
    const autoCreated = [];

    for (const risk of detectedRisks) {
      if (risk.confidence >= confidenceThreshold) {
        // Create risk directly (no approval needed)
        const result = await pool.query(`
          INSERT INTO risks (
            project_id,
            title,
            description,
            category,
            probability,
            impact,
            status,
            ai_detected,
            ai_confidence,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9)
          RETURNING *
        `, [
          projectId,
          risk.title,
          risk.description,
          risk.type,
          risk.probability,
          risk.impact,
          'Open',
          risk.confidence,
          1 // System user
        ]);

        autoCreated.push(result.rows[0]);
      }
    }

    return autoCreated;
  }

  // Helper methods
  extractRiskContext(text, keywords) {
    const sentences = text.split(/[.!?]+/);
    const riskSentences = [];

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      if (keywords.some(keyword => lowerSentence.includes(keyword))) {
        riskSentences.push(sentence.trim());
      }
    }

    return riskSentences.slice(0, 3); // Return top 3
  }

  deduplicateRisks(risks) {
    const seen = new Map();

    for (const risk of risks) {
      const key = `${risk.title}-${risk.source?.id}`;

      if (!seen.has(key) || seen.get(key).confidence < risk.confidence) {
        seen.set(key, risk);
      }
    }

    return Array.from(seen.values());
  }

  rankRisksBySeverity(risks) {
    return risks.sort((a, b) => {
      // Sort by severity (desc), then confidence (desc)
      if (b.severity !== a.severity) {
        return b.severity - a.severity;
      }
      return b.confidence - a.confidence;
    });
  }

  mapImpactToLevel(impact) {
    if (impact >= 4) return 'high';
    if (impact >= 3) return 'medium';
    return 'low';
  }
}

module.exports = new AIRiskDetector();
```

---

### **Task 2: Create Risk Detection API Routes**

**File: `routes/aiRiskDetector.js`**

```javascript
const express = require('express');
const router = express.Router();
const aiRiskDetector = require('../services/aiRiskDetector');
const aiAgentService = require('../services/aiAgent');
const { authenticateToken } = require('../middleware/auth');

/**
 * POST /api/aipm/projects/:projectId/agent/scan-risks
 * Scan project for risks
 */
router.post('/projects/:projectId/agent/scan-risks', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { autoCreateHighConfidence = false } = req.body;
    const userId = req.user.id;

    // 1. Create AI session
    const session = await aiAgentService.createSession({
      projectId: parseInt(projectId),
      userId,
      agentType: 'risk_detector',
      userPrompt: 'Scan project for risks'
    });

    // 2. Scan for risks
    const scanResults = await aiRiskDetector.scanForRisks({
      projectId: parseInt(projectId),
      sessionId: session.session_id
    });

    // 3. Auto-create high-confidence risks if requested
    let autoCreated = [];
    if (autoCreateHighConfidence) {
      autoCreated = await aiRiskDetector.autoCreateHighConfidenceRisks({
        projectId: parseInt(projectId),
        detectedRisks: scanResults.risks
      });
    }

    // 4. Create proposals for remaining risks
    const proposals = [];
    for (const risk of scanResults.risks) {
      if (risk.confidence < 0.9) { // Don't propose if auto-created
        const proposal = await aiRiskDetector.proposeRisk({
          projectId: parseInt(projectId),
          userId,
          sessionId: session.session_id,
          detectedRisk: risk
        });
        proposals.push(proposal);
      }
    }

    // 5. Complete session
    await aiAgentService.completeSession({
      sessionId: session.session_id,
      response: `Detected ${scanResults.risks.length} risks, created ${autoCreated.length} automatically, proposed ${proposals.length} for review`,
      confidenceScore: 0.8,
      pkgNodesUsed: [],
      ragDocsUsed: [],
      tokensUsed: 0,
      latency: scanResults.metadata.executionTimeMs
    });

    res.json({
      sessionId: session.session_id,
      detected: scanResults.risks,
      metadata: scanResults.metadata,
      autoCreated: autoCreated.map(r => ({ id: r.id, title: r.title })),
      proposals: proposals.map(p => ({ proposalId: p.proposal_id, title: p.title }))
    });
  } catch (error) {
    console.error('Error scanning for risks:', error);
    res.status(500).json({ error: 'Failed to scan for risks', details: error.message });
  }
});

/**
 * GET /api/aipm/projects/:projectId/risks/ai-detected
 * Get AI-detected risks
 */
router.get('/projects/:projectId/risks/ai-detected', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    const risks = await pool.query(`
      SELECT
        r.*,
        u.username as created_by_user
      FROM risks r
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.project_id = $1
        AND r.ai_detected = TRUE
      ORDER BY (r.probability * r.impact) DESC, r.created_at DESC
    `, [parseInt(projectId)]);

    res.json({ risks: risks.rows });
  } catch (error) {
    console.error('Error fetching AI-detected risks:', error);
    res.status(500).json({ error: 'Failed to fetch AI-detected risks' });
  }
});

module.exports = router;
```

---

### **Task 3: Add Risk Detection Fields to Risks Table**

**File: `db/029_add_risk_ai_fields.sql`**

```sql
-- Add AI detection fields to risks table
ALTER TABLE risks
  ADD COLUMN IF NOT EXISTS ai_detected BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS detection_source VARCHAR(50);

-- Add index for querying AI-detected risks
CREATE INDEX IF NOT EXISTS idx_risks_ai_detected ON risks(ai_detected, project_id)
  WHERE ai_detected = TRUE;

COMMENT ON COLUMN risks.ai_detected IS 'Whether this risk was detected by AI agent';
COMMENT ON COLUMN risks.ai_confidence IS 'AI confidence score (0.00-1.00)';
COMMENT ON COLUMN risks.detection_source IS 'Source type that triggered detection';
```

**Run migration:**
```bash
psql $DATABASE_URL -f db/029_add_risk_ai_fields.sql
```

---

### **Task 4: Register Routes**

**File: `server.js`**

```javascript
const aiRiskDetectorRoutes = require('./routes/aiRiskDetector');

app.use('/api/aipm', aiRiskDetectorRoutes);
```

---

### **Task 5: Create Scheduled Risk Scanning (Optional)**

**File: `services/riskScanScheduler.js`**

```javascript
const cron = require('node-cron');
const { pool } = require('../db');
const aiRiskDetector = require('./aiRiskDetector');
const aiAgentService = require('./aiAgent');

/**
 * Scheduled Risk Scanning
 * Runs daily to proactively scan all active projects
 */

class RiskScanScheduler {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Start scheduled scanning (daily at 2 AM)
   */
  start() {
    console.log('Starting risk scan scheduler...');

    // Run every day at 2:00 AM
    cron.schedule('0 2 * * *', async () => {
      await this.runDailyScan();
    });

    console.log('Risk scan scheduler started (runs daily at 2:00 AM)');
  }

  /**
   * Run daily risk scan for all active projects
   */
  async runDailyScan() {
    if (this.isRunning) {
      console.log('Risk scan already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('Starting daily risk scan...');

    try {
      // Get all active projects
      const projects = await pool.query(`
        SELECT id, name FROM projects WHERE archived != TRUE
      `);

      for (const project of projects.rows) {
        try {
          console.log(`Scanning project: ${project.name}`);

          // Create system session
          const session = await aiAgentService.createSession({
            projectId: project.id,
            userId: 1, // System user
            agentType: 'risk_detector',
            userPrompt: 'Automated daily risk scan'
          });

          // Scan for risks
          const results = await aiRiskDetector.scanForRisks({
            projectId: project.id,
            sessionId: session.session_id
          });

          // Auto-create high-confidence risks
          const autoCreated = await aiRiskDetector.autoCreateHighConfidenceRisks({
            projectId: project.id,
            detectedRisks: results.risks,
            confidenceThreshold: 0.9
          });

          console.log(`  Detected ${results.risks.length} risks, auto-created ${autoCreated.length}`);

          // Complete session
          await aiAgentService.completeSession({
            sessionId: session.session_id,
            response: `Daily scan: ${results.risks.length} risks detected, ${autoCreated.length} auto-created`,
            confidenceScore: 0.8,
            pkgNodesUsed: [],
            ragDocsUsed: [],
            tokensUsed: 0,
            latency: results.metadata.executionTimeMs
          });
        } catch (error) {
          console.error(`Error scanning project ${project.name}:`, error);
        }
      }

      console.log('Daily risk scan complete');
    } catch (error) {
      console.error('Daily risk scan failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manually trigger scan for specific project
   */
  async scanProject(projectId) {
    const session = await aiAgentService.createSession({
      projectId,
      userId: 1,
      agentType: 'risk_detector',
      userPrompt: 'Manual risk scan'
    });

    const results = await aiRiskDetector.scanForRisks({
      projectId,
      sessionId: session.session_id
    });

    const autoCreated = await aiRiskDetector.autoCreateHighConfidenceRisks({
      projectId,
      detectedRisks: results.risks
    });

    await aiAgentService.completeSession({
      sessionId: session.session_id,
      response: `Manual scan: ${results.risks.length} detected, ${autoCreated.length} created`,
      confidenceScore: 0.8,
      pkgNodesUsed: [],
      ragDocsUsed: [],
      tokensUsed: 0,
      latency: results.metadata.executionTimeMs
    });

    return { results, autoCreated };
  }
}

module.exports = new RiskScanScheduler();
```

**Enable in server:**
```javascript
// In server.js
const riskScanScheduler = require('./services/riskScanScheduler');

// Start scheduler
if (process.env.ENABLE_RISK_SCANNING === 'true') {
  riskScanScheduler.start();
}
```

**Install dependency:**
```bash
npm install node-cron
```

---

## ✅ Acceptance Criteria

**API Endpoints:**
- [ ] `POST /api/aipm/projects/:id/agent/scan-risks` - Scan for risks
- [ ] `GET /api/aipm/projects/:id/risks/ai-detected` - Get AI-detected risks

**Risk Detection:**
- [ ] Scan meeting transcripts for risk mentions
- [ ] Detect dependency bottlenecks
- [ ] Identify high-impact decisions with insufficient analysis
- [ ] Find stuck tasks (>14 days in progress)
- [ ] Detect orphaned tasks
- [ ] Identify overdue items
- [ ] Rank risks by severity (probability × impact)
- [ ] Deduplicate similar risks

**Automation:**
- [ ] Auto-create risks with confidence ≥0.9
- [ ] Create proposals for lower-confidence risks
- [ ] Optional scheduled daily scanning
- [ ] Track AI detection metadata

---

## 🧪 Testing

```bash
# Scan for risks
curl -X POST http://localhost:3000/api/aipm/projects/1/agent/scan-risks \
  -H "Cookie: token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"autoCreateHighConfidence": true}'

# Get AI-detected risks
curl http://localhost:3000/api/aipm/projects/1/risks/ai-detected \
  -H "Cookie: token=$TOKEN"
```

---

## 🚀 Next Steps

After Story 5.2.3, proceed to **Story 5.2.4**: AI Agent API & Integration (streaming, UI, final integration)

---

**Questions?** Start with the risk detector service!
