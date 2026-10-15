# M2 — Citizen Issue Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the citizen grievance lifecycle — submit → reference number → track with a proceedings timeline → in-app notifications as scoped staff advance status — plus a Ward-Member on-behalf API and one optional image attachment.

**Architecture:** Additive on the M1 foundation. NestJS fleshes out the `IssuesModule`/`AttachmentsModule`/`NotificationsModule` shells, reusing M1 `AccessControlService`/`RbacGuard`/`AuthGuard`/`AuditService`/`PrismaService`. `@pg/types` gains the `IssueStatus`/`Priority` enums + DTOs (single source). Status transitions and creates run in single Prisma transactions with concurrency-safe guards. The Citizen app gets the submission wizard + dashboard + timeline + notifications; the Admin app gets a temporary scoped triage screen. Both apps' same-origin BFFs are hardened to a path/method allowlist.

**Tech Stack:** NestJS 12, Prisma 6.x + PostgreSQL 16, Next.js 15 App Router, next-intl, TanStack Query, Zod, Vitest + supertest, Playwright, pnpm/turbo.

**Spec:** `docs/superpowers/specs/2026-10-15-m2-citizen-issues-design.md` (read it alongside this plan).

**Branch:** all work on `milestone-2`. `main` and `foundation` stay at `34734fd` — never commit M2 work to them.

## Global Constraints

- Node `>=20`; pnpm `>=9`; PostgreSQL `16`; Prisma pinned `6.x` (Prisma 7 dropped `datasource url=env()`). TypeScript `strict: true`; `any` only with an inline justification comment.
- Next.js App Router only. NestJS REST only. Prisma is the only DB access layer.
- All user-facing text via next-intl message keys; English catalog complete, Malayalam present (English fallback allowed where translation pending). en/ml key parity must hold.
- Backend is the authoritative authorization layer; frontend `can()`/nav filtering is UX-only.
- Status/priority indicators use icon **+ text**, never color alone (WCAG). ≥44px touch targets.
- Sessions are DB-backed, HttpOnly `pg_session` cookie (name from `SESSION_COOKIE_NAME`), revocation effective next request. Backend is authoritative; BFF presence-check is UX-only.
- Secrets only via env; `.env` gitignored, `.env.example` committed. OTP codes never stored/logged in plaintext.
- Issue `priority` is always `MEDIUM` in M2 and immutable from any client. Status transitions limited to `SUBMITTED→ACKNOWLEDGED→IN_PROGRESS→RESOLVED`.
- Commit after each task's tests pass; conventional-commit messages. Dev DB: PG16 on `localhost:5435` via the gitignored root `.env` (`docker start panchayat-postgres-dev`).
- `@pg/*` workspace packages must be built before the API/apps that consume them (turbo `^build`); `@pg/types` emits `dist` (M1 ESM fix) — keep that intact.

## Review Focus

Failure modes the spec implies that no happy-path task fully exercises — each pinned to a test in the owning task:

1. **Concurrent same-idempotency-key submissions** must yield exactly one issue; the DB-unique loser is caught and returns the original result (not a 500), and an expired key is treated as new — pinned in Task 9.
2. **Rate-limit / audit resilience:** when the rate-limit check backend is unavailable the on-behalf path **fails closed** (deny, not allow), and every rejected/denied attempt is audited with the citizen phone **masked** and no profile fields — pinned in Task 12.
3. **Migration against populated legacy data:** a pre-M2 `IssueStatusHistory` row survives with `fromStatus=toStatus=old status`, `changedById IS NULL`, old `status` column dropped, zero rows lost — pinned in Task 3.
4. **Failed attachment cleanup:** when the compensating delete fails after a DB error, the orphan is logged (ERROR + storageKey) and is **never downloadable** (no DB row → 404), and the client still gets the original error — pinned in Task 15.
5. **Concurrent status transitions:** two racing valid transitions resolve to exactly one winner (one history row, one notification) + one `409 stale_status`; no duplicate side effects — pinned in Task 10.
6. **Cross-app citizen visibility:** a status change made through the real staff **UI** appears in the citizen's timeline **and** as a notification — pinned in Task 24 (Playwright).

---

## File structure

**API (`apps/api/src/`)**
- `issues/` — `issues.controller.ts`, `issues.service.ts`, `issue-reference.service.ts`, `issue-transition.service.ts`, `on-behalf.service.ts`, `dto.ts` (re-exports from `@pg/types`), `issues.module.ts` (exists).
- `notifications/` — `notifications.controller.ts`, `notifications.service.ts`, `notifications.module.ts` (exists). `NotificationsService.createForStatusChange(...)`/`createForSubmission(...)` are called inside issue transactions.
- `attachments/` — `attachments.controller.ts`, `attachments.service.ts`, `storage/storage.provider.ts` (interface + token), `storage/local-disk.storage.ts`, `attachments.module.ts` (exists).
- `common/idempotency/` — `idempotency.service.ts` (+ reuses PrismaService).
- `prisma/schema.prisma` + `prisma/migrations/<ts>_m2_issue_lifecycle/migration.sql`.
- Tests under `apps/api/src/**/*.spec.ts` (unit) and `apps/api/test/*.e2e-spec.ts` (integration + migration).

**Shared packages**
- `packages/types/src/` — `enums.ts` (add `IssueStatusEnum`/`PriorityEnum`), `issue.ts` (new: DTOs + create/transition schemas), `notification.ts` (new), `index.ts`.
- `packages/api-client/src/` — `issues.ts`, `notifications.ts` (new client methods + hooks), `query-keys.ts`, `index.ts`.
- `packages/ui/src/components/` — reuse badges/states; add `timeline.tsx` if a shared timeline helps.

**Citizen app (`apps/citizen/src/`)**
- `features/issues/` — `useIssues.ts`, `SubmitWizard.tsx`, `IssueCard.tsx`, `IssueDetail.tsx`, `Timeline.tsx`.
- `features/notifications/` — `useNotifications.ts`, `NotificationBell.tsx`, `NotificationsList.tsx`.
- `app/[locale]/(app)/report/page.tsx`, `(app)/issues/page.tsx` (dashboard), `(app)/issues/[id]/page.tsx`, `(app)/notifications/page.tsx` (make functional).
- `lib/bff-proxy.ts` (harden to allowlist), `app/api/v1/[...path]/route.ts`.

**Admin app (`apps/admin/src/`)**
- `lib/bff-proxy.ts` (new — copy hardened proxy), `app/api/v1/[...path]/route.ts` (new general catch-all), keep `app/api/v1/auth/[...action]/route.ts`.
- `features/issues/` — `useStaffIssues.ts`, `StaffIssueList.tsx`, `StaffIssueDetail.tsx`, `StatusTransitionControl.tsx`, `TemporaryNotice.tsx`.
- `app/[locale]/(app)/issues/page.tsx` (replace placeholder), `(app)/issues/[id]/page.tsx`.

