# Foundation Design — Panchayat Citizen Grievance & Service Tracking Platform

**Date:** 2026-10-06
**Status:** Approved design — Milestone 1 (Foundation vertical slice)
**Author:** Arshid (with Claude)

---

## 1. Purpose & context

A production web platform letting citizens raise, track, and follow up on
Panchayat-related grievances, applications, and service delays, with a central
admin dashboard for staff to manage the organization and (later) the issue
workflow. This is a **real production system** intended for government
deployment — correctness, security, RBAC, auditability, and data integrity are
first-class, not a prototype.

Two web experiences share one backend:

1. **Citizen web app** — public, mobile-first, bilingual (English/Malayalam),
   usable on low-end phones and slow connections.
2. **Admin dashboard** — authenticated, desktop-first, fully responsive.

Ward Members/Representatives and Coordinators will use a **future mobile app**
that consumes the **same** NestJS API without backend changes.

### Scope of this milestone (Foundation vertical slice)

**In scope (fully built):** monorepo scaffold; PostgreSQL + Prisma; identity,
organization, RBAC, session, and audit data model; phone-OTP authentication for
all users; shared design system; English/Malayalam i18n infrastructure; both app
shells with real login and responsive navigation; seed data.

**Defined now, built later:** the Issue domain (Issue, IssueAssignment,
IssueStatusHistory, Escalation, Notification, Attachment) — its **relationships**
are fixed in this foundation so nothing requires rework; its detailed fields and
workflow are designed/built in Milestone 2. Org-entity admin CRUD screens
(panchayats/wards/representatives/coordinators) are a later milestone; their
tables and relationships exist now and are reachable via seed data.

---

## 2. Technology stack (fixed)

**Frontend:** Next.js (App Router), TypeScript (strict), Tailwind CSS,
shadcn/ui + Radix, TanStack Query (server state), React Hook Form, Zod,
TanStack Table, Recharts, Lucide React, Zustand (only where genuinely needed),
next-intl.

**Backend:** Node.js, NestJS, TypeScript, REST, PostgreSQL, Prisma.

**Auth/security:** phone-OTP auth, DB-backed sessions in httpOnly cookies (web),
RBAC, Zod/class-validator request validation, rate limiting, secure file-upload
validation, audit logging.

**Testing:** Vitest, React Testing Library, Playwright.

**Deployment:** AWS-ready, simple (no microservices).

No alternative frameworks; no Redux unless a demonstrated need TanStack
Query/local state/Zustand cannot meet cleanly.

---

## 3. Monorepo architecture

**Tooling:** pnpm workspaces + Turborepo; strict TypeScript everywhere; shared
config packages so the two frontends never drift.

```
apps/
  citizen/      Next.js App Router — mobile-first, public pages SEO-ready, PWA-ready shell
  admin/        Next.js App Router — desktop-first, fully responsive
  api/          NestJS — REST; the ONLY place business logic lives
packages/
  ui/           design tokens + shadcn/Radix components (shared by both apps)
  types/        shared TS types + Zod schemas = the DTO contract
  api-client/   typed fetch client + TanStack Query hooks
  i18n/         next-intl message catalogs (en, ml)
  config/       eslint / tsconfig / tailwind presets
```

### Auth cookie flow (BFF)

The browser only talks to its own Next origin. Each Next app exposes thin route
handlers that proxy auth calls to NestJS and set a
`Secure; HttpOnly; SameSite=Lax` session cookie. NestJS owns session creation
and validation; Next never holds business logic. This yields a clean CSRF
posture and avoids cross-origin credential issues. The future mobile client
talks to the same NestJS endpoints using bearer tokens — the BFF proxy is a
web-only concern, so mobile needs no backend changes.

### Validation contract

Zod schemas in `packages/types` are the single source of truth. React Hook Form
uses them on the client; NestJS validates the same shapes server-side (Zod
pipe). One definition, enforced on both ends.

### Deployment shape (kept simple)

Three deployable units (two Next apps + one NestJS service) + managed PostgreSQL
(RDS). Dockerized; deployable to AWS (ECS/Fargate or App Runner) behind one
domain with path/subdomain routing. Designed deployment-ready; infra not built
in this milestone.

---

## 4. Data model

This milestone fully models **identity, organization, access control, session,
and audit**. The **Issue domain** entities are listed with their relationships
only; detailed fields/workflow are Milestone 2.

### 4.1 Entity relationship map

```
User ──1:*── RoleAssignment ──*:1── Role(enum)
                   │  scope (nullable):
                   ├── panchayatId?  (COORDINATOR scope)
                   └── wardId?       (REPRESENTATIVE scope; ADMIN = no scope)

Panchayat ──1:*── Ward
Panchayat ──1:*── RoleAssignment(role=COORDINATOR)      → MANY coordinators per panchayat
Ward      ──1:*── RoleAssignment(role=REPRESENTATIVE)   → MANY representatives per ward

Issue ──*:1── citizen:User          (whose issue it is)
      ──*:1── createdBy:User         (who entered it — citizen OR ward member)
      ──    onBehalfOf:boolean       (true when a rep created it for a citizen)
      ──*:1── Panchayat
      ──*:1── Ward
      ──*:1── Category (+ Subcategory)
      ──1:*── IssueAssignment        (current + historical: representative/coordinator)
      ──1:*── IssueStatusHistory     (the timeline)
      ──1:*── Escalation             (reason, by, from→to responsible party, notes)
      ──1:*── Attachment             (issue-scoped files)
      ──1:*── Notification (via events)

Notification ──*:1── recipient:User   (references issueId; typed event)
Attachment   ──*:1── Issue            (validated uploads; storage key, never raw URL)
AuditLog     ──*:1── actor:User       (polymorphic entityType/entityId; spans ALL entities)
```

