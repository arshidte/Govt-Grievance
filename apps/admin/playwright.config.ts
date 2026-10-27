import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the admin app's e2e suite (Task 28).
 *
 * VERIFICATION STATUS: this config (and `e2e/admin-auth.spec.ts`, authored
 * in Tasks 25-27) has been verified by TYPECHECK and inspection only — per
 * the human's explicit scope decision for Task 28, the Playwright browser
 * suite is NOT executed in this sandbox (no browser binaries are installed
 * here). The first actual green run of `pnpm --filter @pg/admin
 * test:e2e` happens in CI (`.github/workflows/ci.yml`) or a real local dev
 * machine, not as part of this task's verification.
 *
 * `webServer` boots THREE servers this suite needs, in order:
 *   1. The API (`@pg/api`): deploy migrations, seed (idempotent — Task 16,
 *      and the source of the SEEDED_COORDINATOR_PHONE this suite logs in
 *      as), build (the now-fixed CJS-compatible build — see
 *      packages/types/tsconfig.build.json), then run the built
 *      `dist/main.js` directly (the production boot path, not `nest
 *      start --watch`), listening on :4000.
 *   2. The admin app itself, built and started on :3001 (production
 *      mode — matches what the e2e suite should exercise, not the dev
 *      server).
 *   3. The citizen app, built and started on :3000 (Task 26's cross-app
 *      acceptance spec, `e2e/admin-issues.spec.ts`, drives a real citizen
 *      session there — a citizen submitting an issue, then checking its
 *      timeline/notifications update after a staff transition made through
 *      the ADMIN UI — so this suite needs all three origins up, not just
 *      API + admin).
 * Playwright starts all `webServer` entries in parallel and waits for
 * each `url` to respond before running tests; `reuseExistingServer`
 * (non-CI) lets a developer who already has `pnpm dev` running skip the
 * rebuild. If the citizen suite's own Playwright run already started the
 * API (or citizen app), this config's `reuseExistingServer` (non-CI)
 * avoids a double-boot; in CI each app's `test:e2e` run is a separate
 * job/step with its own fresh instances.
 */
const API_PORT = 4000;
const APP_PORT = 3001;
const CITIZEN_PORT = 3000;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Single worker everywhere (not just CI): these auth specs share ONE
  // backend, ONE seeded staff identity, and an in-memory mock SMS provider
  // keyed by phone (last-code-per-phone). Parallel workers logging in the
  // same seeded phone would race on that shared OTP state. Serial execution
  // makes the suite deterministic and matches how CI already runs it.
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command:
        // Load the repo-root .env (gitignored) for the prisma CLI steps when
        // present (local dev); in CI it is absent and DATABASE_URL et al come
        // from the job environment, so the sourcing is skipped. `@pg/api...`
        // builds @pg/types (its workspace dep) BEFORE @pg/api so the built
        // `dist/main.js` can resolve it at runtime even on a clean checkout.
        'if [ -f .env ]; then set -a; . ./.env; set +a; fi && ' +
        'pnpm --filter @pg/api exec prisma migrate deploy && ' +
        'pnpm --filter @pg/api exec prisma db seed && ' +
        'pnpm --filter "@pg/api..." build && ' +
        // Raise the per-phone OTP limit for the e2e API only: this suite logs
        // in the SAME seeded COORDINATOR phone several times per run, which
        // would otherwise trip the default 5/hour limit (incidental coupling,
        // not the behavior under test here — the limit itself is asserted by
        // the api suite's otp.service.spec + throttle.e2e-spec).
        // Also raise the per-IP /auth/* throttle for the e2e API only: this
        // cross-app suite performs many real OTP logins (admin-auth +
        // coordinator + rep + citizen) from one IP, which would otherwise
        // trip the strict default (5/60s). The throttle's actual behaviour is
        // asserted by the api `throttle.e2e-spec` at the default; this
        // override mirrors the OTP_RATE_LIMIT override beside it.
        'OTP_RATE_LIMIT_PER_PHONE_PER_HOUR=100 AUTH_THROTTLE_LIMIT=1000 node apps/api/dist/main.js',
      cwd: '../..',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command:
        // Source the repo-root .env locally so the app's server runtime gets
        // API_INTERNAL_URL (used by the BFF/RSC) and SESSION_COOKIE_NAME
        // (inlined into middleware at build); skipped in CI where these come
        // from the job environment.
        'if [ -f .env ]; then set -a; . ./.env; set +a; fi && ' +
        'pnpm --filter @pg/admin build && pnpm --filter @pg/admin start',
      cwd: '../..',
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      // The citizen app, on :3000 — `e2e/admin-issues.spec.ts` (Task 26)
      // drives a real citizen session there (registering + submitting an
      // issue) in a SEPARATE browser context from the staff session, then
      // asserts that a staff-UI status transition made against the admin
      // app shows up in the citizen's timeline/notifications. Mirrors the
      // admin entry above: same `.env` sourcing, same production build+start
      // (not the dev server), same `reuseExistingServer` behavior.
      command:
        'if [ -f .env ]; then set -a; . ./.env; set +a; fi && ' +
        'pnpm --filter @pg/citizen build && pnpm --filter @pg/citizen start',
      cwd: '../..',
      url: `http://localhost:${CITIZEN_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
