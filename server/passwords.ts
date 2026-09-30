import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(value: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(value.normalize('NFC'), salt, 64, options, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}
export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString('hex');
  return `s1:${salt}:${(await derive(value, salt)).toString('hex')}`;
}
export async function verifyPassword(value: string, hash: string) {
  const [version, salt, key] = hash.split(':');
  if (version !== 's1' || !salt || !key) return false;
  const actual = await derive(value, salt);
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const dummyHash = 's1:' + '0'.repeat(32) + ':' + '0'.repeat(128);
