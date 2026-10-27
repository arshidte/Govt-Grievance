import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts', 'test/**/*.spec.ts'],
    globals: false,
    root: './',
    // Guarantees DATABASE_URL (and the rest of the root `.env`) is in
    // `process.env` before ANY e2e spec runs, independent of which spec
    // file Vitest happens to import first — see test/setup-env.ts.
    setupFiles: ['./test/setup-env.ts'],
    // Run ALL e2e spec FILES serially in a single worker. These specs share
    // one real HTTP backend (same origin/IP) behind the per-IP auth throttle
    // (5 req/60s) and an in-memory mock-SMS store keyed by phone. With the
    // default multi-fork parallelism, separate spec files logging in
    // concurrently from the same IP exhaust that throttle and flake with
    // "no session cookie set" / rate-limit errors — a cross-file test-harness
    // artifact, NOT a product bug (each file already minimizes real OTP
    // logins via direct-Prisma role grants + single-login reuse). singleFork
    // serializes the files so the throttle is never contended across them,
    // making the suite deterministic (matches the Playwright configs'
    // `workers: 1` for the same reason).
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  plugins: [swc.vite()],
});
