import { test, expect } from '@playwright/test';
test('Arabic touch workflow, inline validation, cross-device updates and checkout', async ({
  page,
  browser,
}) => {
  page.on('pageerror', (e) => console.error('Browser error:', e.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByLabel('رمز المصادقة', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'مدير', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'المرضى والإقامة' })).toBeVisible();
  const other = await browser.newContext();
  const cashier = await other.newPage();
  await cashier.goto('/');
  await cashier.getByRole('button', { name: 'محاسب', exact: true }).click();
  await expect(cashier.getByRole('heading', { name: 'المرضى والإقامة' })).toBeVisible();
  await page.getByRole('button', { name: 'تسجيل مريض', exact: true }).click();
  await page.getByRole('button', { name: 'تسجيل المريض', exact: true }).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('راجع الحقول');
  await expect(page.locator('dialog form')).toHaveAttribute('novalidate', '');
  await page.getByLabel('اسم المريض الكامل').fill('ليان اختبار');
  await page.getByLabel('رقم الهاتف').fill('0991234567');
  await page.getByLabel('تاريخ الميلاد').fill('1995-04-10');
  await page.getByLabel('الجنس', { exact: true }).selectOption('female');
  await expect(page.getByLabel('سبب إعادة قبول ملف سابق')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: '201 · الجراحة · الجناح ب' })).toBeVisible();
  await page.getByRole('radio', { name: '101 · الداخلية · الجناح أ' }).check();
  await page.getByRole('button', { name: 'تسجيل المريض', exact: true }).click();
  await expect(page.getByText('ليان اختبار', { exact: true })).toBeVisible();
  await expect(cashier.getByText('ليان اختبار', { exact: true })).toBeVisible({
    timeout: 12000,
  });
  await page.getByText('ليان اختبار', { exact: true }).click();
  await page.getByRole('button', { name: 'إضافة خدمة أو مادة' }).click();
  const serviceId = await page.getByLabel('الخدمة أو المادة').locator('option').filter({ hasText: 'معاينة طبية' }).getAttribute('value');
  await page.getByLabel('الخدمة أو المادة').selectOption(serviceId!);
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.locator('.charge-row')).toContainText('معاينة طبية');
  await page.getByRole('link', { name: 'التحصيل والمغادرة' }).click();
  await expect(page.getByRole('heading', { name: 'الدفع ومغادرة المريض' })).toBeVisible();
  await page.getByRole('button', { name: 'تأكيد التحصيل' }).click();
  await expect(page.getByRole('heading', { name: 'تمت تسوية الإقامة' })).toBeVisible();
  await expect(cashier.getByText('ليان اختبار', { exact: true })).not.toBeVisible({
    timeout: 12000,
  });
  await page.screenshot({ path: 'test-results/checkout.png', fullPage: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'تسجيل مريض', exact: true }).click();
  await page.getByLabel('اسم المريض الكامل').fill('ليان اختبار');
  await page.getByLabel('تاريخ الميلاد').fill('1995-04-10');
  await page.getByRole('radio', { name: '101 · الداخلية · الجناح أ' }).check();
  await page.getByRole('button', { name: 'تسجيل المريض', exact: true }).click();
  const readmission = page.getByRole('dialog', {
    name: 'تأكيد إعادة القبول',
    exact: true,
  });
  await expect(readmission).toBeVisible();
  await readmission.getByRole('button', { name: 'إلغاء', exact: true }).click();
  await expect(readmission).not.toBeVisible();
  await expect(page.getByLabel('اسم المريض الكامل')).toHaveValue('ليان اختبار');
  await expect(page.getByRole('radio', { name: '101 · الداخلية · الجناح أ' })).toBeChecked();
  await page.getByRole('button', { name: 'تسجيل المريض', exact: true }).click();
  await readmission.getByRole('button', { name: 'تأكيد إعادة القبول', exact: true }).click();
  await expect(readmission.getByRole('alert')).toContainText('أدخل ملاحظة');
  await readmission.getByLabel('ملاحظة إعادة القبول').fill('عودة المريض لاستكمال العلاج');
  await readmission.getByRole('button', { name: 'تأكيد إعادة القبول', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('ليان اختبار', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'المخزون', exact: true }).click();
  await page.getByRole('button', { name: 'إضافة مادة', exact: true }).click();
  await page.getByLabel('اسم المادة', { exact: true }).fill('شاش طبي معقم');
  await page.getByLabel('رمز المادة').fill('GAUZE-01');
  await page.getByLabel('سعر الوحدة').fill('250');
  await page.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(page.getByText('شاش طبي معقم', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'حركة', exact: true }).click();
  await page.getByLabel('الكمية ·').fill('20');
  await page.getByLabel('سبب الحركة').fill('فاتورة توريد المستودع');
  await page.getByRole('button', { name: 'تأكيد حركة المخزون' }).click();
  await expect(page.locator('.quantity')).toContainText('20');
  await page.screenshot({ path: 'test-results/inventory.png', fullPage: true });
  await page.getByRole('button', { name: 'الفواتير', exact: true }).click();
  await page.getByRole('button', { name: 'تسجيل مصروف', exact: true }).click();
  await page.getByLabel('وصف المصروف').fill('فاتورة شراء مستلزمات');
  await page.getByLabel('المبلغ ·').fill('1500');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'تسجيل المصروف', exact: true })
    .click();
  await expect(page.getByText('فاتورة شراء مستلزمات', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/bills.png', fullPage: true });
  await page.getByRole('button', { name: 'المرضى', exact: true }).click();
  await page.getByRole('button', { name: 'المغادرون', exact: true }).click();
  await page.screenshot({ path: 'test-results/patients.png', fullPage: true });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({ path: 'test-results/ipad.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await other.close();
});
