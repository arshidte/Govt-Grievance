# Foundation (Milestone 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the platform foundation end-to-end — phone-OTP authentication → unified identity → scoped RBAC → application shells → responsive nav → i18n → design system → auditability — with a real NestJS/Prisma backend and two Next.js apps in a pnpm/Turborepo monorepo.

**Architecture:** Two Next.js App Router apps (`citizen`, `admin`) + one NestJS REST API (`api`) in a pnpm workspace orchestrated by Turborepo. Shared packages hold the Zod/type contract, the design system, the typed API client, i18n catalogs, and tooling presets. Browsers talk only to their own Next origin; thin Next route handlers (BFF) proxy auth to NestJS and set an httpOnly session cookie. NestJS owns all business logic and authorization; sessions are DB-backed and revocable.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript (strict), Next.js (App Router), NestJS, Prisma, PostgreSQL, Zod, next-intl, TanStack Query, React Hook Form, Tailwind CSS, shadcn/ui + Radix, Vitest, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-foundation-design.md` — read it alongside this plan; this plan implements that spec's Milestone 1 scope.

## M1 delivery map (implemented / scaffolded / deferred)

**Fully implemented in M1:**
- Monorepo + tooling + shared config, types, i18n, api-client, ui design system
- Prisma schema for ALL foundation + issue-domain relationships; migration; seed
- Phone-OTP auth (request/verify/logout/me) with `SmsProvider` abstraction + mock
- DB-backed, immediately-revocable sessions; httpOnly cookie (web)
- Scoped RBAC (`AccessControl` service + Nest guards + decorators)
- Audit logging for auth + access events
- Read endpoints: panchayats, wards, categories, current-user profile
- Rate limiting + security middleware + global error handling
- Citizen app shell: landing, track (public), login/verify, register, authed home/profile, bottom nav, UI states, i18n
- Admin app shell: login/verify (staff-role gated), dashboard home, responsive sidebar/drawer, role-based nav, placeholder module pages, UI states, i18n
- Vitest unit/component tests + Playwright e2e for both auth flows

**Scaffolded in M1 (structure exists, filled in later milestones):**
- Issue-domain Prisma tables (Issue, IssueAssignment, IssueStatusHistory, Escalation, Notification, Attachment) — relationships only, no endpoints/UI
- `NotificationsModule`, `AttachmentsModule`, `IssuesModule` — empty NestJS module shells
- Admin module routes (issues, panchayats, wards, representatives, coordinators, citizens, categories, escalations, notifications, reports, settings, audit-logs) — render shell + "coming soon" empty states, nav wired
- UI components not needed by M1 screens (DatePicker, FileUploader, FilterPanel, data Table, Pagination, Timeline) — listed, built when their consuming feature lands

**Explicitly deferred (NOT in M1):** Issue submission/tracking UI & workflow (M2); org-entity & category management CRUD UI (M4); password/MFA/2FA staff auth; real SMS provider; AWS infra; offline submission.

## Global Constraints

- Node `>=20`; pnpm `>=9`; PostgreSQL `16`. TypeScript `strict: true` everywhere; `any` only with an inline justification comment.
- Next.js App Router only (no Pages Router). NestJS with REST only. Prisma as the only DB access layer.
- All user-facing text comes from next-intl message keys — never hardcode display strings in components. English catalog complete; Malayalam catalog present (may contain English fallback values where translation pending).
- Categories/subcategories are DB-driven and served via API — the frontend must never hardcode the category list.
- Status/priority indicators must use icon **+ text**, never color alone (WCAG).
- Auth responses (request-otp / verify-otp failures) must be uniform and must not disclose whether a phone exists or is a staff account.
- Self-registration creates ONLY a citizen identity; staff capability comes solely from an admin/seed-granted `RoleAssignment`.
- Sessions are DB-backed and revocation takes effect on the next request.
- Backend is the authoritative authorization layer; frontend `can()` checks are UX-only.
- OTP codes are never stored or logged in plaintext (store only a hash); OTP request & verify are rate-limited per phone and per IP.
- Secrets only via environment variables; `.env` is gitignored; `.env.example` committed.
- Commit after each task's tests pass. Conventional-commit messages.

## Review Focus

These are foundation-wide failure modes the spec implies but that no single happy-path task fully exercises. Each has a pinned test in the task that owns the code.

1. **Expired / already-consumed / wrong OTP** must fail uniformly without creating a session and without revealing account existence — pinned in Task 9.
2. **Revoked or expired session** presented on a later request must be rejected (revocation takes effect immediately) — pinned in Task 10.
3. **Scope escalation**: a COORDINATOR@PanchayatA must be denied acting on resources in PanchayatB; a citizen must be denied staff-only endpoints — pinned in Task 12.
4. **Staff-role gate on admin app**: a valid citizen session reaching the admin app must be forbidden (not crash, not blank) — pinned in Task 24.
5. **OTP rate-limit exhaustion** returns `429` with a translated message and does not leak attempt internals — pinned in Task 9 / Task 15.

---

## PHASE A — Monorepo & tooling

### Task 1: Initialize pnpm + Turborepo workspace

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.npmrc`, `.env.example`
- Modify: `.gitignore` (already present)

**Interfaces:**
- Produces: workspace globs `apps/*`, `packages/*`; root scripts `pnpm dev|build|lint|test`; turbo pipeline.

- [ ] **Step 1:** Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2:** Create root `package.json`:

```json
{
  "name": "panchayat-platform",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3:** Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 4:** Create `.nvmrc` (`20`), `.npmrc` (`auto-install-peers=true` and `node-linker=hoisted`), and `.env.example` with documented keys:

```
# API
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/panchayat?schema=public
API_PORT=4000
SESSION_COOKIE_NAME=pg_session
SESSION_TTL_HOURS=720
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5
OTP_RATE_LIMIT_PER_PHONE_PER_HOUR=5
SMS_PROVIDER=mock
# Web (citizen/admin)
API_INTERNAL_URL=http://localhost:4000
```

- [ ] **Step 5:** Run `pnpm install` and verify the workspace resolves.

Run: `pnpm install && pnpm turbo run build --dry=json`
Expected: dry run lists the (currently empty) package graph with no errors.

- [ ] **Step 6:** Commit.

```bash
git add -A && git commit -m "chore: initialize pnpm + turborepo workspace"
```

**Acceptance criteria:** `pnpm install` succeeds; `turbo` runs; workspace globs recognized; `.env.example` documents every env key used in later tasks.

---

### Task 2: Shared tooling config package

**Files:**
- Create: `packages/config/package.json`, `packages/config/tsconfig.base.json`, `packages/config/eslint.base.cjs`, `packages/config/tailwind.preset.ts`

**Interfaces:**
- Produces: `@pg/config/tsconfig.base.json` (strict TS base), `@pg/config/eslint.base.cjs`, `@pg/config/tailwind.preset` consumed by every package/app.

- [ ] **Step 1:** Create `packages/config/package.json`:

```json
{
  "name": "@pg/config",
  "version": "0.0.0",
  "private": true,
  "main": "index.js",
  "exports": {
    "./tsconfig.base.json": "./tsconfig.base.json",
    "./eslint.base.cjs": "./eslint.base.cjs",
    "./tailwind.preset": "./tailwind.preset.ts"
  },
  "devDependencies": { "tailwindcss": "^3.4.0" }
}
```

- [ ] **Step 2:** Create `packages/config/tsconfig.base.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 3:** Create `eslint.base.cjs` (typescript-eslint recommended + import ordering) and `tailwind.preset.ts` (empty preset object `export default { theme: { extend: {} } }` — tokens added in Task 17).

