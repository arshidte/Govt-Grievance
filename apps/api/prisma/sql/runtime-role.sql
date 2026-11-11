-- ============================================================================
-- Least-privilege PostgreSQL RUNTIME role provisioning (M4D, Part B).
--
-- Creates/updates the application runtime role used by the live NestJS API and
-- grants it ONLY the privileges the application needs. Run this AS THE
-- MIGRATION/ADMIN role (the schema owner), AFTER `prisma migrate deploy` — it
-- grants on ALL EXISTING tables/sequences and sets DEFAULT PRIVILEGES so future
-- migration-created objects inherit the same grants automatically.
--
-- Idempotent: safe to run repeatedly (every statement is CREATE-if-absent,
-- GRANT, or REVOKE). Invoke via scripts/provision-runtime-role.sh, which fills
-- the psql variables below from the environment:
--   :runtime_user      role name           (e.g. app_runtime)
--   :runtime_password  role login password (NEVER committed — from env)
--   :db_name           application database (e.g. panchayat)
--   :owner             migration/admin role that owns the schema (e.g. postgres)
--
-- SECURITY MODEL / LIMITATIONS:
--   * This role is deliberately NOT a superuser and NOT the schema owner, so it
--     cannot DISABLE/DROP the M4C AuditLog append-only triggers, cannot ALTER
--     the AuditLog table, and cannot `SET session_replication_role='replica'`
--     to bypass triggers — all of those require table ownership or superuser.
--   * It gets INSERT (+SELECT) on AuditLog but NOT UPDATE/DELETE/TRUNCATE, so
--     the append-only guarantee holds at BOTH the privilege layer (this file)
--     and the trigger layer (M4C) — defense in depth.
--   * A least-privilege runtime role limits the blast radius of an APPLICATION
--     compromise. It does NOT defend against a sufficiently privileged database
--     administrator (the owner/superuser) who can always alter data or triggers.
-- ============================================================================

\set ON_ERROR_STOP on

-- 1. Create the runtime login role if absent; otherwise refresh its password.
--    Uses psql's \if/\gset (a server-side DO block can't see psql :variables,
--    which are not substituted inside dollar-quoted bodies). :"ident" quotes an
--    identifier; :'literal' quotes a string literal.
SELECT (NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_user'))::text AS need_create \gset
\if :need_create
  CREATE ROLE :"runtime_user" LOGIN PASSWORD :'runtime_password';
\else
  ALTER ROLE :"runtime_user" LOGIN PASSWORD :'runtime_password';
\endif

-- 2. Explicitly strip every elevated attribute (idempotent; least privilege).
ALTER ROLE :"runtime_user"
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT;

-- 3. Database + schema access: connect + read/use objects, but NOT create them
--    (the runtime role may not add/alter schema objects — that's the owner's job).
GRANT CONNECT ON DATABASE :"db_name" TO :"runtime_user";
GRANT USAGE ON SCHEMA public TO :"runtime_user";
REVOKE CREATE ON SCHEMA public FROM :"runtime_user";

-- 4. DML on all existing application tables + sequence access (cuid ids need no
--    sequence, but any Prisma/Postgres sequence is covered defensively).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"runtime_user";

-- 5. AuditLog is APPEND-ONLY for the runtime role: INSERT + SELECT only.
--    Remove the write-back/structure rights that step 4's blanket grant added.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE "AuditLog" FROM :"runtime_user";
GRANT SELECT, INSERT ON TABLE "AuditLog" TO :"runtime_user";

-- 6. Future tables/sequences created by the migration owner inherit the same
--    grants, so new migrations need no re-grant (AuditLog-specific REVOKE in
--    step 5 must still be re-applied by re-running this script after a migration
--    that recreates AuditLog — in practice AuditLog is created once).
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner" IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO :"runtime_user";
