/**
 * Release-readiness fix #2: RoleAssignment DB-level integrity.
 *
 * Proves the PARTIAL unique indexes + CHECK constraint (migration
 * 20261015000000_roleassignment_integrity) actually enforce, at the
 * database level, invariants that the old NULL-distinct composite unique
 * index silently allowed:
 *   - no duplicate logical assignments even when scope columns are NULL
 *     (ADMIN/CITIZEN global, COORDINATOR per-panchayat, REPRESENTATIVE
 *     per-ward)
 *   - only valid role <-> scope combinations
 *
 * These are DB-level assertions (not app logic), so they run against the
 * live Postgres the rest of the e2e suite uses.
 */
import { PrismaClient, type Role } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const prisma = new PrismaClient();

// Distinct fixtures so this spec never collides with seeded rows.
const USER_PHONE = '+919990000001';
const PANCHAYAT_CODE = 'TEST-INTEG-RA-01';
let userId: string;
let panchayatId: string;
let panchayatId2: string;
let wardId: string;
let wardId2: string;

function assign(data: {
  role: Role;
  panchayatId?: string | null;
  wardId?: string | null;
}) {
  return prisma.roleAssignment.create({
    data: {
      userId,
      role: data.role,
      panchayatId: data.panchayatId ?? null,
      wardId: data.wardId ?? null,
    },
  });
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { phone: USER_PHONE } });
  userId = user.id;
  const p1 = await prisma.panchayat.create({
    data: { code: PANCHAYAT_CODE, name: 'Integ P1', nameMl: 'Integ P1' },
  });
  const p2 = await prisma.panchayat.create({
    data: { code: `${PANCHAYAT_CODE}-2`, name: 'Integ P2', nameMl: 'Integ P2' },
  });
  panchayatId = p1.id;
  panchayatId2 = p2.id;
  const w1 = await prisma.ward.create({
    data: { number: 1, name: 'Integ W1', nameMl: 'Integ W1', panchayatId: p1.id },
  });
  const w2 = await prisma.ward.create({
    data: { number: 2, name: 'Integ W2', nameMl: 'Integ W2', panchayatId: p1.id },
  });
  wardId = w1.id;
  wardId2 = w2.id;
});

afterAll(async () => {
  // FK-safe teardown order: assignments -> wards -> panchayats -> user.
  await prisma.roleAssignment.deleteMany({ where: { userId } });
  await prisma.ward.deleteMany({ where: { id: { in: [wardId, wardId2] } } });
  await prisma.panchayat.deleteMany({ where: { id: { in: [panchayatId, panchayatId2] } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe('RoleAssignment uniqueness (NULL-safe, DB-enforced)', () => {
  it('rejects a duplicate ADMIN (both scope columns NULL)', async () => {
    await assign({ role: 'ADMIN' });
    await expect(assign({ role: 'ADMIN' })).rejects.toThrow();
  });

  it('rejects a duplicate COORDINATOR on the same panchayat', async () => {
    await assign({ role: 'COORDINATOR', panchayatId });
    await expect(assign({ role: 'COORDINATOR', panchayatId })).rejects.toThrow();
  });

  it('allows the same COORDINATOR role on a DIFFERENT panchayat (not a duplicate)', async () => {
    const created = await assign({ role: 'COORDINATOR', panchayatId: panchayatId2 });
    expect(created.id).toBeTruthy();
  });

  it('rejects a duplicate REPRESENTATIVE on the same ward', async () => {
    await assign({ role: 'REPRESENTATIVE', wardId });
    await expect(assign({ role: 'REPRESENTATIVE', wardId })).rejects.toThrow();
  });

  it('rejects a duplicate CITIZEN (both scope columns NULL)', async () => {
    await assign({ role: 'CITIZEN' });
    await expect(assign({ role: 'CITIZEN' })).rejects.toThrow();
  });
});

describe('RoleAssignment role<->scope coherence (CHECK constraint)', () => {
  it('rejects ADMIN carrying a panchayat scope', async () => {
    await expect(assign({ role: 'ADMIN', panchayatId })).rejects.toThrow();
  });

  it('rejects COORDINATOR without a panchayat scope', async () => {
    await expect(assign({ role: 'COORDINATOR' })).rejects.toThrow();
  });

  it('rejects COORDINATOR carrying BOTH a panchayat and a ward', async () => {
    await expect(assign({ role: 'COORDINATOR', panchayatId, wardId })).rejects.toThrow();
  });

  it('rejects REPRESENTATIVE without a ward scope', async () => {
    await expect(assign({ role: 'REPRESENTATIVE' })).rejects.toThrow();
  });

  it('rejects REPRESENTATIVE carrying a panchayat scope too', async () => {
    await expect(assign({ role: 'REPRESENTATIVE', panchayatId, wardId })).rejects.toThrow();
  });
});
