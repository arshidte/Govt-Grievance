-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('pending', 'verified', 'cancelled', 'expired');

-- CreateTable
CREATE TABLE "StaffOnboarding" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "userId" TEXT,
    "role" "Role" NOT NULL,
    "wardIds" TEXT[],
    "panchayatIds" TEXT[],
    "status" "OnboardingStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffOnboarding_phone_status_idx" ON "StaffOnboarding"("phone", "status");

-- CreateIndex
CREATE INDEX "StaffOnboarding_status_createdAt_idx" ON "StaffOnboarding"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffOnboarding" ADD CONSTRAINT "StaffOnboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- At most ONE pending onboarding per phone (NULL-safe partial unique index;
-- verified/cancelled/expired rows are unconstrained, preserving history and
-- allowing a phone to be re-onboarded after a terminal outcome). Not
-- expressible in the Prisma schema, so it is added here by hand.
CREATE UNIQUE INDEX "staffonboarding_unique_pending_phone"
  ON "StaffOnboarding" ("phone")
  WHERE "status" = 'pending';
