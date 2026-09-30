import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { config } from 'dotenv';
config({ path: '.env.setup', quiet: true });
async function main() {
  if (existsSync('.env.local') || existsSync('.env.migrate'))
    throw new Error('Configuration already exists; refusing to overwrite.');
  const url = process.env.NOUR_SETUP_DATABASE_URL;
  if (!url)
    throw new Error(
      'Set NOUR_SETUP_DATABASE_URL to a local PostgreSQL administrative connection for one-time provisioning.',
    );
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
    throw new Error('Local provisioning accepts only localhost.');
  const db = new Client({ connectionString: url });
  await db.connect();
  const ownerPassword = randomBytes(32).toString('hex'),
    runtimePassword = randomBytes(32).toString('hex'),
    adminPassword = randomBytes(18).toString('base64url');
  try {
    const existing = await db.query("SELECT 1 FROM pg_database WHERE datname='nour_hospital'");
    if (existing.rowCount) throw new Error('nour_hospital already exists; no data was changed.');
    await db.query(
      `CREATE ROLE nour_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${ownerPassword}'`,
    );
    await db.query(
      `CREATE ROLE nour_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${runtimePassword}'`,
    );
    await db.query('CREATE DATABASE nour_hospital OWNER nour_owner');
    const connection = (user: string, pw: string) => {
      const u = new URL(url);
      u.username = user;
      u.password = pw;
      u.pathname = '/nour_hospital';
      u.search = '';
      return u.toString();
    };
    writeFileSync(
      '.env.local',
      `DATABASE_URL=${connection('nour_app', runtimePassword)}\nNOUR_ORIGIN=http://localhost:3000\nNOUR_TRUST_PROXY=false\nNOUR_BACKUP_KEY=${randomBytes(32).toString('hex')}\nNOUR_BACKUP_DIR=./backups\n`,
      { mode: 0o600, flag: 'wx' },
    );
    writeFileSync(
      '.env.migrate',
      `MIGRATION_DATABASE_URL=${connection('nour_owner', ownerPassword)}\nNOUR_ADMIN_PASSWORD=${adminPassword}\n`,
      { mode: 0o600, flag: 'wx' },
    );
    mkdirSync('.local', { recursive: true, mode: 0o700 });
    writeFileSync(
      '.local/firstLogin.txt',
      `اسم المستخدم: admin\nكلمة المرور المؤقتة: ${adminPassword}\nغيّر كلمة المرور عند أول دخول.\nاحذف هذه الورقة بعد الإعداد.\n`,
      { mode: 0o600, flag: 'wx' },
    );
    console.log(
      'تم تجهيز قاعدة مستقلة وحساب تشغيل محدود. بيانات الدخول الأولية في .local/firstLogin.txt.',
    );
  } finally {
    await db.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
