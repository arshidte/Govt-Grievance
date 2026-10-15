# Milestone 2 — Citizen Issue Lifecycle (design spec)

**Status:** Proposed design — Milestone 2 (Citizen issues vertical slice)
**Date:** 2026-10-15
**Baseline:** `main` @ `34734fd` (M1 foundation, verified release-ready)
**Supersedes scope notes in:** `2026-10-06-foundation-design.md` §13 (M2 row)

---

## 1. Objective

Deliver the first real grievance workflow as a vertical slice: a citizen
submits a grievance, receives a reference number, tracks it with a
proceedings timeline, and is notified in-app as its status changes; authorized
staff advance that status within their scope. The issue state machine, its
API contracts, authorization, attachments, and notifications become real —
while deliberately staying short of full admin issue management (M3), org CRUD
(M4), and escalations/external notifications (M5).

M2 keeps the M1 architecture intact: NestJS API + Prisma, the Citizen web app,
the Admin dashboard, and the shared packages. No breaking changes to M1
interfaces; all additions are additive.

---

## 2. Scope

### In scope (built in M2)
- Citizen self-submission (wizard) → concurrency-safe reference number.
- Citizen dashboard (own issues), issue detail, and a proceedings timeline.
- Minimal **scoped staff triage** with a **temporary web UI in the Admin app**.
- **On-behalf submission API** for Ward Members (REPRESENTATIVE) — API + tests
  only; no dedicated form.
- One optional image attachment per issue (JPEG/PNG/WebP, ≤5 MB, local-disk
  dev storage behind a provider-independent abstraction).
- In-app notifications (DB-backed) on submission and each status change, with a
  functional citizen notifications page + unread count.
- Status lifecycle `SUBMITTED → ACKNOWLEDGED → IN_PROGRESS → RESOLVED`.

### Out of scope (deferred)
- `CLOSED` / `REOPENED` transitions (enum values remain; transitions rejected).
- Issue assignment management, priority editing/re-triage (priority is a fixed
  default of `MEDIUM` in M2), escalation workflow.
- Full Admin CRUD (org entities, categories, users).
- SMS / email / push notifications.
- Anonymous public reference-number lookup (`/track` stays a sign-in prompt).
- Reports, audit UI.

### Explicit scope decisions (recorded separately, by instruction)
1. **Temporary web staff interface — IN M2.** A minimal scoped Issues triage
   screen in the **Admin app**, usable by COORDINATOR / REPRESENTATIVE / ADMIN,
   with backend scope enforced on every operation. Explicitly interim and
   labeled as such in-product and in code/docs.
2. **Deferred on-behalf UI — NOT in M2.** On-behalf creation ships as API +
   authorization + tests only; the dedicated on-behalf form is deferred to the
   staff mobile app. This is a documented temporary usability limitation (in
   M2, on-behalf creation has no web form).
3. **Future shared mobile app — NOT in M2.** The intended long-term home for
   Ward Members + Coordinators (triage, on-behalf creation, role switching).
   **Not scaffolded in M2.** The temporary web screen and the API-only
   on-behalf path are bridges until it exists.

---

## 3. Architecture overview

- **API (`@pg/api`):** new `IssuesModule`, `AttachmentsModule`,
  `NotificationsModule` (M1 left these as empty shells) gain controllers +
  services. Reuses M1 `AccessControlService`/`RbacGuard`, `PrismaService`,
  `AuthGuard`, the global exception filter, and throttling.
- **Citizen app (`@pg/citizen`):** submission wizard, dashboard, issue detail +
  timeline, functional notifications page + bell. Calls the issue/notification
  APIs through the existing general same-origin BFF catch-all (M1 R17).
- **Admin app (`@pg/admin`):** a temporary scoped Issues triage screen. Requires
  **extending the Admin BFF** from auth-only to a hardened general catch-all
  (§8).
