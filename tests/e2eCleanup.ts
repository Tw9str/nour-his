import { readFile, unlink } from 'node:fs/promises';
import { Client } from 'pg';
import { config } from 'dotenv';
export default async function cleanup() {
  config({ path: '.env.migrate', quiet: true });
  let schema: string;
  try {
    schema = JSON.parse(await readFile('.local/e2eSchema.json', 'utf8')).schema;
  } catch {
    return;
  }
  if (!/^nour_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema');
  const db = new Client({
    connectionString: process.env.TEST_DATABASE_URL || process.env.MIGRATION_DATABASE_URL,
  });
  await db.connect();
  try {
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await unlink('.local/e2eSchema.json');
  } finally {
    await db.end();
  }
}
