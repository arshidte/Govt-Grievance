-- Append-only enforcement for AuditLog (M4C, Part C).
--
-- Audit records are a governance/security trail: they must not be modifiable
-- or deletable through normal application operations. We enforce this at the
-- DATABASE layer with triggers that reject UPDATE, DELETE and TRUNCATE on the
-- "AuditLog" table. INSERT is unaffected, so the audit write paths keep
-- working. Not expressible in the Prisma schema, so it is hand-written here
-- (consistent with the roleassignment integrity migration).
--
-- SCOPE / LIMITS (documented honestly):
--   * Triggers fire regardless of the connecting role, so this blocks the
--     application's normal DML even though this repo's dev/CI deployment
--     connects as the `postgres` superuser (a plain `REVOKE` would NOT help
--     there, because a superuser bypasses table privileges).
--   * It is NOT tamper-proofing against a privileged operator. A superuser /
--     table owner can still bypass it by `SET session_replication_role =
--     'replica'`, `ALTER TABLE "AuditLog" DISABLE TRIGGER ...`, or dropping
--     the trigger/function. Those are deliberate, privileged acts — not
--     reachable through the application. (Tests use the documented
--     `session_replication_role` escape hatch to purge their own fixtures.)
--   * A dedicated least-privilege application role (with INSERT/SELECT only on
--     "AuditLog") would be defense-in-depth on top of this, but that is an
--     operational/deployment change not represented in this repo and is NOT
--     assumed to be applied.

CREATE OR REPLACE FUNCTION auditlog_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

-- Row-level: reject any UPDATE or DELETE before it happens.
CREATE TRIGGER auditlog_no_update_delete
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION auditlog_block_mutation();

-- Statement-level: reject TRUNCATE (which does not fire row-level triggers).
CREATE TRIGGER auditlog_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION auditlog_block_mutation();