- **Shared packages:** `@pg/types` gains the `IssueStatus`/`Priority` enums and
  the new DTOs/schemas (single source of truth consumed by API + both apps +
  api-client). `@pg/api-client` gains typed methods + hooks. `@pg/ui` is reused;
  any new shared component (e.g., a timeline) is added here.
- **Storage:** a provider-independent `StorageProvider` abstraction with a
  local-disk dev implementation (files outside the web root).

Data flow for a status change (the reliability-critical path): staff UI →
Admin BFF (allowlisted) → `PATCH /api/v1/issues/:id/status` → a single Prisma
transaction performs the conditional status update, the history insert, and the
notification insert; the citizen app later reads the updated issue + timeline +
notifications.

---

## 4. Data model changes (Prisma — one migration)

All changes are additive. Migration name: `m2_issue_lifecycle`.

### 4.1 Enums (new; promoted to `@pg/types` as canonical)
- `IssueStatus`: `SUBMITTED, ACKNOWLEDGED, UNDER_REVIEW, ASSIGNED, IN_PROGRESS,
  WAITING_FOR_INFORMATION, ESCALATED, RESOLVED, CLOSED, REOPENED` — all ten
  values exist; M2 **activates only the first, plus ACKNOWLEDGED, IN_PROGRESS,
  RESOLVED** via the transition validator.
- `Priority`: `LOW, MEDIUM, HIGH, URGENT`.

This resolves the M1 debt where the status union lived in `@pg/ui` and priority
in `@pg/i18n`: `@pg/types` becomes the one source; `@pg/ui` badges and
`@pg/i18n` label helpers consume it.

### 4.2 Table changes
- **Issue** adds: `title String`, `description String`,
  `status IssueStatus @default(SUBMITTED)`,
  `priority Priority @default(MEDIUM)`, `subcategoryId String?` (FK→Subcategory,
  optional), `updatedAt DateTime @updatedAt`.
- **IssueStatusHistory** replaces the lone `status String` with:
  `changedById String` (FK→User), `fromStatus IssueStatus`,
  `toStatus IssueStatus`, `note String?`, `createdAt`. One row per successful
  transition.
- **Attachment** adds: `uploadedById String` (FK→User), `mimeType String`,
  `sizeBytes Int`, `originalName String`. Keeps `storageKey` (opaque).
- **Notification** adds: `statusHistoryId String? @unique` (FK→
  IssueStatusHistory) and a stable `type String` (e.g. `issue.submitted`,
  `issue.status_changed`); keeps `recipientId`, `issueId?`, `readAt?`,
  `createdAt`. Add a **partial unique index** on `(issueId, type)` scoped to
  `type = 'issue.submitted'` so an issue has at most one submission
  notification.

### 4.3 Reference-number generation (concurrency-safe)
- A dedicated PostgreSQL `SEQUENCE` (`issue_reference_seq`) created in the
  migration. It is **global and monotonic — it does NOT reset annually.**
- Format: `GRV-<YYYY>-<NNNNNN>` where `YYYY` is the creation year (a human
  label) and `NNNNNN` is `nextval('issue_reference_seq')` zero-padded to 6
  digits (overflow beyond 6 digits allowed as the sequence grows).
- `Issue.referenceNo` keeps its `@unique` constraint as a hard backstop.
- Gaps from rolled-back transactions are acceptable (sequences are
  non-transactional by design); uniqueness and monotonic safety under
  concurrency come from the sequence itself, not application locking.

### 4.4 Untouched M2-adjacent models
`IssueAssignment` and `Escalation` are **not modified** in M2 (assignment and
escalation are later milestones). The M1-audit-noted missing `assignee` FK on
`IssueAssignment` is explicitly left for M3 when assignment is built.

---

## 5. Status lifecycle

### 5.1 Allowed transitions (M2)
A single forward chain, each step staff-initiated:
```
SUBMITTED ─▶ ACKNOWLEDGED ─▶ IN_PROGRESS ─▶ RESOLVED
```
The validator accepts a transition only if `(fromStatus, toStatus)` is one of:
`SUBMITTED→ACKNOWLEDGED`, `ACKNOWLEDGED→IN_PROGRESS`, `IN_PROGRESS→RESOLVED`.
Any other target (including `CLOSED`, `REOPENED`, backward moves, skips) is
rejected with `422` (`invalid_transition`). No citizen-initiated transitions in
M2.

