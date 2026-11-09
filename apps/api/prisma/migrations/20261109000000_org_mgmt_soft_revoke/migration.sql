-- Organization-management milestone: soft-revocation for RoleAssignment.
--
-- Representatives and Coordinators are RoleAssignment rows (no dedicated
-- model). This milestone lets an Admin REVOKE an assignment without deleting
-- it, preserving assignment history while ensuring a revoked row no longer
-- grants authorization. We add `revokedAt`/`revokedBy`, and recreate the
-- three partial unique indexes from 20261015000000_roleassignment_integrity
-- so that uniqueness applies to ACTIVE (non-revoked) assignments only — a
-- user may be re-assigned to a ward/panchayat they were previously revoked
-- from, and multiple historical revoked rows for the same scope may coexist.
--
-- Additive + backward-compatible: existing rows get NULL revokedAt (i.e.
-- ACTIVE), exactly their current meaning. The role<->scope CHECK constraint
-- (`roleassignment_scope_valid`) is unaffected and left in place.

-- (a) Soft-revoke columns (nullable; NULL = active). `revokedBy` is a bare
--     actor id with no FK, mirroring the existing `grantedBy` column.
ALTER TABLE "RoleAssignment" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "RoleAssignment" ADD COLUMN "revokedBy" TEXT;

-- (b) Recreate the partial unique indexes to constrain ACTIVE rows only.
--     Each WHERE clause gains `AND "revokedAt" IS NULL`, so a revoked row
--     never collides with a new active assignment of the same shape.
DROP INDEX "roleassignment_unique_global";
DROP INDEX "roleassignment_unique_panchayat";
DROP INDEX "roleassignment_unique_ward";

-- Global roles (ADMIN / CITIZEN): one ACTIVE unscoped assignment per (user, role).
CREATE UNIQUE INDEX "roleassignment_unique_global"
  ON "RoleAssignment" ("userId", "role")
  WHERE "panchayatId" IS NULL AND "wardId" IS NULL AND "revokedAt" IS NULL;

-- Panchayat-scoped (COORDINATOR): one ACTIVE assignment per (user, role, panchayat).
CREATE UNIQUE INDEX "roleassignment_unique_panchayat"
  ON "RoleAssignment" ("userId", "role", "panchayatId")
  WHERE "panchayatId" IS NOT NULL AND "wardId" IS NULL AND "revokedAt" IS NULL;

-- Ward-scoped (REPRESENTATIVE): one ACTIVE assignment per (user, role, ward).
CREATE UNIQUE INDEX "roleassignment_unique_ward"
  ON "RoleAssignment" ("userId", "role", "wardId")
  WHERE "wardId" IS NOT NULL AND "panchayatId" IS NULL AND "revokedAt" IS NULL;

-- (c) Helpful lookup index for "active assignments for a scope" queries used
--     by the listing endpoints (role + scope + active).
CREATE INDEX "roleassignment_active_lookup"
  ON "RoleAssignment" ("role", "panchayatId", "wardId")
  WHERE "revokedAt" IS NULL;
