import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, testPassword } from './fixture';
import { handle } from '../server/handler';
import { authenticated, signInTestUser } from '../server/auth';
import { testLoginEnabled } from '../server/testLogin';
import type { Role } from '../shared/types';

test('role logins, password setup and account management work without second-factor codes', async () => {
  const f = await fixture();
  const send = (action: string, input: unknown, token = '') =>
    handle(
      new Request('http://localhost:3000/api/app', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'Content-Type': 'application/json',
          'Idempotency-Key': `${Date.now()}_${randomUUID()}`,
          ...(token ? { cookie: `nour_session=${token}` } : {}),
        },
        body: JSON.stringify({ action, input }),
      }),
    );
  const snapshot = async (token: string) =>
    (
      await handle(
        new Request('http://localhost:3000/api/app', {
          headers: { cookie: `nour_session=${token}` },
        }),
      )
    ).json();
  const login = async (role: string, password = testPassword) => {
    const response = await send('login', { username: role, password, role });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie')!.match(/nour_session=([a-f0-9]+)/)![1];
  };
  try {
    const tokens: Record<string, string> = {};
    for (const role of ['admin', 'nurse', 'billing', 'inventory']) {
      tokens[role] = await login(role);
      const data = await snapshot(tokens[role]);
      assert.equal(data.actor.role, role);
      assert.ok(!data.setup);
    }
    const sessions = await f.db.session.count();
    const mismatch = await send('login', {
      username: 'nurse',
      password: testPassword,
      role: 'admin',
    });
    assert.equal(mismatch.status, 401);
    assert.equal(mismatch.headers.get('set-cookie'), null);
    assert.equal(await f.db.session.count(), sessions);
    assert.equal(
      (await send('login', { username: 'admin', password: 'wrong-password', role: 'admin' }))
        .status,
      401,
    );
    assert.equal(
      (await send('login', { username: 'admin', password: testPassword })).status,
      200,
    );
    assert.equal((await send('beginMfa', {}, tokens.admin)).status, 400);
    assert.equal((await send('confirmMfa', {}, tokens.admin)).status, 400);

    const disable = {
      userId: f.users.inventory,
      currentPassword: testPassword,
      reason: 'تعطيل حساب اختباري',
    };
    assert.equal(
      (
        await send(
          'disableUser',
          { ...disable, currentPassword: 'wrong-password' },
          tokens.admin,
        )
      ).status,
      403,
    );
    assert.equal((await send('disableUser', disable, tokens.admin)).status, 200);
    assert.equal((await snapshot(tokens.inventory)).actor, null);
    assert.equal(
      (
        await send('login', {
          username: 'inventory',
          password: testPassword,
          role: 'inventory',
        })
      ).status,
      401,
    );

    await f.db.user.update({ where: { id: f.users.nurse }, data: { mustChange: true } });
    assert.equal((await snapshot(tokens.nurse)).setup, true);
    const newPassword = 'Nour!Updated2026';
    for (const role of ['nurse', 'admin']) {
      assert.equal(
        (
          await send(
            'password',
            {
              currentPassword: testPassword,
              newPassword,
              confirmation: newPassword,
            },
            tokens[role],
          )
        ).status,
        200,
      );
      assert.equal((await snapshot(tokens[role])).actor, null);
      const data = await snapshot(await login(role, newPassword));
      assert.equal(data.actor.mustChange, false);
      assert.ok(!data.setup);
    }
  } finally {
    await f.close();
  }
});

test('test shortcuts create separate role accounts and reject disabled or production access', async () => {
  const f = await fixture();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFlag = process.env.NOUR_TEST_LOGIN;
  try {
    Object.assign(process.env, { NODE_ENV: 'development', NOUR_TEST_LOGIN: 'false' });
    assert.equal(testLoginEnabled(), false);
    await assert.rejects(signInTestUser('admin'), /الدخول التجريبي غير متاح/);
    process.env.NOUR_TEST_LOGIN = 'true';
    let adminToken = '';
    for (const role of ['admin', 'nurse', 'billing', 'inventory'] as Role[]) {
      const token = await signInTestUser(role);
      const user = await authenticated(token);
      assert.equal(user.role, role);
      assert.equal(user.username, `__test_${role}`);
      assert.equal(user.mustChange, false);
      assert.notEqual(user.id, f.users[role]);
      if (role === 'admin') adminToken = token;
    }
    assert.equal(await f.db.user.count(), 8);
    await signInTestUser('admin');
    assert.equal(await f.db.user.count(), 8);
    await f.db.user.update({ where: { username: '__test_nurse' }, data: { active: false } });
    await assert.rejects(signInTestUser('nurse'), /الحساب التجريبي غير متاح/);
    process.env.NOUR_TEST_LOGIN = 'false';
    await assert.rejects(authenticated(adminToken), /انتهت الجلسة/);
    Object.assign(process.env, { NODE_ENV: 'production', NOUR_TEST_LOGIN: 'true' });
    assert.equal(testLoginEnabled(), false);
    await assert.rejects(signInTestUser('admin'), /الدخول التجريبي غير متاح/);
    await assert.rejects(authenticated(adminToken), /انتهت الجلسة/);
  } finally {
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: originalNodeEnv });
    if (originalFlag === undefined) delete process.env.NOUR_TEST_LOGIN;
    else process.env.NOUR_TEST_LOGIN = originalFlag;
    await f.close();
  }
});
