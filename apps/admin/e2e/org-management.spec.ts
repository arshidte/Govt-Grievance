import { test, expect, type Page } from '@playwright/test';

/**
 * Org-management milestone — admin UI journey (e2e, real stack).
 *
 * Covers the core Global-Admin journey end to end through the real BFF + API:
 * create a panchayat, create wards within it, assign an existing user as a
 * representative and another as a coordinator, verify the assignments render,
 * revoke an assignment (confirmed), and deactivate the panchayat. "Revoked
 * assignment no longer grants access" is proven at the authorization layer by
 * the API e2e (`apps/api/test/org-management.e2e-spec.ts`); here we assert the
 * UI reflects the revocation (the chip disappears).
 *
 * The admin app exposes no general cleanup; we create a UNIQUELY-coded
 * panchayat per run and deactivate it at the end (so it never leaks into the
 * citizen wizard's active-panchayat list), and we revoke the assignments we
 * create (soft-revoked rows grant nothing), leaving seeded staff unaffected.
 */

const _API_BASE = 'http://localhost:4000';
const SEEDED_ADMIN_PHONE = '+919000000001';
const EXISTING_USER_A = '+919000000002'; // seeded COORDINATOR user (existing account)
const EXISTING_USER_B = '+919000000003'; // seeded REPRESENTATIVE user (existing account)

async function readLastOtp(_page: Page, _phone: string): Promise<string> {
  const code = '123456'; // MSG91 mock mode: any 6-digit code; no server OTP
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

async function fillOtp(page: Page, code: string): Promise<void> {
  for (let i = 0; i < code.length; i += 1) {
    await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i] as string);
  }
}

async function loginAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await expect(page.getByTestId('admin-login-page')).toBeVisible();
  await page.getByTestId('login-phone-input').fill(SEEDED_ADMIN_PHONE);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/verify\?phone=/);
  await fillOtp(page, await readLastOtp(page, SEEDED_ADMIN_PHONE));
  await expect(page).toHaveURL(/\/en\/?$/);
  await expect(page.getByTestId('admin-dashboard-page')).toBeVisible();
}

