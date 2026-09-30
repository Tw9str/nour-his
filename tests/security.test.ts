import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { handle } from '../server/handler';
import { fixture, testPassword } from './fixture';
import { schemas, minor } from '../shared/validation';
import { operate } from '../server/operations';
import { actor } from '../server/auth';
import { AppError } from '../server/db';
const key = () => `${Date.now()}_${randomUUID()}`;
test('admission reserves a bed with phone and sex omitted and rejects an occupied bed', async () => {
  const f = await fixture();
  try {
    const nurse = actor(await f.db.user.findUniqueOrThrow({ where: { id: f.users.nurse } }));
    await f.db.department.create({
      data: { name: 'الداخلية', wards: { create: { name: 'أ' } } },
    });
    const bed = await f.db.bed.create({
      data: { department: 'الداخلية', ward: 'أ', name: '01' },
    });
    const input = schemas.admit.parse({
      name: 'مريض اختبار',
      dob: '2000-01-01',
      bedId: bed.id,
    });
    const result = await f.db.$transaction((tx) => operate(tx, nurse, 'admit', input));
    const stay = await f.db.stay.findUniqueOrThrow({
      where: { id: String(result.entity) },
      include: { patient: true },
    });
    assert.equal(stay.activeBedId, bed.id);
    assert.equal(stay.patient.phone, '');
    assert.equal(stay.patient.sex, '');
    assert.equal(stay.location, 'الداخلية · أ · 01');
    await assert.rejects(
      f.db.$transaction((tx) => operate(tx, nurse, 'admit', { ...input, name: 'مريض آخر' })),
      /هذا السرير لم يعد متاحًا/,
    );
    assert.equal(await f.db.stay.count(), 1);
    await f.db.stay.update({
      where: { id: stay.id },
      data: { status: 'closed', activeBedId: null, dischargedAt: new Date() },
    });
    await assert.rejects(
      f.db.$transaction((tx) => operate(tx, nurse, 'admit', input)),
      (error: unknown) => error instanceof AppError && error.code === 'READMISSION_REQUIRED',
    );
    assert.equal(await f.db.stay.count(), 1);
    const readmission = await f.db.$transaction((tx) =>
      operate(tx, nurse, 'admit', {
        ...input,
        duplicateReason: 'عودة المريض لاستكمال العلاج',
      }),
    );
    assert.equal(await f.db.patient.count(), 1);
    assert.equal(await f.db.stay.count(), 2);
    assert.equal(
      await f.db.audit.count({
        where: {
          entity: String(readmission.entity),
          action: 'readmissionReason',
          detail: 'عودة المريض لاستكمال العلاج',
        },
      }),
      1,
    );
  } finally {
    await f.close();
  }
});
test('Arabic schemas reject malformed money, unknown fields, unsafe email and short passwords', () => {
  assert.equal(minor('12.50'), 1250n);
  assert.equal(
    schemas.user.safeParse({
      username: 'staff',
      name: 'موظف جديد',
      email: 'bad-email',
      role: 'billing',
      password: testPassword,
    }).success,
    false,
  );
  assert.equal(
    schemas.login.safeParse({ username: 'staff', password: 'x', admin: true }).success,
    false,
  );
  assert.equal(
    schemas.checkout.safeParse({
      stayId: randomUUID(),
      version: 1,
      amount: '1e8',
      method: 'cash',
      discharge: true,
    }).success,
    false,
  );
  assert.equal(
    schemas.password.safeParse({
      currentPassword: 'x',
      newPassword: 'short',
      confirmation: 'short',
    }).success,
    false,
  );
});
test('authorized workflow is atomic, auditable, role-protected and retry-safe across sessions', async () => {
  const f = await fixture();
  try {
    const send = (
      action: string,
      input: unknown,
      token = '',
      receipt = key(),
      extra: Record<string, string> = {},
    ) =>
      handle(
        new Request('http://localhost:3000/api/app', {
          method: 'POST',
          headers: {
            origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
            'Idempotency-Key': receipt,
            ...(token ? { cookie: 'nour_session=' + token } : {}),
            ...extra,
          },
          body: JSON.stringify({ action, input }),
        }),
      );
    const get = (token: string, q = '') =>
      handle(
        new Request('http://localhost:3000/api/app' + q, {
          headers: { cookie: 'nour_session=' + token },
        }),
      );
    const tokens: Record<string, string> = {};
    for (const role of ['admin', 'nurse', 'billing', 'inventory']) {
      const r = await send('login', {
        username: role,
        password: testPassword,
        role,
      });
      assert.equal(r.status, 200);
      tokens[role] = r.headers.get('set-cookie')!.match(/nour_session=([a-f0-9]+)/)![1];
    }
    assert.equal(
      (
        await send('activity', {}, tokens.admin, key(), {
          'Content-Length': '20000',
        })
      ).status,
      413,
    );
    assert.equal(
      (
        await send('activity', {}, tokens.admin, key(), {
          'Content-Encoding': 'gzip',
        })
      ).status,
      415,
    );
    assert.equal(
      (
        await send('activity', {}, tokens.admin, key(), {
          'Sec-Fetch-Site': 'cross-site',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await send('login', {
          username: 'admin',
          password: testPassword,
          role: 'nurse',
        })
      ).status,
      401,
    );
    assert.equal((await get(tokens.admin, '?view=patient&id=not-an-id')).status, 400);
    assert.equal(
      (await send('bed', { department: 'القسم', ward: 'الجناح', name: '01' }, tokens.nurse))
        .status,
      403,
    );
    assert.equal(
      (
        await send(
          'bed',
          { department: 'القسم', ward: 'الجناح', name: '01' },
          tokens.admin,
          key(),
          { origin: 'http://evil.invalid' },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await send(
          'bed',
          { department: 'القسم', ward: 'الجناح', name: '01' },
          tokens.admin,
          key(),
          { host: 'evil.invalid' },
        )
      ).status,
      403,
    );
    const created = async (action: string, input: unknown, role = 'admin') => {
      const r = await send(action, input, tokens[role]);
      const body = await r.json();
      assert.equal(r.status, 200, JSON.stringify(body));
      return body;
    };
    await created('department', { name: 'الداخلية' });
    await created('ward', { departmentName: 'الداخلية', name: 'أ' });
    await created('department', { name: 'الجراحة' });
    await created('ward', { departmentName: 'الجراحة', name: 'ب' });
    const b1 = (await created('bed', { department: 'الداخلية', ward: 'أ', name: '01' }))
      .entity;
    const b2 = (await created('bed', { department: 'الجراحة', ward: 'ب', name: '02' })).entity;
    const payload = {
      name: 'مريض اختبار آمن',
      phone: '0991234567',
      dob: '1990-01-01',
      sex: 'male',
      bedId: b1,
      duplicateReason: '',
    };
    const same = key();
    const concurrent = await Promise.all([
      send('admit', payload, tokens.nurse, same),
      send('admit', payload, tokens.nurse, same),
    ]);
    assert.deepEqual(
      concurrent.map((r) => r.status),
      [200, 200],
    );
    const stay = (await concurrent[0].json()).entity;
    assert.equal(await f.db.stay.count(), 1);
    assert.equal(
      (await send('admit', { ...payload, name: 'مريض آخر' }, tokens.nurse)).status,
      409,
    );
    assert.equal(
      (await send('admit', { ...payload, name: 'تغيير المحتوى' }, tokens.nurse, same)).status,
      409,
    );
    const before = await f.db.audit.count();
    const detail = await (await get(tokens.billing, '?view=patient&id=' + stay)).json();
    assert.equal(detail.version, 1);
    assert.ok((await f.db.audit.count()) > before);
    const forbidden = await (await get(tokens.inventory)).json();
    assert.equal(forbidden.stays.length, 0);
    assert.equal(forbidden.users.length, 0);
    assert.equal((await get(tokens.inventory, '?view=patient&id=' + stay)).status, 403);
    await created(
      'transfer',
      { stayId: stay, version: 1, bedId: b2, reason: 'نقل إلى القسم المناسب' },
      'nurse',
    );
    const item = (
      await created(
        'item',
        {
          sku: 'ITEM-01',
          name: 'شاش طبي',
          unit: 'قطعة',
          price: '10.00',
          minimum: 2,
        },
        'inventory',
      )
    ).entity;
    await created(
      'stock',
      { itemId: item, version: 1, quantity: 5, reason: 'توريد اختباري موثق' },
      'inventory',
    );
    await created(
      'addCharge',
      { stayId: stay, version: 2, kind: 'item', sourceId: item, quantity: 2 },
      'nurse',
    );
    assert.equal((await f.db.item.findUniqueOrThrow({ where: { id: item } })).quantity, 3);
    assert.equal(
      (
        await send(
          'addCharge',
          {
            stayId: stay,
            version: 3,
            kind: 'item',
            sourceId: item,
            quantity: 9,
          },
          tokens.nurse,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await send(
          'checkout',
          {
            stayId: stay,
            version: 3,
            amount: '20.00',
            method: 'cash',
            discharge: true,
          },
          tokens.nurse,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await send(
          'checkout',
          {
            stayId: stay,
            version: 3,
            amount: '30.00',
            method: 'cash',
            discharge: true,
          },
          tokens.billing,
        )
      ).status,
      400,
    );
    const paymentKey = key(),
      paymentInput = {
        stayId: stay,
        version: 3,
        amount: '20.00',
        method: 'cash',
        discharge: true,
      };
    const payments = await Promise.all([
      send('checkout', paymentInput, tokens.billing, paymentKey),
      send('checkout', paymentInput, tokens.billing, paymentKey),
    ]);
    assert.deepEqual(
      payments.map((r) => r.status),
      [200, 200],
    );
    assert.equal(await f.db.payment.count(), 1);
    assert.equal(
      (await f.db.stay.findUniqueOrThrow({ where: { id: stay } })).activeBedId,
      null,
    );
    assert.equal(
      (
        await send(
          'addCharge',
          {
            stayId: stay,
            version: 4,
            kind: 'item',
            sourceId: item,
            quantity: 1,
          },
          tokens.nurse,
        )
      ).status,
      409,
    );
    const exp = await created(
      'expense',
      {
        title: 'فاتورة اختبار',
        category: 'supplies',
        amount: '7.50',
        date: '2026-09-30',
        note: '',
      },
      'billing',
    );
    assert.equal(
      (
        await send(
          'voidExpense',
          { expenseId: exp.entity, reason: 'تصحيح مصروف مسجل' },
          tokens.billing,
        )
      ).status,
      403,
    );
    await created('voidExpense', {
      expenseId: exp.entity,
      reason: 'إلغاء مصروف اختباري',
    });
    const log = JSON.stringify(await f.db.audit.findMany());
    assert.ok(!log.includes(testPassword));
    assert.ok(!JSON.stringify(await f.db.receipt.findMany()).includes(testPassword));
    await f.db.user.update({
      where: { id: f.users.nurse },
      data: { active: false },
    });
    assert.equal((await get(tokens.nurse)).status, 200);
    assert.equal((await (await get(tokens.nurse)).json()).actor, null);
  } finally {
    await f.close();
  }
});
