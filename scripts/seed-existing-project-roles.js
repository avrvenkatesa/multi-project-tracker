const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Seed default software roles for all existing projects
 * This script runs the seed_default_software_roles() function for projects that don't have roles yet
 */
async function seedExistingProjectRoles() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Finding projects without custom roles...');
    
    const projectsResult = await client.query(`
      SELECT p.id, p.name, p.customer_id
      FROM projects p
      LEFT JOIN custom_roles r ON r.project_id = p.id
      WHERE r.id IS NULL
      GROUP BY p.id, p.name, p.customer_id
      ORDER BY p.id ASC
    `);

    const projects = projectsResult.rows;
    
    if (projects.length === 0) {
      console.log('✅ All projects already have custom roles seeded!');
      return;
    }

    console.log(`📋 Found ${projects.length} project(s) without roles:`);
    projects.forEach(p => console.log(`   - ${p.name} (ID: ${p.id})`));
    console.log('');

    let seededCount = 0;
    let errorCount = 0;

    for (const project of projects) {
      try {
        console.log(`⚙️  Seeding roles for project: ${project.name} (ID: ${project.id})`);
        
        await client.query('SELECT seed_default_software_roles($1)', [project.id]);
        
        const rolesResult = await client.query(`
          SELECT COUNT(*) as count FROM custom_roles WHERE project_id = $1
        `, [project.id]);
        const rolesCount = parseInt(rolesResult.rows[0].count);
        
        await client.query(`
          INSERT INTO sidecar_config (project_id, customer_id, enabled)
          VALUES ($1, $2, false)
          ON CONFLICT (project_id) DO NOTHING
        `, [project.id, project.customer_id]);
        
        console.log(`   ✅ Created ${rolesCount} roles and sidecar config for ${project.name}`);
        seededCount++;
      } catch (error) {
        console.error(`   ❌ Error seeding project ${project.name}:`, error.message);
        errorCount++;
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('📊 Seeding Summary:');
    console.log(`   ✅ Successfully seeded: ${seededCount} project(s)`);
    if (errorCount > 0) {
      console.log(`   ❌ Failed: ${errorCount} project(s)`);
    }
    console.log('═══════════════════════════════════════════════');
    
    if (seededCount > 0) {
      const totalRolesResult = await client.query(`
        SELECT COUNT(*) as count FROM custom_roles
      `);
      console.log(`\n🎉 Total custom roles in system: ${totalRolesResult.rows[0].count}`);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seedExistingProjectRoles()
    .then(() => {
      console.log('\n✅ Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { seedExistingProjectRoles };
