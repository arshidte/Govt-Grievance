import { test, expect, type Page } from '@playwright/test';

/**
 * Admin-initiated staff onboarding — full UI journey (e2e, real stack).
 *
 * Admin initiates onboarding for a NEW staff phone (REPRESENTATIVE of a
 * seeded ward) → the record stays pending and grants no role → admin enters
 * the OTP (read via the dev endpoint, the existing test mechanism) → the role
 * activates → the new representative appears in the list → the staff member
 * can sign in to the admin app (staff access). Deeper scope enforcement is
 * covered by the API e2e; here we assert the onboarding lifecycle end to end.
 */

const API_BASE = 'http://localhost:4000';
const SEEDED_ADMIN_PHONE = '+919000000001';

async function readOtp(page: Page, phone: string): Promise<string> {
  const res = await page.request.get(
    `${API_BASE}/api/v1/dev/last-otp?phone=${encodeURIComponent(phone)}`,
  );
  expect(res.ok()).toBe(true);
  const { code } = (await res.json()) as { code: string };
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

async function fillOtpCells(page: Page, code: string): Promise<void> {
  for (let i = 0; i < code.length; i += 1) {
    await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i] as string);
  }
}

async function loginViaUi(page: Page, phone: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-phone-input').fill(phone);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/verify\?phone=/);
  await fillOtpCells(page, await readOtp(page, phone));
  await expect(page).toHaveURL(/\/en\/?$/);
  await expect(page.getByTestId('admin-dashboard-page')).toBeVisible();
}

test('admin onboards a new representative via OTP; the staff member can then sign in', async ({
  browser,
}) => {
  const staffPhone = `+9199${`${Date.now()}`.slice(-8)}`;

  const adminCtx = await browser.newContext();
  const page = await adminCtx.newPage();
  await loginViaUi(page, SEEDED_ADMIN_PHONE);

  // --- Initiate onboarding (REPRESENTATIVE of a seeded ward) --------------
  await page.goto('/en/representatives');
  await page.getByTestId('onboarding-start-button').click();
  await expect(page.getByTestId('onboarding-wizard')).toBeVisible();

  await page.getByTestId('onboarding-phone-input').fill(staffPhone);
  await page.getByTestId('onboarding-search-button').click();
  // A brand-new phone → new-account notice.
  await expect(page.getByTestId('onboarding-search-result')).toBeVisible();

  // Pick the first active panchayat, then its first ward.
  await page.getByTestId('onboarding-panchayat-select').selectOption({ index: 1 });
  await page.getByTestId('onboarding-scope-checkbox').first().check();
  await page.getByTestId('onboarding-review-button').click();
  await expect(page.getByTestId('onboarding-review')).toBeVisible();
  await page.getByTestId('onboarding-initiate-submit').click();

  // --- Pending: the record shows, no representative exists yet ------------
  const pendingItem = page.getByTestId('onboarding-item').filter({ hasText: staffPhone });
  await expect(pendingItem).toHaveCount(1);
  await expect(pendingItem.getByTestId('onboarding-status')).toHaveAttribute('data-status', 'pending');
  // Pending grants no role: no representative card for this phone yet.
  await expect(page.getByTestId('representative-card').filter({ hasText: staffPhone })).toHaveCount(0);

  // --- Verify OTP (admin enters the code the staff received) --------------
  const code = await readOtp(page, staffPhone);
  await pendingItem.getByTestId('onboarding-enter-code').click();
  await expect(page.getByTestId('onboarding-otp-modal')).toBeVisible();
  await page.getByTestId('onboarding-code-input').fill(code);
  await page.getByTestId('onboarding-verify-submit').click();
  await expect(page.getByTestId('onboarding-otp-modal')).toBeHidden();

  // --- Role is now active: the new representative appears, pending clears --
  await expect(page.getByTestId('representative-card').filter({ hasText: staffPhone })).toHaveCount(1);
  await expect(page.getByTestId('onboarding-item').filter({ hasText: staffPhone })).toHaveCount(0);

  await adminCtx.close();

  // --- The onboarded staff member can sign in to the admin app -----------
  const staffCtx = await browser.newContext();
  const staffPage = await staffCtx.newPage();
  await loginViaUi(staffPage, staffPhone); // reaching the dashboard proves active staff access
  await staffCtx.close();
});
