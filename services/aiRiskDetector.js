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
      'dependency', 'bottleneck', 'resource', 'constraint'
    ];

    // Convert multi-word phrases to tsquery format (replace spaces with &)
    const query = riskKeywords.join(' | ');

    const meetings = await pool.query(`
      SELECT
        r.id as doc_id,
        r.source_id as meeting_id,
        r.content as content_text,
        r.meta as metadata,
        m.title as meeting_title,
        m.meeting_date
      FROM rag_documents r
      INNER JOIN meetings m ON r.source_id = m.id
      WHERE r.project_id = $1
        AND r.source_type = 'meeting'
        AND r.content_tsv @@ to_tsquery('english', $2)
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
   * ENHANCED: Creates PKG nodes and evidence edges with transaction safety
   */
  async autoCreateHighConfidenceRisks({ projectId, detectedRisks, confidenceThreshold = 0.9 }) {
    const autoCreated = [];

    // Filter high-confidence risks first
    const highConfidenceRisks = detectedRisks.filter(r => r.confidence >= confidenceThreshold);
    
    if (highConfidenceRisks.length === 0) {
      return autoCreated;
    }

    // Create risks with atomic deduplication via unique index
    for (const risk of highConfidenceRisks) {
      const client = await pool.connect();
      
      try {
        await client.query('BEGIN');

        // Generate stable source identifier for deduplication
        const sourceId = risk.source?.id || risk.source?.title || risk.title;
        const sourceIdentifier = `${risk.type}:${sourceId}`;

        // Generate unique risk ID atomically (safe for concurrent requests)
        const riskIdResult = await client.query(
          'SELECT generate_risk_id($1) as risk_id',
          [projectId]
        );
        const riskId = riskIdResult.rows[0].risk_id;

        // 1. Create PKG node FIRST (before risk entity)
        const pkgAttrs = {
          risk_id: riskId,
          title: risk.title,
          description: risk.description,
          category: risk.type,
          probability: risk.probability,
          impact: risk.impact,
          severity: risk.severity,
          status: 'identified',
          detection_source: risk.type,
          source: risk.source
        };

        const pkgNodeResult = await client.query(`
          INSERT INTO pkg_nodes (
            project_id,
            type,
            attrs,
            created_by_ai,
            ai_confidence,
            created_by
          )
          VALUES ($1, 'Risk', $2, true, $3, $4)
          RETURNING id
        `, [projectId, JSON.stringify(pkgAttrs), risk.confidence, 1]);

        const pkgNodeId = pkgNodeResult.rows[0].id;

        // 2. Create risk with PKG node link and ON CONFLICT for atomic deduplication
        const result = await client.query(`
          INSERT INTO risks (
            risk_id,
            project_id,
            title,
            description,
            category,
            probability,
            impact,
            status,
            ai_detected,
            ai_confidence,
            detection_source,
            source_identifier,
            created_by,
            pkg_node_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9, $10, $11, $12, $13)
          ON CONFLICT (project_id, detection_source, source_identifier) 
          WHERE ai_detected = TRUE AND source_identifier IS NOT NULL
          DO NOTHING
          RETURNING *
        `, [
          riskId,
          projectId,
          risk.title,
          risk.description,
          risk.type,
          risk.probability,
          risk.impact,
          'identified',
          risk.confidence,
          risk.type,
          sourceIdentifier,
          1, // System user
          pkgNodeId
        ]);

        // Check if risk was actually inserted (not skipped by ON CONFLICT)
        if (result.rows.length === 0) {
          // Conflict detected - rollback to remove orphaned PKG node
          await client.query('ROLLBACK');
          console.log(`Skipped duplicate risk: ${risk.title} (${sourceIdentifier})`);
          // Note: client.release() is handled in finally block
          continue;
        }

        const createdRisk = result.rows[0];

        // 3. Update PKG node with source_id for bi-directional sync
        await client.query(`
          UPDATE pkg_nodes
          SET
            source_table = 'risks',
            source_id = $1
          WHERE id = $2
        `, [createdRisk.id.toString(), pkgNodeId]);

        // 4. Create PKG edge for evidence relationship (if source exists)
        if (risk.source?.type && risk.source?.id) {
          // Find source PKG node
          const sourcePkgNode = await client.query(`
            SELECT id FROM pkg_nodes
            WHERE project_id = $1
              AND source_table = $2
              AND source_id = $3
            LIMIT 1
          `, [projectId, risk.source.type + 's', risk.source.id.toString()]);

          if (sourcePkgNode.rows.length > 0) {
            const sourceNodeId = sourcePkgNode.rows[0].id;

            // Create evidence edge: source -> risk
            await client.query(`
              INSERT INTO pkg_edges (
                project_id,
                type,
                from_node_id,
                to_node_id,
                confidence,
                evidence_quote,
                created_by_ai,
                created_by
              )
              VALUES ($1, 'evidence_of', $2, $3, $4, $5, true, $6)
              ON CONFLICT DO NOTHING
            `, [
              projectId,
              sourceNodeId,
              pkgNodeId,
              risk.confidence,
              risk.description.substring(0, 200), // Use first 200 chars as evidence quote
              1
            ]);
          }
        }

        // Commit transaction - all PKG operations succeeded
        await client.query('COMMIT');
        autoCreated.push(createdRisk);
      } catch (err) {
        // Rollback on any error to maintain PKG consistency
        await client.query('ROLLBACK');
        console.error(`Failed to create risk "${risk.title}":`, err.message);
      } finally {
        client.release();
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
