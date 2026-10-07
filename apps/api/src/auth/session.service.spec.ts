import { afterAll, describe, expect, it } from 'vitest';

import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from './session.service';

let userCounter = 0;

/** Creates a fresh, collision-free User row for each test. */
async function freshUser(prisma: PrismaService) {
  userCounter += 1;
  const suffix = `${Date.now()}${userCounter}`.slice(-9).padStart(9, '0');
  return prisma.user.create({
    data: { phone: `+91${suffix}` },
  });
}

describe('SessionService', () => {
  const prisma = new PrismaService();
  const service = new SessionService(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('a valid token resolves to the user (with roleAssignments)', async () => {
    const user = await freshUser(prisma);
    const { token } = await service.create(user.id);

    const resolved = await service.validate(token);

    expect(resolved.id).toBe(user.id);
    expect(resolved).toHaveProperty('roleAssignments');
    expect(Array.isArray(resolved.roleAssignments)).toBe(true);
  });

  it('a revoked token is rejected on the very next validate call', async () => {
    const user = await freshUser(prisma);
    const { token } = await service.create(user.id);

    // Sanity: valid before revocation.
    await expect(service.validate(token)).resolves.toBeDefined();

    await service.revoke(token);

    const attempt = service.validate(token);
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.code).toBe('unauthenticated');
      expect(err.status).toBe(401);
      expect(err.messageKey).toBe('states.forbidden');
    });
  });

  it('an expired token is rejected', async () => {
    const user = await freshUser(prisma);
    const { token } = await service.create(user.id);

    // Force expiry directly in the DB (can't wait out SESSION_TTL_HOURS).
    const tokenHash = SessionService.hashToken(token);
    await prisma.session.update({
      where: { tokenHash },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const attempt = service.validate(token);
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.code).toBe('unauthenticated');
      expect(err.status).toBe(401);
    });
  });

  it('stores only a hash of the token; the raw token is never persisted', async () => {
    const user = await freshUser(prisma);
    const { token } = await service.create(user.id);

    const row = await prisma.session.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    expect(row).not.toBeNull();
    expect(row?.tokenHash).not.toBe(token);
    expect(row?.tokenHash).toBe(SessionService.hashToken(token));
  });

  it('revoke() is idempotent (revoking twice does not throw)', async () => {
    const user = await freshUser(prisma);
    const { token } = await service.create(user.id);

    await service.revoke(token);
    await expect(service.revoke(token)).resolves.not.toThrow();
  });
});
