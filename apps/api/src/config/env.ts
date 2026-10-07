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
  SMS_PROVIDER: z.string().min(1).default('mock'),
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
