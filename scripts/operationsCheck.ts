import { config } from 'dotenv';
import { readFile, stat, statfs } from 'node:fs/promises';
import { resolve, basename, join } from 'node:path';
import { database } from '../server/db';
config({ path: '.env.local', quiet: true });
async function main() {
  const failures: string[] = [];
  const db = database();
  try {
    const roles = await db.$queryRaw<
      { danger: boolean }[]
    >`SELECT (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls) AS danger FROM pg_roles WHERE rolname=current_user`;
    if (roles[0]?.danger) failures.push('database-role-overprivileged');
  } catch {
    failures.push('database-unavailable');
  } finally {
    await db.$disconnect();
  }
  try {
    const u = new URL(process.env.NOUR_ORIGIN || '');
    if (u.protocol !== 'https:' || u.origin !== process.env.NOUR_ORIGIN) throw new Error();
  } catch {
    failures.push('https-origin-required');
  }
  if (process.env.NOUR_TRUST_PROXY !== 'true') failures.push('trusted-proxy-required');
  if (!/^[a-f0-9]{64}$/i.test(process.env.NOUR_BACKUP_KEY || ''))
    failures.push('NOUR_BACKUP_KEY-invalid');
  const dir = resolve(process.env.NOUR_BACKUP_DIR || 'backups');
  try {
    const disk = await statfs(dir);
    if (Number(disk.bavail) * Number(disk.bsize) < 5 * 1024 ** 3) failures.push('backup-disk-low');
    const marker = JSON.parse(await readFile(join(dir, 'last-backup.json'), 'utf8'));
    const age = Date.now() - Date.parse(marker.at);
    if (!Number.isFinite(age) || age < 0 || age > 26 * 3600000) throw new Error();
    if (
      marker.filename !== basename(marker.filename) ||
      (await stat(join(dir, marker.filename))).size < 37
    )
      throw new Error();
  } catch {
    failures.push('backup-missing-or-stale');
  }
  try {
    const report = JSON.parse(await readFile(join(dir, 'last-restore-test.json'), 'utf8'));
    const age = Date.now() - Date.parse(report.at);
    if (
      report.restoredSuccessfully !== true ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > 8 * 86400000
    )
      throw new Error();
  } catch {
    failures.push('restore-test-missing-or-stale');
  }
  console.log(JSON.stringify({ healthy: failures.length === 0, failures }));
  process.exitCode = failures.length ? 1 : 0;
}
main().catch(() => {
  console.error('تعذر فحص الجاهزية');
  process.exitCode = 1;
});
