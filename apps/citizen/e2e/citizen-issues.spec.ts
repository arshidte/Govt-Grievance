/**
 * Citizen issues/notifications end-to-end spec (Task 25).
 *
 * EXECUTION DEFERRED TO THE PROJECT'S FINAL RELEASE GATE: per this task's
 * explicit scope, the Playwright browser suite is NOT run from this sandbox
 * (no browser binaries installed — see the header comment in
 * `apps/citizen/playwright.config.ts` — and running it builds+boots both
 * apps). This file is AUTHORED now and STATICALLY VERIFIED by typecheck +
 * grep-confirming every `data-testid`/selector/route against the committed
 * citizen components, mirroring how `citizen-auth.spec.ts` (Task 23/24) was
 * handled: authored + verified by inspection, executed later (there, Task
 * 28; here, the orchestrator's final gate) alongside the rest of the suite.
 *
 * Flow covered (brief + spec §11/§12):
 *   1. Log in a brand-new citizen via the dev OTP endpoint (same sequence as
 *      `citizen-auth.spec.ts`; duplicated locally as `loginNewCitizen` below
 *      rather than importing from that file, per instructions not to modify
 *      it) and complete profile registration -> lands on `/home`.
 *   2. Navigate to `/report` via the bottom nav and submit the grievance
 *      wizard (`SubmitWizard`): category -> subcategory (dependent), then
 *      panchayat -> ward (dependent, ward query gated on panchayat), title +
 *      description, then `submit-button`. Options come from the real seeded
 *      DB (`apps/api/prisma/seed.ts`) — the first real (non-placeholder)
 *      option is always chosen via `selectOption({ index: 1 })`, never a
 *      hardcoded id, and the dependent selects are filled in order so their
 *      options populate before the next select is touched.
 *   3. Assert the `report-confirmation` step renders a `GRV-YYYY-NNNNNN`
 *      shaped `reference-number`.
 *   4. Navigate to `/issues` via the bottom nav; assert `issues-dashboard`
 *      renders an `issue-card` for the just-submitted issue (matched on its
 *      reference number, which `IssueCard` renders verbatim).
 *   5. Click into the issue (`issue-card-link`) -> `/issues/<id>`; assert
 *      `issue-detail` renders and `issue-timeline` is present. A freshly
 *      submitted issue has NO status-history rows yet (SUBMITTED is the
 *      initial state, not a recorded transition — see `Timeline`'s
 *      `entries.length === 0` branch), so this intentionally does NOT
 *      assert a `timeline-entry` — only the container. A staff transition
 *      producing a real timeline entry is Task 26's cross-app flow.
 *   6. A submission creates an `issue.submitted` notification for the
 *      citizen (processed async via the outbox/worker) — assert the header
 *      bell (`notification-bell`) eventually shows `notification-unread-count`
 *      >= 1 (polled via Playwright's auto-retrying `expect`, since the
 *      notification write is not synchronous with the create-issue response).
 *      Click the bell -> `/notifications`; assert `notifications-list` and a
 *      `notification-item` are present.
 *   7. Click the notification item (marks it read via `useMarkRead`, whose
 *      `onSuccess` invalidates both the notifications list and the
 *      unread-count query) -> navigates to the issue. The issue detail
 *      page's `AppHeader` also carries the bell, so the cleared count is
 *      observable immediately there: assert `notification-unread-count` is
 *      gone (the badge only renders when `count > 0` — see
 *      `NotificationBell`).
 *   8. Toggle the `LanguageSwitcher` (`ML` radio, same control exercised in
 *      `citizen-auth.spec.ts`) on `/issues` and assert the dashboard heading
 *      switches to its Malayalam string from `packages/i18n/messages/ml.json`
 *      (`issues.dashboardTitle`: "നിങ്ങളുടെ പരാതികൾ").
 */
import { expect, test, type Page } from '@playwright/test';

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
const API_BASE = 'http://localhost:4000';

/**
 * Logs a brand-new citizen in via the same dev-OTP sequence as
 * `citizen-auth.spec.ts` (duplicated here rather than imported, per this
 * task's instructions to not modify that file): `/` -> `landing-login-link`
 * -> `/login` -> submit phone -> `/verify?phone=` -> read the OTP via the
 * dev-only endpoint -> fill the 6 digit cells -> a brand-new phone has no
 * `fullName` yet, so it is routed to `/register` -> fill full name and save
 * -> lands on `/home`.
 */
async function loginNewCitizen(page: Page, _baseURL: string | undefined, phone: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('landing-login-link').click();
  await expect(page).toHaveURL(/\/login$/);

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

  await expect(page).toHaveURL(/\/register$/);
  await page.getByLabel(/Full name/).fill('Test Citizen');
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(/\/home$/);
}