### 5.2 Concurrency-safe transition (clarification #3)
The transition is performed inside one Prisma `$transaction` using a
**conditional update that asserts the expected previous status**, so concurrent
requests cannot produce conflicting transitions, duplicate notifications, or
multiple history rows:

1. `updateMany({ where: { id, status: expectedFrom }, data: { status: toStatus } })`.
   - If `count === 0`: the issue was not in `expectedFrom` (a concurrent
     request already moved it, or the caller's view is stale). Abort the
     transaction and return `409 conflict` (`stale_status`). No history, no
     notification.
   - If `count === 1`: this request owns the transition.
2. Insert exactly one `IssueStatusHistory { issueId, changedById, fromStatus:
   expectedFrom, toStatus, note }`.
3. Insert exactly one `Notification { recipientId: issue.citizenId, issueId,
   type: 'issue.status_changed', statusHistoryId: <new row> }`. The unique
   `statusHistoryId` guarantees one notification per history row even under an
   unexpected double-commit.

Because the conditional update is the transaction's gate, two racing valid
requests resolve to exactly one winner (one history, one notification) and one
`409` loser — never two transitions. The whole unit is atomic: a committed
status change always has its history and its notification; a failure rolls all
three back.

### 5.3 Idempotent retries
A client retry of an already-applied transition finds `status` already at
`toStatus`, so the conditional update matches 0 rows → `409 stale_status`
(treated by clients as "already done"), producing no duplicate side effects.
(Clients that need an affirmative idempotent ack may send an idempotency key;
the conditional update is the authoritative guard regardless.)

---

## 6. API contracts

All under `/api/v1`, JSON, behind `AuthGuard` unless noted; errors use the M1
envelope `{ error: { code, messageKey } }`.

| Method & path | Who | Request | Success | Key errors |
|---|---|---|---|---|
| `POST /issues` | citizen | `{ title, description, categoryId, subcategoryId?, panchayatId, wardId }` (+ optional `Idempotency-Key` header) | `201 IssueDTO` (incl. `referenceNo`) | 422 validation / ward-not-in-panchayat; 401 |
| `POST /issues/on-behalf` | REPRESENTATIVE | `{ citizenPhone, title, description, categoryId, subcategoryId?, wardId }` (+ optional `Idempotency-Key`) | `201 { referenceNo, id, status, createdAt }` (minimal; see §9) | 403 out-of-scope ward; 422 validation; 401 |
| `GET /issues` | citizen → own; staff → scope | query: `status?`, pagination | `200 IssueSummaryDTO[]` | 401 |
| `GET /issues/:id` | owner or in-scope staff | — | `200 IssueDetailDTO` (incl. `timeline: IssueStatusHistoryDTO[]`, `attachment?`) | 403; 404 |
| `PATCH /issues/:id/status` | in-scope staff | `{ toStatus, note }` | `200 IssueDetailDTO` | 422 invalid_transition; 409 stale_status; 403; 404 |
| `POST /issues/:id/attachment` | issue owner | multipart (one file) | `201 AttachmentDTO` | 413 too_large; 415 unsupported_type; 409 already_has_attachment; 403; 404 |
| `GET /attachments/:id` | owner or in-scope staff | — | `200` streamed bytes | 403; 404 (incl. missing-file; §10) |
| `GET /notifications` | recipient only | pagination | `200 NotificationDTO[]` | 401 |
| `GET /notifications/unread-count` | recipient only | — | `200 { count }` | 401 |
| `PATCH /notifications/:id/read` | recipient only | — | `200 NotificationDTO` | 403; 404 |

DTOs and request zod schemas live in `@pg/types`; `@pg/api-client` exposes
typed methods + TanStack Query hooks for each. Server ignores any
client-supplied protected field (`status`, `priority`, `citizenId`,
`createdById`, `onBehalfOf`, `referenceNo`).

---

## 7. Authorization

Backend is the sole authority (frontend `can()`/nav filtering is UX-only),
reusing `AccessControlService`/`RbacGuard`:

- **Citizen:** may read/list only issues where `citizenId === self`; may create
  self-issues; may read/mark only own notifications; may upload an attachment
  only to an issue they own. Never sees another citizen's issues, notifications,
  or attachments.
- **Staff scope:** REPRESENTATIVE → issues with `wardId ∈ their wards`;
  COORDINATOR → issues with `panchayatId ∈ their panchayats`; ADMIN → all. The
  same scope gates list, detail, status transition, and attachment download.
- **On-behalf:** only REPRESENTATIVE, and only for `wardId ∈ their wards`.
- **No privilege leakage:** staff triage exposes only issue read + the three
  allowed transitions; it never exposes org CRUD, categories, settings, audit,
  priority editing, or assignment. The Admin app's existing `can()`/nav
  filtering already hides non-staff modules from COORDINATOR/REPRESENTATIVE;
  the backend independently denies them regardless of UI.

---

## 8. BFF — hardened general proxy, both apps (clarification #1)

The Admin app today proxies only `/api/v1/auth/*`; M2 adds a general catch-all
so the staff screen can call issue APIs. The Citizen app already has a general
catch-all (M1 R17) that currently forwards broadly. **M2 holds both apps'
general proxies to the same strict standard below** — the admin one is newly
built to it, and the citizen one is hardened to it (closing an M1 gap). Each app
carries **its own allowlist** matching only the endpoints its screens use
(citizen: auth, issues, attachments, notifications, categories, org reads,
`users/me`; admin: auth, issues, attachments). The proxy is built as a **strict
allowlisting proxy**:

- **Fixed internal origin only.** The upstream base is
  `process.env.API_INTERNAL_URL` (server-side, never client-controlled). The
  proxy never forwards to a host derived from the request. The outgoing URL is
  `new URL(<validated relative path>, API_INTERNAL_URL)` — any absolute URL,
  scheme, or host in the incoming path is rejected.
- **Path + method allowlist.** Only an explicit set of `(method, path-pattern)`
  pairs is forwarded — the issue/attachment/notification endpoints in §6.
  Anything else → `404` (indistinguishable from a non-existent route; internal
  endpoints are never reachable by probing).
- **Path-traversal safe.** The incoming path is normalized and rejected if it
  contains `..`, encoded traversal, or escapes the `/api/v1/` prefix after
  decoding; only the matched pattern's shape is forwarded.
- **No token/cookie leakage.** Forwards only the inbound `Cookie` header;
  strips hop-by-hop and sensitive headers; never forwards an `Authorization`
  header from the client; relays upstream `Set-Cookie` via `getSetCookie()`;
  never logs cookie values or the internal origin; the internal origin is never
  included in any response body (the M1 502-without-leak behavior is preserved).
- **Session model preserved.** The HttpOnly `pg_session` cookie remains the
  only credential; the browser never sees a bearer token; `credentials:
  'include'` + same-origin keeps the cookie first-party.

This hardening (allowlist, fixed origin, traversal rejection, no leakage) is a
first-class part of the spec and is covered by BFF tests (§13).

---

## 9. On-behalf submission (clarification #2)

**Endpoint:** `POST /issues/on-behalf`, REPRESENTATIVE-only, ward-scoped.

- **Acting user from session.** `createdById` = the authenticated rep; never
  from the body.
- **Scope check first.** The target `wardId` must be within the rep's ward
  scope, else `403` — enforced before any citizen lookup, so scope failures
  reveal nothing about citizens.
- **Phone-based find-or-create, non-disclosing.** The citizen is resolved by
  `citizenPhone` via find-or-create (reusing the M1 citizen-identity pattern).
  The response is **neutral and minimal**: it returns only the newly created
  issue's `referenceNo`/`id`/`status`/`createdAt`. It **never** returns the
  citizen's profile (name, email, other issues) and **never** signals whether
  the phone already had an account — identical shape whether the citizen is new
  or pre-existing. A brand-new citizen identity is created with no profile
  fields (citizen later completes their own profile on first login), consistent
  with M1 self-registration (citizen = role-less identity).
- **Ownership vs. acting party.** `citizenId` = the resolved citizen (owner);
  `createdById` = rep; `onBehalfOf = true`. The **citizen** is the notification
  recipient and the tracking owner. The rep gains **no** general access to the
  citizen's profile or unrelated issues — the rep sees this issue only through
  normal ward-scoped issue reads, nothing citizen-specific beyond it.
- **Atomicity / idempotency / partial failure.** Citizen resolution + issue
  creation + the `issue.submitted` notification occur in **one Prisma
  `$transaction`**: if issue creation or the notification fails, the whole unit
  rolls back — **no orphan citizen identity and no orphan issue**. Find-or-create
  uses an upsert on the unique `phone`, so a concurrent first-time resolution
  for the same phone cannot create two citizen rows. An optional
  `Idempotency-Key` dedupes a retried on-behalf POST (so a network retry does
  not create a second issue); the `(issueId, 'issue.submitted')` unique index is
  the notification backstop. Reference numbers use the §4.3 sequence.

**Deferred:** the dedicated on-behalf form/UI (mobile app). In M2 this path is
API-only — a **documented temporary usability limitation**: Ward Members have
no web form for on-behalf creation until the mobile app ships; the temporary
Admin Issues screen performs triage only, not on-behalf creation.
**On-behalf attachments are not in M2:** attachment upload is issue-owner-only
(§10), so a rep creating an issue on-behalf cannot attach a photo; this is
deferred with the on-behalf UI and documented as part of the same temporary
limitation.

---

## 10. Attachments (clarification #4)

One optional image per issue, owner-uploaded.

- **Limits & validation.** Max **5 MB** (rejected `413` before buffering the
  whole body where the framework allows). Allowed types **JPEG, PNG, WebP**,
  validated by **content sniffing (magic bytes), not just the declared
  `Content-Type`/extension**; mismatch → `415`. One attachment per issue (a
  second upload → `409 already_has_attachment`).
- **Safe storage keys.** The `storageKey` is server-generated (e.g.
  `<cuid>.<ext>`) with **no client-supplied path component**; the resolved
  absolute path is asserted to remain within the configured storage root
  (path-traversal-proof). `originalName` is stored as metadata only, never used
  as a filesystem path.
- **Location.** Files live **outside the web root**, under a configured storage
  directory; they are never statically served — download is only via the
  authenticated streaming route.
- **Authorization.** Upload: issue owner only. Download (`GET /attachments/:id`):
  issue owner or in-scope staff; authorized before any byte is read.
- **Orphan / partial-failure handling.** Creation order: **write the DB
  `Attachment` row and the file within a bounded operation; if the DB write
  fails after the file was written, the file is deleted (compensating cleanup);
  if the file write fails, no DB row is created.** Net invariant: no DB row
  without its file, and no stored file without a DB row. A background concern
  (periodic orphan sweep) is noted as future work, not M2.
- **Missing-file behavior.** If a DB row exists but the file is absent at
  download time (e.g. ephemeral dev disk wiped), the API returns a clean
  `404 attachment_unavailable` (logged server-side) rather than a 500 or a
  partial stream.
- **Provider independence & dev caveat.** A `StorageProvider` interface
  (`put/get/delete` over opaque keys) with a `LocalDiskStorageProvider` dev
  implementation. **Documented: local disk is development-only and not durable
  or multi-instance-safe; a persistent object-storage provider (e.g. S3) is a
  later drop-in** requiring no change to callers. No cloud infra in M2.

---

## 11. Notifications

- DB-backed `Notification` rows, in-app only (no SMS/email/push).
- Created on **submission** (`type = 'issue.submitted'`, body references the
  reference number) and on **each status change** (`type =
  'issue.status_changed'`, linked to its `IssueStatusHistory` via the unique
  `statusHistoryId`), both inside the respective transaction (§5.2, §9).
- Recipient = the issue's **citizen** in every case (including on-behalf).
- **Idempotent:** one submission notification per issue (partial-unique index);
  one status-change notification per history row (unique FK).
- Citizen-facing: a functional notifications page (timestamps, read/unread,
  link to the issue) and an **unread count / bell** in the citizen shell.
  Listing, reading, and mark-read enforce **recipient-ownership** server-side.
- Extensible: the notification creation point is a single service method so a
  future external-delivery channel can be added without touching callers; M2
  makes **no** external-delivery claim.

---

## 12. UI screens

### Citizen app
- **Submission wizard:** category → subcategory (from seeded catalog), panchayat
  → ward (dependent selects), title + description, optional photo, review →
  submit → **reference-number confirmation**. Client-side zod validation mirrors
  the server schema; server is authoritative.
- **Dashboard:** the citizen's own issues with status badges (icon + text, never
  color alone), loading/empty/error states.
