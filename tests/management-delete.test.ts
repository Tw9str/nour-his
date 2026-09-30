import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, testPassword } from './fixture';
import { signIn, signInTestUser } from '../server/auth';
import { handle } from '../server/handler';

test('management deletes enforce permissions, dependencies and versions while preserving history', async () => {
  const f = await fixture();
  const environment = { node: process.env.NODE_ENV, testLogin: process.env.NOUR_TEST_LOGIN };
  try {
    const admin = await signIn('admin', testPassword);
    const nurse = await signIn('nurse', testPassword);
    await signIn('billing', testPassword);
    const send = (
      action: string,
      input: unknown,
      token = admin,
      key = `${Date.now()}_${randomUUID()}`,
    ) =>
      handle(
        new Request('http://localhost:3000/api/app', {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
            'Idempotency-Key': key,
            cookie: `nour_session=${token}`,
          },
          body: JSON.stringify({ action, input }),
        }),
      );
    const department = await f.db.department.create({
      data: { name: 'قسم الحذف', wards: { create: { name: 'جناح الحذف' } } },
    });
    const ward = await f.db.ward.findFirstOrThrow({
      where: { departmentName: department.name },
    });
    const bed = await f.db.bed.create({
      data: { name: '01', department: department.name, ward: ward.name },
    });
    const service = await f.db.service.create({ data: { name: 'خدمة الحذف', price: 100n } });
    const inputs = {
      deleteDepartment: { id: department.id, version: 1 },
      deleteWard: { id: ward.id, version: 1 },
      deleteBed: { id: bed.id, version: 1 },
      deleteService: { id: service.id, version: 1 },
      deleteUser: { id: f.users.billing, version: 1, currentPassword: testPassword },
    };
    for (const [action, input] of Object.entries(inputs))
      assert.equal((await send(action, input, nurse)).status, 403);
    assert.equal((await send('deleteDepartment', inputs.deleteDepartment)).status, 409);
    assert.equal((await send('deleteWard', inputs.deleteWard)).status, 409);
    assert.equal((await send('deleteBed', { ...inputs.deleteBed, version: 99 })).status, 409);
    const patient = await f.db.patient.create({
      data: { name: 'مريض محفوظ', phone: '', dob: '1990-01-01', sex: '' },
    });
    const stay = await f.db.stay.create({
      data: {
        patientId: patient.id,
        activeBedId: bed.id,
        location: 'قسم الحذف · جناح الحذف · 01',
      },
    });
    const charge = await f.db.charge.create({
      data: { stayId: stay.id, label: service.name, quantity: 1, unitPrice: service.price },
    });
    const payment = await f.db.payment.create({
      data: {
        stayId: stay.id,
        amount: 100n,
        method: 'cash',
        actorId: f.users.billing,
        actorName: 'محاسب سابق',
      },
    });
    assert.equal((await send('deleteBed', inputs.deleteBed)).status, 409);
    assert.equal(
      (await f.db.stay.findUniqueOrThrow({ where: { id: stay.id } })).activeBedId,
      bed.id,
    );
    const retryKey = `${Date.now()}_${randomUUID()}`;
    assert.equal(
      (await send('deleteService', inputs.deleteService, admin, retryKey)).status,
      200,
    );
    assert.equal(
      (await send('deleteService', inputs.deleteService, admin, retryKey)).status,
      200,
    );
    assert.equal(await f.db.service.findUnique({ where: { id: service.id } }), null);
    assert.equal(
      (await f.db.charge.findUniqueOrThrow({ where: { id: charge.id } })).unitPrice,
      100n,
    );
    assert.equal(
      (
        await send('addCharge', {
          stayId: stay.id,
          version: 1,
          kind: 'service',
          sourceId: service.id,
          quantity: 1,
        })
      ).status,
      409,
    );
    await f.db.stay.update({
      where: { id: stay.id },
      data: { activeBedId: null, status: 'closed', dischargedAt: new Date() },
    });
    for (const action of ['deleteBed', 'deleteWard', 'deleteDepartment'] as const)
      assert.equal((await send(action, inputs[action])).status, 200);
    assert.equal(await f.db.bed.count(), 0);
    assert.equal(await f.db.ward.count(), 0);
    assert.equal(await f.db.department.count(), 0);
    assert.equal(
      (await f.db.stay.findUniqueOrThrow({ where: { id: stay.id } })).location,
      stay.location,
    );
    assert.equal(
      (await send('deleteUser', { ...inputs.deleteUser, currentPassword: '' })).status,
      403,
    );
    assert.equal(
      (await send('deleteUser', { ...inputs.deleteUser, currentPassword: 'wrong' })).status,
      403,
    );
    assert.equal(
      (await send('deleteUser', { ...inputs.deleteUser, version: 99 })).status,
      409,
    );
    assert.equal(
      (await send('deleteUser', { ...inputs.deleteUser, id: f.users.admin })).status,
      409,
    );
    assert.equal((await send('deleteUser', inputs.deleteUser)).status, 200);
    assert.equal(await f.db.user.findUnique({ where: { id: f.users.billing } }), null);
    assert.equal(await f.db.session.count({ where: { userId: f.users.billing } }), 0);
    assert.equal(
      (await f.db.payment.findUniqueOrThrow({ where: { id: payment.id } })).actorName,
      'محاسب سابق',
    );
    assert.ok(await f.db.audit.count({ where: { actorId: f.users.billing } }));
    assert.equal(
      await f.db.audit.count({
        where: { action: 'deleteService', entity: service.id, detail: service.name },
      }),
      1,
    );
    Object.assign(process.env, { NODE_ENV: 'development', NOUR_TEST_LOGIN: 'true' });
    const testAdmin = await signInTestUser('admin');
    assert.equal(
      (await send('deleteUser', { id: f.users.admin, version: 1 }, testAdmin)).status,
      409,
    );
    assert.ok(await f.db.user.findUnique({ where: { id: f.users.admin } }));
  } finally {
    if (environment.node === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: environment.node });
    if (environment.testLogin === undefined) delete process.env.NOUR_TEST_LOGIN;
    else process.env.NOUR_TEST_LOGIN = environment.testLogin;
    await f.close();
  }
});
