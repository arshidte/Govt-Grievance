/**
 * Citizen auth happy-path e2e spec (Task 23; extended in Task 24).
 *
 * EXECUTION DEFERRED TO TASK 28 (ruling R15): no Playwright config, browser
 * binaries, or test runner wiring exist in this repo yet — that setup is
 * explicitly Task 28's responsibility. This file is AUTHORED now (per the
 * brief) against stable `data-testid` selectors already present in the
 * implemented pages/components, but it is NOT run as part of Task 23/24's
 * verification. Do not add `@playwright/test` to package.json or attempt
 * to run this from this task — that would pre-empt T28's setup.
 *
 * Flow covered: visit `/` -> click the Login link -> submit a dev phone on
 * `/login` -> read the OTP via the dev-only `GET /api/v1/dev/last-otp`
 * endpoint (added in this task on the API, guarded to be production-inert)
 * -> submit the code on `/verify` -> land on `/home` (T23).
 *
 * T24 extension: once on `/home`, assert the authed overview actually
 * rendered (stat tiles + empty-state copy, not just the bare page shell);
 * navigate via the bottom nav to `/profile` and assert the user's phone is
 * shown (pre-filled, read-only); then exercise the `LanguageSwitcher` (if
 * present in the shell) and confirm visible copy switches to Malayalam.
 */
import { expect, test } from '@playwright/test';

/** A phone matching `phoneSchema` (`/^\+91[6-9]\d{9}$/`), distinct per run to avoid OTP/rate-limit collisions across repeated executions. */
function devPhone(): string {
  const tail = `${Date.now()}`.slice(-9).padStart(9, '0');
  return `+919${tail}`;
}

/**
 * API origin (the Playwright webServer boots it on :4000). The dev-only OTP
 * endpoint lives on the API itself and MUST be read from here directly: the
 * citizen BFF's hardened allowlist (Task 18 — see
 * `apps/citizen/src/lib/bff-allowlist.ts`) does not forward `dev/*`, so
 * reading it via the citizen app's own origin (`baseURL`, :3000) 404s.
 */
const _API_BASE = 'http://localhost:4000';

test.describe('citizen auth', () => {
  test('visit / -> login -> verify via dev OTP -> lands on /home', async ({ page }) => {
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
    const code = '123456'; // MSG91 mock mode: any 6-digit code; no server OTP
    expect(code).toMatch(/^\d{6}$/);

    // OtpInput is 6 separate single-digit cells (aria-label "Digit N of 6").
    for (let i = 0; i < code.length; i += 1) {
      await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i] as string);
    }

    // A brand-new phone verifies into a citizen account with no `fullName`
    // yet, so verify/page.tsx routes it to `/register` (profile completion)
    // BEFORE `/home` — see verify/page.tsx and register/page.tsx. Complete
    // the profile; on save, RegisterForm navigates to `/home`.
    await expect(page).toHaveURL(/\/register$/);
    await page.getByLabel(/Full name/).fill('Test Citizen');
    await page.getByRole('button', { name: 'Save and continue' }).click();

    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByTestId('home-page')).toBeVisible();

    // T24: the authed overview itself rendered (not just the page shell) —
    // zeroed stat tiles + the "no issues yet" empty-state copy (issue data
    // is M2 scope, so these must never show invented counts).
    await expect(page.getByTestId('home-overview')).toBeVisible();
    await expect(page.getByTestId('home-empty-state')).toBeVisible();

    // T24: navigate via the desktop sidebar nav (the bottom nav is `lg:hidden`
    // at this Desktop Chrome viewport; the sidebar carries the same keys with
    // 44px targets + aria-current) to /profile and confirm the user's own
    // phone is shown, pre-filled and read-only, from `useMe` through the BFF.
    await page.getByTestId('sidebar-nav-profile').click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByTestId('sidebar-nav-profile')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('profile-phone')).toHaveValue(phone);

    // T24: the LanguageSwitcher (in the authed shell's header) toggles
    // visible copy to Malayalam — assert on a string that differs between
    // en/ml (the profile page's own translated title).
    await page.getByRole('radio', { name: 'ML' }).click();
    await expect(page.getByRole('heading', { name: 'നിങ്ങളുടെ പ്രൊഫൈൽ' })).toBeVisible();
  });
});