- **Issue detail + proceedings timeline:** status, metadata, the attachment (if
  any), and the ordered `IssueStatusHistory` timeline (each entry: from→to,
  note, timestamp, actor role label — not actor PII).
- **Notifications page + bell:** functional, per §11.
- All strings via next-intl, **en + ml parity** (ml may carry English fallback
  where translation is pending, per the M1 global constraint).

### Admin app — temporary staff triage screen
- The existing placeholder **Issues** module becomes a minimal, **explicitly
  temporary** screen: a scoped issue **list** (status badge, read-only
  priority), an issue **detail**, and a **status-transition control** offering
  only the currently-allowed next transition, with a **required note**.
- A **visible in-product notice** states this is an interim M2 web affordance
  and the long-term staff experience is the shared mobile app with role
  switching. The same note appears in code comments and the spec.
- Visible to COORDINATOR / REPRESENTATIVE / ADMIN; backend enforces scope on
  every call. No other admin modules change; **no on-behalf form.**

---

## 13. Testing strategy + acceptance criteria

### Unit / integration (vitest + supertest, real Postgres)
- **Submission:** forced `status=SUBMITTED`, `priority=MEDIUM`,
  `citizenId=createdById=session`, `onBehalfOf=false`; client-supplied
  `priority`/`status`/`citizenId`/`onBehalfOf`/`referenceNo` ignored;
  ward-must-belong-to-panchayat rejected; idempotency-key retry creates one
  issue.