/**
 * Selects the first REAL (non-placeholder) option of a `<select>` by index,
 * never a hardcoded id — the seeded catalog/org data (`apps/api/prisma/seed.ts`)
 * provides real rows, but their ids are DB-generated and must not be assumed.
 * Index 0 is always the translated placeholder (`<option value="">...`) on
 * every select in `SubmitWizard`, so index 1 is the first real choice.
 */
async function selectFirstRealOption(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).selectOption({ index: 1 });
}

test.describe('citizen issues + notifications', () => {
  test('submit via wizard -> reference number -> dashboard -> detail/timeline -> notification + bell -> mark-read -> en/ml', async ({
    page,
    baseURL,
  }) => {
    const phone = devPhone();
    const title = `Pothole near main road ${Date.now()}`;

    await loginNewCitizen(page, baseURL, phone);

    // Navigate to the wizard via the desktop sidebar nav (confirms the nav
    // item itself, not just the route; the bottom nav is `lg:hidden` here).
    await page.getByTestId('sidebar-nav-report').click();
    await expect(page).toHaveURL(/\/report$/);
    await expect(page.getByTestId('report-wizard')).toBeVisible();

    // Category -> subcategory are DEPENDENT (subcategory options are
    // filtered client-side from the chosen category's nested list) — fill
    // category first so subcategory options exist to choose from.
    await selectFirstRealOption(page, 'category-select');
    await selectFirstRealOption(page, 'subcategory-select');

    // Panchayat -> ward are DEPENDENT too (the ward query is gated on a
    // chosen panchayat via `enabled: !!panchayatId`) — fill panchayat first
    // and wait for the ward select to become enabled before choosing.
    await selectFirstRealOption(page, 'panchayat-select');
    await expect(page.getByTestId('ward-select')).toBeEnabled();
    await selectFirstRealOption(page, 'ward-select');

    await page.getByTestId('title-input').fill(title);
    await page
      .getByTestId('description-input')
      .fill('There is a large pothole causing traffic hazards near the main road.');

    // The wizard's lightweight "review step" (the entered title echoed back)
    // renders inline, ahead of the explicit submit action.
    await expect(page.getByTestId('review-step')).toContainText(title);

    await page.getByTestId('submit-button').click();

    // Reference number confirmation (spec §12).
    await expect(page.getByTestId('report-confirmation')).toBeVisible();
    const referenceNo = (await page.getByTestId('reference-number').textContent())?.trim() ?? '';
    expect(referenceNo).toMatch(/^GRV-\d{4}-\d{6}/);

    // Dashboard: navigate via the desktop sidebar nav and find the just-created issue.
    await page.getByTestId('sidebar-nav-issues').click();
    await expect(page).toHaveURL(/\/issues$/);
    await expect(page.getByTestId('issues-dashboard')).toBeVisible();

    const issueCard = page.getByTestId('issue-card').filter({ hasText: referenceNo });
    await expect(issueCard).toHaveCount(1);

    // Detail + timeline: click into the issue.
    await issueCard.getByTestId('issue-card-link').click();
    await expect(page).toHaveURL(/\/issues\/[^/]+$/);
    await expect(page.getByTestId('issue-detail')).toBeVisible();

    // A freshly-submitted issue has no recorded status-history transitions
    // yet (SUBMITTED is the initial state, not a transition) — assert the
    // timeline container renders without asserting any `timeline-entry`.
    await expect(page.getByTestId('issue-timeline')).toBeVisible();
    await expect(page.getByTestId('timeline-entry')).toHaveCount(0);

    // Notification + bell: the submission's `issue.submitted` notification
    // is written asynchronously, so poll via Playwright's auto-retrying
    // `expect` rather than asserting immediately.
    await expect(page.getByTestId('notification-unread-count')).toBeVisible();
    const unreadText = await page.getByTestId('notification-unread-count').textContent();
    expect(Number(unreadText)).toBeGreaterThanOrEqual(1);

    await page.getByTestId('notification-bell').click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByTestId('notifications-list')).toBeVisible();
    await expect(page.getByTestId('notification-item').first()).toBeVisible();

    // Mark-read clears the count: clicking the (unread) item fires
    // `useMarkRead`, whose `onSuccess` invalidates both the list and the
    // unread-count query, then navigates to the issue (same page shell,
    // same bell).
    await page.getByTestId('notification-item').first().click();
    await expect(page).toHaveURL(/\/issues\/[^/]+$/);
    await expect(page.getByTestId('notification-unread-count')).toHaveCount(0);

    // en -> ml toggle: switch locale via the LanguageSwitcher and confirm
    // the issues dashboard heading renders in Malayalam.
    await page.getByTestId('sidebar-nav-issues').click();
    await expect(page).toHaveURL(/\/issues$/);
    await page.getByRole('radio', { name: 'ML' }).click();
    await expect(page.getByRole('heading', { name: 'നിങ്ങളുടെ പരാതികൾ' })).toBeVisible();
  });
});
