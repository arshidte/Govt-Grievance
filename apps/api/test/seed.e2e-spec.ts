import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedAll } from '../prisma/seed';

/**
 * Task 16: the seed must be idempotent. Rather than asserting table-wide
 * counts (other tests/fixtures may create their own rows), we scope every
 * assertion to the known, stable seeded set — the 4 dev phones and the 11
 * §4.4 category slugs — per the brief's guidance to prefer this over
 * whole-table counts when the DB isn't guaranteed clean.
 *
 * Seed data is meant to persist (it's the system's bootstrap data), so this
 * spec does NOT delete what it creates in `afterAll` — it only asserts.
 */
describe('Seed script (e2e)', () => {
  let prisma: PrismaClient;

  const SEEDED_PHONES = {
    admin: '+919000000001',
    coordinator: '+919000000002',
    rep1: '+919000000003',
    rep2: '+919000000004',
  };

  const SEEDED_CATEGORY_SLUGS = [
    'certificates-applications',
    'property-building',
    'waste-management',
    'water-drainage',
    'roads-infrastructure',
    'street-lighting',
    'public-health',
    'welfare-services',
    'tax-revenue',
    'licensing',
    'other',
  ];

  const PANCHAYAT_CODE = 'DEMO-GP-01';

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeds exactly 1 admin, the panchayat with >=3 wards, staff, and the 11 categories', async () => {
    await seedAll(prisma);

    const admins = await prisma.user.findMany({
      where: { phone: SEEDED_PHONES.admin },
      include: { roleAssignments: true },
    });
    expect(admins).toHaveLength(1);
    const admin = admins[0]!;
    expect(admin.roleAssignments.filter((r) => r.role === 'ADMIN')).toHaveLength(1);
    const adminAssignment = admin.roleAssignments[0]!;
    expect(adminAssignment.panchayatId).toBeNull();
    expect(adminAssignment.wardId).toBeNull();

    const panchayat = await prisma.panchayat.findUnique({
      where: { code: PANCHAYAT_CODE },
      include: { wards: true },
    });
    expect(panchayat).not.toBeNull();
    expect(panchayat!.wards.length).toBeGreaterThanOrEqual(3);

    const coordinator = await prisma.user.findUnique({
      where: { phone: SEEDED_PHONES.coordinator },
      include: { roleAssignments: true },
    });
    expect(coordinator).not.toBeNull();
    const coordAssignments = coordinator!.roleAssignments.filter((r) => r.role === 'COORDINATOR');
    expect(coordAssignments).toHaveLength(1);
    expect(coordAssignments[0]!.panchayatId).toBe(panchayat!.id);

    const rep1 = await prisma.user.findUnique({
      where: { phone: SEEDED_PHONES.rep1 },
      include: { roleAssignments: true },
    });
    const rep2 = await prisma.user.findUnique({
      where: { phone: SEEDED_PHONES.rep2 },
      include: { roleAssignments: true },
    });
    expect(rep1).not.toBeNull();
    expect(rep2).not.toBeNull();
    const rep1Assignments = rep1!.roleAssignments.filter((r) => r.role === 'REPRESENTATIVE');
    const rep2Assignments = rep2!.roleAssignments.filter((r) => r.role === 'REPRESENTATIVE');
    expect(rep1Assignments).toHaveLength(1);
    expect(rep2Assignments).toHaveLength(1);
    const rep1Assignment = rep1Assignments[0]!;
    const rep2Assignment = rep2Assignments[0]!;
    expect(rep1Assignment.wardId).not.toBeNull();
    expect(rep2Assignment.wardId).not.toBeNull();
    expect(rep1Assignment.wardId).not.toBe(rep2Assignment.wardId);

    const categories = await prisma.category.findMany({
      where: { slug: { in: SEEDED_CATEGORY_SLUGS } },
      include: { subcategories: true },
    });
    expect(categories).toHaveLength(11);
    const bySlug = new Map(categories.map((c) => [c.slug, c]));
    for (const slug of SEEDED_CATEGORY_SLUGS) {
      expect(bySlug.has(slug)).toBe(true);
    }
    // sortOrder must be 1..11 and distinct.
    const sortOrders = categories.map((c) => c.sortOrder).sort((a, b) => a - b);
    expect(sortOrders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    // A couple of subcategories were seeded under at least one category.
    const totalSubcategories = categories.reduce((sum, c) => sum + c.subcategories.length, 0);
    expect(totalSubcategories).toBeGreaterThan(0);
  });

  it('re-running seedAll does not duplicate any rows (idempotent)', async () => {
    // Snapshot counts scoped to the known seeded set.
    const before = {
      users: await prisma.user.count({ where: { phone: { in: Object.values(SEEDED_PHONES) } } }),
      roleAssignments: await prisma.roleAssignment.count({
        where: { user: { phone: { in: Object.values(SEEDED_PHONES) } } },
      }),
      wards: await prisma.ward.count({ where: { panchayat: { code: PANCHAYAT_CODE } } }),
      panchayats: await prisma.panchayat.count({ where: { code: PANCHAYAT_CODE } }),
      categories: await prisma.category.count({ where: { slug: { in: SEEDED_CATEGORY_SLUGS } } }),
      subcategories: await prisma.subcategory.count({
        where: { category: { slug: { in: SEEDED_CATEGORY_SLUGS } } },
      }),
    };

    await seedAll(prisma);
    await seedAll(prisma);

    const after = {
      users: await prisma.user.count({ where: { phone: { in: Object.values(SEEDED_PHONES) } } }),
      roleAssignments: await prisma.roleAssignment.count({
        where: { user: { phone: { in: Object.values(SEEDED_PHONES) } } },
      }),
      wards: await prisma.ward.count({ where: { panchayat: { code: PANCHAYAT_CODE } } }),
      panchayats: await prisma.panchayat.count({ where: { code: PANCHAYAT_CODE } }),
      categories: await prisma.category.count({ where: { slug: { in: SEEDED_CATEGORY_SLUGS } } }),
      subcategories: await prisma.subcategory.count({
        where: { category: { slug: { in: SEEDED_CATEGORY_SLUGS } } },
      }),
    };

    expect(after).toEqual(before);
    expect(after.users).toBe(4);
    expect(after.roleAssignments).toBe(4);
    expect(after.panchayats).toBe(1);
    expect(after.wards).toBe(3);
    expect(after.categories).toBe(11);
  });
});
