import { afterAll, describe, expect, it } from 'vitest';

// Imported for its side effect: loads the root `.env` (DATABASE_URL etc.)
// before PrismaService is constructed, matching the pattern used by other
// DB-backed specs (see auth/otp.service.spec.ts, which pulls this in
// transitively via OtpService).
import '../config/env';
import { PrismaService } from '../prisma/prisma.service';

import { IssueReferenceService } from './issue-reference.service';

describe('IssueReferenceService', () => {
  const prisma = new PrismaService();
  const service = new IssueReferenceService(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('generates distinct well-formed reference numbers', async () => {
    const a = await service.next(new Date('2026-05-01'));
    const b = await service.next(new Date('2026-05-01'));

    expect(a).toMatch(/^GRV-2026-\d{6,}$/);
    expect(b).toMatch(/^GRV-2026-\d{6,}$/);
    expect(a).not.toBe(b);
  });

  it('formats the year from the provided date, not the current date', async () => {
    const ref = await service.next(new Date('2030-01-15'));

    expect(ref).toMatch(/^GRV-2030-\d{6,}$/);
  });

  it('is collision-free under concurrency (50 parallel calls)', async () => {
    const refs = await Promise.all(Array.from({ length: 50 }, () => service.next(new Date())));

    expect(new Set(refs).size).toBe(50);
  });
});
