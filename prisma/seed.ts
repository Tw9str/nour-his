import { config } from 'dotenv';
import { database } from '../server/db';
import { hashPassword } from '../server/passwords';
import { password } from '../shared/validation';
config({ path: '.env.local', quiet: true });
config({ path: '.env.migrate', quiet: true });
const migrationUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
if (migrationUrl) process.env.DATABASE_URL = migrationUrl;
async function main() {
  const db = database();
  try {
    if (await db.user.count()) {
      console.log('قاعدة البيانات مهيأة؛ لم يتم تعديل الحسابات أو البيانات.');
      return;
    }
    const value = process.env.NOUR_ADMIN_PASSWORD;
    if (!value || !password.safeParse(value).success)
      throw new Error('اضبط NOUR_ADMIN_PASSWORD بكلمة مرور قوية من 12 محرفًا على الأقل');
    await db.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          username: 'admin',
          name: 'مسؤول المنشأة',
          role: 'admin',
          passwordHash: await hashPassword(value),
          mustChange: true,
        },
      });
      await tx.revision.upsert({ where: { id: 1 }, create: { id: 1, value: 1 }, update: {} });
      await tx.audit.create({
        data: { actorId: 'system', action: 'initialized', entity: 'facility' },
      });
    });
    console.log('تم إنشاء حساب المدير فقط. لا توجد بيانات مرضى تجريبية.');
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('فشل الإعداد الأولي. تحقق من الاتصال وكلمة مرور المدير.');
  process.exitCode = 1;
});
