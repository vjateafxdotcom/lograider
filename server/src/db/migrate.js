const fs = require('fs');
const path = require('path');
const pool = require('./connection');

async function migrate() {
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    // Split on semicolons but respect SQL strings
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await client.query(statement);
    }

    console.log('Schema migrated successfully');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

migrate();
