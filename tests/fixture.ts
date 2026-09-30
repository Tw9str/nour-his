import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { config } from 'dotenv';
import { database, disconnect } from '../server/db';
import { hashPassword } from '../server/passwords';
import { testPassword } from './constants';
export { testPassword } from './constants';
export async function fixture() {
  config({ path: '.env.migrate', quiet: true });
  const base = process.env.TEST_DATABASE_URL || process.env.MIGRATION_DATABASE_URL;
  if (!base) throw new Error('Test migration connection required');
  const schema = 'nour_test_' + randomUUID().replaceAll('-', '');
  const admin = new Client({ connectionString: base });
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}"`);
  try {
    const dirs = await readdir('prisma/migrations', { withFileTypes: true });
    for (const dir of dirs
      .filter((d) => d.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const sql = await readFile(`prisma/migrations/${dir.name}/migration.sql`, 'utf8');
      await admin.query(sql.replaceAll('"public"', `"${schema}"`));
    }
    await disconnect();
    const url = new URL(base);
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.NOUR_TRUST_PROXY = 'false';
    process.env.NOUR_ORIGIN = 'http://localhost:3000';
    const db = database();
    const passwordHash = await hashPassword(testPassword);
    const users: Record<string, string> = {};
    for (const role of ['admin', 'nurse', 'billing', 'inventory']) {
      const id = randomUUID();
      users[role] = id;
      await db.user.create({
        data: {
          id,
          username: role,
          name:
            role === 'admin'
              ? 'مدير الاختبار'
              : role === 'nurse'
                ? 'مسعف'
                : role === 'billing'
                  ? 'محاسب'
                  : 'أمين مستودع',
          role,
          passwordHash,
          mustChange: false,
        },
      });
    }
    await db.revision.create({ data: { id: 1, value: 0 } });
    return {
      db,
      users,
      url: url.toString(),
      close: async () => {
        await disconnect();
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
      },
    };
  } catch (e) {
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    throw e;
  }
}
