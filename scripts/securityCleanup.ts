import { config } from 'dotenv';
import { database } from '../server/db';
config({ path: '.env.local', quiet: true });
async function main() {
  const db = database();
  try {
    await db.$transaction([
      db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      db.rateBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      db.receipt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 2 * 86400000) } } }),
    ]);
    console.log('تم تنظيف بيانات الحماية المنتهية دون حذف سجلات المرضى أو التدقيق.');
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error('فشل التنظيف');
  process.exitCode = 1;
});