test('admin creates a panchayat, wards, assigns + revokes staff, and deactivates', async ({
  page,
}) => {
  const ts = Date.now();
  const code = `E2E${ts}`;
  const name = `E2E Panchayat ${ts}`;

  await loginAdmin(page);

  // --- 1. Create a panchayat ---------------------------------------------
  await page.goto('/en/panchayats');
  await expect(page.getByTestId('panchayats-page')).toBeVisible();
  await page.getByTestId('panchayat-create-button').click();
  await expect(page.getByTestId('panchayat-form-modal')).toBeVisible();
  await page.getByTestId('panchayat-code-input').fill(code);
  await page.getByTestId('panchayat-name-input').fill(name);
  await page.getByTestId('panchayat-name-ml-input').fill(`${name} ml`);
  await page.getByTestId('panchayat-form-submit').click();

  // The new panchayat appears in the list (filter the table to isolate it).
  await page.getByTestId('panchayat-search').fill(code);
  const row = page.locator('table').getByTestId('table-row').filter({ hasText: code });
  await expect(row).toHaveCount(1);

  // --- 2. Create two wards within it -------------------------------------
  await row.getByTestId('panchayat-wards-link').click();
  await expect(page).toHaveURL(/\/wards\?panchayatId=/);
  await expect(page.getByTestId('wards-page')).toBeVisible();

  for (const n of [1, 2]) {
    await page.getByTestId('ward-create-button').click();
    await expect(page.getByTestId('ward-form-modal')).toBeVisible();
    await page.getByTestId('ward-number-input').fill(String(n));
    await page.getByTestId('ward-name-input').fill(`Ward ${n}`);
    await page.getByTestId('ward-name-ml-input').fill(`Ward ${n} ml`);
    await page.getByTestId('ward-form-submit').click();
    await expect(page.getByTestId('ward-form-modal')).toBeHidden();
  }
  await expect(page.locator('table').getByTestId('table-row')).toHaveCount(2);

  // --- 3. Assign a representative (existing user, by phone) ---------------
  await page.goto('/en/representatives');
  await expect(page.getByTestId('representatives-page')).toBeVisible();
  await page.getByTestId('representative-assign-button').click();
  await expect(page.getByTestId('representative-assign-modal')).toBeVisible();
  await page.getByTestId('representative-phone-input').fill(EXISTING_USER_A);
  await page.getByTestId('representative-search-button').click();
  await expect(page.getByTestId('representative-found')).toBeVisible();
  await page.getByTestId('representative-panchayat-select').selectOption({ label: `${code} — ${name}` });
  await page.getByTestId('representative-ward-select').selectOption({ label: 'Ward 1 — Ward 1' });
  await page.getByTestId('representative-assign-submit').click();
  await expect(page.getByTestId('representative-assign-modal')).toBeHidden();

  // The representative card for that user now shows the ward chip.
  const repCard = page.getByTestId('representative-card').filter({ hasText: EXISTING_USER_A });
  await expect(repCard).toHaveCount(1);
  await expect(repCard.getByTestId('representative-ward-chip').filter({ hasText: name })).toHaveCount(1);

  // --- 4. Assign a coordinator (different existing user) ------------------
  await page.goto('/en/coordinators');
  await expect(page.getByTestId('coordinators-page')).toBeVisible();
  await page.getByTestId('coordinator-assign-button').click();
  await expect(page.getByTestId('coordinator-assign-modal')).toBeVisible();
  await page.getByTestId('coordinator-phone-input').fill(EXISTING_USER_B);
  await page.getByTestId('coordinator-search-button').click();
  await expect(page.getByTestId('coordinator-found')).toBeVisible();
  await page.getByTestId('coordinator-panchayat-select').selectOption({ label: `${code} — ${name}` });
  await page.getByTestId('coordinator-assign-submit').click();
  await expect(page.getByTestId('coordinator-assign-modal')).toBeHidden();
  const coordCard = page.getByTestId('coordinator-card').filter({ hasText: EXISTING_USER_B });
  await expect(coordCard.getByTestId('coordinator-panchayat-chip').filter({ hasText: code })).toHaveCount(1);

  // --- 5. Revoke the representative assignment (confirmed) ----------------
  await page.goto('/en/representatives');
  const repCard2 = page.getByTestId('representative-card').filter({ hasText: EXISTING_USER_A });
  await repCard2.getByTestId('representative-revoke').first().click();
  await expect(page.getByTestId('representative-revoke-confirm')).toBeVisible();
  await page.getByTestId('representative-revoke-confirm-confirm').click();
  // The chip for this panchayat is gone (assignment no longer active).
  await expect(
    page
      .getByTestId('representative-card')
      .filter({ hasText: EXISTING_USER_A })
      .getByTestId('representative-ward-chip')
      .filter({ hasText: name }),
  ).toHaveCount(0);

  // --- 6. Revoke the coordinator assignment (cleanup) --------------------
  await page.goto('/en/coordinators');
  const coordCard2 = page.getByTestId('coordinator-card').filter({ hasText: EXISTING_USER_B });
  await coordCard2.getByTestId('coordinator-revoke').first().click();
  await expect(page.getByTestId('coordinator-revoke-confirm')).toBeVisible();
  await page.getByTestId('coordinator-revoke-confirm-confirm').click();
  await expect(
    page
      .getByTestId('coordinator-card')
      .filter({ hasText: EXISTING_USER_B })
      .getByTestId('coordinator-panchayat-chip')
      .filter({ hasText: code }),
  ).toHaveCount(0);

  // --- 7. Deactivate the panchayat (confirmed) — also hides it from the
  //        citizen wizard so this run's data never leaks there ------------
  await page.goto('/en/panchayats');
  await page.getByTestId('panchayat-search').fill(code);
  const row2 = page.locator('table').getByTestId('table-row').filter({ hasText: code });
  await row2.getByTestId('panchayat-toggle-status').click();
  await expect(page.getByTestId('panchayat-confirm')).toBeVisible();
  await page.getByTestId('panchayat-confirm-confirm').click();
  await expect(page.getByTestId('panchayat-confirm')).toBeHidden();
  // The row now reflects the inactive status.
  await expect(row2.getByTestId('active-badge')).toHaveAttribute('data-active', 'false');

  // --- 8. The grievance triage surface is still intact -------------------
  await page.goto('/en/issues');
  await expect(page.getByTestId('admin-issues-page')).toBeVisible();
});
