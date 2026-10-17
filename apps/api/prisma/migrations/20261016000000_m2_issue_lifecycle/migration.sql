-- M2 citizen-issue-lifecycle (spec §4). Expand -> backfill -> contract.
-- Hand-authored (not `prisma migrate dev`) because of the backfill UPDATE
-- and the sequence/partial-index DDL that have no schema.prisma
-- representation — see spec §4.5 and the task-3 brief.

-- enums
CREATE TYPE "IssueStatus" AS ENUM ('SUBMITTED','ACKNOWLEDGED','UNDER_REVIEW','ASSIGNED','IN_PROGRESS','WAITING_FOR_INFORMATION','ESCALATED','RESOLVED','CLOSED','REOPENED');
CREATE TYPE "Priority" AS ENUM ('LOW','MEDIUM','HIGH','URGENT');

-- Issue new columns. `title`/`description`/`updatedAt` get a transient
-- default so the ADD COLUMN...NOT NULL succeeds on a populated table; the
-- default is dropped immediately after so it never applies going forward
-- (a real M1 DB's Issue table is empty, so no row is ever actually
-- backfilled with these placeholder values). `updatedAt` matches the
-- no-DB-default convention already used for every other `@updatedAt`
-- column in this schema (see 20261007050553_init_foundation: User/Panchayat
-- `updatedAt` — Prisma Client sets it on every write, not Postgres).
-- `status`/`priority` keep their defaults permanently (they mirror the
-- schema.prisma @default) since every M1 Issue row predates any status
-- concept and SUBMITTED/MEDIUM are the correct defaults going forward too.
ALTER TABLE "Issue" ADD COLUMN "title" TEXT NOT NULL DEFAULT '', ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "status" "IssueStatus" NOT NULL DEFAULT 'SUBMITTED', ADD COLUMN "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "subcategoryId" TEXT, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Issue" ALTER COLUMN "title" DROP DEFAULT, ALTER COLUMN "description" DROP DEFAULT, ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- IssueStatusHistory: expand -> backfill -> contract
ALTER TABLE "IssueStatusHistory" ADD COLUMN "changedById" TEXT, ADD COLUMN "fromStatus" "IssueStatus", ADD COLUMN "toStatus" "IssueStatus", ADD COLUMN "note" TEXT;
-- Backfill. The legacy "status" was a free String. KNOWN values (the 10 IssueStatus
-- members) map directly to from/toStatus. UNKNOWN values (anything else) fall back
-- to 'SUBMITTED' and the raw original is preserved verbatim in "note" so nothing is
-- lost. changedById stays NULL (legacy actor genuinely unknown — never fabricated).
UPDATE "IssueStatusHistory" h SET
  "toStatus"   = (CASE WHEN h."status" IN ('SUBMITTED','ACKNOWLEDGED','UNDER_REVIEW','ASSIGNED','IN_PROGRESS','WAITING_FOR_INFORMATION','ESCALATED','RESOLVED','CLOSED','REOPENED') THEN h."status"::"IssueStatus" ELSE 'SUBMITTED'::"IssueStatus" END),
  "fromStatus" = (CASE WHEN h."status" IN ('SUBMITTED','ACKNOWLEDGED','UNDER_REVIEW','ASSIGNED','IN_PROGRESS','WAITING_FOR_INFORMATION','ESCALATED','RESOLVED','CLOSED','REOPENED') THEN h."status"::"IssueStatus" ELSE 'SUBMITTED'::"IssueStatus" END),
  "note"       = (CASE WHEN h."status" IN ('SUBMITTED','ACKNOWLEDGED','UNDER_REVIEW','ASSIGNED','IN_PROGRESS','WAITING_FOR_INFORMATION','ESCALATED','RESOLVED','CLOSED','REOPENED') THEN NULL ELSE 'migrated: unrecognized legacy status "' || h."status" || '"' END);
ALTER TABLE "IssueStatusHistory" ALTER COLUMN "fromStatus" SET NOT NULL, ALTER COLUMN "toStatus" SET NOT NULL;
ALTER TABLE "IssueStatusHistory" DROP COLUMN "status";
ALTER TABLE "IssueStatusHistory" ADD CONSTRAINT "IssueStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Attachment. All four new columns get a transient default (the `sizeBytes`
-- 0 and empty strings are scaffolding only — dropped immediately after —
-- so the ADD COLUMN...NOT NULL succeeds on a populated table; a real M1 DB's
-- Attachment table is empty, so no row is ever actually backfilled with
-- these placeholders). FK matches schema.prisma's implicit `onDelete:
-- Restrict` (Prisma's default when unspecified) to avoid drift from the
-- generated-client expectation.
ALTER TABLE "Attachment" ADD COLUMN "uploadedById" TEXT NOT NULL DEFAULT '', ADD COLUMN "mimeType" TEXT NOT NULL DEFAULT '', ADD COLUMN "sizeBytes" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "originalName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Attachment" ALTER COLUMN "uploadedById" DROP DEFAULT, ALTER COLUMN "mimeType" DROP DEFAULT, ALTER COLUMN "sizeBytes" DROP DEFAULT, ALTER COLUMN "originalName" DROP DEFAULT;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Notification. NOTE: M1's init migration already created "type" as
-- `TEXT NOT NULL` (no default) — see 20261007050553_init_foundation. Only
-- `statusHistoryId` is new here; re-adding "type" would fail with
-- "column already exists" on any M1-derived database.
ALTER TABLE "Notification" ADD COLUMN "statusHistoryId" TEXT;
CREATE UNIQUE INDEX "Notification_statusHistoryId_key" ON "Notification"("statusHistoryId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_statusHistoryId_fkey" FOREIGN KEY ("statusHistoryId") REFERENCES "IssueStatusHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "notification_one_submitted_per_issue" ON "Notification"("issueId") WHERE "type" = 'issue.submitted';

-- reference-number sequence (global, non-resetting). Seed it ABOVE any
-- existing reference's numeric suffix so a generated ref can never collide
-- with a pre-existing Issue.referenceNo. On a real (empty) M1 DB MAX is
-- NULL -> COALESCE to 0 -> GREATEST(1, 0+1) -> starts at 1.
-- is_called=false means the next nextval() returns exactly the seeded value.
-- Issue.referenceNo @unique remains the hard backstop regardless.
CREATE SEQUENCE "issue_reference_seq" START 1;
SELECT setval('issue_reference_seq',
  GREATEST(1, (SELECT COALESCE(MAX(CAST(split_part("referenceNo", '-', 3) AS BIGINT)), 0) + 1
               FROM "Issue" WHERE "referenceNo" ~ '^GRV-[0-9]{4}-[0-9]+$')),
  false);
