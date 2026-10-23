import { afterAll, describe, expect, it, vi } from 'vitest';

// Imported for its side effect: loads the root `.env` (DATABASE_URL etc.)
// before PrismaService is constructed, matching the pattern used by other
// DB-backed specs (see auth/otp.service.spec.ts, issues/issue-reference.service.spec.ts).
import '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

import { IdempotencyService } from './idempotency.service';

let keyCounter = 0;

/** Generates a fresh, collision-free idempotency key for each test. */
function freshKey(): string {
  keyCounter += 1;
  return `k-${Date.now()}-${keyCounter}`;
}

describe('IdempotencyService', () => {
  const prisma = new PrismaService();
  const service = new IdempotencyService(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('replays the stored response for the same key + fingerprint without re-running work', async () => {
    const key = freshKey();
    const work = vi.fn(async () => ({ result: { id: 'i1' }, issueId: 'i1' }));

    const first = await service.run({ key, userId: 'u1', route: 'POST /issues', fingerprint: 'f1' }, work);
    const second = await service.run({ key, userId: 'u1', route: 'POST /issues', fingerprint: 'f1' }, work);

    expect(work).toHaveBeenCalledTimes(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.result).toEqual(first.result);
  });

  it('rejects the same key with a different fingerprint (409 idempotency_key_conflict)', async () => {
    const key = freshKey();
    const work = vi.fn(async () => ({ result: {}, issueId: 'i' }));

    await service.run({ key, userId: 'u1', route: 'POST /issues', fingerprint: 'f1' }, work);

    await expect(
      service.run({ key, userId: 'u1', route: 'POST /issues', fingerprint: 'f2' }, work),
    ).rejects.toMatchObject({
      code: 'idempotency_key_conflict',
      status: 409,
      messageKey: 'errors.idempotencyConflict',
    });

    // The conflicting call must never execute the caller's work.
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('runs work and returns replayed:false when no key is supplied', async () => {
    const work = vi.fn(async () => ({ result: { id: 'i2' }, issueId: 'i2' }));

    const first = await service.run({ userId: 'u1', route: 'POST /issues', fingerprint: 'f1' }, work);
    const second = await service.run({ userId: 'u1', route: 'POST /issues', fingerprint: 'f1' }, work);

    expect(work).toHaveBeenCalledTimes(2);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(false);
  });

  it('scopes keys by (userId, route): same key for a different user is independent', async () => {
    const key = freshKey();
    const work = vi.fn(async () => ({ result: { id: 'ix' }, issueId: 'ix' }));

    const forUser1 = await service.run({ key, userId: 'u1', route: 'POST /issues', fingerprint: 'f1' }, work);
    const forUser2 = await service.run({ key, userId: 'u2', route: 'POST /issues', fingerprint: 'f1' }, work);

    expect(work).toHaveBeenCalledTimes(2);
    expect(forUser1.replayed).toBe(false);
    expect(forUser2.replayed).toBe(false);
  });
});
