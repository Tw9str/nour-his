'use client';
import { useState } from 'react';
import { ActionForm, type Field } from '@/components/shared/ActionForm';
import { roles, currency, decimal, type Snapshot } from '@/shared/types';
import { Icon } from '@/components/shared/Icons';
import { ManagementRecord, DeleteManagementModal, type Removal } from './ManagementRecord';
export function FacilitySettings({ data, done }: { data: Snapshot; done: () => void }) {
  const [section, setSection] = useState('users');
  const [removing, setRemoving] = useState<Removal | null>(null);
  const departmentOptions = data.departments.map((d) => ({ value: d.name, label: d.name }));
  const bedFields: Field[] = [
    {
      name: 'department',
      label: 'القسم',
      type: 'select',
      options: departmentOptions,
      reset: ['ward'],
    },
    {
      name: 'ward',
      label: 'الجناح',
      type: 'select',
      options: (v) =>
        data.wards
          .filter((w) => w.departmentName === v.department)
          .map((w) => ({ value: w.name, label: w.name })),
    },
    { name: 'name', label: 'اسم أو رقم السرير' },
  ];
  const wardFields: Field[] = [
    { name: 'departmentName', label: 'القسم', type: 'select', options: departmentOptions },
    { name: 'name', label: 'اسم الجناح' },
  ];
  return (
    <>
      <div className="segmented settings-tabs">
        {[
          { id: 'users', name: 'الموظفون' },
          { id: 'services', name: 'الخدمات' },
          { id: 'beds', name: 'الأسرة' },
          { id: 'departments', name: 'الأقسام' },
          { id: 'wards', name: 'الأجنحة' },
          { id: 'audit', name: 'التدقيق' },
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={s.id === section}
            className={s.id === section ? 'active' : ''}
            onClick={() => setSection(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <h2 className="management-title">
        {section === 'users'
          ? 'إدارة الموظفين'
          : section === 'services'
            ? 'إدارة الخدمات'
            : section === 'beds'
              ? 'إدارة الأسرة'
              : section === 'departments'
                ? 'إدارة الأقسام'
                : section === 'wards'
                  ? 'إدارة الأجنحة'
                  : 'سجل التدقيق'}
      </h2>
      {section === 'departments' && (
        <>
          <ActionForm
            action="department"
            fields={[{ name: 'name', label: 'اسم القسم' }]}
            label="إضافة قسم"
            onSuccess={done}
          />
          {data.departments.map((d) => (
            <ManagementRecord
              key={d.id}
              target={{ kind: 'department', id: d.id, name: d.name, version: d.version }}
              onRemove={setRemoving}
              heading={
                <>
                  {d.name}
                  <span className="badge gray">
                    {data.wards.filter((w) => w.departmentName === d.name).length} أجنحة
                  </span>
                </>
              }
            >
              <ActionForm
                key={d.version}
                action="department"
                initial={{ name: d.name }}
                fields={[{ name: 'name', label: 'اسم القسم' }]}
                build={(v) => ({ ...v, id: d.id, version: d.version })}
                label="حفظ القسم"
                onSuccess={done}
              />
            </ManagementRecord>
          ))}
          {!data.departments.length && (
            <p className="muted">لا توجد أقسام بعد. أضف قسمًا ثم أضف أجنحته.</p>
          )}
        </>
      )}
      {section === 'wards' && (
        <>
          <ActionForm action="ward" fields={wardFields} label="إضافة جناح" onSuccess={done} />
          {!data.departments.length && (
            <p className="muted">أضف قسمًا من تبويب الأقسام أولًا.</p>
          )}
          {data.wards.map((w) => (
            <ManagementRecord
              key={w.id}
              target={{
                kind: 'ward',
                id: w.id,
                name: `${w.departmentName} · ${w.name}`,
                version: w.version,
              }}
              onRemove={setRemoving}
              heading={
                <>
                  {w.departmentName} · {w.name}
                  <span className="badge gray">
                    {
                      data.beds.filter(
                        (b) => b.department === w.departmentName && b.ward === w.name,
                      ).length
                    }{' '}
                    أسرّة
                  </span>
                </>
              }
            >
              <ActionForm
                key={w.version}
                action="ward"
                initial={{ name: w.name, departmentName: w.departmentName }}
                fields={wardFields}
                build={(v) => ({ ...v, id: w.id, version: w.version })}
                label="حفظ الجناح"
                onSuccess={done}
              />
            </ManagementRecord>
          ))}
          {!data.wards.length && <p className="muted">لا توجد أجنحة بعد.</p>}
        </>
      )}
      {section === 'beds' && (
        <>
          <p className="muted">اختر القسم والجناح وأضف السرير. سيظهر فورًا في نموذج القبول.</p>
          <ActionForm action="bed" fields={bedFields} onSuccess={done} label="إضافة السرير" />
          {!data.wards.length && <p className="muted">أضف قسمًا وجناحًا قبل إضافة الأسرة.</p>}
          {data.beds.map((b) => (
            <ManagementRecord
              key={b.id}
              target={{
                kind: 'bed',
                id: b.id,
                name: `${b.department} · ${b.ward} · ${b.name}`,
                version: b.version,
              }}
              onRemove={setRemoving}
              heading={
                <>
                  <Icon name="bed" size={17} />
                  {b.department} · {b.ward} · {b.name}
                  <span className={`badge ${b.occupied ? 'gray' : 'green'}`}>
                    {b.occupied ? 'مشغول' : 'متاح'}
                  </span>
                </>
              }
            >
              <ActionForm
                key={b.version}
                action="bed"
                initial={{ name: b.name, department: b.department, ward: b.ward }}
                fields={bedFields}
                build={(v) => ({ ...v, id: b.id, version: b.version })}
                label="حفظ السرير"
                onSuccess={done}
              />
            </ManagementRecord>
          ))}
        </>
      )}
      {section === 'services' && (
        <>
          <ActionForm
            action="service"
            fields={[
              { name: 'name', label: 'اسم الخدمة' },
              { name: 'price', label: 'السعر · ل.س', type: 'number' },
            ]}
            label="إضافة خدمة"
            onSuccess={done}
          />
          {data.services.map((s) => (
            <ManagementRecord
              key={s.id}
              target={{ kind: 'service', id: s.id, name: s.name, version: s.version }}
              onRemove={setRemoving}
              heading={
                <>
                  {s.name}
                  <strong>{currency(s.price)}</strong>
                </>
              }
            >
              <ActionForm
                action="service"
                initial={{ name: s.name, price: decimal(s.price) }}
                fields={[
                  { name: 'name', label: 'اسم الخدمة' },
                  { name: 'price', label: 'السعر الجديد · ل.س', type: 'number' },
                ]}
                build={(v) => ({ ...v, id: s.id, version: s.version })}
                onSuccess={done}
              />
            </ManagementRecord>
          ))}
        </>
      )}
      {section === 'users' && (
        <>
          <p className="muted">
            الحساب فردي. سيُطلب من الموظف تغيير كلمة المرور المؤقتة عند أول دخول.
          </p>
          <ActionForm
            action="user"
            fields={[
              { name: 'name', label: 'اسم الموظف', wide: true },
              { name: 'username', label: 'اسم المستخدم', dir: 'ltr' },
              {
                name: 'email',
                label: 'البريد الإلكتروني',
                type: 'email',
                optional: true,
                dir: 'ltr',
              },
              {
                name: 'role',
                label: 'الدور',
                type: 'select',
                options: Object.entries(roles).map(([value, label]) => ({ value, label })),
              },
              {
                name: 'password',
                label: 'كلمة مرور مؤقتة',
                type: 'password',
                hint: '12 محرفًا على الأقل؛ سلّمها مباشرة للموظف',
              },
            ]}
            onSuccess={done}
            label="إنشاء حساب"
          />
          {data.users.map((u) => (
            <ManagementRecord
              key={u.id}
              target={{ kind: 'user', id: u.id, name: u.name, version: u.version }}
              onRemove={setRemoving}
              protectedReason={
                u.id === data.actor.id ? 'لا يمكنك حذف حسابك الحالي' : undefined
              }
              heading={
                <>
                  {u.name}
                  <span className="badge gray">{roles[u.role]}</span>
                </>
              }
            >
              {u.id !== data.actor.id ? (
                <ActionForm
                  key={u.version}
                  action="updateUser"
                  initial={{ name: u.name, email: u.email, role: u.role }}
                  fields={[
                    { name: 'name', label: 'اسم الموظف' },
                    {
                      name: 'email',
                      label: 'البريد الإلكتروني',
                      type: 'email',
                      optional: true,
                      dir: 'ltr',
                    },
                    {
                      name: 'role',
                      label: 'الدور',
                      type: 'select',
                      options: Object.entries(roles)
                        .filter(
                          ([value]) => !u.username.startsWith('__test_') || value === u.role,
                        )
                        .map(([value, label]) => ({ value, label })),
                    },
                  ]}
                  build={(v) => ({ ...v, userId: u.id, version: u.version })}
                  label="حفظ بيانات الموظف"
                  onSuccess={done}
                />
              ) : null}
              {u.id !== data.actor.id ? (
                <ActionForm
                  action="disableUser"
                  fields={[
                    { name: 'currentPassword', label: 'كلمة مرور المدير', type: 'password' },
                    { name: 'reason', label: 'سبب التعطيل', wide: true },
                  ]}
                  build={(v) => ({ ...v, userId: u.id })}
                  onSuccess={done}
                  label="تعطيل الحساب وإلغاء جلساته"
                />
              ) : (
                <p>هذا حسابك الحالي.</p>
              )}
            </ManagementRecord>
          ))}
        </>
      )}
      {section === 'audit' && (
        <>
          <p className="muted">
            آخر 30 حدثًا. لا تُعرض محتويات الملفات الطبية في سجل إدارة النظام.
          </p>
          {data.audit.map((a) => (
            <div className="compact-row" key={a.id}>
              <Icon name="shield" size={17} />
              <span>{auditLabel(a.action)}</span>
              <small>{new Date(a.at).toLocaleString('ar-SY-u-nu-latn')}</small>
            </div>
          ))}
        </>
      )}
      {removing && (
        <DeleteManagementModal
          target={removing}
          requirePassword={
            removing.kind === 'user' && !data.actor.username.startsWith('__test_')
          }
          close={() => setRemoving(null)}
          done={() => {
            setRemoving(null);
            done();
          }}
        />
      )}
    </>
  );
}
function auditLabel(action: string) {
  const labels: Record<string, string> = {
    initialized: 'تهيئة المنشأة',
    accountRecovery: 'استعادة حساب محليًا',
    readmissionReason: 'توثيق إعادة قبول مريض',
    login: 'تسجيل دخول',
    logout: 'تسجيل خروج',
    readWorkspace: 'عرض مساحة العمل',
    readPatient: 'قراءة ملف مريض',
    readStock: 'قراءة حركة المخزون',
    admit: 'قبول مريض',
    transfer: 'نقل مريض',
    transferReason: 'توثيق سبب النقل',
    addCharge: 'إضافة بند للمريض',
    voidCharge: 'إلغاء بند',
    checkout: 'تحصيل دفعة أو إنهاء إقامة',
    item: 'حفظ مادة',
    stock: 'حركة مخزون',
    archiveItem: 'أرشفة مادة',
    expense: 'تسجيل مصروف',
    voidExpense: 'إلغاء مصروف',
    bed: 'إضافة سرير',
    department: 'حفظ قسم',
    ward: 'حفظ جناح',
    service: 'حفظ خدمة',
    user: 'إنشاء موظف',
    updateUser: 'تحديث بيانات موظف',
    disableUser: 'تعطيل موظف',
    password: 'تغيير كلمة المرور',
    deleteDepartment: 'حذف قسم',
    deleteWard: 'حذف جناح',
    deleteBed: 'حذف سرير',
    deleteService: 'حذف خدمة',
    deleteUser: 'حذف موظف',
  };
  return labels[action] || 'عملية إدارية مسجلة';
}
