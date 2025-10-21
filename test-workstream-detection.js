/**
 * Test script for Phase 4 Mode 2: Workstream Detection
 * Can be run in browser console after logging in
 * Or as a standalone test file
 */

const testDocument = `
Azure Cloud Migration - Statement of Work

1. INFRASTRUCTURE ASSESSMENT (Weeks 1-2)
Objective: Document current on-premises infrastructure
- Complete inventory of all servers and applications
- Network topology mapping
- Storage capacity and IOPS analysis
- Identify dependencies between systems
- Document backup and disaster recovery setup

2. MIGRATION PLANNING (Weeks 2-3)
Objective: Develop comprehensive migration strategy
- Define migration waves and priorities
- Establish timeline and milestones
- Identify potential risks and mitigation strategies
- Plan for parallel operation during cutover
- Create rollback procedures

3. AZURE ENVIRONMENT SETUP (Weeks 3-4)
Objective: Configure Azure infrastructure
- Design Azure resource groups and subscriptions
- Configure virtual networks and subnets
- Set up ExpressRoute or VPN connectivity
- Implement Azure Active Directory integration
- Configure monitoring and alerting

4. APPLICATION MIGRATION (Weeks 4-6)
Objective: Migrate applications to Azure
- Install Azure Migration Service tools
- Perform lift-and-shift migration for VMs
- Migrate databases to Azure SQL or Managed Instance
- Update application configurations for cloud
- Test applications in Azure environment

5. SECURITY AND COMPLIANCE (Weeks 5-7)
Objective: Ensure security and compliance
- Implement Azure Security Center
- Configure network security groups and firewalls
- Set up Azure Key Vault for secrets management
- Enable audit logging and compliance reporting
- Conduct security assessment

6. TESTING AND VALIDATION (Weeks 6-8)
Objective: Validate migration success
- Schedule production cutover window
- Execute IP repointing for DNS cutover
- Perform mock cutover rehearsal
- Validate all applications post-migration
- Document final migration status
`;

async function testWorkstreamDetection() {
  try {
    console.log('🧪 Testing Phase 4 Mode 2: Workstream Detection...\n');
    console.log('================================================\n');
    
    // Step 1: Detect workstreams
    console.log('📍 Step 1: Detecting workstreams...');
    const detectResponse = await fetch('/api/projects/1/analyze-workstreams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        documentText: testDocument,
        filename: 'azure-migration-sow.txt'
      })
    });
    
    if (!detectResponse.ok) {
      const error = await detectResponse.json();
      console.error('❌ Detection failed:', error);
      return;
    }
    
    const detectData = await detectResponse.json();
    
    console.log('\n✅ Workstreams detected successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Total workstreams: ${detectData.workstreams.length}`);
    console.log(`   Document type: ${detectData.summary.documentType}`);
    console.log(`   Document length: ${detectData.metadata.documentLength} chars`);
    console.log(`   Tokens used: ${detectData.metadata.tokensUsed}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📋 Detected Workstreams:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    detectData.workstreams.forEach((ws, i) => {
      console.log(`\n${i + 1}. ${ws.name}`);
      console.log(`   ID: ${ws.id}`);
      console.log(`   Complexity: ${ws.estimatedComplexity}`);
      console.log(`   Phase: ${ws.suggestedPhase}`);
      console.log(`   Description: ${ws.description}`);
      console.log(`   Key Requirements (${ws.keyRequirements.length}):`);
      ws.keyRequirements.forEach((req, idx) => {
        console.log(`      ${idx + 1}. ${req}`);
      });
      if (ws.dependencies && ws.dependencies.length > 0) {
        console.log(`   Dependencies: ${ws.dependencies.join(', ')}`);
      }
    });
    
    // Step 2: Generate checklists
    console.log('\n\n📍 Step 2: Generating checklists for workstreams...');
    const generateResponse = await fetch('/api/projects/1/generate-workstream-checklists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        workstreams: detectData.workstreams,
        documentText: testDocument
      })
    });
    
    if (!generateResponse.ok) {
      const error = await generateResponse.json();
      console.error('❌ Checklist generation failed:', error);
      return;
    }
    
    const generateData = await generateResponse.json();
    
    console.log('\n✅ Checklists generated successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Total checklists: ${generateData.count}`);
    console.log(`   Total items: ${generateData.totalItems}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log('📝 Generated Checklists:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    generateData.checklists.forEach((c, i) => {
      const itemCount = c.checklist.sections?.reduce(
        (sum, s) => sum + (s.items?.length || 0), 0
      ) || 0;
      
      console.log(`\n${i + 1}. ${c.workstreamName}`);
      console.log(`   Checklist Title: ${c.checklist.title}`);
      console.log(`   Description: ${c.checklist.description}`);
      console.log(`   Sections: ${c.checklist.sections?.length || 0}`);
      console.log(`   Total Items: ${itemCount}`);
      console.log(`   Complexity: ${c.estimatedComplexity}`);
      console.log(`   Phase: ${c.suggestedPhase}`);
      
      console.log('\n   Sections & Items:');
      c.checklist.sections?.forEach((section, sIdx) => {
        console.log(`      ${sIdx + 1}. ${section.title} (${section.items.length} items)`);
        section.items.forEach((item, iIdx) => {
          console.log(`         ${iIdx + 1}. ${item.text} [${item.priority}]`);
          if (item.notes) {
            console.log(`            Note: ${item.notes}`);
          }
        });
      });
    });
    
    console.log('\n\n✅ Test completed successfully!');
    console.log('================================================');
    console.log('\n📊 Summary:');
    console.log(`   ✓ Detected ${detectData.workstreams.length} workstreams`);
    console.log(`   ✓ Generated ${generateData.count} checklists`);
    console.log(`   ✓ Created ${generateData.totalItems} total checklist items`);
    console.log('================================================\n');
    
    return {
      workstreams: detectData.workstreams,
      checklists: generateData.checklists
    };
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    console.error('Error details:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
  console.log('📋 Workstream Detection Test Script Loaded');
  console.log('Run testWorkstreamDetection() to start the test');
  console.log('Make sure you are logged in first!\n');
}

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testWorkstreamDetection, testDocument };
}
