import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the citizen app's e2e suite (Task 28).
 *
 * VERIFICATION STATUS: this config (and `e2e/citizen-auth.spec.ts`, authored
 * in Task 23/24) has been verified by TYPECHECK and inspection only — per
 * the human's explicit scope decision for Task 28, the Playwright browser
 * suite is NOT executed in this sandbox (no browser binaries are installed
 * here). The first actual green run of `pnpm --filter @pg/citizen
 * test:e2e` happens in CI (`.github/workflows/ci.yml`) or a real local dev
 * machine, not as part of this task's verification.
 *
 * `webServer` boots BOTH servers this suite needs, in order:
 *   1. The API (`@pg/api`): deploy migrations, seed (idempotent — Task 16),
 *      build (the now-fixed CJS-compatible build — see
 *      packages/types/tsconfig.build.json), then run the built
 *      `dist/main.js` directly (the production boot path, not `nest
 *      start --watch`), listening on :4000. This is the SAME command CI's
 *      earlier `turbo run build` step already produces artifacts for, but
 *      is repeated here standalone so `pnpm --filter @pg/citizen test:e2e`
 *      works in isolation (e.g. on a dev machine) too.
 *   2. The citizen app itself, built and started on :3000 (production
 *      mode — matches what the e2e suite should exercise, not the dev
 *      server).
 * Playwright starts both `webServer` entries in parallel and waits for
 * each `url` to respond before running tests; `reuseExistingServer`
 * (non-CI) lets a developer who already has `pnpm dev` running skip the
 * rebuild.
 */
const API_PORT = 4000;
const APP_PORT = 3000;

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
      command: 'pnpm --filter @pg/citizen build && pnpm --filter @pg/citizen start',
      cwd: '../..',
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
