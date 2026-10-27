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
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN_CITIZEN: z.string().min(1).default('http://localhost:3000'),
  CORS_ORIGIN_ADMIN: z.string().min(1).default('http://localhost:3001'),
  SESSION_COOKIE_NAME: z.string().min(1).default('pg_session'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(720),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RATE_LIMIT_PER_PHONE_PER_HOUR: z.coerce.number().int().positive().default(5),
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
  SMS_PROVIDER: z.string().min(1).default('mock'),
  // Filesystem root for the local-disk attachment storage provider (M2
  // Task 14 / spec §10, ruling R-ENV). MUST resolve OUTSIDE any app's
  // public/static web root — it is served only via the authenticated
  // download endpoint (Task 16), never directly by a static file server.
  // Relative paths are resolved against `process.cwd()` by the provider.
  // Local-disk storage is DEVELOPMENT-ONLY; see `local-disk.storage.ts`.
  ATTACHMENT_STORAGE_DIR: z.string().min(1).default('.data/attachments'),
}).superRefine((e, ctx) => {
  // Fail closed: the in-memory mock SMS provider must never run in
  // production. SMS_PROVIDER defaults to 'mock', so an unset value in a
  // production deploy would otherwise silently ship a non-delivering
  // provider that also retains codes in memory. Reject it at boot.
  if (e.NODE_ENV === 'production' && e.SMS_PROVIDER === 'mock') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMS_PROVIDER'],
      message:
        'SMS_PROVIDER must not be "mock" in production — configure a real SMS provider.',
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
