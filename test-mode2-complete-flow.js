/**
 * Test script for Phase 4 Mode 2: Complete Flow
 * Tests workstream detection → checklist generation → issue matching → batch creation
 * Can be run in browser console after logging in
 */

async function testCompleteMode2Flow() {
  console.log('🧪 TESTING PHASE 4 MODE 2: COMPLETE FLOW');
  console.log('==========================================\n');
  
  const projectId = 1; // Adjust to your project ID
  
  const testDoc = `
AZURE MIGRATION PROJECT - STATEMENT OF WORK

Phase 1: Infrastructure Assessment
Objective: Complete inventory and analysis of current on-premises infrastructure
Key Deliverables:
- Server and application inventory
- Network topology documentation
- Storage capacity analysis
- Dependency mapping
- Backup and DR assessment

Phase 2: Azure Environment Setup  
Objective: Configure Azure cloud environment and networking
Key Deliverables:
- Azure resource groups and subscriptions
- Virtual networks and subnets
- ExpressRoute/VPN connectivity
- Azure Active Directory integration
- Monitoring and alerting configuration

Phase 3: Database Migration
Objective: Migrate databases to Azure SQL and Managed Instance
Key Deliverables:
- Database inventory and sizing
- Migration strategy per database
- Azure SQL provisioning
- Data migration execution
- Post-migration validation

Phase 4: Application Migration
Objective: Move applications to Azure virtual machines
Key Deliverables:
- Application assessment
- VM sizing and provisioning
- Lift-and-shift migration
- Configuration updates
- Application testing in Azure

Phase 5: Testing and Validation
Objective: Validate complete migration success
Key Deliverables:
- Mock cutover rehearsal
- Production cutover planning
- DNS and IP repointing
- Post-migration validation
- Documentation and handover
`;

  try {
    // ==============================================
    // STEP 1: Detect Workstreams
    // ==============================================
    console.log('📍 STEP 1: Detecting workstreams from document...');
    console.log('─'.repeat(50));
    
    const detectRes = await fetch(`/api/projects/${projectId}/analyze-workstreams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        documentText: testDoc, 
        filename: 'azure-migration-sow.txt' 
      })
    });
    
    if (!detectRes.ok) {
      const error = await detectRes.json();
      console.error('❌ Workstream detection failed:', error);
      return;
    }
    
    const workstreamsData = await detectRes.json();
    
    console.log(`✅ Detected ${workstreamsData.workstreams.length} workstreams\n`);
    workstreamsData.workstreams.forEach((ws, i) => {
      console.log(`   ${i + 1}. ${ws.name}`);
      console.log(`      Complexity: ${ws.estimatedComplexity} | Phase: ${ws.suggestedPhase}`);
      console.log(`      Requirements: ${ws.keyRequirements.length}`);
    });
    console.log('');
    
    // ==============================================
    // STEP 2: Generate Checklists
    // ==============================================
    console.log('📍 STEP 2: Generating checklists for workstreams...');
    console.log('─'.repeat(50));
    
    const generateRes = await fetch(`/api/projects/${projectId}/generate-workstream-checklists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        workstreams: workstreamsData.workstreams,
        documentText: testDoc
      })
    });
    
    if (!generateRes.ok) {
      const error = await generateRes.json();
      console.error('❌ Checklist generation failed:', error);
      return;
    }
    
    const checklistsData = await generateRes.json();
    
    console.log(`✅ Generated ${checklistsData.count} checklists`);
    console.log(`   Total items: ${checklistsData.totalItems}\n`);
    
    checklistsData.checklists.forEach((c, i) => {
      const itemCount = c.checklist.sections?.reduce(
        (sum, s) => sum + (s.items?.length || 0), 0
      ) || 0;
      console.log(`   ${i + 1}. ${c.workstreamName}`);
      console.log(`      Sections: ${c.checklist.sections?.length || 0} | Items: ${itemCount}`);
    });
    console.log('');
    
    // ==============================================
    // STEP 3: Match to Issues
    // ==============================================
    console.log('📍 STEP 3: Matching checklists to existing issues...');
    console.log('─'.repeat(50));
    
    const matchRes = await fetch(`/api/projects/${projectId}/match-checklists-to-issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        checklists: checklistsData.checklists
      })
    });
    
    if (!matchRes.ok) {
      const error = await matchRes.json();
      console.error('❌ Issue matching failed:', error);
      return;
    }
    
    const matchData = await matchRes.json();
    
    console.log('✅ MATCHING COMPLETE\n');
    console.log('📊 Summary Statistics:');
    console.log('─'.repeat(50));
    console.log(`   Total checklists: ${matchData.summary.totalChecklists}`);
    console.log(`   Matched: ${matchData.summary.matched}`);
    console.log(`   Unmatched: ${matchData.summary.unmatched}`);
    console.log(`   Average confidence: ${matchData.summary.averageConfidence}%`);
    console.log(`   High confidence (≥80%): ${matchData.summary.highConfidence}`);
    console.log(`   Medium confidence (50-79%): ${matchData.summary.mediumConfidence}`);
    console.log(`   Low confidence (<50%): ${matchData.summary.lowConfidence}`);
    console.log('');
    
    console.log('🔗 Detailed Matches:');
    console.log('─'.repeat(50));
    matchData.matches.forEach((match, i) => {
      console.log(`\n${i + 1}. ${match.checklist.workstreamName}`);
      
      if (match.matchedIssue) {
        console.log(`   ✓ MATCHED to Issue #${match.matchedIssue.id}`);
        console.log(`     Title: "${match.matchedIssue.title}"`);
        console.log(`     Confidence: ${match.confidence}%`);
        console.log(`     Reasoning: ${match.reasoning}`);
      } else {
        console.log(`   ○ NO MATCH FOUND`);
        console.log(`     Reasoning: ${match.reasoning}`);
        console.log(`     Suggested new issue: "${match.suggestedNewIssue.title}"`);
        console.log(`     Priority: ${match.suggestedNewIssue.priority}`);
      }
    });
    
    // ==============================================
    // STEP 4: (Optional) Create Matched Checklists
    // ==============================================
    console.log('\n\n📍 STEP 4: Ready for batch creation');
    console.log('─'.repeat(50));
    console.log('To create these checklists in the database:');
    console.log('1. Review the matches above');
    console.log('2. Prepare approvedMatches array with your selections');
    console.log('3. Call: POST /api/projects/:id/create-matched-checklists');
    console.log('\nExample approvedMatches format:');
    console.log('[');
    console.log('  {');
    console.log('    checklist: <checklist object>,');
    console.log('    issueId: 123,  // or null');
    console.log('    createNewIssue: false,  // set to true if issueId is null');
    console.log('    suggestedNewIssue: <suggestion object>');
    console.log('  }');
    console.log(']');
    
    // ==============================================
    // Summary
    // ==============================================
    console.log('\n\n✅ MODE 2 COMPLETE FLOW TEST FINISHED!');
    console.log('==========================================');
    console.log('\n🎯 Results Summary:');
    console.log(`   → Workstreams detected: ${workstreamsData.workstreams.length}`);
    console.log(`   → Checklists generated: ${checklistsData.count}`);
    console.log(`   → Total checklist items: ${checklistsData.totalItems}`);
    console.log(`   → Checklists matched to issues: ${matchData.summary.matched}`);
    console.log(`   → Checklists needing new issues: ${matchData.summary.unmatched}`);
    console.log(`   → Average match confidence: ${matchData.summary.averageConfidence}%`);
    console.log('\n');
    
    return {
      workstreams: workstreamsData,
      checklists: checklistsData,
      matches: matchData
    };
    
  } catch (error) {
    console.error('❌ TEST FAILED WITH ERROR:', error);
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Auto-load message
if (typeof window !== 'undefined') {
  console.log('📋 Phase 4 Mode 2 Complete Flow Test Script Loaded');
  console.log('Run: testCompleteMode2Flow()');
  console.log('Make sure you are logged in first!\n');
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testCompleteMode2Flow };
}