---

## Phase A — Data model, types, migration

### Task 1: IssueStatus + Priority enums in `@pg/types`

**Files:**
- Modify: `packages/types/src/enums.ts`, `packages/types/src/index.ts`
- Test: `packages/types/src/enums.test.ts` (extend)

**Interfaces:**
- Produces: `IssueStatusEnum` (zod), `IssueStatus` (type), `ISSUE_STATUSES` (readonly tuple of all 10), `M2_ACTIVE_STATUSES` (`['SUBMITTED','ACKNOWLEDGED','IN_PROGRESS','RESOLVED']`), `PriorityEnum`, `Priority`, `PRIORITIES`.

- [ ] **Step 1: Write the failing test**
```ts
import { IssueStatusEnum, PriorityEnum, M2_ACTIVE_STATUSES } from './enums';
it('defines all 10 issue statuses and 4 priorities', () => {
  expect(IssueStatusEnum.options).toHaveLength(10);
  expect(IssueStatusEnum.options).toContain('WAITING_FOR_INFORMATION');
  expect(PriorityEnum.options).toEqual(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
  expect(M2_ACTIVE_STATUSES).toEqual(['SUBMITTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED']);
});
```
- [ ] **Step 2: Run** `pnpm --filter @pg/types test` → FAIL (not exported).
- [ ] **Step 3: Implement** the zod enums + derived constants in `enums.ts`; export from `index.ts`.
```ts
export const IssueStatusEnum = z.enum(['SUBMITTED','ACKNOWLEDGED','UNDER_REVIEW','ASSIGNED','IN_PROGRESS','WAITING_FOR_INFORMATION','ESCALATED','RESOLVED','CLOSED','REOPENED']);
export type IssueStatus = z.infer<typeof IssueStatusEnum>;
export const M2_ACTIVE_STATUSES = ['SUBMITTED','ACKNOWLEDGED','IN_PROGRESS','RESOLVED'] as const;
export const PriorityEnum = z.enum(['LOW','MEDIUM','HIGH','URGENT']);
export type Priority = z.infer<typeof PriorityEnum>;
```
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Reconcile `@pg/ui`/`@pg/i18n`** — update `@pg/ui` StatusBadge's local `Status` union and `@pg/i18n` `priorityLabelKey`'s `Priority` to import from `@pg/types` (closes the M1 debt). Run `pnpm --filter @pg/ui test` + `pnpm --filter @pg/i18n test` → PASS.
- [ ] **Step 6: Commit** `feat(types): IssueStatus + Priority enums as canonical source`.

### Task 2: Prisma schema — Issue-domain M2 fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Test: `apps/api/test/schema-m2.spec.ts`

**Interfaces:**
- Produces: `Issue` with `title/description/status/priority/subcategoryId?/updatedAt`; `IssueStatusHistory` with `changedById?/fromStatus/toStatus/note`; `Attachment` with `uploadedById/mimeType/sizeBytes/originalName`; `Notification` with `statusHistoryId? @unique/type`; Prisma enums `IssueStatus`, `Priority`.

- [ ] **Step 1: Write the failing test** (asserts the Prisma client exposes the new fields/enums after generate)
```ts
import { PrismaClient, IssueStatus, Priority } from '@prisma/client';
it('exposes M2 enums and Issue.status default typing', () => {
  expect(IssueStatus.SUBMITTED).toBe('SUBMITTED');
  expect(Priority.MEDIUM).toBe('MEDIUM');
  // type-level: Issue create requires title/description
  const _c: Parameters<PrismaClient['issue']['create']>[0]['data'] = {
    title: 't', description: 'd', referenceNo: 'x',
    citizen: { connect: { id: 'u' } }, createdBy: { connect: { id: 'u' } },
    panchayat: { connect: { id: 'p' } }, ward: { connect: { id: 'w' } },
    category: { connect: { id: 'c' } },
  };
  expect(_c.title).toBe('t');
});
```
- [ ] **Step 2: Run** `pnpm --filter @pg/api exec vitest run test/schema-m2.spec.ts` → FAIL (fields/enums absent).
- [ ] **Step 3: Edit `schema.prisma`** — add enums `IssueStatus`/`Priority`; add the fields per spec §4.2 (`Issue.status IssueStatus @default(SUBMITTED)`, `priority Priority @default(MEDIUM)`, `title`, `description`, `subcategoryId String?` + relation, `updatedAt DateTime @updatedAt`; `IssueStatusHistory` → `changedById String?` + relation, `fromStatus IssueStatus`, `toStatus IssueStatus`, `note String?`, remove `status String`; `Attachment` → `uploadedById String` + relation, `mimeType`, `sizeBytes Int`, `originalName`; `Notification` → `statusHistoryId String? @unique` + relation, `type String`). Add partial-unique index for `issue.submitted` via a raw index in the migration (Task 3).
- [ ] **Step 4: Generate** `pnpm --filter @pg/api exec prisma generate`; run test → PASS.
- [ ] **Step 5: Commit** `feat(api): M2 Issue-domain schema fields + enums`.

### Task 3: Migration + populated-legacy-data safety test *(Review Focus #3)*

**Files:**
- Create: `apps/api/prisma/migrations/<ts>_m2_issue_lifecycle/migration.sql`
- Test: `apps/api/test/migration-m2.e2e-spec.ts`

**Interfaces:**
- Produces: the `m2_issue_lifecycle` migration; `issue_reference_seq` sequence; the partial-unique index `notification_one_submitted_per_issue`.

