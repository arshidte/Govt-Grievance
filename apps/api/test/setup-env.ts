/**
 * Vitest `setupFiles` entry for the e2e config (Task 28, Priority 3).
 *
 * Most e2e specs transitively import `AppModule` (-> `src/config/env.ts`),
 * whose top-level `loadDotEnv()` side effect populates `process.env` from
 * the repo-root `.env`. `test/seed.e2e-spec.ts` is the one exception: it
 * imports only `PrismaClient` and `seedAll` from `prisma/seed.ts` (a
 * standalone script with no `env.ts` dependency), so nothing loads the
 * root `.env` before it calls `new PrismaClient()` — that failed with
 * "Environment variable not found: DATABASE_URL" when running via
 * `pnpm turbo run test` (and in CI) even though `.env` exists at the repo
 * root. Vitest/Vite's own automatic env loading (the "injected env (N)
 * from ../../.env" log line) only affects Vite's internal `import.meta.env`
 * and does NOT populate Node's `process.env`, so it doesn't help here.
 *
 * Importing `src/config/env.ts` here (for its `loadDotEnv` side effect)
 * runs the exact same root-`.env`-discovery logic the app itself uses in
 * every environment (dev, prod, this test run), rather than introducing a
 * second, divergent way to find env vars. It is a no-op if some other
 * spec file already triggered it first (dotenv does not overwrite
 * already-set `process.env` keys by default).
 */
import '../src/config/env';
