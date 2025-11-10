/**
 * Multi-Document Analyzer Orchestrator
 * 
 * Coordinates the complete multi-document import workflow:
 * 1. Combine document text
 * 2. Detect workstreams (AI)
 * 3. Create issues from workstreams
 * 4. Extract timeline (phases, milestones)
 * 5. Map dependencies between issues
 * 6. Parse and assign resources
 * 7. Generate checklists for each workstream
 * 
 * Features:
 * - Graceful degradation when optional services unavailable
 * - Comprehensive AI cost tracking
 * - Complete import metadata persistence
 * - Partial failure handling with detailed error/warning reporting
 */

const { pool } = require('../db');
const aiCostTracker = require('./ai-cost-tracker');
const schedulerService = require('./schedulerService');

class MultiDocumentAnalyzer {
  constructor() {
    this.workstreamDetector = null;
    this.timelineExtractor = null;
    this.dependencyMapper = null;
    this.resourceParser = null;
    
    try {
      this.workstreamDetector = require('./workstream-detector');
    } catch (error) {
      console.warn('⚠️  workstream-detector service not available - workstream detection will fail');
    }
    
    try {
      this.timelineExtractor = require('./timeline-extractor');
    } catch (error) {
      console.warn('⚠️  timeline-extractor service not available - timeline extraction will be skipped');
    }
    
    try {
      this.dependencyMapper = require('./dependency-mapper');
    } catch (error) {
      console.warn('⚠️  dependency-mapper service not available - dependency mapping will be skipped');
    }
    
    try {
      this.resourceParser = require('./resource-parser');
    } catch (error) {
      console.warn('⚠️  resource-parser service not available - resource assignment will be skipped');
    }
  }

