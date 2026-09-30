'use client';
import { useRef, useState } from 'react';
import { ActionForm } from '@/components/shared/ActionForm';
import { Icon } from '@/components/shared/Icons';
import { roles, type Role } from '@/shared/types';
import { submit } from '@/services/api';
const loginRoles = Object.keys(roles) as Role[];
export function Login({
  refresh,
  testLoginEnabled = false,
}: {
  refresh: () => void;
  testLoginEnabled?: boolean;
}) {
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const testLogin = async (role: Role) => {
    if (lock.current) return;
    lock.current = true;
    setPendingRole(role);
    setError('');
    try {
      await submit('testLogin', { role });
      refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر الدخول التجريبي');
    } finally {
      lock.current = false;
      setPendingRole(null);
    }
  };
  return (
    <main className="login-layout">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="heart" size={29} />
          </span>
          <div>
            <strong>نور</strong>
            <small>رعاية أقرب. إدارة أبسط.</small>
          </div>
        </div>
        <div className="story-content">
          <span className="story-badge">
            <span className="dot" />
            منظومة محلية للمستشفى
          </span>
          <h1>
            كل التفاصيل،
            <br />
            في مكان واحد.
          </h1>
          <p>
            من استقبال المريض إلى لحظة المغادرة.
            <br />
            مساحة واضحة تمنح فريقك وقتًا أكثر للرعاية.
          </p>
          <div className="story-cards">
            <div>
              <Icon name="patients" />
              <span>المرضى</span>
            </div>
            <div>
              <Icon name="bills" />
              <span>الفواتير</span>
            </div>
            <div>
              <Icon name="inventory" />
              <span>المخزون</span>
            </div>
          </div>
        </div>
        <p className="story-foot">
          <Icon name="shield" size={17} />
          بيانات المنشأة تبقى على خادمها المحلي
        </p>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <span className="eyebrow">أهلًا بعودتك</span>
          <h2>تسجيل الدخول</h2>
          <p className="muted">استخدم حسابك الشخصي للمتابعة إلى مساحة العمل.</p>
          {testLoginEnabled && (
            <section aria-label="دخول تجريبي سريع" aria-busy={pendingRole !== null}>
              <p className="field-label">دخول تجريبي سريع</p>
              <p className="muted">اختر الدور للدخول بحساب تجريبي دون كلمة مرور.</p>
              {error && (
                <div role="alert" className="feedback error">
                  {error}
                </div>
              )}
              <div className="login-role-tabs">
                {loginRoles.map((value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={pendingRole !== null}
                    onClick={() => void testLogin(value)}
                  >
                    {pendingRole === value ? 'جارٍ الدخول…' : roles[value]}
                  </button>
                ))}
              </div>
            </section>
          )}
          <fieldset className="form-fields" disabled={pendingRole !== null}>
            <ActionForm
              action="login"
              fields={[
                {
                  name: 'username',
                  label: 'اسم المستخدم',
                  dir: 'ltr',
                  autoComplete: 'username',
                },
                {
                  name: 'password',
                  label: 'كلمة المرور',
                  type: 'password',
                  autoComplete: 'current-password',
                },
              ]}
              label="دخول إلى مساحة العمل"
              onSuccess={refresh}
            />
          </fieldset>
          <p className="login-help">لإنشاء حساب أو استعادة الدخول، تواصل مع مسؤول المنشأة.</p>
          <div className="local-note">
            <Icon name="building" size={18} />
            اتصال آمن عبر شبكة المستشفى
          </div>
        </div>
      </section>
    </main>
  );
}
