import { PrismaClient, Role } from '@prisma/client';

/**
 * Idempotent seed for the foundation milestone (Task 16).
 *
 * Seeds a minimal but usable system:
 *  - 1 ADMIN user (global role, no panchayat/ward scope)
 *  - 1 Panchayat + 3 Wards
 *  - 1 COORDINATOR user, scoped to the panchayat
 *  - 2 REPRESENTATIVE users, each scoped to a distinct ward
 *  - The 11 categories from spec §4.4 (RULING R13), each with a stable
 *    kebab-case slug and sortOrder, plus a few subcategories.
 *
 * Every write is an upsert (or an explicit find-then-create for models
 * without a natural unique key) so re-running this script against an
 * already-seeded database makes no further changes. See per-entity
 * comments below for the exact idempotency key used.
 */

// RULING R13 — the binding category list (spec §4.4), in required sortOrder.
// nameMl choices: Street Lighting, Public Health, and Other reuse the
// matching Malayalam from packages/i18n/messages/ml.json
// (category.streetLighting, category.publicHealth, category.other). The
// remaining 8 categories are NOT present in that legacy `category.*`
// namespace (it is a different, divergent set per R13), so they carry a
// best-effort Malayalam translation below — none fall back to English.
const CATEGORIES = [
  {
    slug: 'certificates-applications',
    name: 'Certificates & Applications',
    nameMl: 'സർട്ടിഫിക്കറ്റുകളും അപേക്ഷകളും',
    sortOrder: 1,
    subcategories: [
      { name: 'Birth Certificate', nameMl: 'ജനന സർട്ടിഫിക്കറ്റ്' },
      { name: 'Income Certificate', nameMl: 'വരുമാന സർട്ടിഫിക്കറ്റ്' },
    ],
  },
  {
    slug: 'property-building',
    name: 'Property & Building',
    nameMl: 'വസ്തുവും കെട്ടിടവും',
    sortOrder: 2,
    subcategories: [],
  },
  {
    slug: 'waste-management',
    name: 'Waste Management',
    nameMl: 'മാലിന്യ സംസ്കരണം',
    sortOrder: 3,
    subcategories: [
      { name: 'Garbage Collection Missed', nameMl: 'മാലിന്യം ശേഖരിച്ചില്ല' },
    ],
  },
  {
    slug: 'water-drainage',
    name: 'Water & Drainage',
    nameMl: 'ജലവും ഡ്രെയിനേജും',
    sortOrder: 4,
    subcategories: [],
  },
  {
    slug: 'roads-infrastructure',
    name: 'Roads & Infrastructure',
    nameMl: 'റോഡുകളും അടിസ്ഥാന സൗകര്യങ്ങളും',
    sortOrder: 5,
    subcategories: [{ name: 'Potholes', nameMl: 'കുഴികൾ' }],
  },
  {
    slug: 'street-lighting',
    name: 'Street Lighting',
    nameMl: 'തെരുവ് വിളക്കുകൾ', // reused verbatim from ml.json: category.streetLighting
    sortOrder: 6,
    subcategories: [],
  },
  {
    slug: 'public-health',
    name: 'Public Health',
    nameMl: 'പൊതുജനാരോഗ്യം', // reused verbatim from ml.json: category.publicHealth
    sortOrder: 7,
    subcategories: [],
  },
  {
    slug: 'welfare-services',
    name: 'Welfare Services',
    nameMl: 'ക്ഷേമ സേവനങ്ങൾ',
    sortOrder: 8,
    subcategories: [],
  },
  {
    slug: 'tax-revenue',
    name: 'Tax & Revenue',
    nameMl: 'നികുതിയും വരുമാനവും',
    sortOrder: 9,
    subcategories: [],
  },
  {
    slug: 'licensing',
    name: 'Licensing',
    nameMl: 'ലൈസൻസിംഗ്',
    sortOrder: 10,
    subcategories: [],
  },
  {
    slug: 'other',
    name: 'Other',
    nameMl: 'മറ്റുള്ളവ', // reused verbatim from ml.json: category.other
    sortOrder: 11,
    subcategories: [],
  },
] as const;

// Dev-only, clearly-fake phone numbers (valid E.164-ish per phoneSchema:
// `+91[6-9]\d{9}`) documented in `.env.example` for mock-OTP dev login.
const ADMIN_PHONE = '+919000000001';
const COORDINATOR_PHONE = '+919000000002';
const REP_1_PHONE = '+919000000003';
const REP_2_PHONE = '+919000000004';

const PANCHAYAT_CODE = 'DEMO-GP-01';

/**
 * Idempotently ensures exactly one `RoleAssignment` row exists for the
 * given (userId, role, panchayatId, wardId) tuple. See the comment at the
 * call sites in `seedAll` for why this can't use `prisma.roleAssignment.upsert`.
 */
async function upsertRoleAssignment(
  prisma: PrismaClient,
  args: { userId: string; role: Role; panchayatId: string | null; wardId: string | null },
): Promise<void> {
  const existing = await prisma.roleAssignment.findFirst({
    where: {
      userId: args.userId,
      role: args.role,
      panchayatId: args.panchayatId,
      wardId: args.wardId,
    },
  });
  if (!existing) {
    await prisma.roleAssignment.create({
      data: {
        userId: args.userId,
        role: args.role,
        panchayatId: args.panchayatId ?? undefined,
        wardId: args.wardId ?? undefined,
      },
    });
  }
}

