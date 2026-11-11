import type { AuditService } from '../src/audit/audit.service';
import { AuditService as RealAuditService } from '../src/audit/audit.service';
import { AccessControlService } from '../src/access/access-control.service';
import type { SessionUser } from '../src/auth/session.service';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { IssueReferenceService } from '../src/issues/issue-reference.service';
import { IssueTransitionService } from '../src/issues/issue-transition.service';
import { IssuesService } from '../src/issues/issues.service';
import { OnBehalfRateLimit } from '../src/issues/on-behalf-rate-limit';
import { OnBehalfService } from '../src/issues/on-behalf.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';
import '../src/config/env';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { purgeAuditLogs } from './helpers/append-only';

/**
 * M4C — grievance audit coverage + transaction integrity + append-only (e2e,
 * real Postgres). Constructs the services directly (no HTTP/OTP logins, so no
 * auth-throttle contention). Verifies: the new `issue.submitted` /
 * `issue.status_changed` / `issue.on_behalf_created` events; that a failed
 * audit write rolls the business mutation back; idempotent replay doesn't
 * double-record; IssueStatusHistory stays authoritative; and the append-only
 * triggers reject UPDATE/DELETE.
 */
describe('Audit integrity (e2e)', () => {
  const prisma = new PrismaService();
  const idempotency = new IdempotencyService(prisma);
  const notifications = new NotificationsService();
  const issueReference = new IssueReferenceService(prisma);
  const accessControl = new AccessControlService();
  const audit = new RealAuditService(prisma);
  const transitions = new IssueTransitionService(prisma, notifications, audit);
  const issues = new IssuesService(prisma, issueReference, idempotency, notifications, accessControl, transitions, audit);
  const onBehalf = new OnBehalfService(prisma, issueReference, idempotency, notifications, accessControl, audit, new OnBehalfRateLimit(prisma));

  // An IssuesService whose audit write ALWAYS throws (for the rollback test).
  const throwingAudit = {
    record: vi.fn(),
    recordTx: vi.fn(async () => {
      throw new Error('audit boom');
    }),
  } as unknown as AuditService;
  const issuesWithBrokenAudit = new IssuesService(
    prisma, issueReference, idempotency, notifications, accessControl, transitions, throwingAudit,
  );

  const runId = `auditint-${Date.now()}`;
  let panchayatId: string;
  let wardId: string;
  let categoryId: string;
  let citizen: SessionUser;
  let staff: SessionUser;
  let rep: SessionUser;
  const userIds: string[] = [];
  const issueIds: string[] = [];
  let appendOnlyRowId: string | undefined;

  let phoneCounter = 0;
  const freshPhone = () => `+919${`${Date.now()}${(phoneCounter += 1)}`.slice(-9).padStart(9, '0')}`;

  async function mkUser(): Promise<SessionUser> {
    const u = await prisma.user.create({ data: { phone: freshPhone() }, include: { roleAssignments: true } });
    userIds.push(u.id);
    return u;
  }

  beforeAll(async () => {
    const p = await prisma.panchayat.create({ data: { code: `${runId}-p`, name: 'P', nameMl: 'ml' } });
    panchayatId = p.id;
    wardId = (await prisma.ward.create({ data: { panchayatId, number: 1, name: 'W1', nameMl: 'ml' } })).id;
    categoryId = (await prisma.category.create({ data: { slug: `${runId}-c`, name: 'Roads', nameMl: 'ml' } })).id;

    citizen = await mkUser();
    staff = await mkUser();
    const repUser = await mkUser();
    const ra = await prisma.roleAssignment.create({
      data: { userId: repUser.id, role: 'REPRESENTATIVE', wardId },
    });
    // Attach the active assignment so AccessControlService.hasRole passes.
    rep = { ...repUser, roleAssignments: [ra] } as unknown as SessionUser;
  });

  afterAll(async () => {
    await purgeAuditLogs(prisma, { actorUserId: { in: userIds } });
    if (appendOnlyRowId) await purgeAuditLogs(prisma, { id: appendOnlyRowId });
    await prisma.notification.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.issueStatusHistory.deleteMany({ where: { issueId: { in: issueIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: issueIds } } });
    await prisma.idempotencyKey.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.roleAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.ward.deleteMany({ where: { id: wardId } });
    await prisma.panchayat.deleteMany({ where: { id: panchayatId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  const dto = (over: Record<string, unknown> = {}) => ({
    title: 'Pothole',
    description: 'A large pothole on the main road.',
    categoryId,
    panchayatId,
    wardId,
    ...over,
  });

  // ---- Part A: coverage --------------------------------------------------

  it('records issue.submitted on citizen submission (actor = citizen, no PII)', async () => {
    const created = await issues.createForCitizen(citizen, dto());
    issueIds.push(created.id);

    const rows = await prisma.auditLog.findMany({ where: { entityId: created.id, action: 'issue.submitted' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(citizen.id);
    expect(rows[0]!.entityType).toBe('Issue');
    const meta = rows[0]!.metadata as Record<string, unknown>;
    expect(meta.referenceNo).toBe(created.referenceNo);
    expect(meta.onBehalfOf).toBe(false);
    expect(JSON.stringify(rows[0]!.metadata)).not.toMatch(/\+91\d{10}/); // no raw phone
  });

  it('records issue.status_changed on a transition (actor = staff) and keeps IssueStatusHistory authoritative', async () => {
    const created = await issues.createForCitizen(citizen, dto());
    issueIds.push(created.id);

    await transitions.transition(staff, created.id, { toStatus: 'ACKNOWLEDGED', note: 'ack by staff' });

    const audits = await prisma.auditLog.findMany({ where: { entityId: created.id, action: 'issue.status_changed' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorUserId).toBe(staff.id);
    const meta = audits[0]!.metadata as Record<string, unknown>;
    expect(meta.from).toBe('SUBMITTED');
    expect(meta.to).toBe('ACKNOWLEDGED');

    // IssueStatusHistory remains the authoritative proceedings record.
    const history = await prisma.issueStatusHistory.findMany({ where: { issueId: created.id } });
    expect(history).toHaveLength(1);
    expect(history[0]!.fromStatus).toBe('SUBMITTED');
    expect(history[0]!.toStatus).toBe('ACKNOWLEDGED');
    expect(history[0]!.changedById).toBe(staff.id);
  });

  it('records issue.on_behalf_created on a representative on-behalf submission (actor = rep, masked phone only)', async () => {
    const citizenPhone = freshPhone();
    const result = await onBehalf.create(rep, {
      title: 'Streetlight out',
      description: 'The streetlight has been out for a week.',
      categoryId,
      wardId,
      citizenPhone,
    });
    issueIds.push(result.id);
    // The upserted citizen is a new user — track for cleanup.
    const c = await prisma.user.findUnique({ where: { phone: citizenPhone } });
    if (c) userIds.push(c.id);

    const rows = await prisma.auditLog.findMany({ where: { entityId: result.id, action: 'issue.on_behalf_created' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(rep.id); // acting representative
    expect(JSON.stringify(rows[0]!.metadata)).not.toContain(citizenPhone); // raw phone never stored
  });

  // ---- Part B: transaction integrity -------------------------------------

  it('rolls the issue back when the audit write fails (atomicity)', async () => {
    const before = await prisma.issue.count({ where: { citizenId: citizen.id } });
    await expect(issuesWithBrokenAudit.createForCitizen(citizen, dto({ title: 'rollback-me' }))).rejects.toThrow();
    const after = await prisma.issue.count({ where: { citizenId: citizen.id } });
    expect(after).toBe(before); // no issue persisted
    // And no stray issue with that title / no orphaned notification.
    expect(await prisma.issue.findFirst({ where: { title: 'rollback-me' } })).toBeNull();
  });

  it('does not double-record on an idempotent replay (same key)', async () => {
    const key = `${runId}-idemp`;
    const a = await issues.createForCitizen(citizen, dto({ title: 'idem' }), key);
    const b = await issues.createForCitizen(citizen, dto({ title: 'idem' }), key);
    issueIds.push(a.id);
    expect(b.id).toBe(a.id); // replay returns the same issue
    const rows = await prisma.auditLog.findMany({ where: { entityId: a.id, action: 'issue.submitted' } });
    expect(rows).toHaveLength(1); // exactly one audit, not two
  });

  // ---- Part C: append-only -----------------------------------------------

  it('permits INSERT but rejects UPDATE and DELETE on AuditLog', async () => {
    const row = await prisma.auditLog.create({
      data: { action: `${runId}.probe`, entityType: 'Test', actorUserId: citizen.id },
    });
    appendOnlyRowId = row.id;

    await expect(
      prisma.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
    await expect(
      prisma.auditLog.deleteMany({ where: { id: row.id } }),
    ).rejects.toThrow();

    // The row is unchanged and still present (tamper attempts had no effect).
    const still = await prisma.auditLog.findUnique({ where: { id: row.id } });
    expect(still?.action).toBe(`${runId}.probe`);
  });
});
