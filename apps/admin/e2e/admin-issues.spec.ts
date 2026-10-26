/**
 * Cross-app staff-UI-to-citizen acceptance e2e spec (Task 26 — Review
 * Focus #6, "MANDATORY cross-app acceptance Playwright spec"). This is the
 * suite's GATE: it is the only spec in the repo that drives a REAL status
 * transition through the admin app's OWN UI (not a direct API call) and
 * then asserts the effect is visible on the CITIZEN side — the timeline
 * entry and the unread-notification bell — proving the two apps + the API
 * + the async outbox/notification worker are wired together end to end,
 * not just unit/contract-tested in isolation.
 *
 * EXECUTION DEFERRED TO THE ORCHESTRATOR'S FINAL RELEASE GATE: per this
 * task's explicit scope, the Playwright browser suite is NOT run from this
 * sandbox (no browser binaries installed, and a build+boot of all three
 * apps risks a long stall here). This file is AUTHORED now and STATICALLY
 * VERIFIED by typecheck + grep-confirming every `data-testid`/selector/
 * route against the committed admin + citizen components, mirroring how
 * `citizen-issues.spec.ts` (Task 25) and `admin-auth.spec.ts` (Tasks 25-27)
 * were handled: authored + verified by inspection, executed later as part
 * of the full suite's first green run (CI / a real local machine).
 *
 * `workers: 1` (apps/admin/playwright.config.ts) keeps the two tests below
 * serial — both log in the SAME seeded staff phones and share the ONE
 * backend's OTP state, same rationale as `admin-auth.spec.ts`.
 *
 * Flow covered:
 *   Test 1 (the gate) —
 *     1. A brand-new CITIZEN (own browser context `citizenCtx`, own cookie
 *        jar) registers via dev OTP and submits a grievance through the
 *        citizen UI, deterministically scoped to "Demo Grama Panchayat" /
 *        WARD 1 (the only panchayat; wards are returned ordered by
 *        `number: asc` — see `apps/api/src/org/panchayats.service.ts` — so
 *        `selectOption({ index: 1 })` always picks Ward 1). Captures the
 *        `reference-number`.
 *     2. The SEEDED COORDINATOR (`+919000000002`, scoped to the WHOLE
 *        "Demo Grama Panchayat" — panchayat-wide, `wardId: null` in
 *        `apps/api/prisma/seed.ts` — so Ward 1 is in scope) logs into the
 *        ADMIN app's OWN login/verify UI in a SEPARATE browser context
 *        (`staffCtx`), finds the just-submitted issue on the staff triage
 *        list, opens its detail, and submits the SUBMITTED -> ACKNOWLEDGED
 *        transition via `StatusTransitionControl` — a real
 *        `PATCH /issues/:id/status` driven through the UI, not a direct
 *        API call.
 *     3. Back in the CITIZEN context (no page reload of staff state — a
 *        genuinely separate cookie jar), the citizen's own issue detail is
 *        reloaded: the timeline now shows a SUBMITTED -> ACKNOWLEDGED
 *        `timeline-entry`, and the header bell's `notification-unread-count`
 *        reflects the async `issue.status_changed` notification the
 *        transition produced (`NotificationsList`'s
 *        `messageKeyForType`) — written by the outbox/worker, so this polls
 *        via Playwright's auto-retrying `expect` rather than asserting
 *        immediately.
 *   Test 2 (out-of-scope negative) — REP_2 (`+919000000004`, scoped to WARD
 *     2 only) cannot see or open the ward-1 issue from Test 1: it is absent
 *     from `staff-issue-list`, and a direct detail-URL visit renders the
 *     clean `staff-issue-detail-not-found` state, never the real detail or
 *     transition control. The API-layer out-of-scope 403/404 (both ward and
 *     panchayat dimensions) is already exhaustively covered by
 *     `apps/api/test/transition-authz.e2e-spec.ts` — this UI-level check
 *     only confirms the admin triage surface itself honors that scoping,
 *     so it stays narrowly focused on the two assertions above.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';

const CITIZEN = 'http://localhost:3000';
const ADMIN = 'http://localhost:3001';
const API = 'http://localhost:4000';

/** A phone matching `phoneSchema` (`/^\+91[6-9]\d{9}$/`), distinct per run to avoid OTP/rate-limit collisions across repeated executions. */
function devPhone(): string {
  const tail = `${Date.now()}`.slice(-9).padStart(9, '0');
  return `+919${tail}`;
}

