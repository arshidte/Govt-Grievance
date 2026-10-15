/**
 * Admin staff-gate e2e spec (Task 25; the staff-login-succeeds leg is
 * added in Task 26, now that the real login/verify forms exist; the
 * responsive nav shell legs are added in Task 27).
 *
 * EXECUTION DEFERRED TO TASK 28 (ruling R15): no Playwright config, browser
 * binaries, or test runner wiring exist in this repo yet — that setup is
 * explicitly Task 28's responsibility. This file is AUTHORED now (per the
 * brief) against stable `data-testid` selectors already present in the
 * implemented pages/layouts/components, but it is NOT run as part of Task
 * 25/26/27's verification. Do not add `@playwright/test` to package.json
 * or attempt to run this from this task — that would pre-empt T28's setup.
 *
 * Flow covered (Review Focus #4):
 *  1. (T25) An unauthenticated visit to `/` redirects to `/login`.
 *  2. (T25) A CITIZEN session (no staff role) visiting `/` sees the
 *     `ForbiddenState` — not a crash, not a blank page. This exercises the
 *     SERVER-side staff gate in `src/app/[locale]/(app)/layout.tsx`
 *     (`requireStaff`, unit-tested in `src/lib/requireStaff.test.ts`).
 *  3. (T26) A SEEDED staff phone (the COORDINATOR fixture documented in
 *     `.env.example`, seeded by `apps/api/prisma/seed.ts` — Task 16) logs
 *     in through the admin app's OWN `/login` -> `/verify` UI (via the BFF
 *     proxy at `src/app/api/v1/auth/[...action]/route.ts`, reading the
 *     dev-only OTP via `GET /api/v1/dev/last-otp`) and lands on the
 *     dashboard `/`, proving the post-verify `/` navigation + the
 *     `requireStaff` gate's "allow" path both work end to end.
 *  4. (T27) At a `<lg` viewport, the persistent Sidebar (`Sidebar.tsx`,
 *     `hidden lg:flex`) is absent and the drawer trigger
 *     (`mobile-drawer-trigger`) is present; clicking it opens the
 *     `mobile-drawer` dialog (`aria-expanded` flips, ESC/overlay-click
 *     close it).
 *  5. (T27) Clicking a nav item (desktop sidebar or drawer) routes to that
 *     module's page and marks it `aria-current="page"` (`nav-link-<key>`).
 */
import { expect, test } from '@playwright/test';

/** A phone matching `phoneSchema` (`/^\+91[6-9]\d{9}$/`), distinct per run to avoid OTP/rate-limit collisions across repeated executions. */
function devPhone(): string {
  const tail = `${Date.now()}`.slice(-9).padStart(9, '0');
  return `+919${tail}`;
}

/**
 * Seeded COORDINATOR phone (`apps/api/prisma/seed.ts`, Task 16 — documented
 * in the repo root `.env.example`). Scoped to the "Demo Grama Panchayat"
 * (code DEMO-GP-01); a real staff role assignment, so `requireStaff`
 * returns true for it.
 */
const SEEDED_COORDINATOR_PHONE = '+919000000002';

/**
 * API origin (the Playwright webServer boots it on :4000). The dev-only OTP
 * endpoint lives on the API itself; unlike the citizen app, the admin app has
 * NO general BFF catch-all (only `/api/v1/auth/*`), so `/api/v1/dev/last-otp`
 * must be read from the API origin directly, not the admin same-origin.
 */
const API_BASE = 'http://localhost:4000';

test.describe('admin staff gate', () => {
  test('an unauthenticated visit to the admin dashboard redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByTestId('admin-login-page')).toBeVisible();
  });

  test('a citizen session (no staff role) visiting / sees the Forbidden state, not a crash or blank page', async ({
    page,
  }) => {
    // Drive the admin app's OWN login/verify UI with a brand-new phone, so
    // the `pg_session` cookie is set FIRST-PARTY on the admin origin (via the
    // admin BFF) in the SAME browser context the subsequent `page.goto('/')`
    // uses. (Setting a cookie via Playwright's bare `request` fixture would
    // land it in a separate cookie jar the page never sees.) A brand-new
    // phone self-registers as a CITIZEN (no staff role) — exactly the case
    // the server-side `requireStaff` gate must deny with ForbiddenState.
    const phone = devPhone();

    await page.goto('/login');
    await page.getByTestId('login-phone-input').fill(phone);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/verify\?phone=/);

    const lastOtpResponse = await page.request.get(
      `${API_BASE}/api/v1/dev/last-otp?phone=${encodeURIComponent(phone)}`,
    );
    expect(lastOtpResponse.ok()).toBe(true);
    const { code } = (await lastOtpResponse.json()) as { code: string };
    expect(code).toMatch(/^\d{6}$/);

    for (let i = 0; i < code.length; i += 1) {
      await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i] as string);
    }

    // Post-verify, the citizen lands on `/`, where the (app) layout's
    // requireStaff gate renders the Forbidden state (not a crash/blank).
    await expect(page.getByTestId('admin-forbidden-state')).toBeVisible();
    // ...and it is itself the accessible alert (role="alert"), so AT announces
    // the denial. Scope to this element: Next injects its own empty
    // role="alert" route-announcer, so a page-wide getByRole('alert') is
    // ambiguous.
    await expect(page.getByTestId('admin-forbidden-state')).toHaveAttribute('role', 'alert');
  });

  test('a seeded COORDINATOR logs in via the admin login/verify UI and lands on the dashboard', async ({
    page,
  }) => {
    // Unlike the citizen-session case above (which obtains its cookie via
    // direct API calls), this drives the admin app's OWN `/login` ->
    // `/verify` UI end to end, through the BFF proxy, exercising:
    //  - the BFF relay setting `pg_session` as a first-party cookie
    //    (src/app/api/v1/auth/[...action]/route.ts)
    //  - the dev-only `GET /api/v1/dev/last-otp` endpoint, read directly
    //    from the API origin (the admin app has no general BFF catch-all —
    //    only /api/v1/auth/* — so this cannot go through the admin origin)
    //  - VerifyForm's post-verify navigation to `/`
    //  - the `(app)` layout's `requireStaff` gate's ALLOW path for a real
    //    staff role (COORDINATOR)
    await page.goto('/login');
    await expect(page.getByTestId('admin-login-page')).toBeVisible();

    await page.getByTestId('login-phone-input').fill(SEEDED_COORDINATOR_PHONE);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/verify\?phone=/);

    const lastOtpResponse = await page.request.get(
      `${API_BASE}/api/v1/dev/last-otp?phone=${encodeURIComponent(SEEDED_COORDINATOR_PHONE)}`,
    );
    expect(lastOtpResponse.ok()).toBe(true);
    const { code } = (await lastOtpResponse.json()) as { code: string };
    expect(code).toMatch(/^\d{6}$/);

    // OtpInput is 6 separate single-digit cells (aria-label "Digit N of 6").
    for (let i = 0; i < code.length; i += 1) {
      await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i] as string);
    }

    // No /register branch in admin (staff are seeded, never self-registered)
    // — verify always routes straight to `/`, and the dashboard renders
    // because `requireStaff` allows the COORDINATOR role.
    await expect(page).toHaveURL(/\/en\/?$/);
    await expect(page.getByTestId('admin-dashboard-page')).toBeVisible();
  });
});

