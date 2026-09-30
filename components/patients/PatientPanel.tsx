'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { read } from '@/services/api';
import { ActionForm } from '@/components/shared/ActionForm';
import { Modal } from '@/components/shared/Modal';
import { Icon } from '@/components/shared/Icons';
import {
  decimal,
  currency,
  date,
  methods,
  canBill,
  canCare,
  type PatientDetail,
  type Snapshot,
  type Charge,
} from '@/shared/types';
export function PatientPanel({
  id,
  data,
  close,
  refresh,
  checkout = false,
}: {
  id: string;
  data: Snapshot;
  close: () => void;
  refresh: () => void;
  checkout?: boolean;
}) {
  const [patient, setPatient] = useState<PatientDetail | null>(null),
    [error, setError] = useState(''),
    [mode, setMode] = useState<'view' | 'service' | 'transfer'>('view'),
    [voidCharge, setVoid] = useState<Charge | null>(null),
    [receipt, setReceipt] = useState('');
  const reload = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const p = await read<PatientDetail>(new URLSearchParams({ view: 'patient', id }), signal);
        if (!signal?.aborted) {
          setPatient(p);
          setError('');
        }
      } catch (e) {
        if (!signal?.aborted) setError(e instanceof Error ? e.message : 'تعذر تحميل الملف');
      }
    },
    [id],
  );
  // This effect synchronizes the displayed record with the server revision through an asynchronous read.
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Updates follow an awaited server read.
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload, data.revision]);
  const done = async () => {
    setMode('view');
    setVoid(null);
    await reload();
    refresh();
  };
  const print = async () => {
    try {
      await read(new URLSearchParams({ view: 'patient', id }));
      window.print();
    } catch {
      setError('تعذر التحقق من صلاحية طباعة الإيصال');
    }
  };
  const content = (
    <>
      {error && (
        <div className="feedback error" role="alert">
          {error}
          <button className="button" onClick={() => void reload()}>
            إعادة المحاولة
          </button>
        </div>
      )}
      {!patient ? (
        <div className="loading">
          <span className="spinner" />
          جارٍ تحميل الملف…
        </div>
      ) : (
        <>
          <div className="patient-banner">
            <span className="avatar large">{patient.name[0]}</span>
            <div>
              <h2>{patient.name}</h2>
              <p>
                ملف {patient.patientNumber} · إقامة {patient.number}
              </p>
            </div>
            <span className={`badge ${patient.status === 'open' ? 'green' : 'gray'}`}>
              {patient.status === 'open' ? 'مقيم' : 'تمت المغادرة'}
            </span>
          </div>
          <div className="detail-strip">
            <span>
              <Icon name="bed" size={18} />
              {patient.location}
            </span>
            <span>
              <Icon name="clock" size={18} />
              {date(patient.admittedAt)}
            </span>
            <span dir="ltr">{patient.phone}</span>
          </div>
          {!checkout && (
            <div className="patient-actions no-print">
              {patient.status === 'open' && (
                <>
                  {canCare(data.actor) && (
                    <button className="button" onClick={() => setMode('transfer')}>
                      <Icon name="transfer" />
                      نقل المريض
                    </button>
                  )}
                  <button className="button" onClick={() => setMode('service')}>
                    <Icon name="plus" />
                    إضافة خدمة أو مادة
                  </button>
                  {canBill(data.actor) && (
                    <Link className="button primary" href={'/checkout/' + id}>
                      <Icon name="wallet" />
                      التحصيل والمغادرة
                    </Link>
                  )}
                </>
              )}
            </div>
          )}
          {mode === 'transfer' && (
            <div className="embedded-form">
              <h3>نقل إلى سرير آخر</h3>
              <ActionForm
                action="transfer"
                initial={{ reason: '' }}
                fields={[
                  {
                    name: 'bedId',
                    label: 'القسم / الجناح / السرير',
                    type: 'select',
                    wide: true,
                    options: data.beds
                      .filter((b) => !b.occupied)
                      .map((b) => ({
                        value: b.id,
                        label: `${b.department} · ${b.ward} · ${b.name}`,
                      })),
                  },
                  { name: 'reason', label: 'سبب النقل', wide: true },
                ]}
                build={(v) => ({ stayId: id, version: patient.version, ...v })}
                label="تأكيد النقل"
                onSuccess={done}
              />
            </div>
          )}
          {mode === 'service' && (
            <div className="embedded-form">
              <h3>إضافة إلى حساب المريض</h3>
              <ActionForm
                action="addCharge"
                initial={{ kind: 'service', quantity: '1' }}
                fields={[
                  {
                    name: 'kind',
                    label: 'النوع',
                    type: 'select',
                    reset: ['sourceId'],
                    options: [
                      { value: 'service', label: 'خدمة' },
                      { value: 'item', label: 'مادة من المستودع' },
                    ],
                  },
                  {
                    name: 'sourceId',
                    label: 'الخدمة أو المادة',
                    type: 'select',
                    options: (v) =>
                      (v.kind === 'item' ? data.items : data.services).map((s) => ({
                        value: s.id,
                        label: `${s.name} · ${currency(s.price)}`,
                      })),
                  },
                  { name: 'quantity', label: 'الكمية', type: 'number' },
                ]}
                build={(v) => ({
                  stayId: id,
                  version: patient.version,
                  kind: v.kind,
                  sourceId: v.sourceId,
                  quantity: Number(v.quantity),
                })}
                note="سعر الخدمة يُثبت عند الإضافة. المواد تُخصم من المخزون تلقائيًا."
                onSuccess={done}
              />
            </div>
          )}
          <div className={checkout ? 'checkout-columns' : ''}>
            <section className="bill-detail">
              <div className="surface-head">
                <h3>الخدمات والمواد</h3>
                <span className="count-tag">
                  {patient.charges.filter((c) => !c.voided).length} بنود
                </span>
              </div>
              <div className="charge-list">
                {patient.charges.map((c) => (
                  <div className={`charge-row ${c.voided ? 'voided' : ''}`} key={c.id}>
                    <span>
                      <strong>{c.label}</strong>
                      <small>
                        {c.quantity} × {currency(c.unitPrice)}
                        {c.voided ? ' · ملغى' : ''}
                      </small>
                    </span>
                    <strong>
                      {currency((BigInt(c.unitPrice) * BigInt(c.quantity)).toString())}
                    </strong>
                    {canBill(data.actor) && patient.status === 'open' && !c.voided && (
                      <button
                        className="icon-button no-print"
                        aria-label={'إلغاء ' + c.label}
                        onClick={() => setVoid(c)}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {!patient.charges.length && (
                  <p className="muted padded">
                    لم تُضف خدمات بعد. أضف الخدمات المستحقة قبل المغادرة.
                  </p>
                )}
              </div>
              <div className="bill-totals">
                <div>
                  <span>إجمالي الخدمات</span>
                  <strong>{currency(patient.total)}</strong>
                </div>
                <div>
                  <span>المدفوع سابقًا</span>
                  <strong>{currency(patient.paid)}</strong>
                </div>
                <div className="grand-total">
                  <span>المتبقي للدفع</span>
                  <strong>{currency(patient.balance)}</strong>
                </div>
              </div>
            </section>
            {checkout && (
              <section className="payment-card">
                {!canBill(data.actor) ? (
                  <p>التحصيل متاح للمحاسب أو المدير فقط.</p>
                ) : patient.status === 'open' ? (
                  <>
                    <span className="eyebrow">خطوة أخيرة، واضحة</span>
                    <h2>تحصيل دفعة</h2>
                    <p className="muted">راجع المبلغ مع المريض قبل تأكيد الدفع.</p>
                    <ActionForm
                      key={patient.version}
                      action="checkout"
                      fields={[
                        {
                          name: 'amount',
                          label: 'المبلغ المستلم · ل.س',
                          type: 'number',
                          wide: true,
                        },
                        {
                          name: 'method',
                          label: 'طريقة الدفع',
                          type: 'select',
                          wide: true,
                          options: Object.entries(methods).map(([value, label]) => ({
                            value,
                            label,
                          })),
                        },
                        {
                          name: 'discharge',
                          label: 'تسديد كامل وإنهاء الإقامة وإخلاء السرير',
                          type: 'checkbox',
                          wide: true,
                        },
                      ]}
                      initial={{
                        amount: decimal(patient.balance),
                        method: 'cash',
                        discharge: true,
                      }}
                      build={(v) => ({ stayId: id, version: patient.version, ...v })}
                      label="تأكيد التحصيل"
                      onSuccess={async (r) => {
                        setReceipt(r.paymentId || 'closed');
                        await done();
                      }}
                      note="لا تُنهى الإقامة قبل تسديد الرصيد كاملًا. لا يمكن تعديل الدفعة المؤكدة."
                    />
                  </>
                ) : (
                  <div className="payment-complete">
                    <Icon name="success" size={48} />
                    <h2>تمت تسوية الإقامة</h2>
                    <p>السرير متاح الآن لاستقبال مريض آخر.</p>
                  </div>
                )}
                {receipt && (
                  <div className="feedback success" role="status">
                    تم تسجيل العملية وتحديث بيانات المنشأة.
                  </div>
                )}
                <button className="button full no-print" onClick={() => void print()}>
                  <Icon name="print" />
                  طباعة كشف الحساب والإيصالات
                </button>
              </section>
            )}
          </div>
          <div className="payments-history">
            <h3>الدفعات المسجلة</h3>
            {patient.payments.length ? (
              patient.payments.map((p) => (
                <div className="payment-line" key={p.id}>
                  <span>
                    <Icon name="bills" size={18} />
                    إيصال {p.number}
                  </span>
                  <span>
                    {date(p.createdAt)} · {methods[p.method]}
                  </span>
                  <span>{p.actorName}</span>
                  <strong>{currency(p.amount)}</strong>
                </div>
              ))
            ) : (
              <p className="muted">لا توجد دفعات مسجلة.</p>
            )}
          </div>
          {voidCharge && (
            <Modal
              title="إلغاء بند من الحساب"
              subtitle={voidCharge.label}
              close={() => setVoid(null)}
            >
              <ActionForm
                action="voidCharge"
                fields={[{ name: 'reason', label: 'سبب الإلغاء', type: 'textarea', wide: true }]}
                build={(v) => ({
                  stayId: id,
                  version: patient.version,
                  chargeId: voidCharge.id,
                  ...v,
                })}
                onSuccess={done}
                label="تأكيد الإلغاء وإعادة الكمية"
                note="تُعاد المواد المصروفة إلى المخزون؛ تأكد من استلامها فعليًا قبل التأكيد."
              />
            </Modal>
          )}
        </>
      )}
    </>
  );
  return checkout ? (
    <div className="checkout-page">
      <div className="section-heading no-print">
        <div>
          <span className="eyebrow">الصندوق</span>
          <h1>الدفع ومغادرة المريض</h1>
        </div>
        <Link href="/" className="button">
          <Icon name="back" />
          العودة للمرضى
        </Link>
      </div>
      <div className="surface checkout-surface">{content}</div>
    </div>
  ) : (
    <Modal title="ملف الإقامة" wide close={close}>
      {content}
    </Modal>
  );
}
