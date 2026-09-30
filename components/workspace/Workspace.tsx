'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Login } from '@/components/auth/Login';
import { SecuritySetup } from '@/components/auth/SecuritySetup';
import { Icon } from '@/components/shared/Icons';
import { Modal } from '@/components/shared/Modal';
import { ActionForm } from '@/components/shared/ActionForm';
import { PatientsPage } from '@/components/patients/PatientsPage';
import { PatientPanel } from '@/components/patients/PatientPanel';
import { AdmissionForm } from '@/components/patients/AdmissionForm';
import { InventoryPage } from '@/components/inventory/InventoryPage';
import { ItemForm, StockForm, StockHistory } from '@/components/inventory/InventoryForms';
import { BillsPage } from '@/components/billing/BillsPage';
import { FacilitySettings } from '@/components/settings/FacilitySettings';
import { roles, categories, canBill, canCare, type Item, type Expense } from '@/shared/types';
type Dialog =
  | { kind: 'admit' | 'expense' | 'password' }
  | { kind: 'patient'; id: string }
  | { kind: 'item'; item?: Item }
  | { kind: 'stock' | 'history' | 'archive'; item: Item }
  | { kind: 'voidExpense'; expense: Expense };
export function Workspace({ checkoutId }: { checkoutId?: string }) {
  const router = useRouter();
  const w = useWorkspace();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const data = w.snapshot;
  if (w.loading)
    return (
      <main className="boot">
        <div className="brand-mark">
          <Icon name="heart" size={36} />
        </div>
        <h1>نور</h1>
        <p>جارٍ الاتصال بخادم المنشأة…</p>
        <span className="spinner" />
      </main>
    );
  if (w.setup) return <SecuritySetup actor={w.setup} refresh={() => void w.refresh()} />;
  if (!data)
    return (
      <>
        {w.error && (
          <div className="global-error" role="alert">
            {w.error}
            <button onClick={() => void w.refresh()}>إعادة المحاولة</button>
          </div>
        )}
        <Login testLoginEnabled={w.testLoginEnabled} refresh={() => void w.refresh()} />
      </>
    );
  const done = () => {
    setDialog(null);
    void w.refresh();
  };
  const tab =
    data.actor.role === 'inventory'
      ? 'inventory'
      : (w.tab === 'bills' && !canBill(data.actor)) ||
          (w.tab === 'manage' && data.actor.role !== 'admin')
        ? 'patients'
        : w.tab;
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        تجاوز إلى المحتوى
      </a>
      <header className="app-header no-print">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="heart" size={28} />
          </span>
          <div>
            <strong>نور</strong>
            <small>نظام إدارة المنشأة</small>
          </div>
        </div>
        <nav className="main-tabs" aria-label="التنقل الرئيسي">
          {(
            [
              'patients',
              'bills',
              'inventory',
              ...(data.actor.role === 'admin' ? ['manage' as const] : []),
            ] as const
          ).map((t) => (
            <button
              key={t}
              disabled={
                (t === 'patients' && !canCare(data.actor) && !canBill(data.actor)) ||
                (t === 'bills' && !canBill(data.actor))
              }
              className={tab === t && !checkoutId ? 'active' : ''}
              onClick={() => {
                w.setTab(t);
                if (checkoutId) {
                  router.push('/');
                  return;
                }
              }}
            >
              <Icon name={t === 'manage' ? 'settings' : t} />
              <span>
                {t === 'patients'
                  ? 'المرضى'
                  : t === 'bills'
                    ? 'الفواتير'
                    : t === 'manage'
                      ? 'الإدارة'
                      : 'المخزون'}
              </span>
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <span
            className={`connection ${w.connected ? 'online' : ''}`}
            title={
              w.connected
                ? 'تحديثات مباشرة من الخادم'
                : 'جارٍ إعادة الاتصال؛ قد تكون البيانات غير محدثة'
            }
          >
            <i />
            {w.connected ? 'متصل مباشر' : 'إعادة الاتصال'}
          </span>
          <details className="account-menu">
            <summary>
              <span className="avatar small">{data.actor.name[0]}</span>
              <span>
                {data.actor.name}
                <small>{roles[data.actor.role]}</small>
              </span>
            </summary>
            <div className="account-dropdown">
              <button onClick={() => setDialog({ kind: 'password' })}>
                <Icon name="shield" size={17} />
                تغيير كلمة المرور
              </button>
              <button onClick={() => void w.logout()}>
                <Icon name="logout" size={17} />
                تسجيل الخروج
              </button>
            </div>
          </details>
        </div>
      </header>
      <main id="main" className="main-content">
        {w.error && (
          <div className="feedback error" role="alert">
            <Icon name="alert" />
            {w.error}
            <button className="button" onClick={() => void w.refresh()}>
              إعادة المحاولة
            </button>
          </div>
        )}
        {!w.connected && (
          <div className="connection-note no-print">
            التحديث المباشر غير متصل. تحقق من الشبكة قبل الاعتماد على الأرقام المعروضة.
          </div>
        )}
        {checkoutId ? (
          <PatientPanel
            id={checkoutId}
            data={data}
            close={() => {}}
            refresh={() => void w.refresh()}
            checkout
          />
        ) : (
          <>
            <div className="workspace-top">
              <span>
                <Icon name="building" size={16} />
                مستشفى نور <span className="crumb">/</span> مساحة العمل
              </span>
              <span>
                {new Intl.DateTimeFormat('ar-SY-u-nu-latn', {
                  dateStyle: 'full',
                  timeZone: 'Asia/Damascus',
                }).format(new Date())}
              </span>
            </div>
            {tab !== 'manage' && (
              <div className="workspace-toolbar">
                <div className="search-box">
                  <Icon name="search" size={19} />
                  <input
                    aria-label="بحث"
                    value={w.search}
                    onChange={(e) => w.setSearch(e.target.value)}
                    placeholder={
                      tab === 'patients'
                        ? 'ابحث باسم المريض…'
                        : tab === 'inventory'
                          ? 'ابحث باسم المادة أو رمزها…'
                          : 'ابحث عن مصروف…'
                    }
                  />
                  {w.search && (
                    <button
                      className="icon-button"
                      aria-label="مسح البحث"
                      onClick={() => w.setSearch('')}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
                {tab === 'patients' && (
                  <div className="segmented">
                    {[
                      { id: 'open', name: 'المقيمون' },
                      { id: 'closed', name: 'المغادرون' },
                      { id: 'all', name: 'الكل' },
                    ].map((s) => (
                      <button
                        key={s.id}
                        className={w.status === s.id ? 'active' : ''}
                        onClick={() => w.setStatus(s.id)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  className="icon-button"
                  aria-label="تحديث البيانات"
                  onClick={() => void w.refresh()}
                >
                  <Icon name="refresh" size={18} />
                </button>
              </div>
            )}
            {tab === 'manage' && data.actor.role === 'admin' ? (
              <>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">إدارة المنشأة</span>
                    <h1>الإدارة</h1>
                    <p>إدارة الموظفين والخدمات والأسرة والأقسام والأجنحة.</p>
                  </div>
                  <button className="button" onClick={() => void w.refresh()}>
                    <Icon name="refresh" />
                    تحديث البيانات
                  </button>
                </div>
                <section className="surface manage-surface">
                  <FacilitySettings data={data} done={() => void w.refresh()} />
                </section>
              </>
            ) : tab === 'patients' ? (
              <PatientsPage
                data={data}
                open={(id) => setDialog({ kind: 'patient', id })}
                admit={() => setDialog({ kind: 'admit' })}
              />
            ) : tab === 'inventory' ? (
              <InventoryPage
                data={data}
                edit={(item) => setDialog({ kind: 'item', item })}
                stock={(item) => setDialog({ kind: 'stock', item })}
                history={(item) => setDialog({ kind: 'history', item })}
              />
            ) : (
              <BillsPage
                data={data}
                add={() => setDialog({ kind: 'expense' })}
                voidExpense={(expense) => setDialog({ kind: 'voidExpense', expense })}
              />
            )}
            {tab !== 'manage' && (
              <div className="pagination">
                <span>
                  صفحة {data.page} من {data.pages}
                </span>
                <button
                  className="icon-button"
                  aria-label="الصفحة السابقة"
                  disabled={w.page <= 1}
                  onClick={() => w.setPage(w.page - 1)}
                >
                  <Icon name="right" />
                </button>
                <button
                  className="icon-button"
                  aria-label="الصفحة التالية"
                  disabled={w.page >= data.pages}
                  onClick={() => w.setPage(w.page + 1)}
                >
                  <Icon name="left" />
                </button>
              </div>
            )}
          </>
        )}
        <footer className="app-footer">
          <span>نور · رعاية أقرب، إدارة أبسط</span>
          <span>
            <Icon name="shield" size={14} />
            خادم محلي · صلاحيات حسب الدور
          </span>
        </footer>
      </main>
      {dialog?.kind === 'patient' && (
        <PatientPanel
          id={dialog.id}
          data={data}
          close={() => setDialog(null)}
          refresh={() => void w.refresh()}
        />
      )}
      {dialog && dialog.kind !== 'patient' && (
        <Modal
          title={
            dialog.kind === 'admit'
              ? 'استقبال مريض جديد'
              : dialog.kind === 'expense'
                ? 'تسجيل مصروف'
                : dialog.kind === 'item'
                  ? dialog.item
                    ? 'تعديل المادة'
                    : 'إضافة مادة جديدة'
                  : dialog.kind === 'stock'
                    ? 'حركة مخزون'
                    : dialog.kind === 'history'
                      ? 'سجل حركات المادة'
                      : dialog.kind === 'archive'
                        ? 'أرشفة مادة'
                        : dialog.kind === 'password'
                          ? 'تغيير كلمة المرور'
                          : 'إلغاء مصروف'
          }
          close={() => setDialog(null)}
        >
          {dialog.kind === 'admit' && <AdmissionForm beds={data.beds} onDone={done} />}
          {dialog.kind === 'item' && <ItemForm item={dialog.item} done={done} />}
          {dialog.kind === 'stock' && (
            <>
              <h3>{dialog.item.name}</h3>
              <StockForm item={dialog.item} done={done} />
              {dialog.item.quantity === 0 && (
                <button
                  className="button danger spaced"
                  onClick={() => setDialog({ kind: 'archive', item: dialog.item })}
                >
                  <Icon name="archive" />
                  أرشفة المادة الفارغة
                </button>
              )}
            </>
          )}
          {dialog.kind === 'history' && <StockHistory item={dialog.item} />}
          {dialog.kind === 'archive' && (
            <ActionForm
              action="archiveItem"
              fields={[{ name: 'reason', label: 'سبب الأرشفة', wide: true }]}
              build={(v) => ({ itemId: dialog.item.id, version: dialog.item.version, ...v })}
              onSuccess={done}
              label="تأكيد الأرشفة"
              note="تُحفظ الحركات والفواتير السابقة ولا تُحذف."
            />
          )}
          {dialog.kind === 'expense' && (
            <ActionForm
              action="expense"
              initial={{ date: new Date().toISOString().slice(0, 10), category: 'supplies' }}
              fields={[
                { name: 'title', label: 'وصف المصروف', wide: true },
                {
                  name: 'category',
                  label: 'التصنيف',
                  type: 'select',
                  options: Object.entries(categories).map(([value, label]) => ({
                    value,
                    label,
                  })),
                },
                { name: 'amount', label: 'المبلغ · ل.س', type: 'number' },
                { name: 'date', label: 'تاريخ المصروف', type: 'date' },
                {
                  name: 'note',
                  label: 'ملاحظة أو مرجع الفاتورة',
                  type: 'textarea',
                  optional: true,
                  wide: true,
                },
              ]}
              onSuccess={done}
              label="تسجيل المصروف"
            />
          )}
          {dialog.kind === 'voidExpense' && (
            <>
              <h3>{dialog.expense.title}</h3>
              <ActionForm
                action="voidExpense"
                fields={[
                  { name: 'reason', label: 'سبب الإلغاء', type: 'textarea', wide: true },
                ]}
                build={(v) => ({ expenseId: dialog.expense.id, ...v })}
                onSuccess={done}
                label="تأكيد إلغاء المصروف"
                note="يبقى السجل محفوظًا للتدقيق."
              />
            </>
          )}
          {dialog.kind === 'password' && (
            <ActionForm
              action="password"
              fields={[
                { name: 'currentPassword', label: 'كلمة المرور الحالية', type: 'password' },
                {
                  name: 'newPassword',
                  label: 'كلمة المرور الجديدة',
                  type: 'password',
                  hint: '12 محرفًا على الأقل',
                },
                { name: 'confirmation', label: 'تأكيد كلمة المرور', type: 'password' },
              ]}
              onSuccess={done}
              label="تغيير وإلغاء جميع الجلسات"
            />
          )}
        </Modal>
      )}
    </div>
  );
}