- **Reference numbers:** uniqueness; **concurrent creation** (N parallel
  submissions yield N distinct reference numbers, no collision).
- **Transition (concurrency):** conditional-update gate — two racing valid
  transitions yield exactly one success (one history, one notification) and one
  `409`; invalid/backward/skip/CLOSED/REOPENED → `422`; retry of applied
  transition → no duplicate history/notification.
- **Scoped authz:** citizen isolation; REPRESENTATIVE ward scope; COORDINATOR
  panchayat scope; ADMIN global; cross-scope read/transition denied.
- **On-behalf:** rep ward-scope enforced (out-of-scope → 403 before lookup);
  citizen owns issue + is the notification recipient; response is neutral/minimal
  (no profile, no account-existence signal — identical for new vs existing
  phone); rep cannot read the citizen's profile or unrelated issues; partial
  failure rolls back (no orphan citizen/issue); concurrent same-phone resolution
  creates one citizen.
- **Attachments:** happy-path upload + authorized download; invalid type (by
  content sniffing) → 415; oversize → 413; second upload → 409; unauthorized
  upload/download → 403; path-traversal attempt neutralized; DB-failure
  compensation deletes the file; missing-file download → clean 404.
- **Admin BFF:** only allowlisted `(method, path)` forwarded; non-allowlisted →
  404; traversal/absolute-URL/host-override rejected; `Set-Cookie` relayed;
  internal origin never leaked; `Authorization` header not forwarded.
