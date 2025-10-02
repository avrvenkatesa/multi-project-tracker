const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
require('dotenv').config();

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seedProjectMembers() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting project_members migration...\n');
    
    await client.query('BEGIN');
    
    // Get all projects and users
    const projectsResult = await client.query('SELECT id, name, created_by FROM projects ORDER BY id');
    const usersResult = await client.query('SELECT id, username, email, role FROM users ORDER BY id');
    
    const projects = projectsResult.rows;
    const users = usersResult.rows;
    
    console.log(`Found ${projects.length} projects and ${users.length} users\n`);
    
    // Create username to user ID mapping
    const usernameToId = {};
    const userIdMap = {};
    users.forEach(user => {
      usernameToId[user.username.toLowerCase()] = user.id;
      userIdMap[user.id] = user;
    });
    
    let totalMembers = 0;
    
    for (const project of projects) {
      console.log(`📁 Processing: ${project.name} (ID: ${project.id})`);
      
      const members = new Set();
      
      // Step 1: Add project creator as Manager
      if (project.created_by) {
        let creatorId = null;
        
        // Handle both ID and username formats
        if (!isNaN(project.created_by)) {
          creatorId = parseInt(project.created_by);
        } else {
          creatorId = usernameToId[project.created_by.toLowerCase()];
        }
        
        if (creatorId && userIdMap[creatorId]) {
          await client.query(`
            INSERT INTO project_members (project_id, user_id, role, status)
            VALUES ($1, $2, 'Manager', 'active')
            ON CONFLICT (project_id, user_id) DO NOTHING
          `, [project.id, creatorId]);
          
          members.add(creatorId);
          console.log(`  ✅ Added creator: ${userIdMap[creatorId].username} as Manager`);
          totalMembers++;
        }
      }
      
      // Step 2: Add all System Administrators as Admin
      for (const user of users) {
        if (user.role === 'System Administrator' && !members.has(user.id)) {
          await client.query(`
            INSERT INTO project_members (project_id, user_id, role, status)
            VALUES ($1, $2, 'Admin', 'active')
            ON CONFLICT (project_id, user_id) DO NOTHING
          `, [project.id, user.id]);
          
          members.add(user.id);
          console.log(`  ✅ Added System Admin: ${user.username} as Admin`);
          totalMembers++;
        }
      }
      
      // Step 3: Add all Project Managers as Member (can be upgraded via UI later)
      for (const user of users) {
        if (user.role === 'Project Manager' && !members.has(user.id)) {
          await client.query(`
            INSERT INTO project_members (project_id, user_id, role, status)
            VALUES ($1, $2, 'Member', 'active')
            ON CONFLICT (project_id, user_id) DO NOTHING
          `, [project.id, user.id]);
          
          members.add(user.id);
          console.log(`  ✅ Added Project Manager: ${user.username} as Member`);
          totalMembers++;
        }
      }
      
      console.log(`  📊 Total members for this project: ${members.size}\n`);
    }
    
    await client.query('COMMIT');
    
    console.log(`✅ Migration completed successfully!`);
    console.log(`📊 Total project memberships created: ${totalMembers}`);
    
    // Verify results
    const verifyResult = await client.query(`
      SELECT 
        p.name as project_name,
        u.username,
        pm.role,
        pm.status
      FROM project_members pm
      JOIN projects p ON pm.project_id = p.id
      JOIN users u ON pm.user_id = u.id
      ORDER BY p.id, pm.role DESC, u.username
    `);
    
    console.log('\n📋 Current project memberships:');
    console.log('=====================================');
    let currentProject = '';
    for (const row of verifyResult.rows) {
      if (currentProject !== row.project_name) {
        currentProject = row.project_name;
        console.log(`\n${currentProject}:`);
      }
      console.log(`  - ${row.username} (${row.role})`);
    }
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
seedProjectMembers()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });
