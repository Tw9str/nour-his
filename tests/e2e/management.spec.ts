import { test, expect } from '@playwright/test';
import { testPassword } from '../constants';

test('manager tab manages staff, services and the department/ward/bed hierarchy', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'مدير', exact: true }).click();
  await page.getByRole('button', { name: 'الإدارة', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'الإدارة', exact: true })).toBeVisible();
  const manage = page.locator('.manage-surface');
  await expect(manage.getByRole('button', { name: 'الموظفون', exact: true })).toBeVisible();
  await manage.getByLabel('اسم الموظف', { exact: true }).first().fill('موظف إدارة جديد');
  await manage.getByLabel('اسم المستخدم', { exact: true }).fill('managed.staff');
  await manage.getByLabel('الدور', { exact: true }).first().selectOption('nurse');
  await manage.getByLabel('كلمة مرور مؤقتة').fill(testPassword);
  await manage.getByRole('button', { name: 'إنشاء حساب', exact: true }).click();
  const staff = manage
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: 'موظف إدارة جديد' }) });
  await staff.locator('summary').click();
  await staff.getByLabel('اسم الموظف', { exact: true }).fill('موظف إدارة محدث');
  await staff.getByRole('button', { name: 'حفظ بيانات الموظف' }).click();
  await expect(manage.locator('summary', { hasText: 'موظف إدارة محدث' })).toBeVisible();
  await manage.getByRole('button', { name: 'الخدمات', exact: true }).click();
  await manage.getByLabel('اسم الخدمة', { exact: true }).first().fill('خدمة إدارية تجريبية');
  await manage.getByLabel('السعر · ل.س', { exact: true }).fill('150');
  await manage.getByRole('button', { name: 'إضافة خدمة', exact: true }).click();
  await expect(manage.locator('summary', { hasText: 'خدمة إدارية تجريبية' })).toBeVisible();
  await manage.getByRole('button', { name: 'الأقسام', exact: true }).click();
  await manage.getByLabel('اسم القسم', { exact: true }).first().fill('قسم الطوارئ');
  await manage.getByRole('button', { name: 'إضافة قسم', exact: true }).click();
  await expect(manage.locator('summary', { hasText: 'قسم الطوارئ' })).toBeVisible();
  await manage.getByRole('button', { name: 'الأجنحة', exact: true }).click();
  await manage.getByLabel('القسم', { exact: true }).first().selectOption('قسم الطوارئ');
  await manage.getByLabel('اسم الجناح', { exact: true }).first().fill('جناح المراقبة');
  await manage.getByRole('button', { name: 'إضافة جناح', exact: true }).click();
  await expect(manage.locator('summary', { hasText: 'جناح المراقبة' })).toBeVisible();
  await manage.getByRole('button', { name: 'الأسرة', exact: true }).click();
  await manage.getByLabel('القسم', { exact: true }).first().selectOption('قسم الطوارئ');
  await manage.getByLabel('الجناح', { exact: true }).first().selectOption('جناح المراقبة');
  await manage.getByLabel('اسم أو رقم السرير', { exact: true }).first().fill('E01');
  await manage.getByRole('button', { name: 'إضافة السرير', exact: true }).click();
  await expect(manage.locator('summary', { hasText: 'E01' })).toBeVisible();
  await page.screenshot({ path: 'test-results/manage-beds.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'المرضى', exact: true }).click();
  await page.getByRole('button', { name: 'تسجيل مريض', exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'E01 · قسم الطوارئ · جناح المراقبة' }),
  ).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'إغلاق', exact: true }).click();
  await page.getByRole('button', { name: 'الإدارة', exact: true }).click();
  const remove = async (label: string, cancel = false) => {
    await manage.getByRole('button', { name: label, exact: true }).click();
    const modal = page.getByRole('dialog');
    await expect(
      modal.getByRole('button', { name: 'تأكيد الحذف', exact: true }),
    ).toBeVisible();
    await modal
      .getByRole('button', { name: cancel ? 'إلغاء' : 'تأكيد الحذف', exact: true })
      .click();
    await expect(modal).toHaveCount(0);
  };
  await remove('حذف الموظف موظف إدارة محدث', true);
  await expect(manage.locator('summary', { hasText: 'موظف إدارة محدث' })).toBeVisible();
  await remove('حذف الموظف موظف إدارة محدث');
  await expect(manage.locator('summary', { hasText: 'موظف إدارة محدث' })).toHaveCount(0);
  await manage.getByRole('button', { name: 'الخدمات', exact: true }).click();
  await remove('حذف الخدمة خدمة إدارية تجريبية');
  await expect(manage.locator('summary', { hasText: 'خدمة إدارية تجريبية' })).toHaveCount(0);
  await manage.getByRole('button', { name: 'الأقسام', exact: true }).click();
  await manage.getByRole('button', { name: 'حذف القسم قسم الطوارئ', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'تأكيد الحذف', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('يحتوي على أجنحة');
  await page.getByRole('dialog').getByRole('button', { name: 'إلغاء', exact: true }).click();
  await manage.getByRole('button', { name: 'الأسرة', exact: true }).click();
  await page.screenshot({ path: 'test-results/manage-delete.png', fullPage: true });
  await remove('حذف السرير قسم الطوارئ · جناح المراقبة · E01');
  await expect(manage.locator('summary', { hasText: 'E01' })).toHaveCount(0);
  await manage.getByRole('button', { name: 'الأجنحة', exact: true }).click();
  await remove('حذف الجناح قسم الطوارئ · جناح المراقبة');
  await expect(manage.locator('summary', { hasText: 'جناح المراقبة' })).toHaveCount(0);
  await manage.getByRole('button', { name: 'الأقسام', exact: true }).click();
  await remove('حذف القسم قسم الطوارئ');
  await expect(manage.locator('summary', { hasText: 'قسم الطوارئ' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});