export async function seedAll(prisma: PrismaClient): Promise<void> {
  // --- Panchayat (idempotency key: code @unique) ---
  const panchayat = await prisma.panchayat.upsert({
    where: { code: PANCHAYAT_CODE },
    update: {},
    create: {
      code: PANCHAYAT_CODE,
      name: 'Demo Grama Panchayat',
      nameMl: 'ഡെമോ ഗ്രാമപഞ്ചായത്ത്',
      contactPhone: '+914710000000',
      contactEmail: 'demo-panchayat@example.gov.in',
      status: 'active',
    },
  });

  // --- Wards (idempotency key: composite @@unique([panchayatId, number])) ---
  const upsertWard = (number: number, name: string, nameMl: string) =>
    prisma.ward.upsert({
      where: { panchayatId_number: { panchayatId: panchayat.id, number } },
      update: {},
      create: { number, name, nameMl, panchayatId: panchayat.id },
    });

  // ward3 has no staff assigned below — a realistic "not every ward has a
  // representative yet" state — kept to satisfy the ">= 3 wards" requirement.
  const ward1 = await upsertWard(1, 'Ward 1', 'വാർഡ് 1');
  const ward2 = await upsertWard(2, 'Ward 2', 'വാർഡ് 2');
  await upsertWard(3, 'Ward 3', 'വാർഡ് 3');

  // --- Users (idempotency key: phone @unique) ---
  const adminUser = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    update: {},
    create: {
      phone: ADMIN_PHONE,
      fullName: 'Demo Admin',
      preferredLanguage: 'en',
      status: 'active',
    },
  });

  const coordinatorUser = await prisma.user.upsert({
    where: { phone: COORDINATOR_PHONE },
    update: {},
    create: {
      phone: COORDINATOR_PHONE,
      fullName: 'Demo Coordinator',
      preferredLanguage: 'en',
      status: 'active',
    },
  });

  const rep1User = await prisma.user.upsert({
    where: { phone: REP_1_PHONE },
    update: {},
    create: {
      phone: REP_1_PHONE,
      fullName: 'Demo Representative 1',
      preferredLanguage: 'en',
      status: 'active',
      wardId: ward1.id,
    },
  });

  const rep2User = await prisma.user.upsert({
    where: { phone: REP_2_PHONE },
    update: {},
    create: {
      phone: REP_2_PHONE,
      fullName: 'Demo Representative 2',
      preferredLanguage: 'en',
      status: 'active',
      wardId: ward2.id,
    },
  });

  // --- Role assignments (idempotency key: (userId, role, panchayatId, wardId)) ---
  //
  // The schema declares `@@unique([userId, role, panchayatId, wardId])`, but
  // Prisma's generated compound-unique `where` shorthand types the optional
  // `panchayatId`/`wardId` columns as plain `string` (not `string | null`),
  // so `prisma.roleAssignment.upsert()` cannot express a lookup where either
  // is null (as it is for ADMIN, and for one of the two for
  // COORDINATOR/REPRESENTATIVE). We fall back to an explicit
  // find-then-create-if-absent guarded on the same four columns, which the
  // DB unique constraint still protects against races.
  await upsertRoleAssignment(prisma, {
    userId: adminUser.id,
    role: Role.ADMIN,
    panchayatId: null,
    wardId: null,
  });

  await upsertRoleAssignment(prisma, {
    userId: coordinatorUser.id,
    role: Role.COORDINATOR,
    panchayatId: panchayat.id,
    wardId: null,
  });

  await upsertRoleAssignment(prisma, {
    userId: rep1User.id,
    role: Role.REPRESENTATIVE,
    panchayatId: null,
    wardId: ward1.id,
  });

  await upsertRoleAssignment(prisma, {
    userId: rep2User.id,
    role: Role.REPRESENTATIVE,
    panchayatId: null,
    wardId: ward2.id,
  });

  // --- Categories + subcategories ---
  // Category idempotency key: slug @unique.
  // Subcategory has no natural unique key in the schema, so idempotency is
  // achieved with an explicit find-by-(categoryId, name) lookup before
  // create ("create-if-absent") rather than a Prisma `upsert`.
  for (const cat of CATEGORIES) {
    const category = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, nameMl: cat.nameMl, sortOrder: cat.sortOrder },
      create: {
        slug: cat.slug,
        name: cat.name,
        nameMl: cat.nameMl,
        sortOrder: cat.sortOrder,
      },
    });

    for (const sub of cat.subcategories) {
      const existing = await prisma.subcategory.findFirst({
        where: { categoryId: category.id, name: sub.name },
      });
      if (!existing) {
        await prisma.subcategory.create({
          data: {
            categoryId: category.id,
            name: sub.name,
            nameMl: sub.nameMl,
          },
        });
      }
    }
  }
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedAll(prisma)
    .then(() => {
      console.log('Seed complete.');
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
