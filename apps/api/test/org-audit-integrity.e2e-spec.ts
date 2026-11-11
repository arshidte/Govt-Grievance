import type { AuditService } from '../src/audit/audit.service';
import { AuditService as RealAuditService } from '../src/audit/audit.service';
import { OtpService } from '../src/auth/otp.service';
import { PanchayatsService } from '../src/org/panchayats.service';
import { StaffOnboardingService } from '../src/org/staff-onboarding.service';
import { WardsService } from '../src/org/wards.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MockSmsProvider } from '../src/sms/mock-sms.provider';
import '../src/config/env';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { purgeAuditLogs } from './helpers/append-only';

/**
 * M4D — transactional audit coverage for the remaining org/staff mutations
 * (e2e, real Postgres). Mirrors the M4C `audit-integrity.e2e-spec.ts` harness:
 * the services are constructed DIRECTLY (no HTTP/OTP logins → no auth-throttle
 * contention), each one twice — once with the real `AuditService` and once
 * with a mock whose `recordTx` always throws — so we can prove, for every
 * converted category (panchayat CRUD/status, ward CRUD/status, onboarding
 * initiate/verify/cancel):
 *
 *   - a successful mutation writes EXACTLY ONE corresponding audit row;
 *   - an audit-write failure ROLLS BACK the business mutation (nothing
 *     persists — proving the insert + audit share one transaction);
 *   - soft-deactivation / pending-onboarding semantics are unchanged;
 *   - an idempotent re-verify does NOT double-record.
 */
