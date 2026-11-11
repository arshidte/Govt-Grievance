# Database least-privilege runtime role (M4D)

This document describes the separation between the **migration/admin** database
identity and the **runtime** database identity used by the API, and the
deployment runbook for switching an existing environment onto the runtime role.

## Why

The API previously connected as the PostgreSQL superuser/schema owner for
everything — serving requests, running migrations, seeding. A compromise of the
running application therefore inherited full control of the database, including
the ability to disable the M4C AuditLog append-only triggers.

M4D separates two identities so the **running application** holds only the
privileges it actually needs.

> **Security guarantee (be precise):** a least-privilege runtime role reduces
> the blast radius of an **application** compromise — leaked app credentials
> can read/write business data and *append* audit rows, but cannot tamper with
> existing audit rows, disable the append-only triggers, or alter the schema.
> It does **not** defend against a sufficiently privileged database
> administrator (the schema owner or a superuser), who can always alter data,
> triggers, or structure. Append-only is enforced in depth (trigger layer +
> privilege layer) but is not tamper-proof against the DB owner.

## The two roles

| Concern | Identity | Connection env var | Used by |
| --- | --- | --- | --- |
| Migrations, schema changes, role/grant admin | **migration/admin** (schema owner; `postgres` in dev/CI) | `DIRECT_DATABASE_URL` (Prisma `directUrl`) | `prisma migrate deploy\|dev`, `db push`, the provisioning script, the test harness |
| Normal API operation | **runtime** (`app_runtime`) | `DATABASE_URL` (Prisma `url`) | the live NestJS API (Prisma Client) |

Prisma Client reads only `url`; Prisma Migrate uses `directUrl`. The API boots
with `DATABASE_URL` alone (`DIRECT_DATABASE_URL` is optional at runtime).

## Runtime role grants (exact)

Applied idempotently by [`prisma/sql/runtime-role.sql`](../prisma/sql/runtime-role.sql)
(run via `scripts/provision-runtime-role.sh`):

**Granted**
- `CONNECT` on the application database
- `USAGE` on schema `public`
- `SELECT, INSERT, UPDATE, DELETE` on all existing application tables
- `USAGE, SELECT` on all sequences
- `SELECT, INSERT` on `"AuditLog"`
- The same via `ALTER DEFAULT PRIVILEGES` for future migration-created tables/sequences

**Explicitly denied / never granted**
- `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS`
- `CREATE` on schema `public` (cannot add schema objects)
- Ownership of the schema or any table
- `UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` on `"AuditLog"`

## AuditLog protection model

The M4C append-only triggers (`auditlog_no_update_delete`, `auditlog_no_truncate`)
and their function are owned by the **migration/admin** role (they are created by
`prisma migrate deploy`). Because the runtime role is **neither the table owner
nor a superuser**, it:

- cannot `ALTER TABLE "AuditLog" DISABLE TRIGGER ...` (requires table ownership),
- cannot `DROP TRIGGER ...` (requires table ownership),
- cannot `SET session_replication_role = 'replica'` to bypass triggers (superuser only),
- cannot `ALTER`/`DROP` the `"AuditLog"` table.

On top of that, the runtime role is not granted `UPDATE/DELETE/TRUNCATE` on
`"AuditLog"` at all — so those are blocked at the privilege layer *before* the
triggers even fire (defense in depth). INSERT is permitted, so the application
can still append audit rows.

This matrix is asserted by
[`test/runtime-role-privileges.e2e-spec.ts`](../test/runtime-role-privileges.e2e-spec.ts),
which connects **as the runtime role** (`RUNTIME_DATABASE_URL`).

## Local development setup (order matters)

1. Start Postgres: `docker compose -f docker-compose.dev.yml up -d`
2. Set env vars (copy `.env.example` → root `.env`, fill the runtime password).
3. Apply migrations with the **admin** identity:
   `DIRECT_DATABASE_URL=… pnpm --filter @pg/api exec prisma migrate deploy`
4. (Optional) seed: `pnpm --filter @pg/api exec prisma db seed`
5. Provision the runtime role (admin identity; needs tables to exist):
   `RUNTIME_DB_PASSWORD=… pnpm --filter @pg/api db:provision-runtime-role`
6. Run the API — it now connects with `DATABASE_URL` = the runtime role.

The provisioning script and SQL are idempotent; re-run step 5 any time (e.g.
after a migration that adds tables — default privileges cover new tables, but
re-running also re-applies the AuditLog-specific REVOKE if ever needed).

## CI

CI (`.github/workflows/ci.yml`) runs migrations with the admin identity
(`DIRECT_DATABASE_URL`), then provisions `app_runtime` and runs
`test/runtime-role-privileges.e2e-spec.ts` against it (`RUNTIME_DATABASE_URL`).

**What CI verifies:** the runtime role can connect, do ordinary DML, INSERT
AuditLog and run the transactional insert+audit path, and that it is denied
UPDATE/DELETE/TRUNCATE on AuditLog, trigger disable/drop, table ALTER, object
creation, and the superuser bypass.

**What CI does NOT verify:** CI has no long-running API-serving step, so it does
not boot the full HTTP server under the runtime role. The broader e2e suite runs
as the admin identity because it performs privileged seeding/teardown (append-only
purge, CREATE/DROP databases) that the runtime role is intentionally forbidden
from. The runtime role's sufficiency for the application's real write paths is
demonstrated by the dedicated spec's DML + transactional insert+audit assertions.

## Production runbook: switching an existing environment to the runtime role

> Does **not** rotate or revoke any existing credentials automatically. Perform
> during a maintenance window. No secrets appear in this repo.

1. **Provision the migration/admin role** — your existing privileged connection
   (schema owner) becomes `DIRECT_DATABASE_URL`. No change if you already have one.
2. **Provision the runtime role:** with the admin connection exported as
   `DIRECT_DATABASE_URL`, run
   `RUNTIME_DB_USER=… RUNTIME_DB_PASSWORD=… RUNTIME_DB_NAME=… MIGRATION_DB_USER=<owner> \
    pnpm --filter @pg/api db:provision-runtime-role`.
3. **Apply grants:** the script does this (idempotent). Confirm with
   `\du app_runtime` and `\dp "AuditLog"` in `psql`.
4. **Existing data & ownership:** unchanged — tables keep their current owner;
   only grants are added. The runtime role owns nothing.
5. **Switch the runtime connection:** set the API process's `DATABASE_URL` to the
   runtime role and restart. Keep `DIRECT_DATABASE_URL` (admin) only where
   migrations run (CI/ops), never in the app's runtime secret store if avoidable.
6. **Verify functionality:** exercise OTP login, grievance submission, a status
   transition, and an admin org mutation; confirm new AuditLog rows appear and
   that the app starts without permission errors.
7. **Roll back safely:** if the app errors on permissions, point `DATABASE_URL`
   back at the previous (admin) connection and restart — an immediate revert with
   no data change. Then diagnose the missing grant and re-run the provisioning
   script before retrying the switch.