- **Notifications:** recipient-ownership on list/read/mark-read; unread-count
  correctness; submission + status-change notifications created; no duplicates.

### Playwright (cross-app acceptance)
- **Citizen end-to-end:** submit → reference number → dashboard → detail +
  timeline → submission notification + unread bell; mark-read clears the count;
  en→ml toggle switches copy.
- **Staff-driven, UI-not-API (acceptance-critical, per instruction):** a **real
  authorized staff user logs into the Admin app UI, opens the temporary Issues
  screen, and advances an issue through the on-screen control (not an API
  call)**; then, in the Citizen app, **the owning citizen sees the new timeline
  entry and the new status-change notification.** This proves the full
  human-staff → citizen-visible path.
- **Scope enforcement:** an out-of-scope staff user cannot see or transition an
  issue outside their ward/panchayat (UI + backend).

### Acceptance criteria (all must hold)
1. A citizen submits, tracks (dashboard + detail + timeline), and is notified
   in-app, end-to-end.
2. A **real authorized staff user advances an issue via the Admin UI**, and the
   **citizen sees the resulting timeline entry and notification** — demonstrated
   by Playwright, not only an API test.
3. Status transitions are limited to the allowed set, scope-enforced, atomic,
   and concurrency-safe (no duplicate history/notifications; conflicting races
   resolve to one winner).
