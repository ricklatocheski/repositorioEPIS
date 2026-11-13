import { readFile } from "node:fs/promises";
import { getDatabase } from "@netlify/database";
if (!process.env.DATABASE_URL)
  throw Error(
    "Defina DATABASE_URL para migração manual. No Netlify Database, use as migrações automáticas.",
  );
const db = getDatabase({ connectionString: process.env.DATABASE_URL });
const sql = await readFile(
  "netlify/database/migrations/0001_create_epi_database.sql",
  "utf8",
);
const client = await db.pool.connect();
try {
  await client.query("BEGIN");
  await client.query(
    "CREATE TABLE IF NOT EXISTS epi_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  await client.query("SELECT pg_advisory_xact_lock(8743101)");
  const exists = await client.query(
    "SELECT name FROM epi_migrations WHERE name=$1",
    ["0001"],
  );
  if (!exists.rows.length) {
    await client.query(sql);
    await client.query("INSERT INTO epi_migrations(name) VALUES($1)", ["0001"]);
  }
  await client.query("COMMIT");
  console.log("Migrações aplicadas.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await db.pool.end();
}
