/**
 * Citizen auth happy-path e2e spec (Task 23).
 *
 * EXECUTION DEFERRED TO TASK 28 (ruling R15): no Playwright config, browser
 * binaries, or test runner wiring exist in this repo yet — that setup is
 * explicitly Task 28's responsibility. This file is AUTHORED now (per the
 * brief) against stable `data-testid` selectors already present in the
 * implemented pages/components, but it is NOT run as part of Task 23's
 * verification. Do not add `@playwright/test` to package.json or attempt
 * to run this from this task — that would pre-empt T28's setup.
 *
 * Flow covered: visit `/` -> click the Login link -> submit a dev phone on
 * `/login` -> read the OTP via the dev-only `GET /api/v1/dev/last-otp`
 * endpoint (added in this task on the API, guarded to be production-inert)
 * -> submit the code on `/verify` -> land on `/home`.
 */
import { expect, test } from '@playwright/test';

/** A phone matching `phoneSchema` (`/^\+91[6-9]\d{9}$/`), distinct per run to avoid OTP/rate-limit collisions across repeated executions. */
function devPhone(): string {
  const tail = `${Date.now()}`.slice(-9).padStart(9, '0');
  return `+919${tail}`;
}

test.describe('citizen auth', () => {
  test('visit / -> login -> verify via dev OTP -> lands on /home', async ({ page, baseURL }) => {
    const phone = devPhone();

    await page.goto('/');
    await page.getByTestId('landing-login-link').click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByTestId('login-phone-input').fill(phone);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/verify\?phone=/);

    // Dev-only: read the OTP that was just sent, via the endpoint added in
    // this task. Guarded server-side to 404 outside non-production — see
    // apps/api/src/dev/dev.controller.ts.
    const lastOtpResponse = await page.request.get(
      `${baseURL}/api/v1/dev/last-otp?phone=${encodeURIComponent(phone)}`,
    );
    expect(lastOtpResponse.ok()).toBe(true);
    const { code } = (await lastOtpResponse.json()) as { code: string };
    expect(code).toMatch(/^\d{6}$/);

    // OtpInput is 6 separate single-digit cells (aria-label "Digit N of 6").
    for (let i = 0; i < code.length; i += 1) {
      await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i] as string);
    }

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByTestId('home-page')).toBeVisible();
  });
});
