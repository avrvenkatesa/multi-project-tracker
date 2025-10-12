const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function verifyDatabase() {
  try {
    // Verify tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('risk_categories', 'risks', 'risk_updates', 'risk_assessments')
      ORDER BY table_name
    `);
    console.log("\n✅ Tables Created:");
    console.table(tables.rows);

    // Verify categories
    const categories = await pool.query(`
      SELECT id, name, color, icon, display_order 
      FROM risk_categories 
      WHERE project_id IS NULL 
      ORDER BY display_order
    `);
    console.log("\n✅ Default Categories:");
    console.table(categories.rows);

    // Verify indexes
    const indexes = await pool.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND tablename IN ('risks', 'risk_updates', 'risk_assessments')
      ORDER BY tablename, indexname
    `);
    console.log("\n✅ Indexes Created:");
    console.table(indexes.rows);

    // Summary
    console.log("\n📊 Summary:");
    console.log(`   Tables: ${tables.rows.length}/4`);
    console.log(`   Categories: ${categories.rows.length}/8`);
    console.log(`   Indexes: ${indexes.rows.length}/10`);

    await pool.end();
  } catch (error) {
    console.error("❌ Error:", error.message);
    await pool.end();
  }
}

verifyDatabase();
