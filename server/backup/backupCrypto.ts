import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, open, rm, stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const magic = Buffer.from('NOURBAK1');
export function backupKey(value = process.env.NOUR_BACKUP_KEY) {
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new Error('Set NOUR_BACKUP_KEY to a separate 32-byte hexadecimal encryption key.');
  return Buffer.from(value, 'hex');
}

export async function encryptBackup(source: Readable, destination: string, key: Buffer) {
  const iv = randomBytes(12),
    header = Buffer.concat([magic, iv]);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(header);
  const output = await open(destination, 'wx', 0o600);
  try {
    await output.write(header);
    await pipeline(source, cipher, output.createWriteStream());
    await appendFile(destination, cipher.getAuthTag());
  } catch (error) {
    await output.close();
    await rm(destination, { force: true });
    throw error;
  }
}

// Authentication completes before the plaintext can be passed to pg_restore.
export async function decryptBackup(source: string, destination: string, key: Buffer) {
  const size = (await stat(source)).size;
  if (size < 37) throw new Error('Invalid backup archive.');
  const file = await open(source, 'r');
  const header = Buffer.alloc(20),
    tag = Buffer.alloc(16);
  try {
    await file.read(header, 0, 20, 0);
    await file.read(tag, 0, 16, size - 16);
  } finally {
    await file.close();
  }
  if (!header.subarray(0, 8).equals(magic)) throw new Error('Unsupported backup format.');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(8));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const output = await open(destination, 'wx', 0o600);
  try {
    await pipeline(
      createReadStream(source, { start: 20, end: size - 17 }),
      decipher,
      output.createWriteStream(),
    );
  } catch (error) {
    await output.close();
    await rm(destination, { force: true });
    throw error;
  }
}
