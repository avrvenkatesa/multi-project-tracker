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
   * @param {Object} options - {projectId, userId, projectStartDate}
   * @returns {Object} Complete analysis results with created entities
   */
  async analyzeMultipleDocuments(documents, options) {
    const { projectId, userId, projectStartDate } = options;
    const startTime = Date.now();
    
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
      console.log('╔════════════════════════════════════════════════════╗');
      console.log('║   MULTI-DOCUMENT PROJECT IMPORT STARTING           ║');
      console.log('╚════════════════════════════════════════════════════╝');
      console.log(`📁 Project ID: ${projectId}`);
      console.log(`📄 Documents: ${documents.length}`);
      console.log(`📅 Start Date: ${projectStartDate}\n`);

      // Step 1: Combine document text
      console.log('Step 1/7: Combining document text...');
      const combinedText = this._combineDocuments(documents);
      console.log(`✓ Combined ${combinedText.length} characters\n`);
      result.documents.processed = documents.length;

      // Step 2: Detect workstreams (CRITICAL - cannot proceed without this)
      console.log('Step 2/7: Detecting workstreams...');
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

      console.log(`✓ Found ${result.workstreams.length} workstreams`);
      result.workstreams.forEach((ws, i) => {
        console.log(`  ${i + 1}. ${ws.name} (${ws.complexity || 'unknown'} complexity)`);
      });
      console.log('');

      if (result.workstreams.length === 0) {
        throw new Error('No workstreams detected - cannot create project structure');
      }

      // Step 3: Create issues from workstreams with AI effort estimates
      console.log('Step 3/7: Creating issues from workstreams...');
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
            1
          ]
        );
        const issueId = issueResult.rows[0].id;
        workstream.issueId = issueId;
        result.issues.ids.push(issueId);
        result.issues.created++;
        console.log(`  ✓ Created issue #${issueId}: ${workstream.name} (${effortEstimate.hours}h, ${effortEstimate.confidence} confidence)`);
      }
      console.log(`✓ Created ${result.issues.created} issues with AI effort estimates\n`);

      // Step 4: Extract timeline (OPTIONAL)
      console.log('Step 4/7: Extracting timeline...');
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
          
          console.log(`✓ Extracted ${result.timeline.phases?.length || 0} phases, ${result.timeline.milestones?.length || 0} milestones\n`);
        } catch (error) {
          result.warnings.push('Timeline extraction failed: ' + error.message);
          console.log(`⚠️  Timeline extraction failed: ${error.message}\n`);
        }
      } else {
        result.warnings.push('Timeline extractor service not available');
        console.log('⚠️  Timeline extractor not available - skipping\n');
      }

      // Step 5: Create dependencies (OPTIONAL)
      console.log('Step 5/7: Creating dependencies...');
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
          
          console.log(`✓ Created ${result.dependencies.created} dependencies\n`);
        } catch (error) {
          result.warnings.push('Dependency mapping failed: ' + error.message);
          console.log(`⚠️  Dependency mapping failed: ${error.message}\n`);
        }
      } else {
        result.warnings.push('Dependency mapper service not available or insufficient issues');
        console.log('⚠️  Dependency mapper not available - skipping\n');
      }

      // Step 6: Parse resource assignments (OPTIONAL)
      console.log('Step 6/7: Parsing resource assignments...');
      if (this.resourceParser) {
        try {
          const effortDoc = documents.find(d => 
            d.classification === 'Effort' || 
            d.filename.toLowerCase().includes('effort')
          );
          
          if (effortDoc) {
            const resourceResult = await this.resourceParser.parseResources(
              effortDoc.text,
              { 
                projectId, 
                issueIds: result.issues.ids,
                assignToIssues: true  // Enable actual assignment to issues
              }
            );
            
            // Map response correctly
            result.resourceAssignments.assigned = resourceResult.assignments?.length || 0;
            result.resourceAssignments.needsReview = resourceResult.resources?.filter(r => r.needsReview) || [];
            
            console.log(`✓ Assigned ${result.resourceAssignments.assigned} resources\n`);
          } else {
            result.warnings.push('No Effort document found for resource parsing');
            console.log('⚠️  No Effort document found - skipping resource assignment\n');
          }
        } catch (error) {
          result.warnings.push('Resource assignment failed: ' + error.message);
          console.log(`⚠️  Resource assignment failed: ${error.message}\n`);
        }
      } else {
        result.warnings.push('Resource parser service not available');
        console.log('⚠️  Resource parser not available - skipping\n');
      }

      // Step 7: Generate checklists
      console.log('Step 7/7: Generating checklists...');
      console.log(`  Processing ${result.workstreams.length} of ${result.workstreams.length} workstreams`);
      
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
          console.log(`  ⚠️  Failed to generate checklist for ${workstream.name}`);
        }
      }
      
      // Note: checklist generation cost is not tracked separately
      // It's included in the overall OpenAI API usage tracked by ai-cost-tracker
      
      console.log(`✓ Generated ${result.checklists.created} checklists with ${result.checklists.items} items\n`);

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

      console.log('╔════════════════════════════════════════════════════╗');
      console.log('║   MULTI-DOCUMENT IMPORT COMPLETE                   ║');
      console.log('╚════════════════════════════════════════════════════╝');
      console.log(`✅ Import ID: ${importId}`);
      console.log(`✅ Duration: ${result.duration}ms`);
      console.log(`✅ Total AI Cost: $${result.totalCost.toFixed(4)}\n`);

    } catch (error) {
      result.success = false;
      result.errors.push(error.message);
      result.duration = Date.now() - startTime;
      
      console.error('❌ Multi-document import failed:', error.message);
      
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
          console.error('Failed to store import failure metadata:', dbError.message);
        }
      }
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
