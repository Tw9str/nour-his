'use client';
import { useEffect, useState } from 'react';
import { ActionForm } from '@/components/shared/ActionForm';
import { read } from '@/services/api';
import { decimal, date, type Item } from '@/shared/types';
export function ItemForm({ item, done }: { item?: Item; done: () => void }) {
  return (
    <ActionForm
      action="item"
      initial={
        item
          ? {
              sku: item.sku,
              name: item.name,
              unit: item.unit,
              price: decimal(item.price),
              minimum: String(item.minimum),
            }
          : { unit: 'قطعة', minimum: '5' }
      }
      fields={[
        { name: 'name', label: 'اسم المادة', wide: true },
        { name: 'sku', label: 'رمز المادة', dir: 'ltr' },
        { name: 'unit', label: 'وحدة القياس' },
        { name: 'price', label: 'سعر الوحدة · ل.س', type: 'number' },
        { name: 'minimum', label: 'حد تنبيه المخزون', type: 'number' },
      ]}
      build={(v) => ({
        ...v,
        minimum: Number(v.minimum),
        ...(item ? { id: item.id, version: item.version } : {}),
      })}
      onSuccess={done}
      note="تُسجّل الكميات من حركة المخزون بعد إنشاء المادة. الأسعار السابقة في الفواتير لا تتغير."
    />
  );
}
export function StockForm({ item, done }: { item: Item; done: () => void }) {
  return (
    <ActionForm
      action="stock"
      initial={{ direction: 'in', quantity: '1' }}
      fields={[
        {
          name: 'direction',
          label: 'نوع الحركة',
          type: 'select',
          options: [
            { value: 'in', label: 'إضافة كمية واردة' },
            { value: 'out', label: 'سحب كمية / استهلاك' },
          ],
        },
        { name: 'quantity', label: `الكمية · ${item.unit}`, type: 'number' },
        { name: 'reason', label: 'سبب الحركة أو مرجع الاستلام', type: 'textarea', wide: true },
      ]}
      build={(v) => ({
        itemId: item.id,
        version: item.version,
        quantity: Number(v.quantity) * (v.direction === 'out' ? -1 : 1),
        reason: v.reason,
      })}
      onSuccess={done}
      label="تأكيد حركة المخزون"
      note={`الكمية الحالية: ${item.quantity} ${item.unit}. توريد المخزون لا يسجل مصروفًا تلقائيًا؛ سجّل فاتورة الشراء في المصروفات.`}
    />
  );
}
export function StockHistory({ item }: { item: Item }) {
  const [rows, setRows] = useState<{ id: string; quantity: number; reason: string; at: string }[]>(
      [],
    ),
    [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    read<typeof rows>(new URLSearchParams({ view: 'movements', id: item.id }), c.signal)
      .then(setRows)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [item.id]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <p className="muted">آخر 50 حركة مسجلة</p>
      {rows.map((r) => (
        <div className="charge-row" key={r.id}>
          <span>
            <strong>{r.reason}</strong>
            <small>{date(r.at)}</small>
          </span>
          <strong className={r.quantity > 0 ? 'positive' : 'negative'} dir="ltr">
            {r.quantity > 0 ? '+' : ''}
            {r.quantity}
          </strong>
        </div>
      ))}
    </>
  );
}
