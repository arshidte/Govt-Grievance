import { existsSync } from 'node:fs';
import { join } from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Loads the nearest `.env` file, walking up from `cwd` to the filesystem
 * root. The monorepo keeps a single `.env` at the repo root (see
 * `.env.example`), but `apps/api` may be run with `cwd` set to `apps/api`
 * (e.g. `pnpm --filter @pg/api ...`) or to the repo root — this works
 * either way without hardcoding `../../`.
 */
function loadDotEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
}

loadDotEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Runtime (Prisma Client) connection — the least-privilege application role
  // in a hardened deployment. The ONLY DB URL the live API requires.
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  // Privileged connection for Prisma Migrate / schema tooling (schema owner).
  // Optional at app runtime: Prisma Client never evaluates `directUrl`, so the
  // API boots without it; only `prisma migrate|db` commands need it set. See
  // docs/db-least-privilege.md.
  DIRECT_DATABASE_URL: z.string().min(1).optional(),
  // TEST-ONLY: explicit runtime-role URL used by the least-privilege
  // verification spec (test/runtime-role-privileges.e2e-spec.ts) to connect AS
  // the constrained role and assert the allow/deny matrix. Never read by app
  // code; the spec self-skips when it is unset.
  RUNTIME_DATABASE_URL: z.string().min(1).optional(),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN_CITIZEN: z.string().min(1).default('http://localhost:3000'),
  CORS_ORIGIN_ADMIN: z.string().min(1).default('http://localhost:3001'),
  SESSION_COOKIE_NAME: z.string().min(1).default('pg_session'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(720),
  // Validity window (seconds) of a pending staff-onboarding record — how long
  // the admin has to verify the MSG91 OTP after initiating. (Login OTP lifetime
  // is owned by MSG91, not this value.)
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  // Per-IP request limit for `/auth/*` routes within a 60s window, enforced
  // by the global throttler (see src/common/throttler.config.ts, which now
  // sources this validated value so there is ONE config contract). The
  // PRODUCTION value is fixed at the default 5 (strict — auth endpoints are
  // throttled harder than general routes). It is overridable ONLY outside
  // production (the Playwright browser e2e performs many real OTP logins from
  // a single IP and raises it); the production guard below rejects any
  // non-default override so a relaxed limit can never ship.
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(5),
  // Max on-behalf issues one representative may file per rolling hour (M2
  // Task 12 / spec §9). Fail-safe default of 20; enforced per-rep with a
  // DB-backed counter that FAILS CLOSED if the count query errors.
  ON_BEHALF_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(20),
  // MSG91 OTP widget integration. Login + staff-onboarding verification are
  // driven by the MSG91 browser widget; the server validates the widget's
  // access token via `verifyAccessToken`. `mock` (dev/test) uses an in-process
  // verifier that trusts a `test-otp:<phone>` token so the suite can mint
  // sessions without the external service; `live` calls MSG91 with
  // `MSG91_AUTHKEY`.
  MSG91_PROVIDER: z.enum(['mock', 'live']).default('mock'),
  // Server-side secret (MSG91 "authkey") — required only when MSG91_PROVIDER=live.
  // NEVER commit a real value; supply via the deployment secret store.
  MSG91_AUTHKEY: z.string().min(1).optional(),
  // MSG91 server verify endpoint (override only for testing/self-host).
  MSG91_VERIFY_URL: z
    .string()
    .url()
    .default('https://control.msg91.com/api/v5/widget/verifyAccessToken'),
  // Filesystem root for the local-disk attachment storage provider (M2
  // Task 14 / spec §10, ruling R-ENV). MUST resolve OUTSIDE any app's
  // public/static web root — it is served only via the authenticated
  // download endpoint (Task 16), never directly by a static file server.
  // Relative paths are resolved against `process.cwd()` by the provider.
  // Local-disk storage is DEVELOPMENT-ONLY; see `local-disk.storage.ts`.
  ATTACHMENT_STORAGE_DIR: z.string().min(1).default('.data/attachments'),
}).superRefine((e, ctx) => {
  // Fail closed: the in-process MOCK MSG91 verifier (which trusts a
  // `test-otp:<phone>` token) must never run in production. MSG91_PROVIDER
  // defaults to 'mock', so an unset value in a production deploy would
  // otherwise ship a verifier that accepts forged tokens. Reject it at boot.
  if (e.NODE_ENV === 'production' && e.MSG91_PROVIDER !== 'live') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MSG91_PROVIDER'],
      message: 'MSG91_PROVIDER must be "live" in production (the mock verifier accepts forged tokens).',
    });
  }
  // The live verifier cannot authenticate to MSG91 without the authkey.
  if (e.MSG91_PROVIDER === 'live' && !e.MSG91_AUTHKEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MSG91_AUTHKEY'],
      message: 'MSG91_AUTHKEY is required when MSG91_PROVIDER="live".',
    });
  }

  // Fail closed: the tight per-IP /auth throttle must stay at its strict
  // production default (5). A non-default value is a test-only override (the
  // Playwright e2e raises it) and must NEVER ship to production. Because
  // `.default(5)` makes an omitted value and an explicit `5` indistinguishable
  // (both resolve to 5 — the accepted default), any parsed value OTHER than 5
  // is necessarily an explicit non-default override; reject it in production.
  if (e.NODE_ENV === 'production' && e.AUTH_THROTTLE_LIMIT !== 5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_THROTTLE_LIMIT'],
      message:
        'AUTH_THROTTLE_LIMIT must not be overridden in production — it is fixed at the default 5.',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates `process.env` against the schema. Throws (via Zod)
 * on missing/invalid required keys — fail fast at boot rather than at
 * first use.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

export const env = loadEnv();
