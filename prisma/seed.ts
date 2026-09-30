import { config } from 'dotenv';
import { database } from '../server/db';
import { hashPassword } from '../server/passwords';
import { password } from '../shared/validation';
config({ path: '.env.local', quiet: true });
config({ path: '.env.migrate', quiet: true });
const migrationUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
if (migrationUrl) process.env.DATABASE_URL = migrationUrl;
class SeedConfigurationError extends Error {}
let stage = 'configure database connection';
async function main() {
  if (!process.env.DATABASE_URL)
    throw new SeedConfigurationError(
      'Set DATABASE_URL and DATABASE_URL_UNPOOLED in the Vercel environment being deployed.',
    );
  const db = database();
  try {
    stage = 'check existing accounts';
    if (await db.user.count()) {
      console.log('قاعدة البيانات مهيأة؛ لم يتم تعديل الحسابات أو البيانات.');
      return;
    }
    const value = process.env.NOUR_ADMIN_PASSWORD;
    if (!value)
      throw new SeedConfigurationError(
        'NOUR_ADMIN_PASSWORD is missing. Add it to the Vercel environment being deployed, then redeploy.',
      );
    if (!password.safeParse(value).success)
      throw new SeedConfigurationError(
        'NOUR_ADMIN_PASSWORD is invalid. Use 12–200 characters; common passwords and repeated short patterns are rejected.',
      );
    stage = 'hash admin password';
    const passwordHash = await hashPassword(value);
    stage = 'create admin account';
    await db.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          username: 'admin',
          name: 'مسؤول المنشأة',
          role: 'admin',
          passwordHash,
          mustChange: true,
        },
      });
      await tx.revision.upsert({ where: { id: 1 }, create: { id: 1, value: 1 }, update: {} });
      await tx.audit.create({
        data: { actorId: 'system', action: 'initialized', entity: 'facility' },
      });
    }, { maxWait: 15000, timeout: 15000 });
    console.log('تم إنشاء حساب المدير فقط. لا توجد بيانات مرضى تجريبية.');
  } finally {
    await db.$disconnect();
  }
}
main().catch((error: unknown) => {
  if (error instanceof SeedConfigurationError) {
    console.error(`[seed] ${error.message}`);
  } else {
    // Never log raw driver errors: they can include connection details or query values.
    const code = (error as { code?: unknown } | null)?.code;
    const safeCode = typeof code === 'string' && /^[A-Z0-9_]{2,64}$/.test(code) ? code : 'UNKNOWN';
    console.error(`[seed] Failed to ${stage} (code: ${safeCode}).`);
    console.error(
      '[seed] Check the direct Neon URL, database permissions and applied migrations. No credentials have been logged.',
    );
  }
  process.exitCode = 1;
});
