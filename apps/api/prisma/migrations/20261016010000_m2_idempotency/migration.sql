-- M2 idempotency (Task 6). Creates the IdempotencyKey replay store used by
-- IdempotencyService (base replay logic here; concurrent-race P2002
-- handling + 24h TTL purge land in Task 9 — see that task's migration/code
-- for any follow-on DDL, none is needed from this table's shape alone).
-- Hand-authored per R-M1 (no `prisma migrate dev`); standalone table, no FKs,
-- matching schema.prisma's `IdempotencyKey` model (no relations).

CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "issueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyKey_userId_route_key_key" ON "IdempotencyKey"("userId", "route", "key");

CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");