- [ ] **Step 4:** Commit.

```bash
git add -A && git commit -m "chore(config): shared tsconfig, eslint, tailwind preset"
```

**Acceptance criteria:** other packages can `extends` the base tsconfig and import the tailwind preset without error.

---

## PHASE B — Shared contract packages

### Task 3: `packages/types` — Zod schemas & inferred types

**Files:**
- Create: `packages/types/package.json`, `tsconfig.json`, `src/index.ts`, `src/enums.ts`, `src/auth.ts`, `src/user.ts`, `src/org.ts`, `src/category.ts`
- Test: `packages/types/src/auth.test.ts`

**Interfaces:**
- Produces (imported as `@pg/types`):
  - Enums: `Role = 'ADMIN'|'COORDINATOR'|'REPRESENTATIVE'|'CITIZEN'`, `UserStatus`, `Language = 'en'|'ml'`.
  - `requestOtpSchema` → `{ phone: string }`; `verifyOtpSchema` → `{ phone: string; code: string }`.
  - `phoneSchema` (E.164 India: `^\+91[6-9]\d{9}$`), `otpCodeSchema` (`^\d{6}$`).
  - `RoleAssignmentDTO`, `MeResponse`, `CategoryDTO`, `PanchayatDTO`, `WardDTO` types.

- [ ] **Step 1: Write the failing test** `src/auth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { requestOtpSchema, verifyOtpSchema, phoneSchema } from './index';

describe('auth schemas', () => {
  it('accepts a valid Indian E.164 phone', () => {
    expect(phoneSchema.safeParse('+919876543210').success).toBe(true);
  });
  it('rejects a non-E.164 phone', () => {
    expect(phoneSchema.safeParse('9876543210').success).toBe(false);
  });
  it('verifyOtp requires a 6-digit code', () => {
    expect(verifyOtpSchema.safeParse({ phone: '+919876543210', code: '123' }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ phone: '+919876543210', code: '123456' }).success).toBe(true);
  });
  it('requestOtp requires phone only', () => {
    expect(requestOtpSchema.safeParse({ phone: '+919876543210' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pg/types test`
Expected: FAIL (module not found / exports undefined).

- [ ] **Step 3: Implement** `src/enums.ts`:

```ts
import { z } from 'zod';
export const RoleEnum = z.enum(['ADMIN', 'COORDINATOR', 'REPRESENTATIVE', 'CITIZEN']);
export type Role = z.infer<typeof RoleEnum>;
export const STAFF_ROLES: Role[] = ['ADMIN', 'COORDINATOR', 'REPRESENTATIVE'];
export const LanguageEnum = z.enum(['en', 'ml']);
export type Language = z.infer<typeof LanguageEnum>;
export const UserStatusEnum = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatusEnum>;
```

- [ ] **Step 4: Implement** `src/auth.ts`:

```ts
import { z } from 'zod';
export const phoneSchema = z.string().regex(/^\+91[6-9]\d{9}$/, 'invalid_phone');
export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'invalid_code');
export const requestOtpSchema = z.object({ phone: phoneSchema });
export const verifyOtpSchema = z.object({ phone: phoneSchema, code: otpCodeSchema });
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
```

- [ ] **Step 5: Implement** `src/user.ts`, `src/org.ts`, `src/category.ts`, and barrel `src/index.ts`:

```ts
// src/user.ts
import { z } from 'zod';
import { RoleEnum, LanguageEnum, UserStatusEnum } from './enums';
export const roleAssignmentDTO = z.object({
  id: z.string(), role: RoleEnum,
  panchayatId: z.string().nullable(), wardId: z.string().nullable(),
});
export type RoleAssignmentDTO = z.infer<typeof roleAssignmentDTO>;
export const meResponse = z.object({
  id: z.string(), phone: z.string(), fullName: z.string().nullable(),
  email: z.string().nullable(), preferredLanguage: LanguageEnum,
  status: UserStatusEnum, roles: z.array(roleAssignmentDTO),
});
export type MeResponse = z.infer<typeof meResponse>;
export const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal('')),
  preferredLanguage: LanguageEnum,
  addressLine: z.string().max(240).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
```

```ts
// src/org.ts
import { z } from 'zod';
export const wardDTO = z.object({ id: z.string(), number: z.number(), name: z.string(), nameMl: z.string(), panchayatId: z.string() });
export const panchayatDTO = z.object({ id: z.string(), code: z.string(), name: z.string(), nameMl: z.string(), status: z.string() });
export type WardDTO = z.infer<typeof wardDTO>;
export type PanchayatDTO = z.infer<typeof panchayatDTO>;
```

```ts
// src/category.ts
import { z } from 'zod';
export const subcategoryDTO = z.object({ id: z.string(), name: z.string(), nameMl: z.string() });
export const categoryDTO = z.object({ id: z.string(), slug: z.string(), name: z.string(), nameMl: z.string(), subcategories: z.array(subcategoryDTO) });
export type CategoryDTO = z.infer<typeof categoryDTO>;
```

```ts
// src/index.ts
export * from './enums';
export * from './auth';
export * from './user';
export * from './org';
export * from './category';
```

Create `packages/types/package.json` (name `@pg/types`, `main` `src/index.ts`, dep `zod@^3.23`, devDep `vitest`) and `tsconfig.json` extending `@pg/config/tsconfig.base.json`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @pg/types test`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit.**

```bash
git add -A && git commit -m "feat(types): shared zod contract for auth, user, org, category"
```

**Acceptance criteria:** schemas validate the documented valid/invalid cases; types import cleanly as `@pg/types`; tests green.

---

### Task 4: `packages/i18n` — next-intl catalogs + enum→key maps

**Files:**
- Create: `packages/i18n/package.json`, `tsconfig.json`, `src/index.ts`, `messages/en.json`, `messages/ml.json`, `src/enumLabels.ts`
- Test: `packages/i18n/src/enumLabels.test.ts`

**Interfaces:**
- Produces (`@pg/i18n`): `locales = ['en','ml']`, `defaultLocale = 'en'`, `messages` loader, `statusLabelKey(status)`, `priorityLabelKey(priority)`, `roleLabelKey(role)` returning message-key strings (never raw enum text to users).

- [ ] **Step 1: Write failing test** `src/enumLabels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { roleLabelKey, priorityLabelKey } from './enumLabels';
import en from '../messages/en.json';

