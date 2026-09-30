import { config } from 'dotenv';
import { database } from '../server/db';
import { hashPassword } from '../server/passwords';
import { password } from '../shared/validation';
config({ path: '.env.local', quiet: true });
config({ path: '.env.migrate', quiet: true });
if (process.env.MIGRATION_DATABASE_URL)
  process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
async function main() {
  const [username, reason] = process.argv.slice(2),
    value = process.env.NOUR_RECOVERY_PASSWORD;
  const db = database();
  try {
    if (!username || !reason || reason.length < 10 || !value || !password.safeParse(value).success)
      throw new Error();
    const u = await db.user.findUniqueOrThrow({ where: { username } });
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: u.id },
        data: {
          passwordHash: await hashPassword(value),
          mustChange: true,
        },
      });
      await tx.session.deleteMany({ where: { userId: u.id } });
      await tx.audit.create({
        data: {
          actorId: 'local-operator',
          action: 'accountRecovery',
          entity: u.id,
          detail: reason,
        },
      });
    });
    console.log(
      'تم إلغاء الجلسات وإلزام تغيير كلمة المرور. حالة تعطيل الحساب لم تتغير.',
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'فشلت الاستعادة. يلزم اسم المستخدم وسبب موثق وكلمة مرور في NOUR_RECOVERY_PASSWORD.',
  );
  process.exitCode = 1;
});
