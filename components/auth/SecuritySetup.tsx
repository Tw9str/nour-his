'use client';
import { ActionForm } from '@/components/shared/ActionForm';
import { Icon } from '@/components/shared/Icons';
import type { Actor } from '@/shared/types';
export function SecuritySetup({ actor, refresh }: { actor: Actor; refresh: () => void }) {
  return (
    <main className="setup-page">
      <div className="setup-card">
        <div className="empty-icon">
          <Icon name="shield" size={30} />
        </div>
        <h1>عيّن كلمة مرور شخصية</h1>
        <p className="muted">
          مرحبًا {actor.name}، أكمل هذه الخطوة قبل الوصول إلى بيانات المنشأة.
        </p>
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
          onSuccess={refresh}
          label="حفظ والعودة لتسجيل الدخول"
        />
      </div>
    </main>
  );
}