### 4.2 Tables built in this milestone (Prisma)

- **User** — `id`, `phone` (unique, E.164), `email?`, `fullName`,
  `preferredLanguage` (en|ml), `status` (active|disabled), address fields,
  timestamps. One unified identity for citizens *and* staff.
- **OtpChallenge** — `id`, `phone`, `codeHash` (never raw), `purpose`,
  `expiresAt`, `attempts`, `consumedAt`. Rate-limited.
- **Session** — `id`, `userId`, `tokenHash`, `userAgent`, `ip`, `expiresAt`,
  `revokedAt`. DB-backed opaque sessions (not stateless JWT) so deactivating a
  staff member or revoking a device takes effect immediately.
- **RoleAssignment** — `id`, `userId`, `role` (ADMIN | COORDINATOR |
  REPRESENTATIVE | CITIZEN), `panchayatId?`, `wardId?`, `grantedBy`, timestamps.
  A user holds many assignments. ADMIN is global; COORDINATOR scoped to a
  panchayat; REPRESENTATIVE scoped to a ward.
- **Panchayat** — `id`, `code` (unique), `name`, `nameMl`, contact info,
  `status`, timestamps.
- **Ward** — `id`, `panchayatId`, `number`, `name`, `nameMl`, `status`,
  timestamps.
- **AuditLog** — `id`, `actorUserId`, `action`, `entityType`, `entityId`,
  `metadata` (jsonb), `ip`, `createdAt`.

### 4.3 Issue-domain tables (relationships fixed now; fields in M2)

`Issue`, `IssueAssignment`, `IssueStatusHistory`, `Escalation`, `Notification`,
`Attachment`, plus `Category`/`Subcategory` reference tables. Their foreign-key
relationships are as shown in 4.1. Detailed columns, the status lifecycle, SLA,
and escalation workflow are designed in Milestone 2.

### 4.4 Seed data

Bootstraps one ADMIN user, a sample Panchayat with wards, and sample staff
(coordinator + representative) so the system is usable immediately. Citizens
self-register via OTP.

---

## 5. Requirements traceability

| # | Requirement | Mechanism |
|---|------------|-----------|
| 1 | Multiple reps per ward | `RoleAssignment(role=REPRESENTATIVE, wardId=W)` — many rows, no 1:1 FK |
| 2 | Multiple coordinators per panchayat | `RoleAssignment(role=COORDINATOR, panchayatId=P)` — many rows |
| 3 | One user, multiple roles | `User 1:* RoleAssignment` |
| 4 | Different roles at different scopes | `panchayatId` / `wardId` scope columns per assignment |
| 5 | Ward member creates issue for citizen | `createdBy=rep`, `citizen=citizen`, `onBehalfOf=true` |
| 6 | Citizen creates own issue | `createdBy=citizen`, `citizen=citizen`, `onBehalfOf=false` |
| 7 | Both paths → same workflow | Single `Issue` table + single status/assignment/timeline pipeline |
| 8 | Role switching (mobile, later) | API exposes all of a user's assignments; "active role" is a client concern — no backend change |
| 9 | Citizen + admin share one backend | Single NestJS API; apps differ only in UI + endpoints called |
| 10 | Future mobile reuses API | REST API is client-agnostic; BFF cookie proxy is web-only; mobile uses bearer tokens on same endpoints |

---

## 6. Authentication, OTP & permission model

### 6.1 OTP flow (all users)

- `POST /auth/request-otp {phone}` → generate code, store only `codeHash`, send
  via **`SmsProvider` interface**. `MockSmsProvider` logs to console in dev; a
  real SMS provider is wired later with zero change elsewhere. Rate-limited per
  phone and per IP; capped attempts; short expiry.
- `POST /auth/verify-otp {phone, code}` → validate, create a DB **Session**, set
  httpOnly cookie (web) or return a token (mobile, later).
- `POST /auth/logout` → revoke session. `GET /auth/me` → current user + all role
  assignments.

Staff use the same OTP mechanism; the admin app additionally requires the
authenticated user to hold a staff role, else forbidden. (Password/2FA can be
layered on later without schema changes.)

### 6.2 Permission model

Capability-based, derived from a user's `RoleAssignment`s + scope. A central
`AccessControl` service answers "can user U perform action A on resource R?" —
COORDINATOR@PanchayatP acts only within P; REPRESENTATIVE@WardW only within W;
ADMIN everywhere. Enforced by **NestJS guards on every protected route** — the
real security boundary. The frontend gets a lightweight `can()` helper driven by
the same permissions **for UX only** (hiding controls), never for authorization.

