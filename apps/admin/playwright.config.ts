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
 * `webServer` boots BOTH servers this suite needs, in order:
 *   1. The API (`@pg/api`): deploy migrations, seed (idempotent — Task 16,
 *      and the source of the SEEDED_COORDINATOR_PHONE this suite logs in
 *      as), build (the now-fixed CJS-compatible build — see
 *      packages/types/tsconfig.build.json), then run the built
 *      `dist/main.js` directly (the production boot path, not `nest
 *      start --watch`), listening on :4000.
 *   2. The admin app itself, built and started on :3001 (production
 *      mode — matches what the e2e suite should exercise, not the dev
 *      server).
 * Playwright starts both `webServer` entries in parallel and waits for
 * each `url` to respond before running tests; `reuseExistingServer`
 * (non-CI) lets a developer who already has `pnpm dev` running skip the
 * rebuild. If the citizen suite's own Playwright run already started the
 * API on :4000, this config's `reuseExistingServer` (non-CI) avoids a
 * double-boot; in CI each app's `test:e2e` run is a separate job/step with
 * its own fresh API instance.
 */
const API_PORT = 4000;
const APP_PORT = 3001;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
        'pnpm --filter @pg/api exec prisma migrate deploy && ' +
        'pnpm --filter @pg/api exec prisma db seed && ' +
        'pnpm --filter @pg/api build && ' +
        'node apps/api/dist/main.js',
      cwd: '../..',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter @pg/admin build && pnpm --filter @pg/admin start',
      cwd: '../..',
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
