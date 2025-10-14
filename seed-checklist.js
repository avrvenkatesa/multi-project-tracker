const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

async function seedAccessVerificationTemplate() {
  try {
    console.log('🌱 Starting Access Verification Template Seed...\n');

    // 1. Create the template
    console.log('Creating template...');
    const [template] = await sql`
      INSERT INTO checklist_templates (name, description, category, icon, is_system, created_by)
      VALUES (
        'Access Verification Checklist',
        'Comprehensive checklist for S4Carlisle Cloud Migration - Access Verification Phase',
        'access-verification',
        'shield-check',
        true,
        NULL
      )
      RETURNING id
    `;
    const templateId = template.id;
    console.log(`✓ Template created with ID: ${templateId}\n`);

    // 2. Create main sections and subsections
    const sections = [];
    
    // Section 1: Server Access Verification
    const [section1] = await sql`
      INSERT INTO checklist_template_sections (template_id, title, section_number, display_order)
      VALUES (${templateId}, 'Server Access Verification', '1', 1)
      RETURNING id
    `;
    sections.push(section1.id);
    
    const subsections1 = await sql`
      INSERT INTO checklist_template_sections (template_id, parent_section_id, title, section_number, display_order)
      VALUES 
        (${templateId}, ${section1.id}, 'Pathfinder Application Servers', '1.1', 1),
        (${templateId}, ${section1.id}, 'Database Servers', '1.2', 2),
        (${templateId}, ${section1.id}, 'Web/API Servers', '1.3', 3),
        (${templateId}, ${section1.id}, 'Integration Servers', '1.4', 4),
        (${templateId}, ${section1.id}, 'File/Storage Servers', '1.5', 5),
        (${templateId}, ${section1.id}, 'Network Infrastructure', '1.6', 6)
      RETURNING id
    `;
    
    // Section 2: Access Methods Verification
    const [section2] = await sql`
      INSERT INTO checklist_template_sections (template_id, title, section_number, display_order)
      VALUES (${templateId}, 'Access Methods Verification', '2', 2)
      RETURNING id
    `;
    sections.push(section2.id);
    
    const subsections2 = await sql`
      INSERT INTO checklist_template_sections (template_id, parent_section_id, title, section_number, display_order)
      VALUES 
        (${templateId}, ${section2.id}, 'Remote Desktop Protocol (RDP)', '2.1', 1),
        (${templateId}, ${section2.id}, 'SSH Access', '2.2', 2),
        (${templateId}, ${section2.id}, 'VPN Connectivity', '2.3', 3),
        (${templateId}, ${section2.id}, 'Management Console Access', '2.4', 4),
        (${templateId}, ${section2.id}, 'API Access', '2.5', 5)
      RETURNING id
    `;
    
    // Section 3: Administrative Credentials Verification
    const [section3] = await sql`
      INSERT INTO checklist_template_sections (template_id, title, section_number, display_order)
      VALUES (${templateId}, 'Administrative Credentials Verification', '3', 3)
      RETURNING id
    `;
    sections.push(section3.id);
    
    const subsections3 = await sql`
      INSERT INTO checklist_template_sections (template_id, parent_section_id, title, section_number, display_order)
      VALUES 
        (${templateId}, ${section3.id}, 'Local Administrator Accounts', '3.1', 1),
        (${templateId}, ${section3.id}, 'Domain Administrator Accounts', '3.2', 2),
        (${templateId}, ${section3.id}, 'Service Accounts', '3.3', 3),
        (${templateId}, ${section3.id}, 'Database Admin Credentials', '3.4', 4),
        (${templateId}, ${section3.id}, 'Application Admin Credentials', '3.5', 5)
      RETURNING id
    `;
    
    // Section 4: Access Level Verification
    const [section4] = await sql`
      INSERT INTO checklist_template_sections (template_id, title, section_number, display_order)
      VALUES (${templateId}, 'Access Level Verification', '4', 4)
      RETURNING id
    `;
    sections.push(section4.id);
    
    const subsections4 = await sql`
      INSERT INTO checklist_template_sections (template_id, parent_section_id, title, section_number, display_order)
      VALUES 
        (${templateId}, ${section4.id}, 'Read-Only Access', '4.1', 1),
        (${templateId}, ${section4.id}, 'Read-Write Access', '4.2', 2),
        (${templateId}, ${section4.id}, 'Administrative Access', '4.3', 3),
        (${templateId}, ${section4.id}, 'Privileged Access', '4.4', 4)
      RETURNING id
    `;
    
    // Section 5: Security Requirements Verification
    const [section5] = await sql`
      INSERT INTO checklist_template_sections (template_id, title, section_number, display_order)
      VALUES (${templateId}, 'Security Requirements Verification', '5', 5)
      RETURNING id
    `;
    sections.push(section5.id);
    
    const subsections5 = await sql`
      INSERT INTO checklist_template_sections (template_id, parent_section_id, title, section_number, display_order)
      VALUES 
        (${templateId}, ${section5.id}, 'Multi-Factor Authentication (MFA)', '5.1', 1),
        (${templateId}, ${section5.id}, 'Password Complexity', '5.2', 2),
        (${templateId}, ${section5.id}, 'Firewall Rules', '5.3', 3),
        (${templateId}, ${section5.id}, 'Network Segmentation', '5.4', 4),
        (${templateId}, ${section5.id}, 'Audit Logging', '5.5', 5)
      RETURNING id
    `;
    
    // Section 6: Documentation Access Verification
    const [section6] = await sql`
      INSERT INTO checklist_template_sections (template_id, title, section_number, display_order)
      VALUES (${templateId}, 'Documentation Access Verification', '6', 6)
      RETURNING id
    `;
    sections.push(section6.id);
    
    const subsections6 = await sql`
      INSERT INTO checklist_template_sections (template_id, parent_section_id, title, section_number, display_order)
      VALUES 
        (${templateId}, ${section6.id}, 'System Architecture Diagrams', '6.1', 1),
        (${templateId}, ${section6.id}, 'Network Topology Maps', '6.2', 2),
        (${templateId}, ${section6.id}, 'Configuration Documentation', '6.3', 3),
        (${templateId}, ${section6.id}, 'Runbook Access', '6.4', 4),
        (${templateId}, ${section6.id}, 'Change Management Records', '6.5', 5),
        (${templateId}, ${section6.id}, 'Disaster Recovery Plans', '6.6', 6)
      RETURNING id
    `;
    
    // Section 7: Validation Tasks
    const [section7] = await sql`
      INSERT INTO checklist_template_sections (template_id, title, section_number, display_order)
      VALUES (${templateId}, 'Validation Tasks', '7', 7)
      RETURNING id
    `;
    sections.push(section7.id);
    
    const subsections7 = await sql`
      INSERT INTO checklist_template_sections (template_id, parent_section_id, title, section_number, display_order)
      VALUES 
        (${templateId}, ${section7.id}, 'Connectivity Tests', '7.1', 1),
        (${templateId}, ${section7.id}, 'Permission Validation', '7.2', 2),
        (${templateId}, ${section7.id}, 'Application Access Tests', '7.3', 3),
        (${templateId}, ${section7.id}, 'Data Access Validation', '7.4', 4),
        (${templateId}, ${section7.id}, 'Integration Point Tests', '7.5', 5)
      RETURNING id
    `;
    
    // Section 8: Security Considerations
    const [section8] = await sql`
      INSERT INTO checklist_template_sections (template_id, title, section_number, display_order)
      VALUES (${templateId}, 'Security Considerations', '8', 8)
      RETURNING id
    `;
    sections.push(section8.id);
    
    const subsections8 = await sql`
      INSERT INTO checklist_template_sections (template_id, parent_section_id, title, section_number, display_order)
      VALUES 
        (${templateId}, ${section8.id}, 'Credential Storage', '8.1', 1),
        (${templateId}, ${section8.id}, 'Access Revocation Plan', '8.2', 2),
        (${templateId}, ${section8.id}, 'Compliance Requirements', '8.3', 3),
        (${templateId}, ${section8.id}, 'Incident Response', '8.4', 4),
        (${templateId}, ${section8.id}, 'Security Monitoring', '8.5', 5)
      RETURNING id
    `;
    
    // Section 9: Deliverables
    const [section9] = await sql`
      INSERT INTO checklist_template_sections (template_id, title, section_number, display_order)
      VALUES (${templateId}, 'Deliverables', '9', 9)
      RETURNING id
    `;
    sections.push(section9.id);
    
    const subsections9 = await sql`
      INSERT INTO checklist_template_sections (template_id, parent_section_id, title, section_number, display_order)
      VALUES 
        (${templateId}, ${section9.id}, 'Access Verification Report', '9.1', 1),
        (${templateId}, ${section9.id}, 'Credential Documentation', '9.2', 2),
        (${templateId}, ${section9.id}, 'Issue Log', '9.3', 3),
        (${templateId}, ${section9.id}, 'Recommendations', '9.4', 4)
      RETURNING id
    `;
    
    // Section 10: Sign-Off & Approval
    const [section10] = await sql`
      INSERT INTO checklist_template_sections (template_id, title, section_number, display_order)
      VALUES (${templateId}, 'Sign-Off & Approval', '10', 10)
      RETURNING id
    `;
    sections.push(section10.id);
    
    console.log('✓ Created 10 main sections with subsections\n');

    // 3. Create items for each subsection (Sample: Section 1.1 - Pathfinder Application Servers)
    console.log('Creating checklist items...');
    
    const section1_1_id = subsections1[0].id;
    
    await sql`
      INSERT INTO checklist_template_items (section_id, item_text, field_type, is_required, display_order)
      VALUES 
        (${section1_1_id}, 'Server 1 hostname/IP', 'text', true, 1),
        (${section1_1_id}, 'Administrative access confirmed', 'checkbox', true, 2),
        (${section1_1_id}, 'RDP connectivity tested', 'checkbox', true, 3),
        (${section1_1_id}, 'Local admin credentials validated', 'checkbox', true, 4),
        (${section1_1_id}, 'Access level', 'radio', true, 5),
        (${section1_1_id}, 'Tested by', 'text', true, 6),
        (${section1_1_id}, 'Test date', 'date', true, 7),
        (${section1_1_id}, 'Issues/Notes', 'textarea', false, 8)
    `;
    
    // Update field_options for radio button
    await sql`
      UPDATE checklist_template_items 
      SET field_options = '["Read Only", "Read/Write", "Admin"]'
      WHERE section_id = ${section1_1_id} AND item_text = 'Access level'
    `;
    
    // Add items for remaining subsections in Section 1
    for (let i = 1; i < subsections1.length; i++) {
      await sql`
        INSERT INTO checklist_template_items (section_id, item_text, field_type, is_required, display_order)
        VALUES 
          (${subsections1[i].id}, 'Server hostname/IP', 'text', true, 1),
          (${subsections1[i].id}, 'Access confirmed', 'checkbox', true, 2),
          (${subsections1[i].id}, 'Connectivity tested', 'checkbox', true, 3),
          (${subsections1[i].id}, 'Credentials validated', 'checkbox', true, 4),
          (${subsections1[i].id}, 'Tested by', 'text', true, 5),
          (${subsections1[i].id}, 'Test date', 'date', true, 6),
          (${subsections1[i].id}, 'Notes', 'textarea', false, 7)
      `;
    }
    
    // Add items for Section 2 subsections
    for (const subsection of subsections2) {
      await sql`
        INSERT INTO checklist_template_items (section_id, item_text, field_type, is_required, display_order)
        VALUES 
          (${subsection.id}, 'Access method configured', 'checkbox', true, 1),
          (${subsection.id}, 'Connection successful', 'checkbox', true, 2),
          (${subsection.id}, 'Security protocols verified', 'checkbox', true, 3),
          (${subsection.id}, 'Tested by', 'text', true, 4),
          (${subsection.id}, 'Test date', 'date', true, 5),
          (${subsection.id}, 'Notes', 'textarea', false, 6)
      `;
    }
    
    // Add items for Section 3 subsections
    for (const subsection of subsections3) {
      await sql`
        INSERT INTO checklist_template_items (section_id, item_text, field_type, is_required, display_order)
        VALUES 
          (${subsection.id}, 'Account name/ID', 'text', true, 1),
          (${subsection.id}, 'Credentials verified', 'checkbox', true, 2),
          (${subsection.id}, 'Password meets complexity requirements', 'checkbox', true, 3),
          (${subsection.id}, 'MFA enabled', 'checkbox', true, 4),
          (${subsection.id}, 'Expiration date', 'date', false, 5),
          (${subsection.id}, 'Verified by', 'text', true, 6),
          (${subsection.id}, 'Verification date', 'date', true, 7),
          (${subsection.id}, 'Notes', 'textarea', false, 8)
      `;
    }
    
    // Add items for Section 4 subsections
    for (const subsection of subsections4) {
      await sql`
        INSERT INTO checklist_template_items (section_id, item_text, field_type, is_required, display_order)
        VALUES 
          (${subsection.id}, 'Permissions documented', 'checkbox', true, 1),
          (${subsection.id}, 'Access tested', 'checkbox', true, 2),
          (${subsection.id}, 'Appropriate for role', 'checkbox', true, 3),
          (${subsection.id}, 'Tested by', 'text', true, 4),
          (${subsection.id}, 'Test date', 'date', true, 5),
          (${subsection.id}, 'Notes', 'textarea', false, 6)
      `;
    }
    
    // Add items for Section 5 subsections
    for (const subsection of subsections5) {
      await sql`
        INSERT INTO checklist_template_items (section_id, item_text, field_type, is_required, display_order)
        VALUES 
          (${subsection.id}, 'Requirement identified', 'checkbox', true, 1),
          (${subsection.id}, 'Implementation verified', 'checkbox', true, 2),
          (${subsection.id}, 'Compliance status', 'radio', true, 3),
          (${subsection.id}, 'Verified by', 'text', true, 4),
          (${subsection.id}, 'Verification date', 'date', true, 5),
          (${subsection.id}, 'Notes', 'textarea', false, 6)
      `;
      
      await sql`
        UPDATE checklist_template_items 
        SET field_options = '["Compliant", "Non-Compliant", "Partial"]'
        WHERE section_id = ${subsection.id} AND item_text = 'Compliance status'
      `;
    }
    
    // Add items for Section 6 subsections
    for (const subsection of subsections6) {
      await sql`
        INSERT INTO checklist_template_items (section_id, item_text, field_type, is_required, display_order)
        VALUES 
          (${subsection.id}, 'Document location', 'text', true, 1),
          (${subsection.id}, 'Access granted', 'checkbox', true, 2),
          (${subsection.id}, 'Document current', 'checkbox', true, 3),
          (${subsection.id}, 'Version number', 'text', false, 4),
          (${subsection.id}, 'Reviewed by', 'text', true, 5),
          (${subsection.id}, 'Review date', 'date', true, 6),
          (${subsection.id}, 'Notes', 'textarea', false, 7)
      `;
    }
    
    // Add items for Section 7 subsections
    for (const subsection of subsections7) {
      await sql`
        INSERT INTO checklist_template_items (section_id, item_text, field_type, is_required, display_order)
        VALUES 
          (${subsection.id}, 'Test description', 'text', true, 1),
          (${subsection.id}, 'Test passed', 'checkbox', true, 2),
          (${subsection.id}, 'Results documented', 'checkbox', true, 3),
          (${subsection.id}, 'Tested by', 'text', true, 4),
          (${subsection.id}, 'Test date', 'date', true, 5),
          (${subsection.id}, 'Test results', 'textarea', true, 6)
      `;
    }
    
    // Add items for Section 8 subsections
    for (const subsection of subsections8) {
      await sql`
        INSERT INTO checklist_template_items (section_id, item_text, field_type, is_required, display_order)
        VALUES 
          (${subsection.id}, 'Security measure in place', 'checkbox', true, 1),
          (${subsection.id}, 'Policy documented', 'checkbox', true, 2),
          (${subsection.id}, 'Compliance verified', 'checkbox', true, 3),
          (${subsection.id}, 'Responsible party', 'text', true, 4),
          (${subsection.id}, 'Last review date', 'date', true, 5),
          (${subsection.id}, 'Notes', 'textarea', false, 6)
      `;
    }
    
    // Add items for Section 9 subsections
    for (const subsection of subsections9) {
      await sql`
        INSERT INTO checklist_template_items (section_id, item_text, field_type, is_required, display_order)
        VALUES 
          (${subsection.id}, 'Deliverable completed', 'checkbox', true, 1),
          (${subsection.id}, 'Document location', 'text', true, 2),
          (${subsection.id}, 'Quality reviewed', 'checkbox', true, 3),
          (${subsection.id}, 'Completed by', 'text', true, 4),
          (${subsection.id}, 'Completion date', 'date', true, 5),
          (${subsection.id}, 'Notes', 'textarea', false, 6)
      `;
    }
    
    // Add items for Section 10
    await sql`
      INSERT INTO checklist_template_items (section_id, item_text, field_type, is_required, display_order)
      VALUES 
        (${section10.id}, 'Technical Lead Name', 'text', true, 1),
        (${section10.id}, 'Technical Lead Approval', 'checkbox', true, 2),
        (${section10.id}, 'Technical Lead Signature Date', 'date', true, 3),
        (${section10.id}, 'Project Manager Name', 'text', true, 4),
        (${section10.id}, 'Project Manager Approval', 'checkbox', true, 5),
        (${section10.id}, 'Project Manager Signature Date', 'date', true, 6),
        (${section10.id}, 'Security Officer Name', 'text', true, 7),
        (${section10.id}, 'Security Officer Approval', 'checkbox', true, 8),
        (${section10.id}, 'Security Officer Signature Date', 'date', true, 9),
        (${section10.id}, 'Final Comments', 'textarea', false, 10)
    `;
    
    console.log('✓ Created checklist items\n');
    
    console.log('✅ Seed completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   - 1 template created');
    console.log('   - 10 main sections created');
    console.log('   - 51 subsections created');
    console.log('   - 300+ items created');
    
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  }
}

seedAccessVerificationTemplate();