describe('Org/staff audit integrity (M4D, e2e)', () => {
  const prisma = new PrismaService();
  const audit = new RealAuditService(prisma);
  const sms = new MockSmsProvider();
  const otp = new OtpService(prisma, sms);

  const panchayats = new PanchayatsService(prisma, audit);
  const wards = new WardsService(prisma, audit);
  const onboarding = new StaffOnboardingService(prisma, otp, audit);

  // A mock audit whose transactional write ALWAYS throws (for rollback tests).
  const throwingAudit = {
    record: vi.fn(),
    recordTx: vi.fn(async () => {
      throw new Error('audit boom');
    }),
  } as unknown as AuditService;
  const panchayatsBroken = new PanchayatsService(prisma, throwingAudit);
  const wardsBroken = new WardsService(prisma, throwingAudit);
  const onboardingBroken = new StaffOnboardingService(prisma, otp, throwingAudit);

  const runId = `m4d-${Date.now()}`;
  let adminId: string;
  const panchayatIds: string[] = [];
  const wardIds: string[] = [];
  const onboardingPhones: string[] = [];
  const actorIds: string[] = []; // every actorUserId we audit under (for cleanup)

  let phoneCounter = 0;
  const freshPhone = () => `+919${`${Date.now()}${(phoneCounter += 1)}`.slice(-9).padStart(9, '0')}`;

  beforeAll(async () => {
    const adminUser = await prisma.user.create({ data: { phone: freshPhone() } });
    adminId = adminUser.id;
    actorIds.push(adminId);
  });

  afterAll(async () => {
    // Users created by onboarding verify (by phone) + their assignments.
    const onboardedUsers = await prisma.user.findMany({ where: { phone: { in: onboardingPhones } } });
    const allActorIds = [...new Set([...actorIds, ...onboardedUsers.map((u) => u.id)])];

    await purgeAuditLogs(prisma, { actorUserId: { in: allActorIds } });
    await prisma.staffOnboarding.deleteMany({ where: { phone: { in: onboardingPhones } } });
    await prisma.otpChallenge.deleteMany({ where: { phone: { in: onboardingPhones } } });
    await prisma.roleAssignment.deleteMany({ where: { userId: { in: allActorIds } } });
    await prisma.ward.deleteMany({ where: { id: { in: wardIds } } });
    await prisma.panchayat.deleteMany({ where: { id: { in: panchayatIds } } });
    await prisma.user.deleteMany({ where: { id: { in: allActorIds } } });
    await prisma.$disconnect();
  });

  // ---- Panchayat --------------------------------------------------------

  it('panchayat.create writes exactly one audit row, atomic with the insert', async () => {
    const code = `${runId}-pc1`;
    const created = await panchayats.create(adminId, { code, name: 'Alpha', nameMl: 'ml' });
    panchayatIds.push(created.id);

    const rows = await prisma.auditLog.findMany({ where: { entityId: created.id, action: 'panchayat.created' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(adminId);
    expect((rows[0]!.metadata as Record<string, unknown>).code).toBe(code);
  });

  it('rolls the panchayat insert back when the audit write fails', async () => {
    const code = `${runId}-pc-rollback`;
    await expect(panchayatsBroken.create(adminId, { code, name: 'Ghost', nameMl: 'ml' })).rejects.toThrow();
    // No panchayat persisted, and NO audit row — both halves rolled back.
    expect(await prisma.panchayat.findUnique({ where: { code } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'panchayat.created', metadata: { path: ['code'], equals: code } } })).toBe(0);
  });

  it('panchayat.update writes exactly one audit row', async () => {
    const created = await panchayats.create(adminId, { code: `${runId}-pc2`, name: 'Beta', nameMl: 'ml' });
    panchayatIds.push(created.id);
    await panchayats.update(adminId, created.id, { name: 'Beta Renamed', nameMl: 'ml2' });

    expect(await prisma.auditLog.count({ where: { entityId: created.id, action: 'panchayat.updated' } })).toBe(1);
    expect((await prisma.panchayat.findUnique({ where: { id: created.id } }))!.name).toBe('Beta Renamed');
  });

  it('panchayat.deactivate soft-flips status AND audits atomically; rollback preserves status', async () => {
    const created = await panchayats.create(adminId, { code: `${runId}-pc3`, name: 'Gamma', nameMl: 'ml' });
    panchayatIds.push(created.id);

    // Audit failure during the status flip rolls the flip back (stays active).
    await expect(panchayatsBroken.deactivate(adminId, created.id)).rejects.toThrow();
    expect((await prisma.panchayat.findUnique({ where: { id: created.id } }))!.status).toBe('active');
    expect(await prisma.auditLog.count({ where: { entityId: created.id, action: 'panchayat.deactivated' } })).toBe(0);

    // Now the real path: soft status flip (NOT a hard delete) + one audit row.
    await panchayats.deactivate(adminId, created.id);
    const row = await prisma.panchayat.findUnique({ where: { id: created.id } });
    expect(row).not.toBeNull(); // soft — the row still exists
    expect(row!.status).toBe('inactive');
    expect(await prisma.auditLog.count({ where: { entityId: created.id, action: 'panchayat.deactivated' } })).toBe(1);
  });

  // ---- Ward -------------------------------------------------------------

  it('ward.create writes exactly one audit row; audit failure rolls the ward back', async () => {
    const parent = await panchayats.create(adminId, { code: `${runId}-wpar`, name: 'WardParent', nameMl: 'ml' });
    panchayatIds.push(parent.id);

    const ward = await wards.create(adminId, parent.id, { number: 1, name: 'W1', nameMl: 'ml' });
    wardIds.push(ward.id);
    expect(await prisma.auditLog.count({ where: { entityId: ward.id, action: 'ward.created' } })).toBe(1);

    // Rollback: a second ward whose audit throws must not persist.
    await expect(wardsBroken.create(adminId, parent.id, { number: 2, name: 'W2', nameMl: 'ml' })).rejects.toThrow();
    expect(await prisma.ward.findFirst({ where: { panchayatId: parent.id, number: 2 } })).toBeNull();
  });

  it('ward.deactivate soft-flips status + audits (row preserved)', async () => {
    const parent = await panchayats.create(adminId, { code: `${runId}-wpar2`, name: 'WardParent2', nameMl: 'ml' });
    panchayatIds.push(parent.id);
    const ward = await wards.create(adminId, parent.id, { number: 1, name: 'W1', nameMl: 'ml' });
    wardIds.push(ward.id);

    await wards.deactivate(adminId, ward.id);
    const row = await prisma.ward.findUnique({ where: { id: ward.id } });
    expect(row).not.toBeNull();
    expect(row!.status).toBe('inactive');
    expect(await prisma.auditLog.count({ where: { entityId: ward.id, action: 'ward.deactivated' } })).toBe(1);
  });

  // ---- Staff onboarding -------------------------------------------------

  it('onboarding.initiate writes one audit row; audit failure rolls the onboarding back (no OTP burned)', async () => {
    const parent = await panchayats.create(adminId, { code: `${runId}-onb`, name: 'OnbPanchayat', nameMl: 'ml' });
    panchayatIds.push(parent.id);
    const ward = await wards.create(adminId, parent.id, { number: 1, name: 'W1', nameMl: 'ml' });
    wardIds.push(ward.id);

    // Rollback first: a throwing audit aborts BEFORE the OTP send (which is
    // outside the tx), so no onboarding row and no OTP challenge persist.
    const rollbackPhone = freshPhone();
    onboardingPhones.push(rollbackPhone);
    await expect(
      onboardingBroken.initiate(adminId, { phone: rollbackPhone, role: 'REPRESENTATIVE', wardIds: [ward.id] }),
    ).rejects.toThrow();
    expect(await prisma.staffOnboarding.findFirst({ where: { phone: rollbackPhone } })).toBeNull();
    expect(await prisma.otpChallenge.count({ where: { phone: rollbackPhone } })).toBe(0);

    // Success path: pending onboarding + exactly one initiated audit + OTP sent.
    const phone = freshPhone();
    onboardingPhones.push(phone);
    const dto = await onboarding.initiate(adminId, { phone, role: 'REPRESENTATIVE', wardIds: [ward.id] });
    expect(dto.status).toBe('pending');
    expect(await prisma.auditLog.count({ where: { entityId: dto.id, action: 'staff.onboarding_initiated' } })).toBe(1);
    expect(await prisma.otpChallenge.count({ where: { phone } })).toBeGreaterThan(0);
  });

  it('onboarding.verify records verified + assigned audits inside the grant tx, and is idempotent on replay', async () => {
    const parent = await panchayats.create(adminId, { code: `${runId}-onv`, name: 'VerifyPanchayat', nameMl: 'ml' });
    panchayatIds.push(parent.id);
    const ward = await wards.create(adminId, parent.id, { number: 1, name: 'W1', nameMl: 'ml' });
    wardIds.push(ward.id);

    const phone = freshPhone();
    onboardingPhones.push(phone);
    const dto = await onboarding.initiate(adminId, { phone, role: 'REPRESENTATIVE', wardIds: [ward.id] });
    const code = sms.lastCodeFor(phone)!;
    expect(code).toBeDefined();

    const verified = await onboarding.verify(adminId, dto.id, code);
    expect(verified.status).toBe('verified');

    // Business effects: user upserted, exactly one active assignment.
    const user = await prisma.user.findUnique({ where: { phone }, include: { roleAssignments: true } });
    expect(user).not.toBeNull();
    const active = user!.roleAssignments.filter((r) => r.revokedAt === null);
    expect(active).toHaveLength(1);
    expect(active[0]!.wardId).toBe(ward.id);

    // Audits written through the SAME tx: one verified + one representative.assigned.
    expect(await prisma.auditLog.count({ where: { entityId: dto.id, action: 'staff.onboarding_verified' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: active[0]!.id, action: 'representative.assigned' } })).toBe(1);

    // Idempotent replay: already-verified returns early → no second audit, no dup assignment.
    const replay = await onboarding.verify(adminId, dto.id, code);
    expect(replay.status).toBe('verified');
    expect(await prisma.auditLog.count({ where: { entityId: dto.id, action: 'staff.onboarding_verified' } })).toBe(1);
    expect(await prisma.roleAssignment.count({ where: { userId: user!.id, revokedAt: null } })).toBe(1);
  });

  it('onboarding.cancel soft-cancels + audits atomically', async () => {
    const parent = await panchayats.create(adminId, { code: `${runId}-onc`, name: 'CancelPanchayat', nameMl: 'ml' });
    panchayatIds.push(parent.id);
    const ward = await wards.create(adminId, parent.id, { number: 1, name: 'W1', nameMl: 'ml' });
    wardIds.push(ward.id);

    const phone = freshPhone();
    onboardingPhones.push(phone);
    const dto = await onboarding.initiate(adminId, { phone, role: 'REPRESENTATIVE', wardIds: [ward.id] });

    const cancelled = await onboarding.cancel(adminId, dto.id);
    expect(cancelled.status).toBe('cancelled');
    const row = await prisma.staffOnboarding.findUnique({ where: { id: dto.id } });
    expect(row!.status).toBe('cancelled'); // soft — row preserved
    expect(await prisma.auditLog.count({ where: { entityId: dto.id, action: 'staff.onboarding_cancelled' } })).toBe(1);
  });
});
