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
 *
 * M4D (least-privilege DB roles): the TEST HARNESS is inherently
 * administrative — it seeds fixtures, PURGES append-only AuditLog rows (via the
 * superuser-only `session_replication_role` bypass), and CREATE/DROP throwaway
 * databases (migration tests). Those operations are INTENTIONALLY beyond the
 * least-privilege runtime role. So the whole suite connects with the
 * ADMIN/migration identity: we force `process.env.DATABASE_URL` (what
 * PrismaService reads) to `DIRECT_DATABASE_URL` when it is set. When it is NOT
 * set (e.g. a pre-M4D `.env` with only `DATABASE_URL`), this is a no-op and the
 * suite behaves exactly as before. The constrained runtime role is verified
 * separately by test/runtime-role-privileges.e2e-spec.ts via
 * `RUNTIME_DATABASE_URL`. This override must run BEFORE any `new PrismaService()`
 * (Prisma Client reads `process.env.DATABASE_URL` live at construction), which
 * is why it lives in this setupFiles entry.
 */
import '../src/config/env';

if (process.env.DIRECT_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL;
}
