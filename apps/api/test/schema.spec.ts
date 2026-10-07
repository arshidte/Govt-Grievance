import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Side-effect import: loads the nearest `.env` (walking up from cwd) so
// `DATABASE_URL` is populated before PrismaClient reads it, matching the
// pattern used by the rest of the app (see src/config/env.ts).
import '../src/config/env';

const db = new PrismaClient();

describe('schema relationships', () => {
  beforeAll(async () => {
    await db.$connect();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('a user holds multiple scoped role assignments', async () => {
    const suffix = Date.now().toString();
    const p = await db.panchayat.create({
      data: { code: `T1-${suffix}`, name: 'T', nameMl: 'T', status: 'active' },
    });
    const w = await db.ward.create({
      data: { number: 1, name: 'W1', nameMl: 'W1', panchayatId: p.id },
    });
    const u = await db.user.create({
      data: {
        phone: `+9190000${suffix.slice(-5)}`,
        preferredLanguage: 'en',
        status: 'active',
        roleAssignments: {
          create: [
            { role: 'COORDINATOR', panchayatId: p.id },
            { role: 'REPRESENTATIVE', wardId: w.id },
          ],
        },
      },
      include: { roleAssignments: true },
    });

    expect(u.roleAssignments).toHaveLength(2);

    // cleanup (idempotent re-runs)
    await db.roleAssignment.deleteMany({ where: { userId: u.id } });
    await db.user.delete({ where: { id: u.id } });
    await db.ward.delete({ where: { id: w.id } });
    await db.panchayat.delete({ where: { id: p.id } });
  });

  it('creating an Issue requires citizenId, createdById, and onBehalfOf FKs', async () => {
    const suffix = Date.now().toString();
    const p = await db.panchayat.create({
      data: { code: `T2-${suffix}`, name: 'T2', nameMl: 'T2', status: 'active' },
    });
    const w = await db.ward.create({
      data: { number: 2, name: 'W2', nameMl: 'W2', panchayatId: p.id },
    });
    const category = await db.category.create({
      data: { slug: `cat-${suffix}`, name: 'Roads', nameMl: 'Roads' },
    });
    const citizen = await db.user.create({
      data: { phone: `+9191000${suffix.slice(-5)}`, status: 'active' },
    });
    const staff = await db.user.create({
      data: { phone: `+9192000${suffix.slice(-5)}`, status: 'active' },
    });

    const issue = await db.issue.create({
      data: {
        referenceNo: `REF-${suffix}`,
        citizenId: citizen.id,
        createdById: staff.id,
        onBehalfOf: true,
        panchayatId: p.id,
        wardId: w.id,
        categoryId: category.id,
      },
      include: { citizen: true, createdBy: true, panchayat: true, ward: true, category: true },
    });

    expect(issue.citizenId).toBe(citizen.id);
    expect(issue.createdById).toBe(staff.id);
    expect(issue.onBehalfOf).toBe(true);
    expect(issue.citizen.id).toBe(citizen.id);
    expect(issue.createdBy.id).toBe(staff.id);

    // cleanup (idempotent re-runs)
    await db.issue.delete({ where: { id: issue.id } });
    await db.user.delete({ where: { id: citizen.id } });
    await db.user.delete({ where: { id: staff.id } });
    await db.category.delete({ where: { id: category.id } });
    await db.ward.delete({ where: { id: w.id } });
    await db.panchayat.delete({ where: { id: p.id } });
  });
});
