import type { Action, ActionInput } from '@/shared/validation';
import { minor } from '@/shared/validation';
import type { Actor } from '@/shared/types';
import { AppError, audit, type Tx } from './db';
import { permit } from './auth';
export const location = (b: { department: string; ward: string; name: string }) =>
  `${b.department} · ${b.ward} · ${b.name}`;
async function openStay(tx: Tx, id: string, version: number) {
  const s = await tx.stay.findUnique({
    where: { id },
    include: { charges: true, payments: true },
  });
  if (!s || s.status !== 'open') throw new AppError('الإقامة غير متاحة أو تم إغلاقها', 409);
  if (s.version !== version)
    throw new AppError('تم تحديث الملف من جهاز آخر. أغلق النموذج وافتحه مجددًا', 409);
  return s;
}
export function totals(s: {
  charges: { voided: boolean; unitPrice: bigint; quantity: number }[];
  payments: { amount: bigint }[];
}) {
  const total = s.charges
      .filter((c) => !c.voided)
      .reduce((sum, c) => sum + c.unitPrice * BigInt(c.quantity), 0n),
    paid = s.payments.reduce((sum, p) => sum + p.amount, 0n);
  return { total, paid, balance: total - paid };
}
async function availableBed(tx: Tx, id: string) {
  const b = await tx.bed.findUnique({ where: { id }, include: { stay: true } });
  if (!b?.active || b.stay)
    throw new AppError('هذا السرير لم يعد متاحًا. اختر سريرًا آخر', 409);
  return b;
}
const bump = (tx: Tx, id: string) =>
  tx.stay.update({ where: { id }, data: { version: { increment: 1 } } });
