import { Client } from 'pg';
import { config } from 'dotenv';
config({ path: '.env.migrate', quiet: true });
async function main() {
  const db = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await db.connect();
  try {
    await db.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await db.query('GRANT USAGE ON SCHEMA public TO nour_app');
    await db.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nour_app',
    );
    await db.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nour_app');
    await db.query('REVOKE UPDATE, DELETE ON "Audit", "Payment", "StockMovement" FROM nour_app');
    await db.query('REVOKE ALL ON "_prisma_migrations" FROM nour_app');
    console.log('تم تطبيق صلاحيات التشغيل وحماية السجلات المالية والتدقيق من التعديل والحذف.');
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error('فشل تطبيق الصلاحيات');
  process.exitCode = 1;
});
