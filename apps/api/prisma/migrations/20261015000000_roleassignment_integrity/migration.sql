-- RoleAssignment integrity hardening (release-readiness fix #2).
--
-- The init migration's composite UNIQUE index
-- ("userId","role","panchayatId","wardId") is INEFFECTIVE for real role
-- assignments: PostgreSQL treats NULLs as DISTINCT in unique indexes, and
-- every role has at least one NULL scope column (ADMIN/CITIZEN: both NULL,
-- COORDINATOR: wardId NULL, REPRESENTATIVE: panchayatId NULL). So duplicate
-- logical assignments were allowed at the DB level. Replace it with:
--   (a) three PARTIAL unique indexes — one per scope shape — which enforce
--       uniqueness NULL-safely without depending on NULLS NOT DISTINCT, and
--   (b) a CHECK constraint enforcing valid role <-> scope combinations.

-- (a) Drop the ineffective composite unique index.
DROP INDEX "RoleAssignment_userId_role_panchayatId_wardId_key";

-- (b) Partial unique indexes per scope shape (NULL-safe: the WHERE clauses
--     fix the NULLity of the scope columns, so no NULL-distinct escape hatch).
-- Global roles (ADMIN / CITIZEN): unique per (user, role) when unscoped.
CREATE UNIQUE INDEX "roleassignment_unique_global"
  ON "RoleAssignment" ("userId", "role")
  WHERE "panchayatId" IS NULL AND "wardId" IS NULL;

-- Panchayat-scoped (COORDINATOR): unique per (user, role, panchayat).
CREATE UNIQUE INDEX "roleassignment_unique_panchayat"
  ON "RoleAssignment" ("userId", "role", "panchayatId")
  WHERE "panchayatId" IS NOT NULL AND "wardId" IS NULL;

-- Ward-scoped (REPRESENTATIVE): unique per (user, role, ward).
CREATE UNIQUE INDEX "roleassignment_unique_ward"
  ON "RoleAssignment" ("userId", "role", "wardId")
  WHERE "wardId" IS NOT NULL AND "panchayatId" IS NULL;

-- (c) Role <-> scope coherence. ADMIN/CITIZEN are global (no scope);
--     COORDINATOR is scoped to exactly a panchayat; REPRESENTATIVE to exactly
--     a ward. Any other combination (e.g. ADMIN with a scope, COORDINATOR
--     without a panchayat, or a row carrying BOTH a panchayat and a ward) is
--     rejected.
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "roleassignment_scope_valid" CHECK (
  ("role" IN ('ADMIN', 'CITIZEN') AND "panchayatId" IS NULL AND "wardId" IS NULL)
  OR ("role" = 'COORDINATOR' AND "panchayatId" IS NOT NULL AND "wardId" IS NULL)
  OR ("role" = 'REPRESENTATIVE' AND "wardId" IS NOT NULL AND "panchayatId" IS NULL)
);
