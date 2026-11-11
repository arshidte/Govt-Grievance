import { afterEach, describe, expect, it } from 'vitest';

// Side-effect import: loads the nearest `.env` (see `config/env.ts`) before
// `PrismaService` is constructed below. Other DB-touching specs get this for
// free by importing a service (e.g. `OtpService`) that already imports
// `env`; `AuditService` has no such dependency, so this spec imports it
// directly — matching the app's own bootstrap in `main.ts`.
import '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  const prisma = new PrismaService();
  const service = new AuditService(prisma);

  // Track ids created by each test so we can clean up without truncating
  // the whole table (other tests/specs may be writing to it concurrently).
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length > 0) {
      // AuditLog is append-only (M4C trigger); purge test rows via the
      // documented superuser escape hatch (disable triggers for this tx).
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
        await tx.auditLog.deleteMany({ where: { id: { in: createdIds } } });
      });
      createdIds.length = 0;
    }
  });

  it('record() persists a row with the given fields', async () => {
    const row = await service.record({
      actorUserId: 'user-123',
      action: 'otp.requested',
      entityType: 'User',
      entityId: 'user-123',
      metadata: { phoneMasked: '******7890' },
      ip: '127.0.0.1',
    });
    expect(row).not.toBeNull();
    createdIds.push((row as { id: string }).id);

    const persisted = await prisma.auditLog.findUnique({ where: { id: row?.id } });

    expect(persisted).not.toBeNull();
    expect(persisted?.actorUserId).toBe('user-123');
    expect(persisted?.action).toBe('otp.requested');
    expect(persisted?.entityType).toBe('User');
    expect(persisted?.entityId).toBe('user-123');
    expect(persisted?.metadata).toEqual({ phoneMasked: '******7890' });
    expect(persisted?.ip).toBe('127.0.0.1');
  });

  it('record() tolerates omitted optional fields (actorUserId, entityId, metadata, ip)', async () => {
    const row = await service.record({
      action: 'otp.failed',
      entityType: 'OtpChallenge',
    });
    expect(row).not.toBeNull();
    createdIds.push((row as { id: string }).id);

    const persisted = await prisma.auditLog.findUnique({ where: { id: row?.id } });

    expect(persisted).not.toBeNull();
    expect(persisted?.actorUserId).toBeNull();
    expect(persisted?.entityId).toBeNull();
    expect(persisted?.metadata).toBeNull();
    expect(persisted?.ip).toBeNull();
  });
});