  /**
   * Analyze multiple documents and create complete project structure
   * @param {Array} documents - Array of {filename, text, classification}
   * @param {Object} options - {projectId, userId, projectStartDate, progressCallback}
   * @returns {Object} Complete analysis results with created entities
   */
  async analyzeMultipleDocuments(documents, options) {
    const { projectId, userId, projectStartDate, progressCallback } = options;
    const startTime = Date.now();
    
    // Helper function to emit progress events
    const emit = (type, data) => {
      if (progressCallback) {
        progressCallback({ type, ...data, timestamp: new Date().toISOString() });
      }
      
      // Also log to server console
      if (type === 'log') {
        console.log(data.message);
      } else if (type === 'error') {
        console.error(data.message);
      } else if (type === 'step') {
        console.log(`Step ${data.step}/7: ${data.title}...`);
      }
    };
    
    const result = {
      success: false,
      documents: { processed: 0 },
      workstreams: [],
      issues: { created: 0, ids: [] },
      timeline: { phases: [], milestones: [] },
      dependencies: { created: 0, warnings: [] },
      resourceAssignments: { assigned: 0, needsReview: [] },
      checklists: { created: 0, items: 0 },
      errors: [],
      warnings: [],
      aiCostBreakdown: {},
      totalCost: 0,
      duration: 0
    };

    let importId = null;

    try {
      emit('log', { message: '╔════════════════════════════════════════════════════╗' });
      emit('log', { message: '║   MULTI-DOCUMENT PROJECT IMPORT STARTING           ║' });
      emit('log', { message: '╚════════════════════════════════════════════════════╝' });
      emit('log', { message: `📁 Project ID: ${projectId}` });
      emit('log', { message: `📄 Documents: ${documents.length}` });
      emit('log', { message: `📅 Start Date: ${projectStartDate}` });
      emit('log', { message: '' });

      // Step 1: Combine document text
      emit('step', { step: 1, title: 'Combine Docs' });
      emit('log', { message: 'Step 1/7: Combining document text...' });
      const combinedText = this._combineDocuments(documents);
      emit('log', { message: `✓ Combined ${combinedText.length} characters` });
      emit('log', { message: '' });
      result.documents.processed = documents.length;

      // Step 2: Detect workstreams (CRITICAL - cannot proceed without this)
      emit('step', { step: 2, title: 'Detect Workstreams' });
      emit('log', { message: 'Step 2/7: Detecting workstreams...' });
      if (!this.workstreamDetector) {
        throw new Error('Workstream detector service not available - cannot proceed');
      }

      // Get project name for context
      const projectResult = await pool.query('SELECT name, description FROM projects WHERE id = $1', [projectId]);
      const projectName = projectResult.rows[0]?.name || 'Unknown Project';
      const projectDescription = projectResult.rows[0]?.description;

      const workstreamsResult = await this.workstreamDetector.detectWorkstreams(combinedText, {
        projectId,
        projectName,
        projectDescription,
        documentFilename: documents.length === 1 ? documents[0].filename : `${documents.length} documents`
      });
      result.workstreams = workstreamsResult.workstreams || [];
      
      // Workstream detector doesn't return cost - it's tracked separately via ai-cost-tracker

      emit('log', { message: `✓ Found ${result.workstreams.length} workstreams` });
      result.workstreams.forEach((ws, i) => {
        emit('log', { message: `  ${i + 1}. ${ws.name} (${ws.complexity || 'unknown'} complexity)` });
      });
      emit('log', { message: '' });

      if (result.workstreams.length === 0) {
        throw new Error('No workstreams detected - cannot create project structure');
      }

      // Step 3: Create issues from workstreams with AI effort estimates
      emit('step', { step: 3, title: 'Create Issues' });
      emit('log', { message: 'Step 3/7: Creating issues from workstreams...' });
      for (const workstream of result.workstreams) {
        const effortEstimate = this._calculateEffortEstimate(workstream);
        
        const issueResult = await pool.query(
          `INSERT INTO issues (
            project_id, title, description, status, created_by,
            ai_effort_estimate_hours, ai_estimate_confidence, ai_estimate_version
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            projectId, 
            workstream.name, 
            workstream.description || '', 
            'To Do', 
            userId,
            effortEstimate.hours,
            effortEstimate.confidence,
            0  // Version 0 = heuristic estimate (can be upgraded to detailed AI later)
          ]
        );
        const issueId = issueResult.rows[0].id;
        workstream.issueId = issueId;
        result.issues.ids.push(issueId);
        result.issues.created++;
        emit('log', { message: `  ✓ Created issue #${issueId}: ${workstream.name} (${effortEstimate.hours}h, ${effortEstimate.confidence} confidence)` });
      }
      emit('log', { message: `✓ Created ${result.issues.created} issues with AI effort estimates` });
      emit('log', { message: '' });

      // Step 4: Extract timeline (OPTIONAL)
      emit('step', { step: 4, title: 'Extract Timeline' });
      emit('log', { message: 'Step 4/7: Extracting timeline...' });
      if (this.timelineExtractor) {
        try {
          const timelineResult = await this.timelineExtractor.extractTimeline(
            combinedText,
            { projectId, projectStartDate }
          );
          
          result.timeline = timelineResult.timeline || { phases: [], milestones: [] };
          
          // Extract cost from timeline result (it's an object with costUsd property)
          if (timelineResult.cost && typeof timelineResult.cost === 'object') {
            const costAmount = timelineResult.cost.costUsd || 0;
            result.aiCostBreakdown.timeline_extraction = costAmount;
            result.totalCost += costAmount;
          }
          
          emit('log', { message: `✓ Extracted ${result.timeline.phases?.length || 0} phases, ${result.timeline.milestones?.length || 0} milestones` });
          emit('log', { message: '' });
        } catch (error) {
          result.warnings.push('Timeline extraction failed: ' + error.message);
          emit('log', { message: `⚠️  Timeline extraction failed: ${error.message}` });
          emit('log', { message: '' });
        }
      } else {
        result.warnings.push('Timeline extractor service not available');
        emit('log', { message: '⚠️  Timeline extractor not available - skipping' });
        emit('log', { message: '' });
      }

      // Step 5: Create dependencies (OPTIONAL)
      emit('step', { step: 5, title: 'Dependencies' });
      emit('log', { message: 'Step 5/7: Creating dependencies...' });
      if (this.dependencyMapper && result.issues.ids.length > 1) {
        try {
          // Call createDependencies with workstreams and projectId
          const dependencyResult = await this.dependencyMapper.createDependencies(
            result.workstreams,
            projectId
          );
          
          result.dependencies.created = dependencyResult.dependencies?.length || 0;
          result.dependencies.warnings = dependencyResult.warnings || [];
          
          // Add any errors to our results
          if (dependencyResult.errors && dependencyResult.errors.length > 0) {
            result.warnings.push(...dependencyResult.errors.map(e => `Dependency error: ${e}`));
          }
          
          emit('log', { message: `✓ Created ${result.dependencies.created} dependencies` });
          emit('log', { message: '' });
        } catch (error) {
          result.warnings.push('Dependency mapping failed: ' + error.message);
          emit('log', { message: `⚠️  Dependency mapping failed: ${error.message}` });
          emit('log', { message: '' });
        }
      } else {
        result.warnings.push('Dependency mapper service not available or insufficient issues');
        emit('log', { message: '⚠️  Dependency mapper not available - skipping' });
        emit('log', { message: '' });
      }

      // Step 6: Parse resource assignments (OPTIONAL)
      emit('step', { step: 6, title: 'Parse Resources' });
      emit('log', { message: 'Step 6/7: Parsing resource assignments...' });
      if (this.resourceParser) {
        try {
          // Look for resources or effort documents
          const resourceDoc = documents.find(d => 
            d.classification === 'resources' || 
            d.classification === 'effort-estimate' ||
            d.filename.toLowerCase().includes('effort') ||
            d.filename.toLowerCase().includes('resource')
          );
          
          if (resourceDoc) {
            emit('log', { message: `  Using "${resourceDoc.filename}" for resource assignment` });
            const resourceResult = await this.resourceParser.parseResources(
              resourceDoc.text,
              { 
                projectId, 
                issueIds: result.issues.ids,
                assignToIssues: true  // Enable actual assignment to issues
              }
            );
            
            // Map response correctly
            result.resourceAssignments.assigned = resourceResult.assignments?.length || 0;
            result.resourceAssignments.needsReview = resourceResult.resources?.filter(r => r.needsReview) || [];
            
            emit('log', { message: `✓ Assigned ${result.resourceAssignments.assigned} resources` });
            emit('log', { message: '' });
          } else {
            result.warnings.push('No resource/effort document found for resource parsing');
            emit('log', { message: '⚠️  No resource/effort document found - skipping resource assignment' });
            emit('log', { message: '' });
          }
        } catch (error) {
          result.warnings.push('Resource assignment failed: ' + error.message);
          emit('log', { message: `⚠️  Resource assignment failed: ${error.message}` });
          emit('log', { message: '' });
        }
      } else {
        result.warnings.push('Resource parser service not available');
        emit('log', { message: '⚠️  Resource parser not available - skipping' });
        emit('log', { message: '' });
      }

      // Step 7: Generate checklists
      emit('step', { step: 7, title: 'Gen Checklists' });
      emit('log', { message: 'Step 7/7: Generating checklists...' });
      emit('log', { message: `  Processing ${result.workstreams.length} of ${result.workstreams.length} workstreams` });
      
      const aiService = require('./ai-service');
      
      for (const workstream of result.workstreams) {
        try {
          const context = {
            projectId,
            issueId: workstream.issueId,
            issueName: workstream.name,
            mode: 'issue'
          };
          
          // generateChecklistFromDocument returns an array of checklists, not a cost object
          const checklists = await aiService.generateChecklistFromDocument(
            combinedText,
            context
          );
          
          // Count items from returned checklists array
          let itemCount = 0;
          if (Array.isArray(checklists)) {
            for (const checklist of checklists) {
              if (checklist.sections) {
                for (const section of checklist.sections) {
                  itemCount += section.items?.length || 0;
                }
              }
            }
          }
          
          result.checklists.created++;
          result.checklists.items += itemCount;
        } catch (error) {
          result.warnings.push(`Checklist generation failed for ${workstream.name}: ${error.message}`);
          emit('log', { message: `  ⚠️  Failed to generate checklist for ${workstream.name}` });
        }
      }
      
      // Note: checklist generation cost is not tracked separately
      // It's included in the overall OpenAI API usage tracked by ai-cost-tracker
      
      emit('log', { message: `✓ Generated ${result.checklists.created} checklists with ${result.checklists.items} items` });
      emit('log', { message: '' });

      // Auto-create project schedule if we have issues with estimates and dependencies
      result.schedule = { created: false, scheduleId: null, message: null };
      
      if (result.issues.created > 0 && result.issues.ids.length > 0) {
        try {
          emit('log', { message: '📅 Auto-generating project schedule...' });
          
          // Check if a schedule already exists for this project
          const existingSchedule = await pool.query(
            'SELECT id FROM project_schedules WHERE project_id = $1 LIMIT 1',
            [projectId]
          );
          
          if (existingSchedule.rows.length > 0) {
            result.schedule.created = false;
            result.schedule.message = 'Schedule already exists for this project';
            result.warnings.push('Schedule creation skipped: Schedule already exists');
            emit('log', { message: '⚠️  Schedule already exists - skipping auto-creation' });
            emit('log', { message: '' });
          } else {
            // Fetch created issues with estimates and dependencies
            const issuesData = await pool.query(
              `SELECT i.id, i.title, i.assignee, i.due_date,
                      i.ai_effort_estimate_hours as estimated_hours,
                      CASE
                        WHEN i.ai_estimate_version = 0 THEN 'heuristic'
                        WHEN i.ai_estimate_version > 0 THEN 'ai'
                        ELSE 'manual'
                      END as estimate_source
               FROM issues i
               WHERE i.id = ANY($1)
               ORDER BY i.id`,
              [result.issues.ids]
            );

            // Fetch dependencies from issue_relationships table
            const depsData = await pool.query(
              `SELECT source_id, source_type, target_id, target_type, relationship_type
               FROM issue_relationships
               WHERE (source_id = ANY($1) OR target_id = ANY($1))
               AND source_type = 'issue' AND target_type = 'issue'`,
              [result.issues.ids]
            );

            // Build dependency map (issue -> prerequisites)
            const dependencyMap = new Map();
            for (const dep of depsData.rows) {
              if (dep.relationship_type === 'blocks') {
                // A blocks B means B depends on A
                const dependent = `issue:${dep.target_id}`;
                const prerequisite = `issue:${dep.source_id}`;
                if (!dependencyMap.has(dependent)) {
                  dependencyMap.set(dependent, []);
                }
                dependencyMap.get(dependent).push(prerequisite);
              } else if (dep.relationship_type === 'depends_on') {
                // A depends_on B means A depends on B
                const dependent = `issue:${dep.source_id}`;
                const prerequisite = `issue:${dep.target_id}`;
                if (!dependencyMap.has(dependent)) {
                  dependencyMap.set(dependent, []);
                }
                dependencyMap.get(dependent).push(prerequisite);
              }
            }

            // Prepare items for schedule calculation
            const scheduleItems = issuesData.rows.map(issue => ({
              type: 'issue',
              id: issue.id,
              title: issue.title,
              assignee: issue.assignee || 'Unassigned',
              // Convert to number - PostgreSQL numeric columns return strings
              estimate: parseFloat(issue.estimated_hours) || 0,
              estimateSource: issue.estimate_source || 'ai',
              dueDate: issue.due_date,
              dependencies: dependencyMap.get(`issue:${issue.id}`) || []
            }));

            // Determine schedule start date
            const scheduleStartDate = projectStartDate || 
              result.timeline.phases?.[0]?.startDate || 
              new Date().toISOString().split('T')[0];

            // Create schedule using reusable service
            const scheduleResult = await schedulerService.createScheduleFromIssues({
              projectId,
              name: 'AI-Generated Schedule (Multi-Document Import)',
              items: scheduleItems,
              startDate: scheduleStartDate,
              hoursPerDay: 8,
              includeWeekends: false,
              userId,
              notes: `Auto-generated from multi-document import (${documents.length} documents)`
            });

            result.schedule.created = true;
            result.schedule.scheduleId = scheduleResult.scheduleId;
            result.schedule.message = `Schedule created with ${scheduleResult.totalTasks} tasks`;
            
            emit('log', { message: `✅ Schedule #${scheduleResult.scheduleId} auto-created with ${scheduleResult.totalTasks} tasks` });
            emit('log', { message: '' });
          }
        } catch (scheduleError) {
          result.schedule.created = false;
          result.schedule.message = `Schedule creation failed: ${scheduleError.message}`;
          result.warnings.push(`Auto-schedule creation failed: ${scheduleError.message}`);
          emit('log', { message: `⚠️  Schedule auto-creation failed: ${scheduleError.message}` });
          emit('log', { message: '' });
        }
      } else {
        result.schedule.created = false;
        result.schedule.message = 'No issues created to schedule';
        emit('log', { message: '⚠️  No issues to schedule - skipping schedule creation' });
        emit('log', { message: '' });
      }

      // Store import metadata
      const importResult = await pool.query(
        `INSERT INTO project_imports (
          project_id, user_id, documents_processed,
          workstreams_created, issues_created, phases_extracted, milestones_extracted,
          dependencies_created, resource_assignments, checklists_created, checklist_items_created,
          ai_cost_breakdown, total_ai_cost_usd, success, errors, warnings, duration_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id`,
        [
          projectId,
          userId,
          result.documents.processed,
          result.workstreams.length,
          result.issues.created,
          result.timeline.phases?.length || 0,
          result.timeline.milestones?.length || 0,
          result.dependencies.created,
          result.resourceAssignments.assigned,
          result.checklists.created,
          result.checklists.items,
          JSON.stringify(result.aiCostBreakdown),
          result.totalCost,
          true,
          JSON.stringify(result.errors),
          JSON.stringify(result.warnings),
          Date.now() - startTime
        ]
      );
      importId = importResult.rows[0].id;

      result.success = true;
      result.duration = Date.now() - startTime;

      emit('log', { message: '╔════════════════════════════════════════════════════╗' });
      emit('log', { message: '║   MULTI-DOCUMENT IMPORT COMPLETE                   ║' });
      emit('log', { message: '╚════════════════════════════════════════════════════╝' });
      emit('log', { message: `✅ Import ID: ${importId}` });
      emit('log', { message: `✅ Duration: ${result.duration}ms` });
      emit('log', { message: `✅ Total AI Cost: $${result.totalCost.toFixed(4)}` });
      emit('log', { message: '' });
      
      // Send completion event
      emit('complete', { success: true, importId, duration: result.duration, totalCost: result.totalCost });

    } catch (error) {
      result.success = false;
      result.errors.push(error.message);
      result.duration = Date.now() - startTime;
      
      emit('error', { message: `❌ Multi-document import failed: ${error.message}` });
      
      // Store failed import metadata
      if (projectId && userId) {
        try {
          await pool.query(
            `INSERT INTO project_imports (
              project_id, user_id, documents_processed,
              success, errors, warnings, duration_ms
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              projectId,
              userId,
              documents.length,
              false,
              JSON.stringify(result.errors),
              JSON.stringify(result.warnings),
              result.duration
            ]
          );
        } catch (dbError) {
          emit('error', { message: `Failed to store import failure metadata: ${dbError.message}` });
        }
      }
      
      // Send error completion event
      emit('complete', { success: false, error: error.message, duration: result.duration });
    }

    return result;
  }

  /**
   * Calculate AI effort estimate based on workstream complexity
   * @param {object} workstream - Workstream with estimatedComplexity
   * @returns {object} { hours, confidence }
   */
  _calculateEffortEstimate(workstream) {
    const complexity = (workstream.estimatedComplexity || workstream.complexity || 'medium').toLowerCase();
    const requirementsCount = workstream.keyRequirements?.length || 0;
    
    // Base effort estimates by complexity (in hours)
    const effortMap = {
      'low': 30,      // ~1 week for one person
      'medium': 60,   // ~2 weeks for one person
      'high': 120     // ~4 weeks for one person
    };
    
    // Get base hours
    let baseHours = effortMap[complexity] || effortMap['medium'];
    
    // Adjust based on number of requirements (±20%)
    if (requirementsCount > 0) {
      if (requirementsCount <= 3) {
        baseHours *= 0.85;  // Fewer requirements = less work
      } else if (requirementsCount >= 8) {
        baseHours *= 1.15;  // More requirements = more work
      }
    }
    
    // Round to nearest 5 hours for cleaner estimates
    const estimatedHours = Math.round(baseHours / 5) * 5;
    
    // Calculate confidence based on available information
    let confidence = 0.6;  // Base confidence for AI estimates
    
    if (workstream.description && workstream.description.length > 100) {
      confidence += 0.1;  // Good description
    }
    if (requirementsCount >= 3) {
      confidence += 0.1;  // Clear requirements
    }
    if (workstream.documentSections && workstream.documentSections.length > 0) {
      confidence += 0.1;  // References to specific document sections
    }
    
    confidence = Math.min(confidence, 0.85);  // Cap at 85% for AI estimates
    
    return {
      hours: estimatedHours,
      confidence: parseFloat(confidence.toFixed(2))
    };
  }

  /**
   * Combine multiple documents into a single text with clear separators
   */
  _combineDocuments(documents) {
    return documents.map((doc, index) => 
      `=== Document ${index + 1}: ${doc.filename} (${doc.classification || 'unclassified'}) ===\n${doc.text}`
    ).join('\n\n');
  }
}

module.exports = new MultiDocumentAnalyzer();