- [ ] **Step 1: Write the failing migration test.** It applies migrations up to the M1 head on a throwaway DB, inserts a legacy-shaped graph + an `IssueStatusHistory` row with the **old** `status` column, applies the M2 migration via `prisma migrate deploy`, and asserts preservation.
```ts
// Uses a dedicated test database name; see test/helpers/migration-db.ts (create in this task).
it('preserves legacy IssueStatusHistory rows and nulls the legacy actor', async () => {
  // (a) fresh DB at M1 head; (b) insert User/Panchayat/Ward/Category + an M1-shape Issue
  //     + an IssueStatusHistory row with status='SUBMITTED' via raw SQL; (c) run M2 migrate deploy.
  const rows = await db.$queryRawUnsafe(
    `SELECT "fromStatus","toStatus","changedById" FROM "IssueStatusHistory"`);
  expect(rows).toHaveLength(1);
  expect(rows[0].fromStatus).toBe('SUBMITTED');
  expect(rows[0].toStatus).toBe('SUBMITTED');
  expect(rows[0].changedById).toBeNull();
  const cols = await db.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name='IssueStatusHistory'`);
  expect(cols.map((c:any)=>c.column_name)).not.toContain('status');
});
```
- [ ] **Step 2: Run** → FAIL (no M2 migration yet).
- [ ] **Step 3: Author `migration.sql`** using expand→backfill→contract:
```sql
-- enums
CREATE TYPE "IssueStatus" AS ENUM ('SUBMITTED','ACKNOWLEDGED','UNDER_REVIEW','ASSIGNED','IN_PROGRESS','WAITING_FOR_INFORMATION','ESCALATED','RESOLVED','CLOSED','REOPENED');
CREATE TYPE "Priority" AS ENUM ('LOW','MEDIUM','HIGH','URGENT');
-- Issue new columns
ALTER TABLE "Issue" ADD COLUMN "title" TEXT NOT NULL DEFAULT '', ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "status" "IssueStatus" NOT NULL DEFAULT 'SUBMITTED', ADD COLUMN "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "subcategoryId" TEXT, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Issue" ALTER COLUMN "title" DROP DEFAULT, ALTER COLUMN "description" DROP DEFAULT;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- IssueStatusHistory: expand -> backfill -> contract
ALTER TABLE "IssueStatusHistory" ADD COLUMN "changedById" TEXT, ADD COLUMN "fromStatus" "IssueStatus", ADD COLUMN "toStatus" "IssueStatus", ADD COLUMN "note" TEXT;
UPDATE "IssueStatusHistory" SET "toStatus" = "status"::"IssueStatus", "fromStatus" = "status"::"IssueStatus";
ALTER TABLE "IssueStatusHistory" ALTER COLUMN "fromStatus" SET NOT NULL, ALTER COLUMN "toStatus" SET NOT NULL;
ALTER TABLE "IssueStatusHistory" DROP COLUMN "status";
ALTER TABLE "IssueStatusHistory" ADD CONSTRAINT "IssueStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Attachment
ALTER TABLE "Attachment" ADD COLUMN "uploadedById" TEXT NOT NULL DEFAULT '', ADD COLUMN "mimeType" TEXT NOT NULL DEFAULT '', ADD COLUMN "sizeBytes" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "originalName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Attachment" ALTER COLUMN "uploadedById" DROP DEFAULT, ALTER COLUMN "mimeType" DROP DEFAULT, ALTER COLUMN "originalName" DROP DEFAULT;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON UPDATE CASCADE;
-- Notification
ALTER TABLE "Notification" ADD COLUMN "statusHistoryId" TEXT, ADD COLUMN "type" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "Notification" ALTER COLUMN "type" DROP DEFAULT;
CREATE UNIQUE INDEX "Notification_statusHistoryId_key" ON "Notification"("statusHistoryId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_statusHistoryId_fkey" FOREIGN KEY ("statusHistoryId") REFERENCES "IssueStatusHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "notification_one_submitted_per_issue" ON "Notification"("issueId") WHERE "type" = 'issue.submitted';
-- reference-number sequence (global, non-resetting)
CREATE SEQUENCE "issue_reference_seq" START 1;
```
  (Note: the empty-string defaults are transient scaffolding so the columns can be `NOT NULL` on a populated table, then the default is dropped; a real M1 DB is empty so no row is affected. Document this inline.)
- [ ] **Step 4: Run** the migration test → PASS; also run `prisma migrate deploy` on the dev DB.
- [ ] **Step 5: Run** the M1 `test/schema.spec.ts` + seed idempotency to confirm no regression. **Step 6: Commit** `feat(api): m2_issue_lifecycle migration + legacy-safe history backfill`.

### Task 4: Reference-number service (concurrency-safe)

**Files:**
- Create: `apps/api/src/issues/issue-reference.service.ts`
- Test: `apps/api/src/issues/issue-reference.service.spec.ts`

**Interfaces:**
- Produces: `IssueReferenceService.next(now: Date): Promise<string>` → `GRV-YYYY-NNNNNN` using `nextval('issue_reference_seq')`.

- [ ] **Step 1: Write the failing test** (DB-backed): calling `next()` twice yields two distinct, well-formed refs; a parallel burst yields all-distinct.
```ts
it('generates distinct well-formed reference numbers', async () => {
  const a = await svc.next(new Date('2026-05-01'));
  const b = await svc.next(new Date('2026-05-01'));
  expect(a).toMatch(/^GRV-2026-\d{6,}$/);
  expect(a).not.toBe(b);
});
it('is collision-free under concurrency', async () => {
  const refs = await Promise.all(Array.from({ length: 50 }, () => svc.next(new Date())));
  expect(new Set(refs).size).toBe(50);
});
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** using `prisma.$queryRaw\`SELECT nextval('issue_reference_seq')\``, format `GRV-${year}-${String(n).padStart(6,'0')}`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(api): concurrency-safe issue reference numbers`.

---

## Phase B — Issue DTOs, creation, reads

### Task 5: Issue + notification DTOs and schemas in `@pg/types`

**Files:**
- Create: `packages/types/src/issue.ts`, `packages/types/src/notification.ts`; Modify: `index.ts`
- Test: `packages/types/src/issue.test.ts`

**Interfaces:**
- Produces: `createIssueSchema` (`{ title(1..200), description(1..5000), categoryId, subcategoryId?, panchayatId, wardId }`), `createOnBehalfSchema` (adds `citizenPhone` via `phoneSchema`, drops panchayatId — derived from ward), `transitionSchema` (`{ toStatus: IssueStatusEnum, note: string(1..1000) }`), `IssueSummaryDTO`, `IssueDetailDTO` (incl. `timeline: IssueStatusHistoryDTO[]`, `attachment?: AttachmentDTO`), `IssueStatusHistoryDTO`, `NotificationDTO`.

- [ ] **Step 1: Write failing tests** asserting each schema accepts a valid payload and rejects an empty `title`/bad `toStatus`.
```ts
it('createIssueSchema rejects empty title', () => {
  expect(createIssueSchema.safeParse({ title:'', description:'d', categoryId:'c', panchayatId:'p', wardId:'w' }).success).toBe(false);
});
it('transitionSchema requires a note', () => {
  expect(transitionSchema.safeParse({ toStatus:'ACKNOWLEDGED', note:'' }).success).toBe(false);
});
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the schemas + DTO types, reusing `phoneSchema` from `auth.ts`. **Step 4: Run** → PASS. **Step 5: Commit** `feat(types): issue + notification DTOs and request schemas`.

### Task 6: Idempotency table + service

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add `IdempotencyKey` model) + a follow-on migration `m2_idempotency`; Create: `apps/api/src/common/idempotency/idempotency.service.ts`, `idempotency.module.ts`
- Test: `apps/api/src/common/idempotency/idempotency.service.spec.ts`

