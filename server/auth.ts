import { randomBytes } from 'node:crypto';
import { database, AppError, transaction, audit, type Tx } from './db';
import { digest } from './security';
import { dummyHash, hashPassword, verifyPassword } from './passwords';
import { roles, type Actor, type Role } from '@/shared/types';
import { isTestUsername, testLoginEnabled } from './testLogin';
export const actor = (u: {
  id: string;
  name: string;
  username: string;
  role: string;
  mustChange: boolean;
}): Actor => ({
  id: u.id,
  name: u.name,
  username: u.username,
  role: u.role as Role,
  mustChange: u.mustChange,
});
export const setupRequired = (a: Actor) => a.mustChange;
export async function authenticated(
  token: string | undefined,
  tx: Tx = database(),
  setup = false,
) {
  if (!token) throw new AppError('سجّل الدخول للمتابعة', 401);
  const s = await tx.session.findUnique({
    where: { id: digest(token) },
    include: { user: true },
  });
  if (
    !s ||
    !s.user.active ||
    (isTestUsername(s.user.username) && !testLoginEnabled()) ||
    s.expiresAt.getTime() <= Date.now() ||
    s.lastActive.getTime() + 5 * 60000 <= Date.now()
  )
    throw new AppError('انتهت الجلسة. سجّل الدخول مجددًا', 401);
  const a = actor(s.user);
  if (!setup && setupRequired(a)) throw new AppError('أكمل إعداد أمان الحساب أولًا', 403);
  return a;
}
export async function signIn(username: string, password: string, role?: Role) {
  const row = await database().user.findUnique({ where: { username } });
  const valid = await verifyPassword(password, row?.passwordHash || dummyHash);
  if (!row || !valid || !row.active || isTestUsername(username) || (role && row.role !== role))
    throw new AppError('بيانات الدخول أو دور الحساب غير صحيحة', 401);
  return transaction(async (tx) => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: row.id } });
    if (
      !current.active ||
      current.passwordHash !== row.passwordHash ||
      (role && current.role !== role)
    )
      throw new AppError('بيانات الدخول أو دور الحساب غير صحيحة', 401);
    const token = randomBytes(32).toString('hex');
    await tx.session.create({
      data: {
        id: digest(token),
        userId: row.id,
        expiresAt: new Date(Date.now() + 8 * 3600000),
      },
    });
    await audit(tx, row.id, 'login', row.id);
    return token;
  });
}
export function permit(a: Actor, roles: Role[]) {
  if (!roles.includes(a.role)) throw new AppError('لا تملك صلاحية تنفيذ هذه العملية', 403);
}

export async function signInTestUser(role: Role) {
  if (!testLoginEnabled()) throw new AppError('الدخول التجريبي غير متاح', 403);
  const username = `__test_${role}`;
  const passwordHash = await hashPassword(randomBytes(32).toString('base64url'));
  return transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { username },
      create: {
        username,
        name: `${roles[role]} · تجريبي`,
        role,
        passwordHash,
        mustChange: false,
      },
      update: { name: `${roles[role]} · تجريبي` },
    });
    if (!user.active || user.role !== role || user.mustChange)
      throw new AppError('الحساب التجريبي غير متاح. راجع مسؤول النظام', 403);
    const token = randomBytes(32).toString('hex');
    await tx.session.create({
      data: {
        id: digest(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 8 * 3600000),
      },
    });
    await audit(tx, user.id, 'testLogin', user.id);
    return token;
  });
}
