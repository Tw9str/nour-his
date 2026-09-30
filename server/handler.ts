import { NextResponse } from 'next/server';
import { z } from 'zod';
import { schemas, fieldErrors, type Action, type ActionInput } from '@/shared/validation';
import { authenticated, signIn, signInTestUser, permit } from './auth';
import { isTestUsername, testLoginEnabled } from './testLogin';
import { audit, AppError, database, jsonSafe, transaction } from './db';
import {
  cookieName,
  digest,
  enter,
  guard,
  origin,
  rate,
  readBody,
  receipt,
  sessionToken,
  source,
} from './security';
import { query } from './queries';
import { operate } from './operations';
import { hashPassword, verifyPassword } from './passwords';
const envelope = z.strictObject({
  action: z.enum(Object.keys(schemas) as [Action, ...Action[]]),
  input: z.unknown(),
});
const setupActions = ['password', 'logout', 'activity'];
export async function handle(request: Request) {
  const requestId = crypto.randomUUID();
  let release: (() => void) | undefined;
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(jsonSafe(body), {
      status,
      headers: {
        'Cache-Control': 'no-store, private',
        'X-Request-ID': requestId,
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
      },
    });
  try {
    release = enter();
    guard(request);
    const ip = source(request);
    await rate('global', 2400, 60);
    await rate('source:' + ip, 300, 60);
    const token = sessionToken(request);
    if (request.method === 'GET') {
      try {
        const a = await authenticated(token, database(), true);
        await rate('read:' + a.id, 100, 60);
        return reply({
          ...(await query(token, new URL(request.url).searchParams)),
          testLoginEnabled: testLoginEnabled(),
        });
      } catch (error) {
        if (error instanceof AppError && error.status === 401)
          return reply({ actor: null, testLoginEnabled: testLoginEnabled() });
        throw error;
      }
    }
    if (request.method !== 'POST') return reply({ error: 'الطريقة غير مدعومة' }, 405);
    const raw = await readBody(request),
      parsed = envelope.safeParse(raw);
    if (!parsed.success) return reply({ error: 'طلب غير صالح' }, 400);
    const { action } = parsed.data;
    const validation = schemas[action].safeParse(parsed.data.input);
    if (!validation.success)
      return reply(
        { error: 'راجع الحقول الموضحة', fields: fieldErrors(validation.error) },
        400,
      );
    const input = validation.data;
    if (action === 'login' || action === 'testLogin') {
      await rate('login-source:' + ip, 20, 900);
      let next: string;
      if (action === 'testLogin') {
        next = await signInTestUser((input as ActionInput<'testLogin'>).role);
      } else {
        const v = input as ActionInput<'login'>;
        await rate('login-account:' + v.username, 8, 900);
        next = await signIn(v.username, v.password, v.role);
      }
      if (token) await database().session.deleteMany({ where: { id: digest(token) } });
      const response = reply({ ok: true });
      response.cookies.set(cookieName, next, {
        httpOnly: true,
        secure: origin(request).startsWith('https:'),
        sameSite: 'strict',
        path: '/',
        maxAge: 8 * 3600,
      });
      return response;
    }
    const a = await authenticated(token, database(), setupActions.includes(action));
    await rate('write:' + a.id, 90, 60);
    if (['password', 'user', 'updateUser', 'disableUser', 'deleteUser'].includes(action))
      await rate('sensitive:' + a.id, 10, 900);
    if (action === 'logout') {
      await transaction(async (tx) => {
        await tx.session.deleteMany({ where: { id: digest(token!) } });
        await audit(tx, a.id, 'logout', a.id);
      });
      const response = reply({ ok: true });
      response.cookies.set(cookieName, '', {
        httpOnly: true,
        secure: origin(request).startsWith('https:'),
        sameSite: 'strict',
        path: '/',
        maxAge: 0,
      });
      return response;
    }
    if (action === 'activity') {
      await database().session.updateMany({
        where: {
          id: digest(token!),
          expiresAt: { gt: new Date() },
          lastActive: { gt: new Date(Date.now() - 300000) },
        },
        data: { lastActive: new Date() },
      });
      return reply({ ok: true });
    }
    // Expensive password derivation happens before the serialized write transaction.
    const newHash =
      action === 'password'
        ? await hashPassword((input as ActionInput<'password'>).newPassword)
        : action === 'user'
          ? await hashPassword((input as ActionInput<'user'>).password)
          : undefined;
    if (action === 'deleteUser') permit(a, ['admin']);
    const sensitive =
      ['password', 'disableUser'].includes(action) ||
      (action === 'deleteUser' && !(testLoginEnabled() && isTestUsername(a.username)));
    const row = sensitive
      ? await database().user.findUniqueOrThrow({ where: { id: a.id } })
      : null;
    if (
      row &&
      !(await verifyPassword(
        (input as { currentPassword: string }).currentPassword,
        row.passwordHash,
      ))
    )
      throw new AppError('كلمة المرور الحالية غير صحيحة', 403);
    const protectedReceipt =
      action !== 'password' ? receipt(request, token!, { action, input }) : undefined;
    const result = await transaction(async (tx) => {
      const current = await authenticated(token, tx, setupActions.includes(action));
      if (protectedReceipt) {
        const old = await tx.receipt.findUnique({ where: { id: protectedReceipt.id } });
        if (old) {
          if (old.userId !== current.id || old.hash !== protectedReceipt.hash)
            throw new AppError('مفتاح الإرسال استُخدم لطلب آخر', 409);
          return old.result;
        }
      }
      let value: Record<string, unknown> = {};
      if (row) {
        const fresh = await tx.user.findUniqueOrThrow({ where: { id: a.id } });
        if (fresh.passwordHash !== row.passwordHash)
          throw new AppError('أعد التحقق من الحساب', 409);
      }
      if (action === 'password') {
        const v = input as ActionInput<'password'>;
        if (v.newPassword.toLowerCase() === current.username)
          throw new AppError('كلمة المرور لا يمكن أن تطابق اسم المستخدم');
        await tx.user.update({
          where: { id: a.id },
          data: { passwordHash: newHash!, mustChange: false },
        });
        await tx.session.deleteMany({ where: { userId: a.id } });
        value = { signedOut: true };
      } else if (action === 'user') {
        permit(current, ['admin']);
        const v = input as ActionInput<'user'>;
        if (v.password.toLowerCase() === v.username)
          throw new AppError('كلمة المرور لا يمكن أن تطابق اسم المستخدم');
        const u = await tx.user.create({
          data: {
            username: v.username,
            name: v.name,
            email: v.email || null,
            role: v.role,
            passwordHash: newHash!,
            mustChange: true,
          },
        });
        value = { entity: u.id };
      } else if (action === 'updateUser') {
        permit(current, ['admin']);
        const v = input as ActionInput<'updateUser'>;
        const u = await tx.user.findUnique({ where: { id: v.userId } });
        if (!u?.active || u.version !== v.version)
          throw new AppError('تغير الحساب. أعد فتح النموذج', 409);
        if (u.role !== v.role && (u.id === a.id || u.username.startsWith('__test_')))
          throw new AppError('لا يمكن تغيير دور حسابك الحالي أو الحساب التجريبي');
        if (
          u.role === 'admin' &&
          v.role !== 'admin' &&
          !(await tx.user.count({
            where: {
              role: 'admin',
              active: true,
              mustChange: false,
              username: { not: { startsWith: '__test_' } },
              id: { not: u.id },
            },
          }))
        )
          throw new AppError('يجب وجود مدير آخر فعّال قبل المتابعة');
        await tx.user.update({
          where: { id: u.id },
          data: {
            name: v.name,
            email: v.email || null,
            role: v.role,
            version: { increment: 1 },
          },
        });
        if (u.role !== v.role) await tx.session.deleteMany({ where: { userId: u.id } });
        value = { entity: u.id };
      } else if (action === 'disableUser') {
        permit(current, ['admin']);
        const v = input as ActionInput<'disableUser'>;
        const u = await tx.user.findUnique({ where: { id: v.userId } });
        if (!u?.active || u.id === a.id) throw new AppError('لا يمكن تعطيل هذا الحساب');
        if (
          u.role === 'admin' &&
          (await tx.user.count({
            where: {
              role: 'admin',
              active: true,
              username: { not: { startsWith: '__test_' } },
              mustChange: false,
              id: { not: u.id },
            },
          })) === 0
        )
          throw new AppError('يجب وجود مدير آخر فعّال قبل المتابعة');
        await tx.user.update({
          where: { id: u.id },
          data: { active: false, version: { increment: 1 } },
        });
        await tx.session.deleteMany({ where: { userId: u.id } });
        value = { entity: u.id };
      } else value = await operate(tx, current, action, input as never);
      await audit(
        tx,
        a.id,
        action,
        String(value.entity || a.id),
        typeof value.deletedName === 'string' ? value.deletedName : '',
      );
      await tx.revision.upsert({
        where: { id: 1 },
        create: { id: 1, value: 1 },
        update: { value: { increment: 1 } },
      });
      if (protectedReceipt)
        await tx.receipt.create({
          data: { ...protectedReceipt, userId: a.id, result: jsonSafe(value) },
        });
      return value;
    });
    return reply({ ok: true, ...(result as object) });
  } catch (error) {
    const status = error instanceof AppError ? error.status : 503;
    const code = (error as { code?: string })?.code;
    const conflict = ['P2002', 'P2003'].includes(code || '');
    console.warn(
      JSON.stringify({ event: 'nour-rejection', status: conflict ? 409 : status, requestId }),
    );
    return reply(
      {
        error: conflict
          ? 'يوجد سجل بنفس البيانات أو بيانات مرتبطة. راجع المدخلات'
          : error instanceof AppError
            ? error.message
            : 'الخدمة غير متاحة مؤقتًا. أعد المحاولة',
        requestId,
        ...(error instanceof AppError && error.code ? { code: error.code } : {}),
      },
      conflict ? 409 : status,
    );
  } finally {
    release?.();
  }
}