**Interfaces:**
- Produces: model `IdempotencyKey { id, key, userId, route, fingerprint, responseJson Json, issueId?, createdAt }` with `@@unique([userId, route, key])`. `IdempotencyService.run<T>({ key?, userId, route, fingerprint, tx }, work: (tx)=>Promise<{ result: T, issueId?: string }>): Promise<{ result: T, replayed: boolean }>` — within a transaction: if no key, run `work`; if key exists with same fingerprint → return stored response (`replayed:true`); if key exists with different fingerprint → throw `ApiError('idempotency_key_conflict',409,'errors.idempotencyConflict')`; else run `work`, persist key+response, catch the unique-violation race (see Task 9).

- [ ] **Step 1: Write failing tests** — same key+payload returns the stored response without re-running `work`; same key+different payload throws 409; TTL field present.
```ts
it('replays stored response for same key+fingerprint', async () => {
  const w = vi.fn(async () => ({ result: { id: 'i1' }, issueId: 'i1' }));
  const first = await svc.run({ key:'k1', userId:'u1', route:'POST /issues', fingerprint:'f1' }, w);
  const second = await svc.run({ key:'k1', userId:'u1', route:'POST /issues', fingerprint:'f1' }, w);
  expect(w).toHaveBeenCalledTimes(1);
  expect(second.replayed).toBe(true);
  expect(second.result).toEqual(first.result);
});
it('rejects same key with a different fingerprint (409)', async () => {
  await svc.run({ key:'k2', userId:'u1', route:'POST /issues', fingerprint:'f1' }, async ()=>({result:{},issueId:'i'}));
  await expect(svc.run({ key:'k2', userId:'u1', route:'POST /issues', fingerprint:'f2' }, async ()=>({result:{},issueId:'i'}))).rejects.toMatchObject({ status: 409 });
});
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the model + migration + service. Fingerprint = SHA-256 of the canonicalized body. **Step 4: Run** → PASS. **Step 5: Commit** `feat(api): idempotency key table + replay service`.

### Task 7: Issues service — self-submission + validation

**Files:**
- Create: `apps/api/src/issues/issues.service.ts`; Modify: `issues.module.ts` (provide service, import PrismaModule + IdempotencyModule + NotificationsModule + IssueReferenceService)
- Test: `apps/api/src/issues/issues.service.spec.ts`

**Interfaces:**
- Consumes: `IssueReferenceService.next`, `NotificationsService.createForSubmission(tx, {issueId, citizenId, referenceNo})`, `IdempotencyService.run`, `AccessControlService`.
- Produces: `IssuesService.createForCitizen(user, dto, idempotencyKey?): Promise<IssueDetailDTO>` — validates ward∈panchayat + subcategory∈category, forces `status=SUBMITTED/priority=MEDIUM/onBehalfOf=false/citizenId=createdById=user.id`, generates ref, inserts issue + submission notification in one transaction (wrapped by idempotency).

- [ ] **Step 1: Write failing tests** (DB-backed): valid submit creates an issue with forced fields; client-supplied `priority:'URGENT'`/`status:'RESOLVED'`/`citizenId:'other'` are ignored; ward-not-in-panchayat → 422 `ward_panchayat_mismatch`; subcategory-not-in-category → 422 `subcategory_category_mismatch`.
```ts
it('forces protected fields and ignores client overrides', async () => {
  const issue = await svc.createForCitizen(citizen, { ...valid, priority:'URGENT', status:'RESOLVED', citizenId:'someone-else' } as any);
  expect(issue.priority).toBe('MEDIUM');
  expect(issue.status).toBe('SUBMITTED');
  expect(issue.citizenId).toBe(citizen.id);
});
it('rejects a ward that does not belong to the panchayat', async () => {
  await expect(svc.createForCitizen(citizen, { ...valid, wardId: otherPanchayatWard.id })).rejects.toMatchObject({ status: 422 });
});
it('rejects a subcategory that does not belong to the category', async () => {
  await expect(svc.createForCitizen(citizen, { ...valid, subcategoryId: foreignSub.id })).rejects.toMatchObject({ status: 422 });
});
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — validation queries (ward.panchayatId === dto.panchayatId; subcategory.categoryId === dto.categoryId), then `prisma.$transaction` creating the issue + submission notification; wrap in `IdempotencyService.run` keyed by user+route when a key is supplied. **Step 4: Run** → PASS. **Step 5: Commit** `feat(api): citizen issue submission with server-side validation`.

### Task 8: Issues controller — create + reads + scoped authz

