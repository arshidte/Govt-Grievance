/**
 * Admin staff-gate e2e spec (Task 25; the staff-login-succeeds leg is
 * added in Task 26, once the real login form exists).
 *
 * EXECUTION DEFERRED TO TASK 28 (ruling R15): no Playwright config, browser
 * binaries, or test runner wiring exist in this repo yet — that setup is
 * explicitly Task 28's responsibility. This file is AUTHORED now (per the
 * brief) against stable `data-testid` selectors already present in the
 * implemented pages/layouts, but it is NOT run as part of Task 25's
 * verification. Do not add `@playwright/test` to package.json or attempt
 * to run this from this task — that would pre-empt T28's setup.
 *
 * Flow covered (Review Focus #4): a CITIZEN session (no staff role) that
 * visits the admin app's root `/` must see the `ForbiddenState` — not a
 * crash, not a blank page. This exercises the SERVER-side staff gate in
 * `src/app/[locale]/(app)/layout.tsx` (`requireStaff`, unit-tested in
 * `src/lib/requireStaff.test.ts`), using a real `pg_session` cookie for a
 * citizen account obtained via the citizen app's own dev-login flow (both
 * apps share the same backend + `pg_session` cookie — see
 * src/lib/api.ts's header comment).
 *
 * A second, unauthenticated case is covered too: visiting any protected
 * admin path with NO session cookie at all must redirect to `/login`
 * (middleware.ts's cookie-presence gate) rather than reach the staff check.
 */
import { expect, test } from '@playwright/test';

/** A phone matching `phoneSchema` (`/^\+91[6-9]\d{9}$/`), distinct per run to avoid OTP/rate-limit collisions across repeated executions. */
function devPhone(): string {
  const tail = `${Date.now()}`.slice(-9).padStart(9, '0');
  return `+919${tail}`;
}

test.describe('admin staff gate', () => {
  test('an unauthenticated visit to the admin dashboard redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('admin-login-page')).toBeVisible();
  });

  test('a citizen session (no staff role) visiting / sees the Forbidden state, not a crash or blank page', async ({
    page,
    baseURL,
    request,
  }) => {
    // Obtain a real citizen session cookie via the OTP dev flow against
    // the SAME backend the citizen app uses (both apps share pg_session —
    // see src/lib/api.ts). This mirrors apps/citizen/e2e/citizen-auth.spec.ts's
    // dev-OTP technique rather than driving the citizen app's UI.
    const phone = devPhone();
    const apiBase = baseURL!.replace(':3001', ':4000');

    await request.post(`${apiBase}/api/v1/auth/request-otp`, {
      data: { phone },
    });

    const lastOtpResponse = await request.get(
      `${apiBase}/api/v1/dev/last-otp?phone=${encodeURIComponent(phone)}`,
    );
    expect(lastOtpResponse.ok()).toBe(true);
    const { code } = (await lastOtpResponse.json()) as { code: string };

    const verifyResponse = await request.post(`${apiBase}/api/v1/auth/verify-otp`, {
      data: { phone, code },
    });
    expect(verifyResponse.ok()).toBe(true);

    // A brand-new phone verifies into a CITIZEN-only account (no staff
    // role assignments) — exactly the case `requireStaff` must deny.
    await page.goto('/');
    await expect(page.getByTestId('admin-forbidden-state')).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