async function refreshBedLocations(tx: Tx, bedIds: string[]) {
  const stays = await tx.stay.findMany({
    where: { activeBedId: { in: bedIds }, status: 'open' },
    include: { activeBed: true },
  });
  for (const stay of stays) {
    if (stay.activeBed)
      await tx.stay.update({
        where: { id: stay.id },
        data: { location: location(stay.activeBed), version: { increment: 1 } },
      });
  }
}
export async function operate<K extends Action>(
  tx: Tx,
  a: Actor,
  action: K,
  input: ActionInput<K>,
): Promise<Record<string, unknown>> {
  if (action === 'admit') {
    permit(a, ['admin', 'nurse']);
    const v = input as ActionInput<'admit'>;
    const b = await availableBed(tx, v.bedId);
    const existing = await tx.patient.findFirst({ where: { name: v.name, dob: v.dob } });
    if (
      existing &&
      (await tx.stay.count({ where: { patientId: existing.id, status: 'open' } }))
    )
      throw new AppError('للمريض إقامة مفتوحة بالفعل. افتح ملفه الحالي', 409);
    if (existing && v.duplicateReason.length < 5)
      throw new AppError(
        'يوجد ملف بنفس الاسم والميلاد. تحقق من الهوية وأدخل سبب إعادة القبول',
        409,
        'READMISSION_REQUIRED',
      );
    const p =
      existing ??
      (await tx.patient.create({
        data: { name: v.name, phone: v.phone, dob: v.dob, sex: v.sex },
      }));
    if (
      existing &&
      ((v.phone && existing.phone !== v.phone) || (v.sex && existing.sex !== v.sex))
    )
      throw new AppError('بيانات الهوية لا تطابق الملف السابق. راجع المدير', 409);
    const s = await tx.stay.create({
      data: {
        patientId: p.id,
        activeBedId: b.id,
        location: location(b),
      },
    });
    if (existing) await audit(tx, a.id, 'readmissionReason', s.id, v.duplicateReason);
    return { entity: s.id };
  }
  if (action === 'transfer') {
    permit(a, ['admin', 'nurse']);
    const v = input as ActionInput<'transfer'>;
    const s = await openStay(tx, v.stayId, v.version);
    const b = await availableBed(tx, v.bedId);
    await tx.stay.update({
      where: { id: s.id },
      data: { activeBedId: b.id, location: location(b), version: { increment: 1 } },
    });
    await audit(tx, a.id, 'transferReason', s.id, v.reason);
    return { entity: s.id };
  }
  if (action === 'addCharge') {
    permit(a, ['admin', 'nurse']);
    const v = input as ActionInput<'addCharge'>;
    await openStay(tx, v.stayId, v.version);
    const source =
      v.kind === 'item'
        ? await tx.item.findUnique({ where: { id: v.sourceId } })
        : await tx.service.findUnique({ where: { id: v.sourceId } });
    if (!source?.active) throw new AppError('الخدمة أو المادة غير متاحة', 409);
    if (v.kind === 'item') {
      const item = await tx.item.findUniqueOrThrow({ where: { id: v.sourceId } });
      if (item.quantity < v.quantity) throw new AppError('الكمية المتوفرة لا تكفي', 409);
      await tx.item.update({
        where: { id: item.id },
        data: { quantity: { decrement: v.quantity }, version: { increment: 1 } },
      });
      await tx.stockMovement.create({
        data: {
          itemId: item.id,
          quantity: -v.quantity,
          actorId: a.id,
          reason: 'صرف إلى مريض',
        },
      });
    }
    await tx.charge.create({
      data: {
        stayId: v.stayId,
        label: source.name,
        quantity: v.quantity,
        unitPrice: source.price,
        itemId: v.kind === 'item' ? source.id : null,
      },
    });
    await bump(tx, v.stayId);
    return { entity: v.stayId };
  }
  if (action === 'voidCharge') {
    permit(a, ['admin', 'billing']);
    const v = input as ActionInput<'voidCharge'>,
      s = await openStay(tx, v.stayId, v.version),
      charge = s.charges.find((c) => c.id === v.chargeId && !c.voided);
    if (!charge) throw new AppError('البند غير متاح', 409);
    if (totals(s).balance < charge.unitPrice * BigInt(charge.quantity))
      throw new AppError('لا يمكن إلغاء بند يؤدي إلى رصيد دائن. راجع إجراء الاسترداد', 409);
    await tx.charge.update({
      where: { id: charge.id },
      data: { voided: true, voidReason: v.reason },
    });
    if (charge.itemId) {
      await tx.item.update({
        where: { id: charge.itemId },
        data: { quantity: { increment: charge.quantity }, version: { increment: 1 } },
      });
      await tx.stockMovement.create({
        data: {
          itemId: charge.itemId,
          quantity: charge.quantity,
          reason: 'إلغاء صرف للمريض',
          actorId: a.id,
        },
      });
    }
    await bump(tx, s.id);
    return { entity: s.id };
  }
  if (action === 'checkout') {
    permit(a, ['admin', 'billing']);
    const v = input as ActionInput<'checkout'>,
      s = await openStay(tx, v.stayId, v.version),
      amount = minor(v.amount),
      balance = totals(s).balance;
    if (amount > balance || amount < 0n || (!v.discharge && amount === 0n))
      throw new AppError('المبلغ يجب أن يكون أكبر من 0 وألا يتجاوز المتبقي');
    if (v.discharge && amount !== balance)
      throw new AppError('يجب تسديد الرصيد المتبقي كاملًا قبل إخلاء السرير');
    const payment =
      amount > 0n
        ? await tx.payment.create({
            data: { stayId: s.id, amount, method: v.method, actorId: a.id, actorName: a.name },
          })
        : null;
    await tx.stay.update({
      where: { id: s.id },
      data: {
        version: { increment: 1 },
        ...(v.discharge
          ? { status: 'closed', activeBedId: null, dischargedAt: new Date() }
          : {}),
      },
    });
    return { entity: s.id, paymentId: payment?.id ?? null, discharged: v.discharge };
  }
  if (action === 'item') {
    permit(a, ['admin', 'inventory']);
    const v = input as ActionInput<'item'>;
    const data = {
      sku: v.sku,
      name: v.name,
      unit: v.unit,
      price: minor(v.price),
      minimum: v.minimum,
    };
    if (v.id) {
      const item = await tx.item.findUnique({ where: { id: v.id } });
      if (!item?.active || item.version !== v.version)
        throw new AppError('تغيرت المادة. أعد فتح النموذج', 409);
      await tx.item.update({
        where: { id: v.id },
        data: { ...data, version: { increment: 1 } },
      });
      return { entity: v.id };
    }
    return { entity: (await tx.item.create({ data })).id };
  }
  if (action === 'stock' || action === 'archiveItem') {
    permit(a, ['admin', 'inventory']);
    const v = input as ActionInput<'stock'>;
    const item = await tx.item.findUnique({ where: { id: v.itemId } });
    if (!item?.active || item.version !== v.version)
      throw new AppError('تغير المخزون. أعد فتح النموذج', 409);
    if (action === 'archiveItem') {
      if (item.quantity !== 0) throw new AppError('يجب أن يكون الرصيد 0 قبل أرشفة المادة');
      await tx.item.update({
        where: { id: item.id },
        data: { active: false, version: { increment: 1 } },
      });
    } else {
      if (item.quantity + v.quantity < 0 || item.quantity + v.quantity > 1000000)
        throw new AppError('الكمية الناتجة غير مسموحة');
      await tx.item.update({
        where: { id: item.id },
        data: { quantity: { increment: v.quantity }, version: { increment: 1 } },
      });
      await tx.stockMovement.create({
        data: { itemId: item.id, quantity: v.quantity, reason: v.reason, actorId: a.id },
      });
    }
    return { entity: item.id };
  }
  if (action === 'expense') {
    permit(a, ['admin', 'billing']);
    const v = input as ActionInput<'expense'>;
    return {
      entity: (
        await tx.expense.create({ data: { ...v, amount: minor(v.amount), actorId: a.id } })
      ).id,
    };
  }
  if (action === 'voidExpense') {
    permit(a, ['admin']);
    const v = input as ActionInput<'voidExpense'>;
    const changed = await tx.expense.updateMany({
      where: { id: v.expenseId, voided: false },
      data: { voided: true, voidReason: v.reason },
    });
    if (!changed.count) throw new AppError('المصروف غير متاح', 409);
    return { entity: v.expenseId };
  }
  if (action === 'bed') {
    permit(a, ['admin']);
    const v = input as ActionInput<'bed'>;
    const ward = await tx.ward.findUnique({
      where: { departmentName_name: { departmentName: v.department, name: v.ward } },
    });
    if (!ward) throw new AppError('اختر قسمًا وجناحًا موجودين');
    if (v.id) {
      const changed = await tx.bed.updateMany({
        where: { id: v.id, version: v.version ?? -1, active: true },
        data: {
          name: v.name,
          department: v.department,
          ward: v.ward,
          version: { increment: 1 },
        },
      });
      if (!changed.count) throw new AppError('تغير السرير. أعد فتح النموذج', 409);
      await refreshBedLocations(tx, [v.id]);
      return { entity: v.id };
    }
    return {
      entity: (
        await tx.bed.create({ data: { name: v.name, department: v.department, ward: v.ward } })
      ).id,
    };
  }
  if (action === 'department') {
    permit(a, ['admin']);
    const v = input as ActionInput<'department'>;
    if (!v.id) return { entity: (await tx.department.create({ data: { name: v.name } })).id };
    const previous = await tx.department.findUnique({ where: { id: v.id } });
    if (!previous || previous.version !== v.version)
      throw new AppError('تغير القسم. أعد فتح النموذج', 409);
    await tx.department.update({
      where: { id: v.id },
      data: { name: v.name, version: { increment: 1 } },
    });
    await tx.ward.updateMany({
      where: { departmentName: v.name },
      data: { version: { increment: 1 } },
    });
    await tx.bed.updateMany({
      where: { department: v.name },
      data: { version: { increment: 1 } },
    });
    await refreshBedLocations(
      tx,
      (await tx.bed.findMany({ where: { department: v.name }, select: { id: true } })).map(
        (b) => b.id,
      ),
    );
    return { entity: v.id };
  }
  if (action === 'ward') {
    permit(a, ['admin']);
    const v = input as ActionInput<'ward'>;
    if (!(await tx.department.findUnique({ where: { name: v.departmentName } })))
      throw new AppError('اختر قسمًا موجودًا');
    if (!v.id)
      return {
        entity: (
          await tx.ward.create({ data: { name: v.name, departmentName: v.departmentName } })
        ).id,
      };
    const previous = await tx.ward.findUnique({ where: { id: v.id } });
    if (!previous || previous.version !== v.version)
      throw new AppError('تغير الجناح. أعد فتح النموذج', 409);
    await tx.ward.update({
      where: { id: v.id },
      data: { name: v.name, departmentName: v.departmentName, version: { increment: 1 } },
    });
    await tx.bed.updateMany({
      where: { department: v.departmentName, ward: v.name },
      data: { version: { increment: 1 } },
    });
    await refreshBedLocations(
      tx,
      (
        await tx.bed.findMany({
          where: { department: v.departmentName, ward: v.name },
          select: { id: true },
        })
      ).map((b) => b.id),
    );
    return { entity: v.id };
  }
  if (action === 'service') {
    permit(a, ['admin']);
    const v = input as ActionInput<'service'>;
    if (v.id) {
      const s = await tx.service.findUnique({ where: { id: v.id } });
      if (!s || s.version !== v.version)
        throw new AppError('تغيرت الخدمة. أعد فتح النموذج', 409);
      await tx.service.update({
        where: { id: v.id },
        data: { name: v.name, price: minor(v.price), version: { increment: 1 } },
      });
      return { entity: v.id };
    }
    return {
      entity: (await tx.service.create({ data: { name: v.name, price: minor(v.price) } })).id,
    };
  }
  if (action === 'deleteDepartment') {
    permit(a, ['admin']);
    const v = input as ActionInput<'deleteDepartment'>;
    const record = await tx.department.findUnique({
      where: { id: v.id },
      include: { _count: { select: { wards: true } } },
    });
    if (!record || record.version !== v.version)
      throw new AppError('تغير القسم أو تم حذفه. حدّث البيانات', 409);
    if (record._count.wards)
      throw new AppError('لا يمكن حذف قسم يحتوي على أجنحة. انقل الأجنحة أو احذفها أولًا', 409);
    const deleted = await tx.department.deleteMany({
      where: { id: v.id, version: v.version },
    });
    if (!deleted.count) throw new AppError('تغير القسم. حدّث البيانات', 409);
    return { entity: v.id, deletedName: record.name };
  }
  if (action === 'deleteWard') {
    permit(a, ['admin']);
    const v = input as ActionInput<'deleteWard'>;
    const record = await tx.ward.findUnique({
      where: { id: v.id },
      include: { _count: { select: { beds: true } } },
    });
    if (!record || record.version !== v.version)
      throw new AppError('تغير الجناح أو تم حذفه. حدّث البيانات', 409);
    if (record._count.beds)
      throw new AppError('لا يمكن حذف جناح يحتوي على أسرة. انقل الأسرة أو احذفها أولًا', 409);
    const deleted = await tx.ward.deleteMany({ where: { id: v.id, version: v.version } });
    if (!deleted.count) throw new AppError('تغير الجناح. حدّث البيانات', 409);
    return { entity: v.id, deletedName: `${record.departmentName} · ${record.name}` };
  }
  if (action === 'deleteBed') {
    permit(a, ['admin']);
    const v = input as ActionInput<'deleteBed'>;
    const record = await tx.bed.findUnique({ where: { id: v.id }, include: { stay: true } });
    if (!record || record.version !== v.version)
      throw new AppError('تغير السرير أو تم حذفه. حدّث البيانات', 409);
    if (record.stay)
      throw new AppError('لا يمكن حذف سرير مشغول. انقل المريض أو أنهِ الإقامة أولًا', 409);
    const deleted = await tx.bed.deleteMany({ where: { id: v.id, version: v.version } });
    if (!deleted.count) throw new AppError('تغير السرير. حدّث البيانات', 409);
    return { entity: v.id, deletedName: location(record) };
  }
  if (action === 'deleteService') {
    permit(a, ['admin']);
    const v = input as ActionInput<'deleteService'>;
    const record = await tx.service.findUnique({ where: { id: v.id } });
    if (!record || record.version !== v.version)
      throw new AppError('تغيرت الخدمة أو تم حذفها. حدّث البيانات', 409);
    const deleted = await tx.service.deleteMany({ where: { id: v.id, version: v.version } });
    if (!deleted.count) throw new AppError('تغيرت الخدمة. حدّث البيانات', 409);
    return { entity: v.id, deletedName: record.name };
  }
  if (action === 'deleteUser') {
    permit(a, ['admin']);
    const v = input as ActionInput<'deleteUser'>;
    const record = await tx.user.findUnique({ where: { id: v.id } });
    if (!record || record.version !== v.version)
      throw new AppError('تغير الحساب أو تم حذفه. حدّث البيانات', 409);
    if (record.id === a.id) throw new AppError('لا يمكنك حذف حسابك الحالي', 409);
    if (
      record.active &&
      record.role === 'admin' &&
      !(await tx.user.count({
        where: {
          role: 'admin',
          active: true,
          mustChange: false,
          username: { not: { startsWith: '__test_' } },
          id: { not: record.id },
        },
      }))
    )
      throw new AppError('لا يمكن حذف آخر مدير فعّال', 409);
    const deleted = await tx.user.deleteMany({ where: { id: v.id, version: v.version } });
    if (!deleted.count) throw new AppError('تغير الحساب. حدّث البيانات', 409);
    return { entity: v.id, deletedName: record.name };
  }
  throw new AppError('العملية غير مدعومة');
}