describe('enum label keys', () => {
  it('maps a role to an existing en message key', () => {
    const key = roleLabelKey('REPRESENTATIVE'); // e.g. "role.representative"
    const [ns, k] = key.split('.');
    expect((en as any)[ns][k]).toBeTypeOf('string');
  });
  it('maps every priority to a present key', () => {
    for (const p of ['LOW','MEDIUM','HIGH','URGENT'] as const) {
      const [ns, k] = priorityLabelKey(p).split('.');
      expect((en as any)[ns][k]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @pg/i18n test` → FAIL.

- [ ] **Step 3: Implement** `messages/en.json` with namespaces: `common`, `nav`, `auth`, `role`, `status`, `priority`, `states` (loading/empty/error/forbidden/offline/noResults), `category`. Example excerpt:

```json
{
  "common": { "appName": "Panchayat Grievance Platform", "submit": "Submit", "cancel": "Cancel", "retry": "Try again" },
  "auth": { "phoneLabel": "Mobile number", "sendOtp": "Send OTP", "otpLabel": "Enter the 6-digit code", "verify": "Verify", "otpSent": "If the number is valid, a code has been sent.", "invalidCode": "That code is incorrect or expired.", "tooMany": "Too many attempts. Please wait and try again." },
  "role": { "admin": "Administrator", "coordinator": "Panchayat Coordinator", "representative": "Ward Representative", "citizen": "Citizen" },
  "priority": { "low": "Low", "medium": "Medium", "high": "High", "urgent": "Urgent" },
  "status": { "submitted": "Submitted", "acknowledged": "Acknowledged", "underReview": "Under review", "assigned": "Assigned", "inProgress": "In progress", "waitingForInformation": "More information required", "escalated": "Escalated", "resolved": "Resolved", "closed": "Closed", "reopened": "Reopened" },
  "states": { "loading": "Loading…", "emptyIssues": "You haven't reported any issues yet.", "noResults": "No results match your filters.", "error": "Something went wrong. Please try again.", "forbidden": "You don't have access to this page.", "offline": "You appear to be offline." },
  "nav": { "dashboard": "Dashboard", "issues": "Issues", "panchayats": "Panchayats", "wards": "Wards", "representatives": "Representatives", "coordinators": "Coordinators", "citizens": "Citizens", "categories": "Categories", "escalations": "Escalations", "notifications": "Notifications", "reports": "Reports", "settings": "Settings", "auditLogs": "Audit logs", "home": "Home", "track": "Track", "report": "Report an issue", "profile": "Profile" }
}
```

Create `messages/ml.json` with the same keys (Malayalam values where known, English fallback otherwise). Implement `src/enumLabels.ts`:

```ts
import type { Role } from '@pg/types';
export const roleLabelKey = (r: Role) => `role.${r.toLowerCase()}`;
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export const priorityLabelKey = (p: Priority) =>
  `priority.${p.toLowerCase()}`;
const STATUS_KEY: Record<string, string> = {
  SUBMITTED: 'status.submitted', ACKNOWLEDGED: 'status.acknowledged',
  UNDER_REVIEW: 'status.underReview', ASSIGNED: 'status.assigned',
  IN_PROGRESS: 'status.inProgress', WAITING_FOR_INFORMATION: 'status.waitingForInformation',
  ESCALATED: 'status.escalated', RESOLVED: 'status.resolved',
  CLOSED: 'status.closed', REOPENED: 'status.reopened',
};
export const statusLabelKey = (s: string) => STATUS_KEY[s] ?? 'status.submitted';
```

And `src/index.ts`:

```ts
export const locales = ['en', 'ml'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
export const loadMessages = async (locale: Locale) =>
  (await import(`../messages/${locale}.json`)).default;
export * from './enumLabels';
```

- [ ] **Step 4: Run** `pnpm --filter @pg/i18n test` → PASS.
- [ ] **Step 5:** Add a key-parity test ensuring `Object.keys(en)` deep-equals `Object.keys(ml)` so no key is missing in Malayalam. Run → PASS.
- [ ] **Step 6: Commit.**

```bash
git add -A && git commit -m "feat(i18n): next-intl en/ml catalogs + enum label keys"
```

**Acceptance criteria:** en/ml catalogs have identical key sets; enum→key helpers resolve to present keys; no citizen-facing raw enum names.

---

## PHASE C — Backend API (`apps/api`)

### Task 5: NestJS bootstrap + config + Prisma module

**Files:**
- Create: `apps/api/package.json`, `tsconfig.json`, `nest-cli.json`, `src/main.ts`, `src/app.module.ts`, `src/config/env.ts`, `src/prisma/prisma.service.ts`, `src/prisma/prisma.module.ts`, `src/health/health.controller.ts`
- Test: `apps/api/test/health.e2e-spec.ts`

**Interfaces:**
- Produces: Nest app on `API_PORT`; `PrismaService` (extends `PrismaClient`, `onModuleInit` connects); validated `env` object; `GET /api/v1/health` → `{ status: 'ok' }`.

- [ ] **Step 1: Write failing e2e** `test/health.e2e-spec.ts` booting the app and asserting `GET /api/v1/health` returns 200 `{status:'ok'}` (Supertest + Vitest).
- [ ] **Step 2: Run** `pnpm --filter @pg/api test` → FAIL.
- [ ] **Step 3: Implement** env loader with Zod (`src/config/env.ts` parses `process.env` against a schema; throws on missing keys), `PrismaService`/`PrismaModule`, `HealthController`, `AppModule` (imports `PrismaModule`, `ConfigModule` global), and `main.ts` that sets global prefix `api/v1`, enables CORS for the two web origins with `credentials: true`, `cookie-parser`, and listens on `env.API_PORT`.
- [ ] **Step 4: Run** the e2e → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(api): nestjs bootstrap, env, prisma, health"`

**Acceptance criteria:** app boots with a validated env; `/api/v1/health` green; Prisma connects.

---

### Task 6: Prisma schema (all foundation + issue-domain relationships), migration & client

**Files:**
- Create: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*`
- Test: `apps/api/test/schema.spec.ts`

**Interfaces:**
- Produces: generated Prisma client with models `User, OtpChallenge, Session, RoleAssignment, Panchayat, Ward, Category, Subcategory` (full) and relationship-only `Issue, IssueAssignment, IssueStatusHistory, Escalation, Notification, Attachment, AuditLog`.

- [ ] **Step 1: Write failing test** `test/schema.spec.ts` asserting (via a throwaway test DB) that a `User` can hold two `RoleAssignment`s with different scopes, and that creating an `Issue` requires `citizenId`, `createdById`, and `onBehalfOf`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

describe('schema relationships', () => {
  beforeAll(async () => { await db.$connect(); });
  it('a user holds multiple scoped role assignments', async () => {
    const p = await db.panchayat.create({ data: { code: 'T1', name: 'T', nameMl: 'T', status: 'active' } });
    const w = await db.ward.create({ data: { number: 1, name: 'W1', nameMl: 'W1', panchayatId: p.id } });
    const u = await db.user.create({ data: { phone: '+919000000001', preferredLanguage: 'en', status: 'active',
      roleAssignments: { create: [
        { role: 'COORDINATOR', panchayatId: p.id },
        { role: 'REPRESENTATIVE', wardId: w.id },
      ] } }, include: { roleAssignments: true } });
    expect(u.roleAssignments).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @pg/api test -- schema` → FAIL (no models).
- [ ] **Step 3: Implement** `schema.prisma`. Key models (abridged — issue-domain models carry FKs only, minimal scalar fields, filled in M2):

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Role { ADMIN COORDINATOR REPRESENTATIVE CITIZEN }
enum UserStatus { active disabled }
enum Language { en ml }

model User {
  id                String   @id @default(cuid())
  phone             String   @unique
  email             String?
  fullName          String?
  preferredLanguage Language @default(en)
  status            UserStatus @default(active)
  addressLine       String?
  wardId            String?
  ward              Ward?    @relation(fields: [wardId], references: [id])
  roleAssignments   RoleAssignment[]
  sessions          Session[]
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  // issue-domain back-relations (M2):
  issuesAsCitizen   Issue[]  @relation("issueCitizen")
  issuesCreated     Issue[]  @relation("issueCreatedBy")
  notifications     Notification[]
}

model OtpChallenge {
  id         String   @id @default(cuid())
  phone      String
  codeHash   String
  purpose    String   @default("login")
  attempts   Int      @default(0)
  expiresAt  DateTime
  consumedAt DateTime?
  createdAt  DateTime @default(now())
  @@index([phone, createdAt])
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  tokenHash String   @unique
  userAgent String?
  ip        String?
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime @default(now())
  @@index([userId])
}

model RoleAssignment {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  role        Role
  panchayatId String?
  panchayat   Panchayat? @relation(fields: [panchayatId], references: [id])
  wardId      String?
  ward        Ward?    @relation(fields: [wardId], references: [id])
  grantedBy   String?
  createdAt   DateTime @default(now())
  @@unique([userId, role, panchayatId, wardId])
}

model Panchayat {
  id        String   @id @default(cuid())
  code      String   @unique
  name      String
  nameMl    String
  contactPhone String?
  contactEmail String?
  status    String   @default("active")
  wards     Ward[]
  roleAssignments RoleAssignment[]
  issues    Issue[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Ward {
  id          String   @id @default(cuid())
  number      Int
  name        String
  nameMl      String
  panchayatId String
  panchayat   Panchayat @relation(fields: [panchayatId], references: [id])
  status      String   @default("active")
  roleAssignments RoleAssignment[]
  users       User[]
  issues      Issue[]
  @@unique([panchayatId, number])
}

model Category {
  id        String   @id @default(cuid())
  slug      String   @unique
  name      String
  nameMl    String
  sortOrder Int      @default(0)
  subcategories Subcategory[]
  issues    Issue[]
}
model Subcategory {
  id         String   @id @default(cuid())
  categoryId String
  category   Category @relation(fields: [categoryId], references: [id])
  name       String
  nameMl     String
}

// ---- Issue domain: relationships fixed now, fields in M2 ----
model Issue {
  id           String  @id @default(cuid())
  referenceNo  String  @unique
  citizenId    String
  citizen      User    @relation("issueCitizen", fields: [citizenId], references: [id])
  createdById  String
  createdBy    User    @relation("issueCreatedBy", fields: [createdById], references: [id])
  onBehalfOf   Boolean @default(false)
  panchayatId  String
  panchayat    Panchayat @relation(fields: [panchayatId], references: [id])
  wardId       String
  ward         Ward    @relation(fields: [wardId], references: [id])
  categoryId   String
  category     Category @relation(fields: [categoryId], references: [id])
  createdAt    DateTime @default(now())
  assignments      IssueAssignment[]
  statusHistory    IssueStatusHistory[]
  escalations      Escalation[]
  attachments      Attachment[]
  notifications    Notification[]
}
model IssueAssignment     { id String @id @default(cuid()) issueId String issue Issue @relation(fields:[issueId],references:[id]) assigneeId String createdAt DateTime @default(now()) }
model IssueStatusHistory  { id String @id @default(cuid()) issueId String issue Issue @relation(fields:[issueId],references:[id]) status String createdAt DateTime @default(now()) }
model Escalation          { id String @id @default(cuid()) issueId String issue Issue @relation(fields:[issueId],references:[id]) createdAt DateTime @default(now()) }
model Attachment          { id String @id @default(cuid()) issueId String issue Issue @relation(fields:[issueId],references:[id]) storageKey String createdAt DateTime @default(now()) }
model Notification        { id String @id @default(cuid()) recipientId String recipient User @relation(fields:[recipientId],references:[id]) issueId String? issue Issue? @relation(fields:[issueId],references:[id]) type String readAt DateTime? createdAt DateTime @default(now()) }

model AuditLog {
  id          String   @id @default(cuid())
  actorUserId String?
  action      String
  entityType  String
  entityId    String?
  metadata    Json?
  ip          String?
  createdAt   DateTime @default(now())
  @@index([entityType, entityId])
  @@index([actorUserId, createdAt])
}
```

- [ ] **Step 4:** Run `pnpm --filter @pg/api exec prisma migrate dev --name init_foundation` then `prisma generate`.
- [ ] **Step 5: Run** the schema test → PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat(api): prisma schema + init migration for foundation + issue relationships"`

**Acceptance criteria:** migration applies cleanly; a user can hold multiple scoped role assignments; issue-domain FKs exist; client generates.

---

### Task 7: Zod validation pipe + global exception filter

**Files:**
- Create: `apps/api/src/common/zod-validation.pipe.ts`, `apps/api/src/common/http-exception.filter.ts`, `apps/api/src/common/api-error.ts`
- Test: `apps/api/test/exception-filter.spec.ts`, `apps/api/src/common/zod-validation.pipe.spec.ts`

**Interfaces:**
- Produces: `ZodValidationPipe(schema)`; `AllExceptionsFilter` that maps errors to `{ error: { code, messageKey } }` with correct HTTP status and **never** leaks stack/internal messages; `ApiError(code, status, messageKey)`.

- [ ] **Step 1: Write failing tests:** pipe rejects invalid body with 422 + `messageKey`; filter maps an unknown `Error` to 500 with generic `errors.server` and no stack in body; maps `ApiError('rate_limited',429,'auth.tooMany')` to 429.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the pipe (parses with schema, throws `ApiError('validation',422,firstIssueKey)`) and the filter (switch on `ApiError`/`HttpException`/unknown; body shape `{ error: { code, messageKey } }`; log full detail server-side only).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5:** Wire filter globally in `main.ts`.
- [ ] **Step 6: Commit.** `git commit -m "feat(api): zod pipe + safe global exception filter"`

**Acceptance criteria:** validation failures → 422 + key; unexpected errors → 500 generic, no internals; messageKeys resolvable by i18n.

---

### Task 8: SMS provider abstraction + mock

**Files:**
- Create: `apps/api/src/sms/sms-provider.interface.ts`, `src/sms/mock-sms.provider.ts`, `src/sms/sms.module.ts`
- Test: `apps/api/src/sms/mock-sms.provider.spec.ts`

**Interfaces:**
- Produces: `SmsProvider` interface `{ send(phone: string, message: string): Promise<void> }`; `MockSmsProvider` (records sent messages in-memory + logs; exposes `lastCodeFor(phone)` for tests/dev); DI token `SMS_PROVIDER` selected by `env.SMS_PROVIDER`.

- [ ] **Step 1: Write failing test:** `MockSmsProvider.send` stores the message and `lastMessageFor(phone)` returns it.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(api): sms provider abstraction + mock"`

**Acceptance criteria:** provider resolved via DI token; swapping to a real provider later needs no change outside `sms/`.

---

### Task 9: OTP service (request/verify, hashing, rate limit, attempts)

**Files:**
- Create: `apps/api/src/auth/otp.service.ts`
- Test: `apps/api/src/auth/otp.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `SmsProvider`, `env`.
- Produces: `OtpService.request(phone, ctx)` (rate-limit check → generate 6-digit → store `codeHash` (bcrypt/argon) → send via SMS; returns void regardless of account existence); `OtpService.verify(phone, code)` → returns `{ ok: true }` or throws `ApiError`; consumes challenge atomically; increments attempts; enforces `OTP_MAX_ATTEMPTS` and `OTP_TTL_SECONDS`.

- [ ] **Step 1: Write failing tests** (Review Focus #1, #5):

```ts
// pseudocode of assertions
it('verify fails for an expired challenge without throwing account info', ...) // → ApiError invalid_code
it('verify fails for an already-consumed challenge', ...)
it('verify fails after max attempts with rate_limited', ...)
it('request is rate-limited per phone per hour -> ApiError rate_limited (429)', ...)
it('stored codeHash never equals the raw code', ...)
it('verify succeeds with the correct fresh code and marks consumedAt', ...)
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `OtpService` exactly to those behaviors (crypto-random 6 digits; hash with argon2/bcrypt; count recent challenges for rate limit; transaction on verify to set `consumedAt`; uniform errors).
- [ ] **Step 4: Run** → PASS (all 6).
- [ ] **Step 5: Commit.** `git commit -m "feat(api): otp service with hashing, rate limiting, attempt caps"`

**Acceptance criteria:** Review Focus #1 & #5 pinned green; no plaintext code stored; uniform failures.

---

### Task 10: Session service (DB-backed, revocable) + cookie helper

**Files:**
- Create: `apps/api/src/auth/session.service.ts`, `src/auth/cookie.util.ts`
- Test: `apps/api/src/auth/session.service.spec.ts`

**Interfaces:**
- Produces: `SessionService.create(userId, ctx)` → `{ token }` (stores only `tokenHash`, sets `expiresAt` from `SESSION_TTL_HOURS`); `SessionService.validate(token)` → `User` with `roleAssignments` or throws (rejects expired/revoked); `SessionService.revoke(token)`; cookie attrs `Secure; HttpOnly; SameSite=Lax; Path=/`.

- [ ] **Step 1: Write failing tests** (Review Focus #2): valid token resolves user; revoked token → reject on next validate; expired token → reject; `tokenHash` stored, raw token never persisted.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(api): db-backed revocable sessions + cookie util"`

**Acceptance criteria:** Review Focus #2 pinned green; revocation effective immediately; opaque token, hashed at rest.

---

### Task 11: AuthModule — controller, AuthGuard, endpoints

**Files:**
- Create: `apps/api/src/auth/auth.controller.ts`, `src/auth/auth.service.ts`, `src/auth/auth.guard.ts`, `src/auth/current-user.decorator.ts`, `src/auth/auth.module.ts`
- Test: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `OtpService`, `SessionService`, `PrismaService`, `AuditService` (Task 13).
- Produces endpoints (all under `/api/v1/auth`): `POST request-otp`, `POST verify-otp` (on success: upsert citizen `User` if new, create session, set cookie, return `MeResponse`), `POST logout`, `GET me`. `AuthGuard` reads cookie → `SessionService.validate` → attaches `req.user`. `@CurrentUser()` decorator.

- [ ] **Step 1: Write failing e2e:** full happy path (request-otp → read mock code → verify-otp sets cookie → `GET me` returns the user with empty `roles` for a new citizen); `GET me` without cookie → 401; verify with wrong code → 401/422 generic.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** New-phone verify creates a CITIZEN identity (no staff role). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(api): auth endpoints, guard, current-user decorator"`

**Acceptance criteria:** happy path works end-to-end via mock SMS; unauthenticated `me` → 401; new verify yields citizen-only identity (Global Constraint: self-register = citizen only).

---

### Task 12: AccessControl service + RBAC guard + decorators

**Files:**
- Create: `apps/api/src/access/access-control.service.ts`, `src/access/roles.decorator.ts`, `src/access/rbac.guard.ts`, `src/access/scope.ts`, `src/access/access.module.ts`
- Test: `apps/api/src/access/access-control.service.spec.ts`

**Interfaces:**
- Produces: `AccessControlService.can(user, action, resourceScope)` where `resourceScope = { panchayatId?, wardId? }`; helpers `isStaff(user)`, `hasRole(user, role, scope?)`. `@Roles(...roles)` + optional `@ScopeFrom('param'|'query', key)` metadata; `RbacGuard` enforces role **and** scope: ADMIN passes all; COORDINATOR passes when `panchayatId` matches an assignment; REPRESENTATIVE passes when `wardId` matches (or its ward's panchayat for panchayat-scoped reads).

- [ ] **Step 1: Write failing tests** (Review Focus #3):

```ts
it('ADMIN can act on any scope', ...)
it('COORDINATOR@P1 denied on P2', ...)
it('REPRESENTATIVE@W1 denied on W2', ...)
it('CITIZEN denied a staff-only action', ...)
it('COORDINATOR@P1 allowed on a ward within P1', ...)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** service + guard + decorators. **Step 4: Run** → PASS (5).
- [ ] **Step 5: Commit.** `git commit -m "feat(api): scoped RBAC access control service + guard"`

**Acceptance criteria:** Review Focus #3 pinned green; scope escalation denied; ADMIN global.

---

### Task 13: Audit service + auth/access audit events

**Files:**
- Create: `apps/api/src/audit/audit.service.ts`, `src/audit/audit.module.ts`
- Test: `apps/api/src/audit/audit.service.spec.ts`
- Modify: `src/auth/auth.service.ts` (emit events)

**Interfaces:**
- Produces: `AuditService.record({ actorUserId?, action, entityType, entityId?, metadata?, ip? })`. Auth emits: `otp.requested`, `otp.verified`, `otp.failed`, `session.created`, `session.revoked` (metadata must NOT include the OTP code or phone in plaintext beyond a masked form).

- [ ] **Step 1: Write failing tests:** `record` persists a row; a failed verify produces an `otp.failed` audit row without the raw code.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** + wire into auth. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(api): audit logging for auth events"`

**Acceptance criteria:** auth events auditable; no secret leakage in audit metadata.

---

### Task 14: Read endpoints — categories, panchayats, wards, profile

**Files:**
- Create: `apps/api/src/catalog/categories.controller.ts`+`service`, `src/org/panchayats.controller.ts`+`service`, `src/org/wards.controller.ts`+`service`, `src/users/users.controller.ts`+`service` (+ modules)
- Test: `apps/api/test/catalog.e2e-spec.ts`, `apps/api/test/profile.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /categories` (public, returns seeded `CategoryDTO[]` with subcategories, ordered) ; `GET /panchayats` & `GET /panchayats/:id/wards` (auth required) ; `PATCH /users/me` (auth; validates `updateProfileSchema`); all serialized to the `@pg/types` DTOs.

- [ ] **Step 1: Write failing e2e:** `GET /categories` returns the seeded set (count matches seed) without auth; `PATCH /users/me` updates `fullName`/`preferredLanguage` for the session user; `GET /panchayats` without session → 401.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** thin controllers → services → Prisma, DTO-mapped. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(api): read endpoints for categories, org, profile"`

**Acceptance criteria:** categories DB-driven via API; org reads require auth; profile update validated against shared schema.

---

### Task 15: Security middleware — rate limiting, helmet, throttling

**Files:**
- Modify: `apps/api/src/main.ts`, `src/app.module.ts`
- Create: `apps/api/src/common/throttler.config.ts`
- Test: `apps/api/test/throttle.e2e-spec.ts`

**Interfaces:**
- Produces: `@nestjs/throttler` global guard (stricter limits on `/auth/*`), `helmet`, body size limits. Returns `429` + `auth.tooMany` key on breach (Review Focus #5 at the HTTP edge).

- [ ] **Step 1: Write failing e2e:** hammering `POST /auth/request-otp` past the limit returns 429 with the translated key shape.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(api): throttling, helmet, body limits"`

**Acceptance criteria:** Review Focus #5 pinned at HTTP edge; auth endpoints throttled harder than general.

---

### Task 16: Seed script (admin, panchayat, wards, staff, categories)

**Files:**
- Create: `apps/api/prisma/seed.ts`
- Modify: `apps/api/package.json` (`prisma.seed`)
- Test: `apps/api/test/seed.e2e-spec.ts`

**Interfaces:**
- Produces: idempotent seed creating 1 ADMIN user, 1 Panchayat + 3 Wards, 1 COORDINATOR (scoped to the panchayat), 2 REPRESENTATIVEs (scoped to wards), and the 11 categories from the spec (§4.4) with a few subcategories. Admin/staff phones documented in `.env.example` comments for dev login via mock OTP.

- [ ] **Step 1: Write failing e2e:** after `prisma db seed`, counts match (1 admin, 11 categories, ≥3 wards); re-running seed does not duplicate (idempotent upserts).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** with `upsert`. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(api): idempotent seed for admin, org, staff, categories"`

**Acceptance criteria:** fresh DB + seed yields a usable system; categories match spec list; idempotent.

---

### Task 17: Skeleton modules for future domains

**Files:**
- Create: `apps/api/src/issues/issues.module.ts`, `src/notifications/notifications.module.ts`, `src/attachments/attachments.module.ts` (empty providers, registered in `AppModule`, no routes)

**Interfaces:**
- Produces: importable module shells so M2+ adds controllers/services without restructuring.

- [ ] **Step 1:** Create the three empty modules and register them.
- [ ] **Step 2: Run** `pnpm --filter @pg/api test` (full suite) → PASS (app still boots).
- [ ] **Step 3: Commit.** `git commit -m "chore(api): scaffold issues/notifications/attachments modules"`

**Acceptance criteria:** app boots with the scaffolded modules; no endpoints exposed yet.

---

## PHASE D — Typed API client

### Task 18: `packages/api-client` — fetch client + TanStack Query hooks

**Files:**
- Create: `packages/api-client/package.json`, `tsconfig.json`, `src/client.ts`, `src/auth.ts`, `src/catalog.ts`, `src/profile.ts`, `src/index.ts`
- Test: `packages/api-client/src/client.test.ts`

**Interfaces:**
- Produces (`@pg/api-client`): `createApiClient({ baseUrl, getCookieHeader? })`; query/mutation hooks `useRequestOtp()`, `useVerifyOtp()`, `useLogout()`, `useMe()`, `useCategories()`, `useUpdateProfile()` returning `@pg/types` types; a shared `queryKeys` map. The fetch layer throws a typed `ApiClientError { code, messageKey, status }` parsed from the backend error shape.

- [ ] **Step 1: Write failing test:** given a mocked fetch returning the backend error body, the client throws `ApiClientError` carrying `messageKey`; a success returns parsed JSON typed as `MeResponse`.
- [ ] **Step 2: Run** `pnpm --filter @pg/api-client test` → FAIL.
- [ ] **Step 3: Implement** the fetch wrapper (credentials: 'include'), error parsing, and thin TanStack Query hooks (hooks are consumed by apps; test the client + error mapping here).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(api-client): typed fetch client + query hooks"`

**Acceptance criteria:** error body → typed error with messageKey; success typed via shared DTOs; credentials included for cookie auth.

---

## PHASE E — Design system (`packages/ui`)

### Task 19: Tokens, Tailwind preset, fonts

**Files:**
- Create: `packages/ui/package.json`, `tsconfig.json`, `src/tokens.ts`, `tailwind.preset.ts`, `src/styles/globals.css`, `src/fonts.ts`
- Test: `packages/ui/src/tokens.test.ts`

**Interfaces:**
- Produces (`@pg/ui`): design tokens (civic deep-blue primary, neutral grays, semantic `status.*`/`priority.*` colors, spacing/radius/shadow/breakpoint scales), a Tailwind preset exposing them as theme + CSS variables, and font setup (Inter + Noto Sans Malayalam). Breakpoints `xs:320, sm:375, md:768, lg:1024, xl:1280, 2xl:1440`.

- [ ] **Step 1: Write failing test:** the preset exposes `theme.extend.colors.primary` and semantic `priority` colors; the four priorities and ten statuses each have a token.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** tokens + preset + fonts. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): design tokens, tailwind preset, fonts"`

**Acceptance criteria:** tokens cover all statuses/priorities; preset consumable by both apps; no arbitrary CSS values needed downstream.

---

### Task 20: Core primitives — Button, Input, OtpInput, Card, Alert

**Files:**
- Create: `packages/ui/src/components/{button,input,otp-input,card,alert}.tsx`, `src/index.ts`
- Test: `packages/ui/src/components/button.test.tsx`, `otp-input.test.tsx`

**Interfaces:**
- Produces: accessible `Button` (variants primary/secondary/ghost/destructive, `loading` state with aria-busy, min 44px touch target), `Input` (label + error wiring via `aria-describedby`), `OtpInput` (6 cells, numeric inputMode, paste-fill, emits string), `Card`, `Alert` (variant with icon + text). Built on Radix where applicable.

- [ ] **Step 1: Write failing tests (RTL):** Button shows a spinner and sets `aria-busy` when `loading`; disabled prevents `onClick`; OtpInput emits a 6-char string after typing/paste and exposes 6 labeled inputs.
- [ ] **Step 2: Run** `pnpm --filter @pg/ui test` → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): button, input, otp-input, card, alert"`

**Acceptance criteria:** keyboard-operable, labeled, 44px targets; OtpInput mobile-friendly (numeric, paste).

---

### Task 21: Status/Priority badges + UI state components

**Files:**
- Create: `packages/ui/src/components/{status-badge,priority-badge,empty-state,loading-state,error-state,forbidden-state,skeleton,toast,language-switcher}.tsx`
- Test: `packages/ui/src/components/priority-badge.test.tsx`, `empty-state.test.tsx`

**Interfaces:**
- Produces: `StatusBadge({status})` and `PriorityBadge({priority})` rendering an **icon + translated text** (never color alone); `EmptyState`, `LoadingState` (skeletons), `ErrorState` (with retry), `ForbiddenState`, `Toast` (Radix), `LanguageSwitcher`. Badges take message-key labels via a passed `t` function to stay i18n-pure.

- [ ] **Step 1: Write failing tests:** PriorityBadge renders visible text for each priority (not just a color class) and an icon with `aria-hidden`; EmptyState renders a title, description, and optional action button.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(ui): status/priority badges + UI state components"`

**Acceptance criteria:** WCAG — meaning not by color alone; all state components present for app screens.

> **Scaffolded (not built in M1):** `DatePicker`, `FileUploader`, `FilterPanel`, data `Table`, `Pagination`, `Timeline` — add when their consuming feature (M2/M3) lands. Export a typed `// TODO(M2)` placeholder note in `src/index.ts` listing them so consumers know they're intentionally absent.

---

## PHASE F — Citizen app shell (`apps/citizen`)

### Task 22: Next.js bootstrap + providers + i18n + middleware

**Files:**
- Create: `apps/citizen/package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, `src/providers.tsx`, `src/i18n/request.ts`, `src/middleware.ts`, `src/lib/api.ts`
- Test: `apps/citizen/src/middleware.test.ts`

**Interfaces:**
- Consumes: `@pg/ui`, `@pg/i18n`, `@pg/api-client`, `@pg/types`.
- Produces: App Router with `[locale]` segment (next-intl), `QueryClientProvider`, `NextIntlClientProvider`, Tailwind using `@pg/ui` preset, `src/lib/api.ts` = server-side api client using the request cookie, and `middleware.ts` guarding `/(app)/*` routes (redirect to `/login` when no session cookie).

- [ ] **Step 1: Write failing test:** middleware redirects an unauthenticated request for `/home` to `/login`, and passes through for `/` and `/track`.
- [ ] **Step 2: Run** `pnpm --filter @pg/citizen test` → FAIL. **Step 3: Implement** bootstrap + providers + middleware. **Step 4: Run** → PASS.
- [ ] **Step 5:** Verify `pnpm --filter @pg/citizen build` succeeds.
- [ ] **Step 6: Commit.** `git commit -m "feat(citizen): next.js shell, providers, i18n, route middleware"`

**Acceptance criteria:** app builds; locale routing works; protected routes gated by cookie presence (full validation still server-side).

---

### Task 23: Citizen auth — BFF route handlers + login/verify/register pages

**Files:**
- Create: `apps/citizen/src/app/api/auth/[...action]/route.ts` (BFF proxy), `src/app/[locale]/login/page.tsx`, `src/app/[locale]/verify/page.tsx`, `src/app/[locale]/register/page.tsx`, `src/features/auth/useAuth.ts`
- Test: `apps/citizen/src/features/auth/login-form.test.tsx`, `apps/citizen/e2e/citizen-auth.spec.ts`

**Interfaces:**
- Produces: BFF route handler forwarding `/api/auth/*` to NestJS and relaying the `Set-Cookie` to the browser (same-origin); `LoginForm` (phone, React Hook Form + `requestOtpSchema`), `VerifyForm` (OtpInput + `verifyOtpSchema`), `RegisterForm` (profile completion via `updateProfileSchema`), all strings via next-intl.

- [ ] **Step 1: Write failing component test:** LoginForm shows a field error from the Zod `invalid_phone` key when submitting a bad phone and does not call the mutation; valid phone triggers `useRequestOtp`.
- [ ] **Step 2: Write failing Playwright e2e** `citizen-auth.spec.ts` (Review-Focus-adjacent happy path): visit `/` → Login → enter dev phone → (test reads OTP via a dev-only `GET /api/v1/dev/last-otp` guarded by `NODE_ENV!=='production'`, added in this task on the API) → verify → lands on `/home`.
- [ ] **Step 3: Run** both → FAIL. **Step 4: Implement** BFF proxy, pages, forms, and the dev-only last-otp endpoint. **Step 5: Run** → PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat(citizen): BFF auth proxy + login/verify/register flow"`

**Acceptance criteria:** end-to-end citizen register/login via OTP works against the real API in dev; validation errors shown inline and translated; cookie set same-origin.

---

### Task 24: Citizen authed shell — home, profile, bottom nav, states; public landing & track

**Files:**
- Create: `apps/citizen/src/app/[locale]/(app)/layout.tsx`, `(app)/home/page.tsx`, `(app)/profile/page.tsx`, `(app)/notifications/page.tsx`, `src/app/[locale]/page.tsx` (landing), `src/app/[locale]/track/page.tsx`, `src/components/BottomNav.tsx`, `src/features/profile/ProfileForm.tsx`
- Test: `apps/citizen/src/features/profile/profile-form.test.tsx`, extend `e2e/citizen-auth.spec.ts`

**Interfaces:**
- Consumes: `useMe`, `useUpdateProfile`, `useCategories`, UI state components.
- Produces: mobile-first authed layout with a sticky bottom nav (Home/Report/Track/Profile, 44px targets), `/home` overview (active/awaiting/resolved as zeroed StatCards with empty-state copy — issue data arrives M2), `/profile` (editable via ProfileForm), landing page (primary "Report an Issue" CTA + Track + Login) and public `/track` (reference input; shows "sign in for details" when privacy-sensitive — no PII without auth). Every page renders loading/empty/error states.

- [ ] **Step 1: Write failing test:** ProfileForm pre-fills from `useMe`, submits `updateProfileSchema`, shows a success toast; home renders the empty-state copy for issues.
- [ ] **Step 2: Extend e2e:** after login, `/home` shows the overview and `/profile` shows the user's phone; language switch toggles copy to Malayalam.
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6:** `pnpm --filter @pg/citizen build` succeeds; Lighthouse-style check: landing is a server component (SEO metadata present).
- [ ] **Step 7: Commit.** `git commit -m "feat(citizen): authed shell, home, profile, landing, track, i18n"`

**Acceptance criteria:** mobile-first shell navigable; states handled; landing SEO-ready; no PII on track without auth; Malayalam toggles.

---

## PHASE G — Admin app shell (`apps/admin`)

### Task 25: Admin bootstrap + providers + staff-role middleware

**Files:**
- Create: `apps/admin/package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/app/[locale]/layout.tsx`, `src/providers.tsx`, `src/i18n/request.ts`, `src/middleware.ts`, `src/lib/api.ts`, `src/lib/requireStaff.ts`
- Test: `apps/admin/src/lib/requireStaff.test.ts`, `apps/admin/e2e/admin-auth.spec.ts`

**Interfaces:**
- Produces: admin Next.js shell (same provider stack as citizen); `requireStaff(user)` returns true only if the user holds a role in `STAFF_ROLES`; middleware redirects unauthenticated to `/login`; authed-but-non-staff is routed to a Forbidden view (server-validated via `GET me`).

- [ ] **Step 1: Write failing tests (Review Focus #4):** `requireStaff` false for a citizen-only `MeResponse`, true when any staff role present; e2e: a citizen session visiting admin `/` sees the Forbidden state (not a crash/blank).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** bootstrap + middleware + requireStaff + ForbiddenState usage. **Step 4: Run** → PASS.
- [ ] **Step 5:** `pnpm --filter @pg/admin build` succeeds.
- [ ] **Step 6: Commit.** `git commit -m "feat(admin): shell, providers, staff-role gate"`

**Acceptance criteria:** Review Focus #4 pinned green; non-staff forbidden gracefully; builds.

---

### Task 26: Admin auth pages (login/verify) reusing shared auth

**Files:**
- Create: `apps/admin/src/app/[locale]/login/page.tsx`, `verify/page.tsx`, `src/app/api/auth/[...action]/route.ts` (BFF proxy)
- Test: extend `apps/admin/e2e/admin-auth.spec.ts`

**Interfaces:**
- Produces: admin login/verify using the same `@pg/ui` forms + `@pg/api-client`; on successful verify, staff users land on `/`, non-staff hit Forbidden.

- [ ] **Step 1: Write failing e2e:** seeded coordinator phone → OTP → dashboard home; seeded nothing/citizen → Forbidden.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(admin): login/verify via shared OTP auth"`

**Acceptance criteria:** seeded staff log in to the dashboard; citizen is forbidden.

---

### Task 27: Admin dashboard shell — responsive sidebar/drawer + role-based nav + placeholder modules

**Files:**
- Create: `apps/admin/src/app/[locale]/(dash)/layout.tsx`, `src/components/Sidebar.tsx`, `src/components/MobileDrawer.tsx`, `src/features/nav/navItems.ts`, `src/features/auth/can.ts`, and placeholder pages `(dash)/page.tsx` + `(dash)/{issues,panchayats,wards,representatives,coordinators,citizens,categories,escalations,notifications,reports,settings,audit-logs}/page.tsx`
- Test: `apps/admin/src/features/nav/navItems.test.ts`, extend e2e

**Interfaces:**
- Consumes: `useMe`, `@pg/ui`.
- Produces: desktop persistent sidebar that collapses to a drawer on `<lg`; `navItems` filtered by `can(user, item.permission)` (UX-only); dashboard home with top-level metric StatCards (zeroed + "data arrives in later milestones" empty copy); each module page renders a titled shell with an EmptyState ("coming soon"). Nav highlights the active route.

- [ ] **Step 1: Write failing tests:** `navItems` for a REPRESENTATIVE excludes admin-only items (e.g. Settings/Audit) but includes Issues; e2e: at `<lg` width the sidebar is a toggleable drawer; clicking a nav item routes and highlights it.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5:** `pnpm --filter @pg/admin build` succeeds.
- [ ] **Step 6: Commit.** `git commit -m "feat(admin): responsive nav shell + role-based placeholder modules"`

**Acceptance criteria:** responsive sidebar↔drawer; nav filtered by permission (UX); all module routes exist as shells; desktop-first but usable at 320px.

---

## PHASE H — Cross-cutting verification

### Task 28: E2E orchestration + CI pipeline

**Files:**
- Create: `.github/workflows/ci.yml`, `apps/citizen/playwright.config.ts`, `apps/admin/playwright.config.ts`, `docker-compose.dev.yml` (Postgres for CI/dev)
- Modify: root `package.json` (`test:e2e` script)

**Interfaces:**
- Produces: CI that spins up Postgres, runs migrate + seed, boots the API, runs unit/component tests (Vitest across packages), then Playwright e2e for both apps. Turbo caches build/test.

- [ ] **Step 1:** Add `docker-compose.dev.yml` (Postgres 16) and Playwright configs that `webServer` the API + the app under test.
- [ ] **Step 2:** Write the CI workflow: install → prisma migrate deploy → seed → `pnpm turbo run lint typecheck test build` → `pnpm test:e2e`.
- [ ] **Step 3: Run locally:** `pnpm turbo run test` (all green) and `pnpm test:e2e` (both auth suites green).

Run: `pnpm turbo run lint typecheck test` then `pnpm test:e2e`
Expected: all unit/component suites PASS; citizen and admin e2e PASS.

- [ ] **Step 4: Commit.** `git commit -m "ci: postgres + migrate/seed + unit/e2e pipeline"`

**Acceptance criteria:** one command runs the whole test matrix locally; CI mirrors it; both auth e2e flows pass against the real API.

---

## Self-review notes (author)

- **Spec coverage:** architecture (Tasks 1–2, 22, 25), data model incl. issue relationships (Task 6), requirements 1–10 (Task 6 schema + Task 12 RBAC + Task 23/24 create-paths deferred to M2 but relationships proven), auth/OTP/sessions/permissions (Tasks 8–12), DB-driven categories (Tasks 6/14/16), i18n en+ml (Task 4, used throughout), design system (Tasks 19–21), route structure (Tasks 22–27), API boundaries (Tasks 5,11,12,14,17), security/error handling (Tasks 7,10,13,15), responsive/a11y (Tasks 20,21,24,27), testing (every task + Task 28), auditability (Task 13). Staff-auth posture constraints (spec §6.3) covered by Tasks 11 (citizen-only self-register), 25/26 (staff-role gate), 9/15 (rate limit), 13 (audit), 9/11 (uniform responses).
- **Placeholder scan:** domain-critical code is concrete; scaffolding tasks specify exact commands/files; intentionally-deferred UI components are explicitly listed, not vaguely implied.
- **Type consistency:** DTOs defined in `@pg/types` (Task 3) are the single names reused by api-client (18), apps (22–27), and API serializers (14).
- **Review Focus:** all five pinned to owning tasks (9, 10, 12, 24, 15).