/**
 * Seeded COORDINATOR phone (`apps/api/prisma/seed.ts`, Task 16). Scoped to
 * the WHOLE "Demo Grama Panchayat" (panchayat-wide: `panchayatId` set,
 * `wardId: null`), so it covers Ward 1 — the ward Test 1's citizen issue is
 * deterministically filed under.
 */
const SEEDED_COORDINATOR_PHONE = '+919000000002';

/**
 * Seeded REPRESENTATIVE phone scoped to WARD 2 ONLY (`apps/api/prisma/seed.ts`).
 * Used in Test 2 as the out-of-scope staff identity against a ward-1 issue.
 */
const SEEDED_REP_WARD2_PHONE = '+919000000004';

/**
 * Reads the most recently sent OTP for `phone` from the API origin
 * directly. Unlike the citizen/admin same-origin BFFs, the dev-only
 * `GET /api/v1/dev/last-otp` endpoint only exists on the API itself (see
 * `apps/citizen/src/lib/bff-allowlist.ts`'s comment: `dev` is not an
 * allowlisted prefix; the admin app's BFF only proxies `/api/v1/auth/*`) —
 * both `admin-auth.spec.ts` and the Part A fix to the citizen specs read it
 * the same way.
 */
async function readLastOtp(page: Page, phone: string): Promise<string> {
  const response = await page.request.get(`${API}/api/v1/dev/last-otp?phone=${encodeURIComponent(phone)}`);
  expect(response.ok()).toBe(true);
  const { code } = (await response.json()) as { code: string };
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

/** Fills the 6 single-digit OTP cells (`OtpInput`, shared by both apps). */
async function fillOtp(page: Page, code: string): Promise<void> {
  for (let i = 0; i < code.length; i += 1) {
    await page.getByLabel(`Digit ${i + 1} of 6`).fill(code[i] as string);
  }
}

/**
 * Registers a brand-new citizen (same dev-OTP + profile-completion sequence
 * as `citizen-issues.spec.ts`'s `loginNewCitizen`, duplicated here rather
 * than imported — it lives in a different app's e2e directory — so this
 * file has no cross-app import dependency) and submits ONE grievance via
 * the wizard, deterministically filed under "Demo Grama Panchayat" / Ward 1
 * (the only panchayat; wards are server-ordered by `number: asc`, so index
 * 1 is always Ward 1). Returns the reference number and the issue detail
 * URL (read after navigating into the just-created issue from the
 * dashboard), so the caller can both match on the reference number and
 * capture the issue id without assuming anything about its shape.
 */
async function registerCitizenAndSubmitWardOneIssue(
  cz: Page,
): Promise<{ referenceNo: string; detailUrl: string }> {
  const phone = devPhone();
  const title = `Cross-app acceptance pothole ${Date.now()}`;

  await cz.goto(`${CITIZEN}/`);
  await cz.getByTestId('landing-login-link').click();
  await expect(cz).toHaveURL(/\/login$/);

  await cz.getByTestId('login-phone-input').fill(phone);
  await cz.getByTestId('login-submit').click();
  await expect(cz).toHaveURL(/\/verify\?phone=/);

  const code = await readLastOtp(cz, phone);
  await fillOtp(cz, code);

  // Brand-new phone -> no `fullName` yet -> routed to `/register` first.
  await expect(cz).toHaveURL(/\/register$/);
  await cz.getByLabel(/Full name/).fill('Cross App Citizen');
  await cz.getByRole('button', { name: 'Save and continue' }).click();
  await expect(cz).toHaveURL(/\/home$/);

  await cz.getByTestId('bottom-nav-report').click();
  await expect(cz).toHaveURL(/\/report$/);
  await expect(cz.getByTestId('report-wizard')).toBeVisible();

  // Category -> subcategory are dependent; fill category first.
  await cz.getByTestId('category-select').selectOption({ index: 1 });
  await cz.getByTestId('subcategory-select').selectOption({ index: 1 });

  // Panchayat -> ward are dependent too (ward query gated on panchayat).
  // "Demo Grama Panchayat" is the only seeded panchayat, and wards are
  // returned ordered by `number: asc`, so index 1 is deterministically
  // Ward 1 — required so the out-of-scope test (REP_2, ward 2) is reliable.
  await cz.getByTestId('panchayat-select').selectOption({ index: 1 });
  await expect(cz.getByTestId('ward-select')).toBeEnabled();
  await cz.getByTestId('ward-select').selectOption({ index: 1 });

  await cz.getByTestId('title-input').fill(title);
  await cz
    .getByTestId('description-input')
    .fill('Large pothole on the main road in ward 1, filed for the cross-app acceptance flow.');

  await expect(cz.getByTestId('review-step')).toContainText(title);
  await cz.getByTestId('submit-button').click();

  await expect(cz.getByTestId('report-confirmation')).toBeVisible();
  const referenceNo = (await cz.getByTestId('reference-number').textContent())?.trim() ?? '';
  expect(referenceNo).toMatch(/^GRV-\d{4}-\d{6}/);

  // Navigate to the dashboard and into the issue's own detail page, purely
  // to capture its id (from the URL) for Test 2's direct-navigation check.
  await cz.getByTestId('bottom-nav-issues').click();
  await expect(cz).toHaveURL(/\/issues$/);
  const issueCard = cz.getByTestId('issue-card').filter({ hasText: referenceNo });
  await expect(issueCard).toHaveCount(1);
  await issueCard.getByTestId('issue-card-link').click();
  await expect(cz).toHaveURL(/\/issues\/[^/]+$/);
  await expect(cz.getByTestId('issue-detail')).toBeVisible();

  return { referenceNo, detailUrl: cz.url() };
}

/**
 * Logs a seeded staff phone into the admin app's OWN `/login` -> `/verify`
 * UI (mirrors `admin-auth.spec.ts`'s `loginAsSeededCoordinator`, generalized
 * to any seeded phone so Test 2 can reuse it for REP_2), landing on the
 * dashboard once `requireStaff` allows the role.
 */
async function loginSeededStaff(st: Page, phone: string): Promise<void> {
  await st.goto(`${ADMIN}/login`);
  await expect(st.getByTestId('admin-login-page')).toBeVisible();

  await st.getByTestId('login-phone-input').fill(phone);
  await st.getByTestId('login-submit').click();
  await expect(st).toHaveURL(/\/verify\?phone=/);

  const code = await readLastOtp(st, phone);
  await fillOtp(st, code);

  await expect(st).toHaveURL(/\/en\/?$/);
  await expect(st.getByTestId('admin-dashboard-page')).toBeVisible();
}

/** Opens a fresh, isolated browser context + page (own cookie jar). */
async function newContextPage(browser: Browser): Promise<{ ctx: Awaited<ReturnType<Browser['newContext']>>; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  return { ctx, page };
}

test.describe('cross-app: staff UI status transition reaches the citizen', () => {
  test('a real staff UI status change appears in the citizen timeline + notifications', async ({ browser }) => {
    // Two ISOLATED browser contexts: the citizen's session cookie and the
    // staff's session cookie must never share a jar, or logging in as staff
    // second would silently clobber/confuse the citizen's own session.
    const { ctx: citizenCtx, page: cz } = await newContextPage(browser);
    const { ctx: staffCtx, page: st } = await newContextPage(browser);

    try {
      const { referenceNo } = await registerCitizenAndSubmitWardOneIssue(cz);

      // Staff context: the seeded COORDINATOR (panchayat-wide, covers ward 1)
      // logs in through the admin app's own UI.
      await loginSeededStaff(st, SEEDED_COORDINATOR_PHONE);

      await st.goto(`${ADMIN}/en/issues`);
      await expect(st.getByTestId('admin-issues-page')).toBeVisible();

      const staffItem = st.getByTestId('staff-issue-item').filter({ hasText: referenceNo });
      await expect(staffItem).toHaveCount(1);
      await staffItem.getByTestId('staff-issue-item-link').click();
      await expect(st.getByTestId('staff-issue-detail')).toBeVisible();

      // Drive the REAL transition through the UI's StatusTransitionControl
      // (SUBMITTED's single allowed next status is ACKNOWLEDGED — see
      // `NEXT_STATUS` in StatusTransitionControl.tsx) — this is the actual
      // `PATCH /issues/:id/status` call, not a direct API request.
      await expect(st.getByTestId('status-transition-control')).toBeVisible();
      await st.getByTestId('transition-note-input').fill('Acknowledged by coordinator');
      await st.getByTestId('transition-submit').click();

      // The transition succeeded: a staff-side timeline entry now exists for
      // this transition (StaffIssueDetail -> StaffTimeline).
      await expect(st.getByTestId('staff-timeline-entry').first()).toBeVisible();

      // Back in the CITIZEN context (separate cookie jar, untouched by the
      // staff login above): reload the citizen's own issue detail and
      // confirm the transition is visible there too.
      await cz.reload();
      await expect(cz.getByTestId('issue-detail')).toBeVisible();
      await expect(cz.getByTestId('issue-timeline')).toBeVisible();
      await expect(cz.getByTestId('timeline-entry')).toHaveCount(1);

      // The async `issue.status_changed` notification (outbox/worker) is not
      // synchronous with the transition response — poll via Playwright's
      // auto-retrying `expect`.
      await expect(cz.getByTestId('notification-unread-count')).toBeVisible();
      const unreadText = await cz.getByTestId('notification-unread-count').textContent();
      expect(Number(unreadText)).toBeGreaterThanOrEqual(1);

      await cz.getByTestId('notification-bell').click();
      await expect(cz).toHaveURL(/\/notifications$/);
      await expect(cz.getByTestId('notifications-list')).toBeVisible();
      await expect(cz.getByTestId('notification-item').first()).toBeVisible();
    } finally {
      await citizenCtx.close();
      await staffCtx.close();
    }
  });
});

test.describe('cross-app: out-of-scope staff cannot see or transition the issue', () => {
  test('REP_2 (ward 2) cannot see or open a ward-1 issue on the admin triage surface', async ({ browser }) => {
    const { ctx: citizenCtx, page: cz } = await newContextPage(browser);
    const { ctx: staffCtx, page: st } = await newContextPage(browser);

    try {
      const { referenceNo, detailUrl } = await registerCitizenAndSubmitWardOneIssue(cz);

      // REP_2 is scoped to ward 2 only (`apps/api/prisma/seed.ts`); the
      // citizen's issue above is deterministically ward 1 -> out of scope.
      await loginSeededStaff(st, SEEDED_REP_WARD2_PHONE);

      await st.goto(`${ADMIN}/en/issues`);
      await expect(st.getByTestId('admin-issues-page')).toBeVisible();

      // The server-scoped list simply omits it — no item for this reference
      // number anywhere on the triage surface.
      await expect(st.getByTestId('staff-issue-item').filter({ hasText: referenceNo })).toHaveCount(0);

      // A direct detail-URL visit (same issue id, derived from the citizen's
      // own detail URL) gets the clean, non-disclosing not-found state —
      // never the real detail or transition control. The API collapses
      // "doesn't exist" and "exists but out of scope" into the same 404
      // (see `StaffIssueDetail`'s comment), so there is nothing else to
      // assert here on the admin side; the API-layer 403/404 distinction is
      // covered by `apps/api/test/transition-authz.e2e-spec.ts`.
      const issueId = new URL(detailUrl).pathname.split('/').pop();
      await st.goto(`${ADMIN}/en/issues/${issueId}`);
      await expect(st.getByTestId('staff-issue-detail-not-found')).toBeVisible();
      await expect(st.getByTestId('staff-issue-detail')).toHaveCount(0);
      await expect(st.getByTestId('status-transition-control')).toHaveCount(0);
    } finally {
      await citizenCtx.close();
      await staffCtx.close();
    }
  });
});
