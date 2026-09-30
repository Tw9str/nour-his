import { test, expect } from '@playwright/test';
import { testPassword } from '../constants';

for (const [role, label, heading] of [
  ['admin', 'مدير', 'المرضى والإقامة'],
  ['inventory', 'أمين مستودع', 'المخزون والمستلزمات'],
  ['billing', 'محاسب', 'المرضى والإقامة'],
  ['nurse', 'مسعف', 'المرضى والإقامة'],
]) {
  test(`test shortcut signs in immediately as ${role}`, async ({ page }) => {
    await page.goto('/');
    const shortcuts = page.getByRole('region', { name: 'دخول تجريبي سريع' });
    await expect(shortcuts.getByRole('button')).toHaveCount(4);
    await expect(page.getByLabel('اسم المستخدم')).toHaveValue('');
    await expect(page.getByLabel('كلمة المرور', { exact: true })).toHaveValue('');
    if (role === 'admin') {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: 'test-results/login-test-shortcuts.png', fullPage: true });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
    }
    await shortcuts.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByRole('button', { name: 'الإدارة', exact: true })).toHaveCount(
      role === 'admin' ? 1 : 0,
    );
    const response = await page.request.get('/api/app');
    const data = await response.json();
    expect(data.actor.role).toBe(role);
    expect(data.actor.username).toBe(`__test_${role}`);
    expect(data.setup).toBeUndefined();
  });
}

test('ordinary login uses the account role without selecting a shortcut', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('اسم المستخدم').fill('nurse');
  await page.getByLabel('كلمة المرور', { exact: true }).fill(testPassword);
  await page.getByRole('button', { name: 'دخول إلى مساحة العمل' }).click();
  await expect(page.getByRole('heading', { name: 'المرضى والإقامة' })).toBeVisible();
  const data = await (await page.request.get('/api/app')).json();
  expect(data.actor.username).toBe('nurse');
  expect(data.actor.role).toBe('nurse');
});