---

## 7. Route structure

### Citizen app (`apps/citizen`) — mobile-first

```
/                 landing: Report an Issue · Track · Login
/track            public reference lookup (no PII without auth)
/login /verify    phone → OTP
/register         first-time profile completion
/(app)/home       overview (active / awaiting / resolved)
/(app)/issues     my issues  ·  /issues/new (wizard)  ·  /issues/[ref]
/(app)/notifications
/(app)/profile
```

### Admin app (`apps/admin`) — desktop-first, role-based sidebar

```
/login /verify    phone → OTP (must hold a staff role, else forbidden)
/                 dashboard home
/issues  /issues/[id]
/panchayats  /wards  /representatives  /coordinators  /citizens
/categories  /priorities  /escalations  /notifications  /reports  /settings  /audit-logs
```

Nav items render only where the user's permissions allow. (Issue and org-CRUD
screens are built in later milestones; routes/shell exist now.)

---

## 8. API boundaries (`apps/api`)

REST, versioned under `/api/v1`. Every module: thin controller → service
(logic) → Prisma; Zod DTO validation; guards.

**Built now:** `AuthModule`, `UsersModule`, `AccessControlModule`,
`PanchayatsModule`, `WardsModule`, `AuditModule`.
**Skeleton now, built later:** `NotificationsModule`, `AttachmentsModule`,
`IssuesModule`/`EscalationsModule` (relationships defined; endpoints in M2).

---

## 9. Design-system foundation (`packages/ui`)

- **Tokens:** civic deep-blue primary; neutral grays; semantic status/priority
  colors used consistently; spacing, radius, shadow, breakpoint, transition
  scales. No arbitrary CSS values.
- **Typography:** Inter (English) + Noto Sans Malayalam; clear hierarchy; no
  tiny text.
- **i18n (`packages/i18n`):** next-intl from day one; all user-facing text via
  keys (e.g. `issue.status.inProgress`); English complete, Malayalam seeded and
  filled incrementally. Internal enums never shown to citizens — mapped to
  friendly keys.
- **Core components:** Button, Input, Textarea, Select, DatePicker,
  Modal/Drawer/Dialog, Toast, Alert, Badge, **StatusBadge**, **PriorityBadge**
  (icon **+ text**, never color alone — WCAG), Card, Table, Pagination, Tabs,
  Breadcrumb, Dropdown, EmptyState, LoadingState (skeletons), ErrorState,
  Timeline, FileUploader, SearchBar, FilterPanel, StatCard, ConfirmDialog.
- **UI states:** every screen handles loading · empty · error · unauthorized ·
  forbidden · offline · no-results. Reduced-motion respected. Citizen app
  PWA-ready shell.

---

## 10. Responsive & accessibility baseline

- Breakpoints: 320 / 375 / 390 / 414 / 768 / 1024 / 1280 / 1440 / large.
- Citizen mobile-first; admin desktop-first but fully responsive (persistent
  sidebar → collapsible → drawer/bottom nav).
- WCAG: strong contrast, keyboard nav, visible focus, semantic HTML, accessible
  labels, meaningful errors, never color alone for meaning.
- Mobile UX: large touch targets, short forms, correct input types
  (`tel`/`email`/`number`/`date`), minimal typing, sticky primary actions,
  no hover-only interactions.

---

## 11. Error handling & security baseline

- Consistent handling of 400/401/403/404/409/422/429/500 with human-readable,
  translated messages; never expose raw backend errors (e.g. no
  "AxiosError 500").
- Backend is the authoritative authorization layer; frontend permissions are
  UX-only.
- Rate limiting on auth and OTP; secure file-upload validation (type/size,
  storage keys not raw URLs); input validation; audit logging; no secrets in
  frontend; environment variables.

---

## 12. Testing strategy

- **Unit (Vitest):** validation schemas, AccessControl permission logic, OTP/
  session services, utilities.
- **Component (RTL):** design-system components, auth/login forms, nav,
  status/priority badges.
- **E2E (Playwright):** citizen register→login→OTP; admin login→(forbidden
  without staff role)→dashboard shell; responsive nav.

---

## 13. Development phases (post-foundation)

1. **M1 Foundation (this spec):** monorepo, data model, auth/RBAC, design
   system, both shells, i18n, nav.
2. **M2 Citizen issues:** Issue domain detail + submission wizard, reference
   number, tracking, citizen dashboard, timeline.
3. **M3 Admin issue management:** issue table/detail, assignment, priority,
   status management.
4. **M4 Org management:** panchayat/ward/representative/coordinator CRUD.
5. **M5 Escalations, notifications, reports, audit UI.**
6. **M6 Accessibility, performance, security hardening, testing, polish.**

Each milestone gets its own spec → plan → implementation cycle.

---

## 14. Non-goals for this milestone

- No Issue submission/tracking UI or workflow (M2).
- No org-entity admin CRUD screens (M4).
- No real SMS provider integration (mock only; interface ready).
- No AWS infra provisioning (deployment-ready design only).
- No offline issue submission.
