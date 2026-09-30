import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, testPassword } from './fixture';
import { signIn } from '../server/auth';
import { handle } from '../server/handler';

test('manager manages facility hierarchy and staff with role checks and stale-edit protection', async () => {
  const f = await fixture();
  try {
    const admin = await signIn('admin', testPassword);
    const nurse = await signIn('nurse', testPassword);
    const send = (action: string, input: unknown, token = admin) =>
      handle(
        new Request('http://localhost:3000/api/app', {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
            'Idempotency-Key': `${Date.now()}_${randomUUID()}`,
            cookie: `nour_session=${token}`,
          },
          body: JSON.stringify({ action, input }),
        }),
      );
    const save = async (action: string, input: unknown) => {
      const response = await send(action, input);
      const data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      return data.entity as string;
    };
    const read = (token: string) =>
      handle(
        new Request('http://localhost:3000/api/app?tab=manage', {
          headers: { cookie: `nour_session=${token}` },
        }),
      );
    assert.equal((await read(nurse)).status, 403);
    assert.equal((await send('department', { name: 'قسم ممنوع' }, nurse)).status, 403);
    assert.equal(
      (await send('ward', { departmentName: 'قسم مفقود', name: 'جناح' })).status,
      400,
    );
    assert.equal(
      (await send('bed', { department: 'قسم مفقود', ward: 'جناح', name: '01' })).status,
      400,
    );
    const departmentId = await save('department', { name: 'قسم جديد' });
    const wardId = await save('ward', { departmentName: 'قسم جديد', name: 'جناح جديد' });
    const bedId = await save('bed', {
      department: 'قسم جديد',
      ward: 'جناح جديد',
      name: '301',
    });
    assert.equal((await send('department', { name: 'قسم جديد' })).status, 409);
    const stayId = await save('admit', { name: 'مريض إدارة', dob: '1990-01-01', bedId });
    const stay = await f.db.stay.findUniqueOrThrow({ where: { id: stayId } });
    const historical = await f.db.stay.create({
      data: {
        patientId: stay.patientId,
        status: 'closed',
        location: 'موقع تاريخي',
        dischargedAt: new Date(),
      },
    });
    await save('department', { id: departmentId, version: 1, name: 'قسم محدث' });
    assert.equal(
      (await f.db.ward.findUniqueOrThrow({ where: { id: wardId } })).departmentName,
      'قسم محدث',
    );
    assert.equal(
      (await f.db.bed.findUniqueOrThrow({ where: { id: bedId } })).department,
      'قسم محدث',
    );
    assert.equal(
      (await f.db.stay.findUniqueOrThrow({ where: { id: stayId } })).location,
      'قسم محدث · جناح جديد · 301',
    );
    assert.equal(
      (await f.db.stay.findUniqueOrThrow({ where: { id: historical.id } })).location,
      'موقع تاريخي',
    );
    assert.equal(
      (await send('department', { id: departmentId, version: 1, name: 'تعديل قديم' })).status,
      409,
    );
    await save('ward', {
      id: wardId,
      version: 2,
      departmentName: 'قسم محدث',
      name: 'جناح محدث',
    });
    await save('bed', {
      id: bedId,
      version: 3,
      department: 'قسم محدث',
      ward: 'جناح محدث',
      name: '302',
    });
    assert.equal(
      (await f.db.stay.findUniqueOrThrow({ where: { id: stayId } })).location,
      'قسم محدث · جناح محدث · 302',
    );
    assert.equal(
      (
        await send('bed', {
          id: bedId,
          version: 1,
          department: 'قسم محدث',
          ward: 'جناح محدث',
          name: '303',
        })
      ).status,
      409,
    );
    const data = await (await read(admin)).json();
    assert.equal(data.departments[0].name, 'قسم محدث');
    assert.equal(data.wards[0].name, 'جناح محدث');
    const change = {
      userId: f.users.nurse,
      version: 1,
      name: 'موظف محدث',
      email: 'staff@example.test',
      role: 'billing',
    };
    assert.equal((await send('updateUser', change, nurse)).status, 403);
    await save('updateUser', change);
    assert.equal(await f.db.session.count({ where: { userId: f.users.nurse } }), 0);
    const updated = await f.db.user.findUniqueOrThrow({ where: { id: f.users.nurse } });
    assert.equal(updated.role, 'billing');
    assert.equal(updated.email, 'staff@example.test');
    assert.equal((await send('updateUser', change)).status, 409);
    assert.equal((await send('updateUser', { ...change, userId: f.users.admin })).status, 400);
  } finally {
    await f.close();
  }
});
