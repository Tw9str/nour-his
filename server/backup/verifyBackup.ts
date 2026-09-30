import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { backupKey, decryptBackup } from './backupCrypto';
import { postgresConnection, postgresTool } from './postgresTools';

export async function verifyDatabaseBackup(
  filename: string,
  maintenanceConnection: string,
  directory: string,
  encryptionKey = backupKey(),
  preserveRecoveredDatabase = false,
) {
  const { url, schema } = postgresConnection(maintenanceConnection);
  const database = 'nour_restore_' + randomUUID().replaceAll('-', '');
  const maintenance = new Client({ connectionString: url.toString() });
  const base = resolve(directory);
  await mkdir(base, { recursive: true, mode: 0o700 });
  const temp = await mkdtemp(join(base, '.restore-'));
  const plaintext = join(temp, 'archive.dump');
  let created = false;
  let verified = false;
  try {
    await decryptBackup(filename, plaintext, encryptionKey);
    await maintenance.connect();
    // The target is always generated here. No existing database can be selected for restore.
    await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
    created = true;
    const target = new URL(url);
    target.pathname = '/' + database;
    // template0 supplies an empty public schema; pg_dump includes CREATE SCHEMA public.
    // Remove only that empty schema in this newly generated test database before restore.
    const emptyTarget = new Client({ connectionString: target.toString() });
    await emptyTarget.connect();
    try {
      await emptyTarget.query('DROP SCHEMA public');
    } finally {
      await emptyTarget.end();
    }
    const { child, completion } = postgresTool('pg_restore', target, [
      '--exit-on-error',
      '--single-transaction',
      '--no-owner',
      '--no-acl',
      '--dbname=' + database,
      plaintext,
    ]);
    child.stdout.resume();
    await completion;
    const restored = new Client({ connectionString: target.toString() });
    await restored.connect();
    try {
      const counts: Record<string, number> = {};
      for (const table of [
        'Revision',
        'User',
        'Patient',
        'Stay',
        'Audit',
        'Bed',
        'Service',
        'Item',
        'Charge',
        'Payment',
        'Expense',
        'StockMovement',
      ]) {
        const result = await restored.query(
          `SELECT count(*)::int AS count FROM "${schema}"."${table}"`,
        );
        counts[table] = result.rows[0].count;
      }
      if (counts.Revision !== 1 || counts.User < 1)
        throw new Error('Restored workspace validation failed.');
      const report = {
        at: new Date().toISOString(),
        archive: resolve(filename),
        counts,
        restoredSuccessfully: true,
        recoveredDatabase: preserveRecoveredDatabase ? database : undefined,
      };
      await writeFile(join(base, 'last-restore-test.json'), JSON.stringify(report), {
        mode: 0o600,
      });
      verified = true;
      return report;
    } finally {
      await restored.end();
    }
  } finally {
    try {
      if (
        created &&
        !(verified && preserveRecoveredDatabase) &&
        /^nour_restore_[a-f0-9]{32}$/.test(database)
      )
        await maintenance.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    } finally {
      await maintenance.end();
      await rm(plaintext, { force: true });
      await rmdir(temp);
    }
  }
}
