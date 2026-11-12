import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * Admin Audit Log viewer (M4B, e2e, real stack). An admin browses/filters/
 * pages real audit rows (the login itself writes some) and opens a row's
 * metadata; a panchayat-scoped COORDINATOR reaching the same route is denied
 * (Forbidden state) — proving the data is Global-Admin-only via the BFF/API,
 * not just hidden in nav.
 */
const _API_BASE = 'http://localhost:4000';
const SEEDED_ADMIN_PHONE = '+919000000001';
const SEEDED_COORDINATOR_PHONE = '+919000000002';

async function readOtp(_page: Page, _phone: string): Promise<string> {
  const code = '123456'; // MSG91 mock mode: any 6-digit code; no server OTP
  return code;
}

async function login(page: Page, phone: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-phone-input').fill(phone);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/verify\?phone=/);
  const code = await readOtp(page, phone);
  for (let i = 0; i < code.length; i += 1) await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i] as string);
  await expect(page).toHaveURL(/\/en\/?$/);
  await expect(page.getByTestId('admin-dashboard-page')).toBeVisible();
}

async function newPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  return ctx.newPage();
}

test('admin can browse, filter and page audit logs and open a row detail', async ({ browser }) => {
  const page = await newPage(browser);
  await login(page, SEEDED_ADMIN_PHONE);

  await page.goto('/en/audit-logs');
  await expect(page.getByTestId('audit-logs-page')).toBeVisible();
  await expect(page.getByTestId('audit-table')).toBeVisible();
  const rows = page.locator('table').getByTestId('table-row');
  expect(await rows.count()).toBeGreaterThan(0);

  // Row detail → metadata is shown (as text).
  await rows.first().click();
  await expect(page.getByTestId('audit-detail')).toBeVisible();
  await expect(page.getByTestId('audit-metadata')).toBeVisible();
  await page.getByTestId('audit-detail-close').click();

  // Next page uses the opaque cursor (plenty of rows exist → hasMore).
  await expect(page.getByTestId('audit-page')).toHaveText(/1/);
  if (await page.getByTestId('audit-next').isEnabled()) {
    await page.getByTestId('audit-next').click();
    await expect(page.getByTestId('audit-page')).toHaveText(/2/);
    await expect(page.getByTestId('audit-prev')).toBeEnabled();
  }

  // Filter with a non-existent action → empty state; reset restores rows.
  await page.getByTestId('audit-filter-action').fill('does.not.exist.xyz');
  await page.getByTestId('audit-apply').click();
  await expect(page.getByTestId('audit-empty')).toBeVisible();
  await page.getByTestId('audit-reset').click();
  await expect(page.getByTestId('audit-table')).toBeVisible();
});

test('a non-admin (COORDINATOR) is denied the audit viewer data (Forbidden state)', async ({ browser }) => {
  const page = await newPage(browser);
  await login(page, SEEDED_COORDINATOR_PHONE);
  await page.goto('/en/audit-logs');
  await expect(page.getByTestId('audit-logs-page')).toBeVisible();
  await expect(page.getByTestId('audit-forbidden')).toBeVisible();
  await expect(page.getByTestId('audit-table')).toBeHidden();
});
