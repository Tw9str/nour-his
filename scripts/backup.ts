import { config } from 'dotenv';
import { createDatabaseBackup } from '../server/backup/databaseBackup';
import { verifyDatabaseBackup } from '../server/backup/verifyBackup';
config({ path: '.env.backup', quiet: true });
config({ path: '.env.local', quiet: true });
async function main() {
  if (!process.env.DATABASE_URL || !process.env.NOUR_BACKUP_DIR) throw new Error();
  const mode = process.argv[2];
  if (mode === 'verify' || mode === 'restore') {
    if (!process.argv[3] || !process.env.NOUR_RESTORE_TEST_URL) throw new Error();
    const report = await verifyDatabaseBackup(
      process.argv[3],
      process.env.NOUR_RESTORE_TEST_URL,
      process.env.NOUR_BACKUP_DIR,
      undefined,
      mode === 'restore',
    );
    console.log(
      mode === 'restore'
        ? 'تمت الاستعادة إلى قاعدة مستقلة: ' +
            report.recoveredDatabase +
            '؛ لم تتغير قاعدة التشغيل.'
        : 'نجح اختبار الاستعادة في قاعدة معزولة. لم تتغير قاعدة التشغيل.',
    );
  } else if (!mode) {
    await createDatabaseBackup(process.env.DATABASE_URL, process.env.NOUR_BACKUP_DIR);
    console.log('تم إنشاء نسخة احتياطية مشفرة.');
  } else throw new Error();
}
main().catch(() => {
  console.error('فشلت عملية النسخ أو التحقق. راجع الاتصال والأدوات والمفتاح والمسار.');
  process.exitCode = 1;
});