/** Drives the same login/verify flow as the test above, landing an authenticated COORDINATOR session on `/`. Shared by the T27 nav-shell specs below so each test doesn't repeat the OTP dance. */
async function loginAsSeededCoordinator(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByTestId('login-phone-input').fill(SEEDED_COORDINATOR_PHONE);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/verify\?phone=/);

  const lastOtpResponse = await page.request.get(
    `${API_BASE}/api/v1/dev/last-otp?phone=${encodeURIComponent(SEEDED_COORDINATOR_PHONE)}`,
  );
  const { code } = (await lastOtpResponse.json()) as { code: string };
  for (let i = 0; i < code.length; i += 1) {
    await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i] as string);
  }
  await expect(page.getByTestId('admin-dashboard-page')).toBeVisible();
}

test.describe('admin responsive nav shell (T27)', () => {
  test.use({ viewport: { width: 375, height: 812 } }); // <lg: drawer, not persistent sidebar

  test('at <lg width, the sidebar is replaced by a toggleable drawer', async ({ page }) => {
    await loginAsSeededCoordinator(page);

    // Persistent sidebar is `hidden lg:flex` — not visible below `lg`.
    await expect(page.getByTestId('admin-sidebar')).toBeHidden();

    const trigger = page.getByTestId('mobile-drawer-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('mobile-drawer')).toHaveCount(0);

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('mobile-drawer')).toBeVisible();

    // ESC closes the drawer and returns focus to the trigger.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mobile-drawer')).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // Clicking the overlay also closes it.
    await trigger.click();
    await page.getByTestId('mobile-drawer-overlay').click({ position: { x: 350, y: 10 } });
    await expect(page.getByTestId('mobile-drawer')).toHaveCount(0);
  });

  test('clicking a nav item in the drawer routes and highlights it, then closes the drawer', async ({
    page,
  }) => {
    await loginAsSeededCoordinator(page);

    await page.getByTestId('mobile-drawer-trigger').click();
    // Scope nav-link lookups to the drawer: the persistent sidebar is
    // `hidden lg:flex` (present in the DOM but hidden at this viewport), so an
    // unscoped getByTestId('nav-link-issues') matches BOTH the sidebar and the
    // drawer copies and trips Playwright strict mode.
    const drawer = page.getByTestId('mobile-drawer');
    await drawer.getByTestId('nav-link-issues').click();

    await expect(page).toHaveURL(/\/issues$/);
    await expect(page.getByTestId('admin-issues-page')).toBeVisible();
    // Drawer closes on navigation.
    await expect(page.getByTestId('mobile-drawer')).toHaveCount(0);

    // Re-open and confirm the active item carries aria-current="page".
    await page.getByTestId('mobile-drawer-trigger').click();
    await expect(
      page.getByTestId('mobile-drawer').getByTestId('nav-link-issues'),
    ).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('admin responsive nav shell — desktop (T27)', () => {
  test('at >=lg width, the sidebar is persistent and clicking a nav item highlights the active route', async ({
    page,
  }) => {
    await loginAsSeededCoordinator(page);

    await expect(page.getByTestId('admin-sidebar')).toBeVisible();
    await expect(page.getByTestId('mobile-drawer-trigger')).toBeHidden();

    await page.getByTestId('admin-sidebar').getByTestId('nav-link-issues').click();
    await expect(page).toHaveURL(/\/issues$/);
    await expect(page.getByTestId('nav-link-issues')).toHaveAttribute('aria-current', 'page');
    // A non-active item carries no aria-current.
    await expect(page.getByTestId('nav-link-dashboard')).not.toHaveAttribute('aria-current', 'page');
  });
});
