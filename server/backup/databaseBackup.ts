import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { encryptBackup, backupKey } from './backupCrypto';
import { postgresConnection, postgresTool } from './postgresTools';

export async function createDatabaseBackup(
  connection: string,
  directory: string,
  encryptionKey = backupKey(),
) {
  const { url, schema } = postgresConnection(connection);
  const destination = resolve(directory);
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const name = `nour-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.nourbak`;
  const filename = join(destination, name),
    partial = filename + '.partial';
  const { child, completion } = postgresTool('pg_dump', url, [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--strict-names',
    '--schema=' + schema,
  ]);
  try {
    const results = await Promise.allSettled([
      completion,
      encryptBackup(child.stdout, partial, encryptionKey),
    ]);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    await rename(partial, filename);
    const status = join(destination, '.last-backup-' + randomUUID());
    await writeFile(
      status,
      JSON.stringify({ at: new Date().toISOString(), filename: name, schema, verified: false }),
      { mode: 0o600 },
    );
    await rename(status, join(destination, 'last-backup.json'));
    return filename;
  } catch (error) {
    child.kill();
    await completion.catch(() => undefined);
    await rm(partial, { force: true });
    throw error;
  }
}
