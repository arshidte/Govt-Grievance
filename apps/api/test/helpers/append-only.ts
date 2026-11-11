import type { Prisma } from '@prisma/client';

import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * TEST-ONLY audit-row purge. The M4C append-only triggers reject ordinary
 * DELETE on "AuditLog", so test fixtures can't be torn down normally. This
 * uses the DOCUMENTED privileged escape hatch — `SET LOCAL
 * session_replication_role = 'replica'` (superuser-only; disables user
 * triggers for this transaction) — to remove the rows a test created. It is
 * never used by application code, and exercising it is itself evidence of the
 * "a superuser can bypass the trigger" limitation noted in the migration.
 */
export async function purgeAuditLogs(
  prisma: PrismaService,
  where: Prisma.AuditLogWhereInput,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
    await tx.auditLog.deleteMany({ where });
  });
}
