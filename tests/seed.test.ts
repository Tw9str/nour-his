import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fixture, testPassword } from './fixture';
import { verifyPassword } from '../server/passwords';

const run = promisify(execFile);

test('seed explains password failures, initializes atomically and preserves existing accounts', async () => {
  const f = await fixture();
  try {
    await f.db.user.deleteMany();
    const seed = async (adminPassword: string) => {
      const options = {
        timeout: 30000,
        env: {
          ...process.env,
          DATABASE_URL: f.url,
          MIGRATION_DATABASE_URL: f.url,
          DATABASE_URL_UNPOOLED: f.url,
          NOUR_ADMIN_PASSWORD: adminPassword,
        },
      };
      try {
        const result = await run(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], options);
        return { code: 0, output: result.stdout + result.stderr };
      } catch (error) {
        const failure = error as { code: number; stdout: string; stderr: string };
        return { code: failure.code, output: failure.stdout + failure.stderr };
      }
    };

    const missing = await seed('');
    assert.equal(missing.code, 1);
    assert.match(missing.output, /NOUR_ADMIN_PASSWORD is missing/);

    const invalid = await seed('password1234');
    assert.equal(invalid.code, 1);
    assert.match(invalid.output, /NOUR_ADMIN_PASSWORD is invalid/);
    assert.ok(!invalid.output.includes('password1234'));
    assert.equal(await f.db.user.count(), 0);

    const created = await seed(testPassword);
    assert.equal(created.code, 0, created.output);
    const admin = await f.db.user.findUniqueOrThrow({ where: { username: 'admin' } });
    assert.equal(admin.role, 'admin');
    assert.equal(admin.mustChange, true);
    assert.ok(await verifyPassword(testPassword, admin.passwordHash));
    assert.equal(await f.db.audit.count({ where: { action: 'initialized' } }), 1);
    assert.ok(!created.output.includes(testPassword));
    assert.ok(!created.output.includes(f.url));

    const repeated = await seed('');
    assert.equal(repeated.code, 0, repeated.output);
    assert.equal(await f.db.user.count(), 1);
    assert.deepEqual(await f.db.user.findUniqueOrThrow({ where: { id: admin.id } }), admin);
    assert.equal(await f.db.audit.count({ where: { action: 'initialized' } }), 1);
  } finally {
    await f.close();
  }
});
