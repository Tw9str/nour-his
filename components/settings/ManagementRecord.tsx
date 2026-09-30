'use client';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Icon } from '@/components/shared/Icons';
import { submit } from '@/services/api';

const actions = {
  department: 'deleteDepartment',
  ward: 'deleteWard',
  bed: 'deleteBed',
  service: 'deleteService',
  user: 'deleteUser',
} as const;
const labels = {
  department: 'القسم',
  ward: 'الجناح',
  bed: 'السرير',
  service: 'الخدمة',
  user: 'الموظف',
};
const notes = {
  department: 'يُحذف القسم نهائيًا. يجب نقل أجنحته أو حذفها أولًا.',
  ward: 'يُحذف الجناح نهائيًا. يجب نقل أسرته أو حذفها أولًا.',
  bed: 'يُحذف السرير من القائمة. لا يمكن حذف سرير مشغول، وتبقى بيانات الإقامات السابقة محفوظة.',
  service: 'تُحذف الخدمة من القائمة. تبقى بنود الفواتير السابقة وأسعارها محفوظة.',
  user: 'يُحذف حساب الموظف وتُلغى جلساته. تبقى عملياته السابقة وسجلات التدقيق محفوظة.',
};
export type Removal = {
  kind: keyof typeof actions;
  id: string;
  name: string;
  version: number;
};

export function ManagementRecord({
  target,
  heading,
  children,
  onRemove,
  protectedReason,
}: {
  target: Removal;
  heading?: ReactNode;
  children: ReactNode;
  onRemove: (target: Removal) => void;
  protectedReason?: string;
}) {
  return (
    <div className="management-record">
      <details className="service-editor">
        <summary>{heading || target.name}</summary>
        {children}
      </details>
      <button
        type="button"
        className="button danger small management-delete"
        aria-label={`حذف ${labels[target.kind]} ${target.name}`}
        title={protectedReason}
        disabled={!!protectedReason}
        onClick={() => onRemove(target)}
      >
        <Icon name="trash" size={16} />
        حذف
      </button>
    </div>
  );
}

export function DeleteManagementModal({
  target,
  requirePassword,
  close,
  done,
}: {
  target: Removal;
  requirePassword: boolean;
  close: () => void;
  done: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const passwordId = useId();
  const cancel = () => {
    if (!lock.current) close();
  };
  return (
    <Modal title={`حذف ${labels[target.kind]}`} subtitle={target.name} close={cancel}>
      <p>{notes[target.kind]}</p>
      <form
        aria-busy={busy}
        onSubmit={async (event) => {
          event.preventDefault();
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError('');
          try {
            await submit(actions[target.kind], {
              id: target.id,
              version: target.version,
              ...(target.kind === 'user' ? { currentPassword: password } : {}),
            });
            done();
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'تعذر الحذف. حاول مجددًا');
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {error && (
          <p className="feedback error" role="alert">
            {error}
          </p>
        )}
        {requirePassword && (
          <label className="field" htmlFor={passwordId}>
            <span className="field-label">كلمة مرور المدير</span>
            <input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        )}
        <div className="form-footer">
          <button type="button" className="button" disabled={busy} onClick={cancel}>
            إلغاء
          </button>
          <button type="submit" className="button danger" disabled={busy}>
            <Icon name="trash" size={17} />
            {busy ? 'جارٍ الحذف…' : 'تأكيد الحذف'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