4. On-behalf API works, is ward-scoped, non-disclosing, and transactionally safe;
   the citizen owns and is notified.
5. Attachments are size/type-validated, authorized, traversal-safe, and leave no
   orphans; missing files degrade cleanly.
6. Priority is immutable from any client (always MEDIUM in M2).
7. Admin BFF forwards only allowlisted paths/methods to the fixed internal
   origin with no leakage.
8. en/ml parity holds; `pnpm turbo run lint typecheck test build` is green; both
   Playwright suites pass against the real Postgres-backed API; clean-DB
   migration + seed idempotency re-verified after the schema change.

---

## 14. Non-goals / deferred (summary)
`CLOSED`/`REOPENED` transitions; assignment; priority editing/escalation; full
Admin CRUD; SMS/email/push; anonymous `/track` lookup; reports/audit UI; the
on-behalf web form; the shared staff mobile app; persistent object storage;
background orphan-sweep. Each is a later milestone, not a silent omission.

---

## 15. Unresolved concerns / risks (for reviewer attention)

1. **Temporary Admin triage audience drift.** Hosting COORDINATOR/REPRESENTATIVE
   triage in the Admin app is an accepted interim decision; the risk is it
   becomes permanent. Mitigation: explicit in-product + code labeling and this
   spec's §2 decision record. No code guard prevents its continued use after the
   mobile app ships — that cleanup is a mobile-milestone task.
2. **On-behalf citizen onboarding.** A citizen created on-behalf has no profile
   and has never logged in; their first self-login (OTP) must reconcile to the
   same phone-keyed identity (it will, via the unique `phone`). First-login UX
   for such pre-created citizens is otherwise unchanged; flagged for awareness.
3. **Local-disk attachments in multi-instance/CI.** Dev-only local disk is not
   shared across instances; CI runs a single API instance so Playwright
   attachment tests are fine, but this must not be read as production-ready
   storage. Documented in §10.
4. **Reference-number year label vs. non-resetting sequence.** `YYYY` is a
   display label only; the number does not reset per year, so two issues in
   different years can read `GRV-2026-000500` / `GRV-2027-000501`. Confirmed
   acceptable per decision #3; noted so it is not mistaken for a defect.
5. **Idempotency-Key scope.** Proposed for `POST /issues` and
   `POST /issues/on-behalf` to dedupe creation on retry; the exact key storage
   (short-lived table vs. header-echo) is an implementation detail for the plan,
   not a spec-level decision — flagged so the plan resolves it.

---

*End of M2 design spec.*