**Files:**
- Create: `apps/api/src/issues/issues.controller.ts`; Modify: `issues.module.ts`, `apps/api/src/app.module.ts` (register IssuesModule's controller)
- Test: `apps/api/test/issues.e2e-spec.ts`

**Interfaces:**
- Produces routes: `POST /issues`, `GET /issues`, `GET /issues/:id` (per spec §6); `@CurrentUser` + `AuthGuard`; scope filtering in `IssuesService.listFor(user)` and `getForUser(user, id)` using `AccessControlService` (citizen→own; staff→scope).

- [ ] **Step 1: Write failing e2e** (real session cookies via the M1 OTP flow helper): citizen creates an issue (201 + referenceNo); `GET /issues` returns only their own; a second citizen cannot `GET /issues/:id` of the first (403/404); unauthenticated → 401.
```ts
it('isolates issues to their owner', async () => {
  const { cookie: c1 } = await loginCitizen(app, '+919000010001');
  const created = await post(app, '/api/v1/issues', validBody, c1); // 201
  const { cookie: c2 } = await loginCitizen(app, '+919000010002');
  const res = await get(app, `/api/v1/issues/${created.body.id}`, c2);
  expect([403,404]).toContain(res.status);
});
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the controller + scoped service reads + register in AppModule. `IssueDetailDTO` includes the (empty for now) timeline. **Step 4: Run** → PASS. **Step 5: Commit** `feat(api): issues controller — create + scoped reads`.

### Task 9: Concurrent idempotency-key handling *(Review Focus #1)*

**Files:**
- Modify: `apps/api/src/common/idempotency/idempotency.service.ts`
- Test: `apps/api/test/idempotency-concurrency.e2e-spec.ts`

- [ ] **Step 1: Write failing e2e** — fire two concurrent `POST /issues` with the **same** `Idempotency-Key` + same payload; assert exactly one issue is created and both responses carry the same `referenceNo`; then assert an expired key (manually age the row past 24h) is treated as new.
```ts
it('two concurrent same-key submissions create exactly one issue', async () => {
  const { cookie } = await loginCitizen(app, '+919000010010');
  const [a, b] = await Promise.all([
    post(app, '/api/v1/issues', validBody, cookie, { 'Idempotency-Key': 'dup-1' }),
    post(app, '/api/v1/issues', validBody, cookie, { 'Idempotency-Key': 'dup-1' }),
  ]);
  const refs = [a.body.referenceNo, b.body.referenceNo].filter(Boolean);
  expect(new Set(refs).size).toBe(1);
  const count = await countIssues(cookie);
  expect(count).toBe(1);
});
it('treats an expired key as new', async () => {
  // insert then backdate the IdempotencyKey row > 24h, re-POST same key -> new issue
});
```
- [ ] **Step 2: Run** → FAIL (race creates two issues or 500s on unique violation). **Step 3: Implement** the race handling: the `IdempotencyKey` insert uses the `@@unique([userId,route,key])`; on a unique-violation (`P2002`) the loser **re-reads** the winning row and returns its stored response (not a 500); reads treat rows older than the 24h TTL as absent. **Step 4: Run** → PASS. **Step 5: Commit** `fix(api): idempotency safe under concurrent same-key submissions`.

---

## Phase C — Status lifecycle

### Task 10: Transition service — concurrency-safe + atomic notification *(Review Focus #5)*

**Files:**
- Create: `apps/api/src/issues/issue-transition.service.ts`; Modify: `apps/api/src/notifications/notifications.service.ts` (add `createForStatusChange(tx, {...})`)
- Test: `apps/api/src/issues/issue-transition.service.spec.ts`, `apps/api/test/transition-concurrency.e2e-spec.ts`

**Interfaces:**
- Produces: `IssueTransitionService.transition(actor, issueId, { toStatus, note }): Promise<IssueDetailDTO>`. Validates `(fromStatus→toStatus)` ∈ allowed set else `ApiError('invalid_transition',422,...)`; in one `$transaction`: conditional `updateMany({where:{id,status:expectedFrom},data:{status:toStatus,updatedAt}})` → if count 0 `ApiError('stale_status',409,...)`; else insert `IssueStatusHistory` + insert `Notification{recipientId:citizenId, type:'issue.status_changed', statusHistoryId}`.

- [ ] **Step 1: Write failing unit tests** — allowed chain works; `SUBMITTED→IN_PROGRESS` (skip) → 422; `SUBMITTED→CLOSED` → 422; backward → 422.
- [ ] **Step 2: Write failing concurrency e2e**
```ts
it('two racing valid transitions yield one winner and one 409; one history, one notification', async () => {
  const issue = await seedIssue({ status: 'SUBMITTED' });
  const [a, b] = await Promise.all([
    patch(app, `/api/v1/issues/${issue.id}/status`, { toStatus:'ACKNOWLEDGED', note:'n' }, staffCookie),
    patch(app, `/api/v1/issues/${issue.id}/status`, { toStatus:'ACKNOWLEDGED', note:'n' }, staffCookie),
  ]);
  const statuses = [a.status, b.status].sort();
  expect(statuses).toEqual([200, 409]);
  expect(await countHistory(issue.id)).toBe(1);
  expect(await countStatusNotifications(issue.id)).toBe(1);
});
```
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement** per the conditional-update design (spec §5.2). **Step 5: Run** → PASS. **Step 6: Commit** `feat(api): concurrency-safe status transition + atomic notification`.

### Task 11: Transition endpoint + scoped staff authz + timeline in detail

**Files:**
- Modify: `apps/api/src/issues/issues.controller.ts` (add `PATCH /issues/:id/status`), `issues.service.ts` (detail includes ordered timeline)
- Test: `apps/api/test/transition-authz.e2e-spec.ts`

**Interfaces:**
- Produces: `PATCH /issues/:id/status` guarded so only in-scope staff (REPRESENTATIVE ward / COORDINATOR panchayat / ADMIN) may transition; citizen → 403. `IssueDetailDTO.timeline` populated ascending by `createdAt`.

- [ ] **Step 1: Write failing e2e** — in-scope COORDINATOR transitions SUBMITTED→ACKNOWLEDGED (200, timeline grows, citizen gets a notification row); out-of-scope staff → 403; citizen → 403; detail returns the timeline in order.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the route (reuse `RbacGuard`/`AccessControlService.can` with the issue's scope resolved from its ward/panchayat) + timeline read. **Step 4: Run** → PASS. **Step 5: Commit** `feat(api): status transition endpoint with scoped authorization`.

---

## Phase D — On-behalf submission

### Task 12: On-behalf service — rate-limit + audit + non-disclosing find-or-create *(Review Focus #2)*

**Files:**
- Create: `apps/api/src/issues/on-behalf.service.ts`, `apps/api/src/issues/on-behalf-rate-limit.ts`
- Test: `apps/api/src/issues/on-behalf.service.spec.ts`, `apps/api/test/on-behalf.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuditService.record`, `AccessControlService`, `IssuesService` internals, `IdempotencyService`.
- Produces: `OnBehalfService.create(rep, dto, idempotencyKey?): Promise<{ referenceNo, id, status, createdAt }>` — rep ward-scope check first; per-rep rate-limit check (fail-closed on backend error); find-or-create citizen by `phone` (upsert) in the same `$transaction` as issue + submission notification; audit on success and on denial/limit with **masked phone**, no profile fields; response minimal/neutral.

- [ ] **Step 1: Write failing tests**
```ts
it('denies an out-of-scope ward before any citizen lookup, and audits the denial with a masked phone', async () => {
  await expect(svc.create(repWardA, { ...dto, wardId: wardB.id, citizenPhone: '+919000020001' }))
    .rejects.toMatchObject({ status: 403 });
  const evt = lastAudit();
  expect(evt.action).toBe('issue.on_behalf_denied');
  expect(JSON.stringify(evt.metadata)).not.toContain('919000020001'); // masked
  expect(JSON.stringify(evt.metadata)).toMatch(/\*{3,}0001/);
});
it('returns a neutral minimal response identical for new vs existing citizen', async () => {
  const a = await svc.create(repWardA, { ...dto, citizenPhone:'+919000020010' }); // new
  await loginCitizen(app, '+919000020011'); // make this one pre-exist
  const b = await svc.create(repWardA, { ...dto, citizenPhone:'+919000020011' }); // existing
  expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  expect(a).not.toHaveProperty('fullName');
});
it('fails closed when the rate-limit backend is unavailable', async () => {
  rateLimit.breakBackend();
  await expect(svc.create(repWardA, { ...dto, citizenPhone:'+919000020020' })).rejects.toMatchObject({ status: 503 });
  expect(lastAudit().action).toBe('issue.on_behalf_denied');
});
it('rate-limits per representative (429 past the cap) and audits each limited attempt', async () => {
  for (let i=0;i<CAP;i++) await svc.create(repWardA, { ...dto, citizenPhone:`+9190000210${i}` });
  await expect(svc.create(repWardA, { ...dto, citizenPhone:'+919000021099' })).rejects.toMatchObject({ status: 429 });
});
it('citizen owns the issue + is the notification recipient; rep cannot read citizen profile', async () => { /* ... */ });
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** — rate limit via a DB-backed counter (reuse the OTP per-window count pattern) read inside a try/catch that throws `ApiError('rate_limit_unavailable',503,...)` on backend error (fail-closed) and audits the denial; scope check → audit on 403; upsert citizen by phone; transactional create; `AuditService.record` with `maskPhone` (reuse M1 helper). Response omits all citizen fields. **Step 4: Run** → PASS. **Step 5: Commit** `feat(api): on-behalf submission with rate-limit, audit, non-disclosure`.

### Task 13: On-behalf endpoint (REPRESENTATIVE-only)

**Files:**
- Modify: `apps/api/src/issues/issues.controller.ts` (add `POST /issues/on-behalf`)
- Test: `apps/api/test/on-behalf-endpoint.e2e-spec.ts`

**Interfaces:**
- Produces: `POST /issues/on-behalf` guarded to REPRESENTATIVE; validates `createOnBehalfSchema`; wires `OnBehalfService`.

- [ ] **Step 1: Write failing e2e** — seeded REPRESENTATIVE creates on-behalf (201 minimal body; the citizen, logging in later, sees the issue + submission notification); a COORDINATOR/ADMIN/citizen calling it → 403; the acting rep is not the owner.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the route with `@Roles('REPRESENTATIVE')` + `RbacGuard`. **Step 4: Run** → PASS. **Step 5: Commit** `feat(api): POST /issues/on-behalf endpoint`.

---

## Phase E — Attachments

### Task 14: Storage abstraction + local-disk provider

**Files:**
- Create: `apps/api/src/attachments/storage/storage.provider.ts` (interface + `STORAGE_PROVIDER` token), `storage/local-disk.storage.ts`
- Test: `apps/api/src/attachments/storage/local-disk.storage.spec.ts`

**Interfaces:**
- Produces: `interface StorageProvider { put(key, buf): Promise<void>; get(key): Promise<Buffer>; delete(key): Promise<void>; }`; `LocalDiskStorageProvider` rooted at `env.ATTACHMENT_STORAGE_DIR` (outside web root); key resolution asserts the absolute path stays within the root (throws on traversal).

- [ ] **Step 1: Write failing tests** — put/get round-trips; a key containing `../` or an absolute path is rejected; `get` of a missing key throws a typed not-found.
```ts
it('rejects path traversal in a storage key', async () => {
  await expect(store.put('../escape.jpg', Buffer.from('x'))).rejects.toThrow(/invalid key/i);
});
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** with `path.resolve(root, key)` + `resolved.startsWith(root + sep)` assertion. **Step 4: Run** → PASS. **Step 5: Commit** `feat(api): provider-independent storage + local-disk impl`.

### Task 15: Attachment service — validation + upload/download + cleanup failure *(Review Focus #4)*

**Files:**
- Create: `apps/api/src/attachments/attachments.service.ts`
- Test: `apps/api/src/attachments/attachments.service.spec.ts`, `apps/api/test/attachments.e2e-spec.ts`

**Interfaces:**
- Produces: `AttachmentsService.upload(user, issueId, file): Promise<AttachmentDTO>` (owner-only; one per issue; ≤5MB; JPEG/PNG/WebP by magic-byte sniff; generated `storageKey`; file-then-DB with compensating delete; on cleanup failure logs ERROR+storageKey and rethrows the original error); `getStream(user, attachmentId)` (owner or in-scope staff; missing file → `ApiError('attachment_unavailable',404,...)`).

- [ ] **Step 1: Write failing tests**
```ts
it('rejects a non-image by content sniff even if the extension is .jpg', async () => {
  await expect(svc.upload(owner, issue.id, { buffer: Buffer.from('%PDF-1.7'), mimetype:'image/jpeg', originalname:'x.jpg', size: 8 }))
    .rejects.toMatchObject({ status: 415 });
});
it('rejects a file over 5MB', async () => { /* size = 5*1024*1024+1 -> 413 */ });
it('on DB failure after file write, deletes the file; if delete also fails, logs ERROR and the orphan is not downloadable', async () => {
  store.put = vi.fn(async () => {});                 // file "written"
  prisma.attachment.create = vi.fn(async () => { throw new Error('db down'); });
  store.delete = vi.fn(async () => { throw new Error('disk down'); }); // cleanup fails
  const logSpy = vi.spyOn(logger, 'error');
  await expect(svc.upload(owner, issue.id, validJpeg)).rejects.toThrow(/db down/);
  expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/orphan/i), expect.objectContaining({ storageKey: expect.any(String) }));
  // no Attachment row was created -> getStream cannot find it
  await expect(svc.getStream(owner, 'any')).rejects.toMatchObject({ status: 404 });
});
it('returns 404 when the DB row exists but the file is missing', async () => { /* ... */ });
```
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** per spec §10 (sniff via magic bytes; `already_has_attachment` 409; write-file→create-row; `try{delete}catch{logger.error('orphan file left after failed cleanup',{storageKey,issueId})}` then rethrow original). **Step 4: Run** → PASS. **Step 5: Commit** `feat(api): attachment upload/download with safe cleanup + orphan logging`.

### Task 16: Attachment endpoints + authz

**Files:**
- Modify: `apps/api/src/attachments/attachments.controller.ts` (create), `attachments.module.ts`, `app.module.ts`
- Test: `apps/api/test/attachments-authz.e2e-spec.ts`

**Interfaces:**
- Produces: `POST /issues/:id/attachment` (owner; multipart, Nest file interceptor with 5MB limit), `GET /attachments/:id` (owner or in-scope staff; streams). Unauthorized upload/download → 403.

- [ ] **Step 1: Write failing e2e** — owner uploads + downloads; a different citizen → 403 on both; in-scope staff can download; oversize → 413; wrong type → 415.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** controller + register. **Step 4: Run** → PASS. **Step 5: Commit** `feat(api): attachment endpoints with issue-level authz`.

---

## Phase F — Notifications API, BFF hardening, api-client

### Task 17: Notifications controller + service (owner-scoped)

**Files:**
- Create: `apps/api/src/notifications/notifications.controller.ts`; Modify: `notifications.service.ts`, `notifications.module.ts`, `app.module.ts`
- Test: `apps/api/test/notifications.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read` — all recipient-scoped; `NotificationsService.listFor/unreadCount/markRead(user,...)`. (Creation methods already added in Tasks 7/10.)

- [ ] **Step 1: Write failing e2e** — after a submission + a transition, the citizen's `GET /notifications` returns 2 rows, `unread-count` = 2, mark-read drops it to 1; a different user cannot read or mark these (403/404).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS. **Step 5: Commit** `feat(api): owner-scoped notifications endpoints`.

### Task 18: Harden the citizen BFF to an allowlist

**Files:**
- Modify: `apps/citizen/src/lib/bff-proxy.ts`, `apps/citizen/src/app/api/v1/[...path]/route.ts`
- Test: `apps/citizen/src/app/api/v1/[...path]/route.test.ts` (extend)

**Interfaces:**
- Produces: `isAllowed(method, path): boolean` over the citizen allowlist (auth/*, issues, issues/:id, issues/:id/status is NOT citizen — exclude; attachments/:id, issues/:id/attachment, notifications*, categories, panchayats*, users/me); non-allowlisted → 404; fixed `API_INTERNAL_URL` origin; traversal/absolute-URL rejected; no `Authorization` forwarded; `Set-Cookie` relayed.

- [ ] **Step 1: Write failing tests** — an allowlisted path forwards; `/api/v1/dev/last-otp` (or any non-allowlisted) → 404; an absolute-URL/`..` path → 404; internal origin never appears in a 502 body.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the allowlist (array of `{method, pattern}`; match the decoded, normalized path). **Step 4: Run** → PASS. **Step 5: Commit** `fix(citizen): harden BFF proxy to a path/method allowlist`.

### Task 19: Admin general BFF (hardened) *(parallels Task 18)*

**Files:**
- Create: `apps/admin/src/lib/bff-proxy.ts` (copy citizen's hardened helper), `apps/admin/src/app/api/v1/[...path]/route.ts`
- Test: `apps/admin/src/app/api/v1/[...path]/route.test.ts`

**Interfaces:**
- Produces: admin allowlist (auth/*, issues, issues/:id, issues/:id/status, issues/on-behalf is REP-only but still allowlisted, attachments/:id); same hardening as Task 18. The static `/api/v1/auth/[...action]` route still wins over the catch-all.

- [ ] **Step 1: Write failing tests** — mirror Task 18 for the admin allowlist; confirm `issues/:id/status` (admin-only) is allowlisted and e.g. `users/me` is NOT; confirm the existing auth route is untouched + its tests still pass.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS; run the M1 admin auth route tests. **Step 5: Commit** `feat(admin): hardened general BFF catch-all for issue APIs`.

### Task 20: api-client — issue + notification methods and hooks

**Files:**
- Create: `packages/api-client/src/issues.ts`, `packages/api-client/src/notifications.ts`; Modify: `client.ts` (methods), `query-keys.ts`, `index.ts`
- Test: `packages/api-client/src/issues.test.ts`

**Interfaces:**
- Produces: client methods `createIssue`, `createOnBehalf`, `listIssues`, `getIssue`, `transitionIssue`, `uploadAttachment`, `listNotifications`, `unreadCount`, `markNotificationRead`; hooks `useCreateIssue`, `useIssues`, `useIssue`, `useTransitionIssue`, `useNotifications`, `useUnreadCount`, `useMarkRead`; `queryKeys.issues`, `queryKeys.issue(id)`, `queryKeys.notifications`, `queryKeys.unreadCount`. Mutations invalidate the right keys.

- [ ] **Step 1: Write failing tests** (mocked fetch) — `createIssue` posts to `/api/v1/issues` and returns `IssueDetailDTO`; `transitionIssue` PATCHes; error body → `ApiClientError`. Assert `Idempotency-Key` header is sent when passed.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** reusing the single `request()` helper (prepends `/api/v1`, `credentials:'include'`). **Step 4: Run** → PASS. **Step 5: Commit** `feat(api-client): issue + notification methods and hooks`.

---

## Phase G — Citizen UI

### Task 21: Submission wizard

**Files:**
- Create: `apps/citizen/src/features/issues/SubmitWizard.tsx`, `apps/citizen/src/app/[locale]/(app)/report/page.tsx`; Modify: i18n catalogs (en + ml), middleware PUBLIC_PATHS not needed (authed)
- Test: `apps/citizen/src/features/issues/submit-wizard.test.tsx`

**Interfaces:**
- Consumes: `useCreateIssue`, `useCategories`, panchayat/ward reads. Produces: a wizard rendering category→subcategory (dependent), panchayat→ward (dependent), title/description, optional photo, review→submit→reference-number confirmation. Client zod mirrors `createIssueSchema`; sends an `Idempotency-Key` (a per-wizard-instance uuid).

- [ ] **Step 1: Write failing RTL tests** — invalid (empty title) blocks submit + shows the translated error and does not call the mutation; a valid flow calls `useCreateIssue` with the chosen values and renders the returned reference number. Dependent selects: choosing a category filters subcategories; choosing a panchayat filters wards.
- [ ] **Step 2: Run** `pnpm --filter @pg/citizen test` → FAIL. **Step 3: Implement** (react-hook-form + zodResolver; `@pg/ui` Input/Button/Alert). Add i18n keys (en + ml parity). **Step 4: Run** → PASS + build. **Step 5: Commit** `feat(citizen): grievance submission wizard`.

### Task 22: Dashboard + issue detail + timeline

**Files:**
- Create: `apps/citizen/src/app/[locale]/(app)/issues/page.tsx` (dashboard), `(app)/issues/[id]/page.tsx`, `features/issues/IssueCard.tsx`, `IssueDetail.tsx`, `Timeline.tsx`; Modify: BottomNav (point an item at `/issues`), i18n
- Test: `apps/citizen/src/features/issues/issue-detail.test.tsx`, `timeline.test.tsx`

**Interfaces:**
- Consumes: `useIssues`, `useIssue`. Produces: dashboard list (status badges, loading/empty/error), detail with metadata + attachment (if any) + ordered timeline (from→to, note, timestamp, actor **role label** not PII).

- [ ] **Step 1: Write failing RTL tests** — dashboard renders issue cards with status badge + empty-state when none; detail renders the timeline entries in order with icon+text status (never color alone); an unknown status falls back gracefully.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** reusing `@pg/ui` badges + state components. **Step 4: Run** → PASS + build. **Step 5: Commit** `feat(citizen): issue dashboard, detail, proceedings timeline`.

### Task 23: Notifications page + unread bell

**Files:**
- Modify: `apps/citizen/src/app/[locale]/(app)/notifications/page.tsx` (make functional); Create: `features/notifications/NotificationBell.tsx`, `NotificationsList.tsx`, `useNotifications.ts`; Modify: the authed header (mount the bell), i18n
- Test: `apps/citizen/src/features/notifications/notifications.test.tsx`

**Interfaces:**
- Consumes: `useNotifications`, `useUnreadCount`, `useMarkRead`. Produces: a list (timestamp, read/unread, link to the issue) + a header bell showing the unread count; clicking a notification marks it read and navigates to the issue.

- [ ] **Step 1: Write failing RTL tests** — renders unread + read states; the bell shows the count; mark-read decrements it; each item links to `/issues/:id`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**. **Step 4: Run** → PASS + build. **Step 5: Commit** `feat(citizen): functional notifications page + unread bell`.

---

## Phase H — Admin temporary triage UI

### Task 24: Temporary staff triage screen

**Files:**
- Modify: `apps/admin/src/app/[locale]/(app)/issues/page.tsx` (replace placeholder); Create: `(app)/issues/[id]/page.tsx`, `features/issues/StaffIssueList.tsx`, `StaffIssueDetail.tsx`, `StatusTransitionControl.tsx`, `TemporaryNotice.tsx`, `useStaffIssues.ts`; Modify: i18n
- Test: `apps/admin/src/features/issues/status-transition-control.test.tsx`, `temporary-notice.test.tsx`

**Interfaces:**
- Consumes: `useIssues` (scoped server-side), `useTransitionIssue`. Produces: a scoped list (status badge, read-only priority), a detail with a `StatusTransitionControl` offering only the currently-allowed next transition + a required note, and a visible `TemporaryNotice` ("interim web screen; long-term home is the shared mobile app with role switching").

- [ ] **Step 1: Write failing RTL tests** — the control offers only the allowed next transition for the current status (SUBMITTED→only ACKNOWLEDGED), requires a note before enabling submit, and calls `useTransitionIssue` with `{toStatus,note}`; `TemporaryNotice` renders the interim message; RESOLVED shows no further transition.
- [ ] **Step 2: Run** `pnpm --filter @pg/admin test` → FAIL. **Step 3: Implement** reusing `@pg/ui`. Add i18n (en + ml). **Step 4: Run** → PASS + build. **Step 5: Commit** `feat(admin): temporary scoped staff triage screen`.

---

## Phase I — Cross-app acceptance + CI

### Task 25: Playwright — citizen end-to-end

**Files:**
- Create: `apps/citizen/e2e/citizen-issues.spec.ts`
- Test: itself (Playwright)

- [ ] **Step 1: Author the spec** — citizen logs in → submits via the wizard → sees the reference number → dashboard shows it → detail shows the timeline → a submission notification + unread bell appear → mark-read clears the count → en→ml toggles copy. Uses the dev OTP endpoint via the citizen BFF. Add stable `data-testid`s as implemented.
- [ ] **Step 2: Run** `pnpm --filter @pg/citizen test:e2e` (DB up) → PASS.
- [ ] **Step 3: Commit** `test(citizen): e2e for submission, tracking, notifications`.

### Task 26: Playwright — staff-UI → citizen-visible (cross-app) *(Review Focus #6)*

**Files:**
- Create: `apps/admin/e2e/admin-issues.spec.ts`; Modify: `apps/citizen/e2e/citizen-issues.spec.ts` if a shared fixture helps
- Test: itself (Playwright)

- [ ] **Step 1: Author the acceptance spec** — (1) a citizen (seeded or freshly registered) submits an issue in the citizen app; (2) a **seeded in-scope staff user logs into the Admin app UI**, opens the temporary Issues screen, and **advances the issue via the on-screen control** (not an API call) with a note; (3) back in the **citizen app**, the owning citizen **sees the new timeline entry and the new status-change notification**. Also: an out-of-scope staff user cannot see/transition it.
```ts
test('a real staff UI status change appears in the citizen timeline + notifications', async ({ browser }) => {
  const citizenCtx = await browser.newContext();
  const staffCtx = await browser.newContext();
  // citizen submits -> capture referenceNo
  // staff logs in (admin UI), opens Issues, clicks "Acknowledge", enters a note, submits
  // citizen reloads detail -> expect timeline entry SUBMITTED->ACKNOWLEDGED; bell shows an unread notification
});
```
- [ ] **Step 2: Run** both suites (DB up) → PASS.
- [ ] **Step 3: Commit** `test(admin): cross-app staff-UI-to-citizen acceptance e2e`.

### Task 27: CI + migration/seed verification wiring

**Files:**
- Modify: `.github/workflows/ci.yml` (ensure the M2 migration runs: `prisma migrate deploy` already in the pipeline covers it; add the admin e2e if not already globbed), root `package.json` `test:e2e` (already runs both apps)
- Test: the pipeline itself + a local full run

- [ ] **Step 1:** Confirm `pnpm turbo run lint typecheck test build` is green (DB up), both Playwright suites pass, and `prisma migrate deploy` + seed are idempotent on a clean DB (reuse the M1 verification commands). Fix any wiring gaps (e.g., ensure the new migration-safety + concurrency e2e specs are included).
- [ ] **Step 2: Run** the full matrix locally → all green.
- [ ] **Step 3: Commit** `ci: include M2 suites in the pipeline`.

---

## Self-review notes (author)

- **Spec coverage:** §4 data model → Tasks 2–3; §4.3 reference numbers → Task 4; §5 lifecycle → Tasks 10–11; §6 API → Tasks 7–8,11,13,16,17; §6.1 validation → Task 7; §6.2 idempotency → Tasks 6,9; §7 authz → Tasks 8,11,13,16,17; §8 BFF hardening → Tasks 18–19; §9 on-behalf → Tasks 12–13; §10 attachments → Tasks 14–16; §11 notifications → Tasks 10,17,23; §12 UI → Tasks 21–24; §13 tests/acceptance → every task + Tasks 25–27; §4.5 migration safety → Task 3. Enums promotion/M1 debt → Task 1.
- **Review Focus mapping:** #1→T9, #2→T12, #3→T3, #4→T15, #5→T10, #6→T26 — each has an explicit test.
- **Type consistency:** `IssueStatus`/`Priority` defined in T1 and reused everywhere; DTO/schema names from T5 reused by API (T7+) and api-client (T20) and UI (T21+).
- **Scope discipline:** no CLOSED/REOPENED transitions, no assignment/priority-editing/escalation, no on-behalf form, no mobile scaffold, no anonymous `/track` — all honored.
- **Branch:** every task commits on `milestone-2`; `main`/`foundation` untouched at `34734fd`.
