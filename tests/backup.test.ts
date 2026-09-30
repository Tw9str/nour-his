import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { encryptBackup, decryptBackup } from '../server/backup/backupCrypto';
import { createDatabaseBackup } from '../server/backup/databaseBackup';
test('backup authentication rejects tampering and wrong keys without retaining plaintext', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nour-crypto-'));
  try {
    const key = randomBytes(32),
      archive = join(dir, 'backup.nourbak'),
      restored = join(dir, 'restore.dump');
    await encryptBackup(Readable.from(['synthetic backup payload']), archive, key);
    await decryptBackup(archive, restored, key);
    assert.equal(await readFile(restored, 'utf8'), 'synthetic backup payload');
    const failed = join(dir, 'invalid.dump');
    await assert.rejects(decryptBackup(archive, failed, randomBytes(32)));
    await assert.rejects(access(failed));
    const bytes = await readFile(archive);
    bytes[23] ^= 1;
    await writeFile(archive, bytes);
    await assert.rejects(decryptBackup(archive, failed, key));
    await assert.rejects(access(failed));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test(
  'missing PostgreSQL tools fail promptly and do not publish a backup',
  { timeout: 10000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nour-missing-tools-'));
    const original = process.env.NOUR_PG_BIN;
    process.env.NOUR_PG_BIN = join(dir, 'missing');
    try {
      await assert.rejects(
        createDatabaseBackup(
          'postgresql://unavailable@127.0.0.1:1/nour_test',
          dir,
          randomBytes(32),
        ),
      );
      await assert.rejects(access(join(dir, 'last-backup.json')));
    } finally {
      if (original === undefined) delete process.env.NOUR_PG_BIN;
      else process.env.NOUR_PG_BIN = original;
      await rm(dir, { recursive: true, force: true });
    }
  },
);
