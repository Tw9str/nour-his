import { audit, database, AppError, jsonSafe } from './db';
import { authenticated, actor, permit, setupRequired } from './auth';
import { canBill, canCare, canStock } from '@/shared/types';
import { totals } from './operations';
import { z } from 'zod';
const querySchema = z.strictObject({
  view: z.enum(['workspace', 'patient', 'movements']).default('workspace'),
  id: z.uuid().optional(),
  q: z.string().max(80).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  tab: z.enum(['patients', 'bills', 'inventory', 'manage']).default('patients'),
  status: z.enum(['open', 'closed', 'all']).default('open'),
});
export async function query(token: string | undefined, parameters: URLSearchParams) {
  const parsed = querySchema.safeParse(Object.fromEntries(parameters));
  if (!parsed.success || new Set(parameters.keys()).size !== [...parameters.keys()].length)
    throw new AppError('استعلام غير صالح');
  const v = parsed.data;
  return database().$transaction(
    async (tx) => {
      const a = await authenticated(token, tx, true);
      if (setupRequired(a)) return { actor: a, setup: true };
      if (v.tab === 'manage') permit(a, ['admin']);
      if (v.view === 'patient') {
        permit(a, ['admin', 'nurse', 'billing']);
        if (!v.id) throw new AppError('اختر المريض');
        const s = await tx.stay.findUnique({
          where: { id: v.id },
          include: {
            patient: true,
            charges: { orderBy: { createdAt: 'asc' } },
            payments: { orderBy: { createdAt: 'asc' } },
          },
        });
        if (!s) throw new AppError('الملف غير موجود', 404);
        await audit(tx, a.id, 'readPatient', s.id);
        return jsonSafe({
          id: s.id,
          number: s.number,
          patientNumber: s.patient.number,
          name: s.patient.name,
          phone: s.patient.phone,
          dob: s.patient.dob,
          sex: s.patient.sex,
          location: s.location,
          status: s.status,
          version: s.version,
          admittedAt: s.admittedAt,
          dischargedAt: s.dischargedAt,
          charges: s.charges,
          payments: s.payments,
          ...totals(s),
        });
      }
      if (v.view === 'movements') {
        permit(a, ['admin', 'inventory']);
        if (!v.id) throw new AppError('اختر المادة');
        await audit(tx, a.id, 'readStock', v.id);
        return tx.stockMovement.findMany({
          where: { itemId: v.id },
          orderBy: { at: 'desc' },
          take: 50,
          select: { id: true, quantity: true, reason: true, at: true },
        });
      }
      const patientAccess = canCare(a) || canBill(a),
        billing = canBill(a);
      const where = {
        ...(v.status === 'all' ? {} : { status: v.status }),
        ...(v.q ? { patient: { name: { contains: v.q, mode: 'insensitive' as const } } } : {}),
      };
      const stays = patientAccess
        ? await tx.stay.findMany({
            where,
            orderBy: { admittedAt: 'desc' },
            skip: (v.page - 1) * 30,
            take: 30,
            include: {
              patient: { select: { name: true, number: true } },
              ...(billing ? { charges: true, payments: true } : {}),
            },
          })
        : [];
      const total = patientAccess ? await tx.stay.count({ where }) : 0;
      const beds = patientAccess
        ? await tx.bed.findMany({
            where: { active: true },
            include: { stay: { select: { id: true } } },
            orderBy: [{ department: 'asc' }, { ward: 'asc' }, { name: 'asc' }],
            take: 500,
          })
        : [];
      const items = await tx.item.findMany({
        where: {
          active: true,
          ...(v.tab === 'inventory' && v.q
            ? {
                OR: [
                  { name: { contains: v.q, mode: 'insensitive' } },
                  { sku: { contains: v.q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        take: 100,
        skip: v.tab === 'inventory' ? (v.page - 1) * 100 : 0,
      });
      const expenses = billing
        ? await tx.expense.findMany({
            where:
              v.tab === 'bills' && v.q
                ? { title: { contains: v.q, mode: 'insensitive' } }
                : {},
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            take: 30,
            skip: v.tab === 'bills' ? (v.page - 1) * 30 : 0,
          })
        : [];
      const received = billing ? await tx.payment.aggregate({ _sum: { amount: true } }) : null;
      const spent = billing
        ? await tx.expense.aggregate({ where: { voided: false }, _sum: { amount: true } })
        : null;
      const low = canStock(a)
        ? await tx.$queryRaw<
            { count: bigint }[]
          >`SELECT count(*) AS count FROM "Item" WHERE active=true AND quantity<=minimum`
        : [];
      const count =
        v.tab === 'inventory'
          ? await tx.item.count({
              where: {
                active: true,
                ...(v.q
                  ? { OR: [{ name: { contains: v.q } }, { sku: { contains: v.q } }] }
                  : {}),
              },
            })
          : v.tab === 'bills' && billing
            ? await tx.expense.count({
                where: v.q ? { title: { contains: v.q, mode: 'insensitive' } } : {},
              })
            : total;
      await audit(tx, a.id, 'readWorkspace', v.tab);
      return jsonSafe({
        actor: a,
        departments:
          a.role === 'admin' ? await tx.department.findMany({ orderBy: { name: 'asc' } }) : [],
        wards:
          a.role === 'admin'
            ? await tx.ward.findMany({ orderBy: [{ departmentName: 'asc' }, { name: 'asc' }] })
            : [],
        beds: beds.map(({ stay, ...bed }) => ({ ...bed, occupied: !!stay })),
        stays: stays.map((s) => ({
          id: s.id,
          number: s.number,
          name: s.patient.name,
          patientNumber: s.patient.number,
          location: s.location,
          status: s.status,
          admittedAt: s.admittedAt,
          version: s.version,
          ...('charges' in s && 'payments' in s
            ? { balance: totals(s as unknown as Parameters<typeof totals>[0]).balance }
            : {}),
        })),
        items,
        services: patientAccess
          ? await tx.service.findMany({
              where: { active: true },
              orderBy: { name: 'asc' },
              take: 200,
            })
          : [],
        expenses,
        users:
          a.role === 'admin'
            ? (
                await tx.user.findMany({
                  where: { active: true },
                  orderBy: { name: 'asc' },
                  take: 100,
                })
              ).map((u) => ({ ...actor(u), email: u.email || '', version: u.version }))
            : [],
        audit:
          a.role === 'admin'
            ? await tx.audit.findMany({
                select: { id: true, actorId: true, action: true, at: true },
                orderBy: { at: 'desc' },
                take: 30,
              })
            : [],
        stats: {
          active: patientAccess ? await tx.stay.count({ where: { status: 'open' } }) : 0,
          freeBeds: beds.filter((b) => !b.stay).length,
          lowStock: Number(low[0]?.count ?? 0),
          received: received?._sum.amount ?? 0n,
          spent: spent?._sum.amount ?? 0n,
        },
        revision: (await tx.revision.findUnique({ where: { id: 1 } }))?.value ?? 0,
        total: count,
        page: v.page,
        pages: Math.max(1, Math.ceil(count / (v.tab === 'inventory' ? 100 : 30))),
      });
    },
    { isolationLevel: 'RepeatableRead', timeout: 12000, maxWait: 5000 },
  );
}
