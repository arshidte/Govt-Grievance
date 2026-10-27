import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { CreateOnBehalfInput } from '@pg/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AccessControlService } from '../src/access/access-control.service';
import { AppModule } from '../src/app.module';
import { AuditService } from '../src/audit/audit.service';
import type { SessionUser } from '../src/auth/session.service';
import { IdempotencyService } from '../src/common/idempotency/idempotency.service';
import { env } from '../src/config/env';
import { IssueReferenceService } from '../src/issues/issue-reference.service';
import { IssuesService } from '../src/issues/issues.service';
import { OnBehalfRateLimit } from '../src/issues/on-behalf-rate-limit';
import { OnBehalfService } from '../src/issues/on-behalf.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Task 12 (M2 spec §9, Review Focus #2): on-behalf submission service.
 *
 * Driven by calling `OnBehalfService.create(...)` DIRECTLY — the
 * `POST /issues/on-behalf` HTTP route is Task 13 and does not exist yet
 * (same direct-service pattern as the T10/T11 e2e specs).
 *
 * CARRY-IN (T8/T11): `AuthController` throttles its whole surface to 5
 * calls/IP/60s and each real OTP login costs 2 — so this file does NO real
 * logins. All actors (the representative + any "pre-existing" citizens) are
 * created via DIRECT Prisma `User`/`RoleAssignment` writes, which is a
 * faithful exercise of the service's real `AccessControlService` /
 * `PrismaService` paths (the service reads `roleAssignments` off the passed
 * `SessionUser` and resolves everything else from the DB).
 *
 * FAST CAP TEST: the hourly cap is read from `env.ON_BEHALF_RATE_LIMIT_PER_HOUR`
 * on every `check()`. We overwrite it with a small `CAP` for the cap test
 * (and raise it for the others), restoring the original in `afterAll`, so the
 * "past the cap" test only creates a handful of issues, not 20+.
 *
 * RATE-LIMIT INSTANCE PER TEST: `breakBackend()` is a one-way, test-only seam
 * (by design it can't be un-tripped — see its `@internal` doc). So instead of
 * sharing the Nest singleton `OnBehalfRateLimit`, each test builds its own
 * `OnBehalfService` over a FRESH `OnBehalfRateLimit` (wired to the same real
 * singleton collaborators resolved once in `beforeAll`). This keeps the
 * fail-closed test fully isolated.
 */
describe('On-behalf service (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let issuesService: IssuesService;

  // Real singleton collaborators, resolved once; each test wires a fresh
  // OnBehalfService over a fresh OnBehalfRateLimit using these.
  let issueReference: IssueReferenceService;
  let idempotency: IdempotencyService;
  let notifications: NotificationsService;
  let accessControl: AccessControlService;
  let audit: AuditService;

  const runId = `t12-${Date.now()}`;

  const CAP = 3;
  let originalCap: number;

  let categoryId: string;
  let panchayatId: string;
  let wardAId: string;
  let otherPanchayatId: string;
  let wardBId: string;

  let repWardA: SessionUser;

  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleAssignmentIds: string[] = [];

  let phoneCounter = 0;
  function freshPhone(): string {
    phoneCounter += 1;
    const tail = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '0');
    return `+919${tail}`;
  }

  function validDto(overrides: Partial<CreateOnBehalfInput> = {}): CreateOnBehalfInput {
    return {
      title: 'Broken streetlight on Main Rd',
      description: 'The streetlight at the junction has been dark for over a week.',
      categoryId,
      wardId: wardAId,
      citizenPhone: freshPhone(),
      ...overrides,
    };
  }

  /** Builds an OnBehalfService over a FRESH rate limiter (+ the real singletons). */
  function buildService(rateLimit: OnBehalfRateLimit): OnBehalfService {
    return new OnBehalfService(
      prisma,
      issueReference,
      idempotency,
      notifications,
      accessControl,
      audit,
      rateLimit,
    );
  }

  async function loadSessionUser(userId: string): Promise<SessionUser> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roleAssignments: true },
    });
    return user as SessionUser;
  }

  async function lastAudit() {
    const row = await prisma.auditLog.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!row) throw new Error('expected an audit row');
    return row;
  }

  async function seedCitizen(data: { phone: string; fullName?: string; email?: string }): Promise<string> {
    const u = await prisma.user.create({ data });
    createdUserIds.push(u.id);
    return u.id;
  }

  async function seedIssue(args: { citizenId: string; wardId: string; panchayatId: string }): Promise<string> {
    const issue = await prisma.issue.create({
      data: {
        title: 'Unrelated prior issue',
        description: 'Something the citizen filed earlier, unrelated to ward A.',
        categoryId,
        wardId: args.wardId,
        panchayatId: args.panchayatId,
        referenceNo: `${runId}-seed-${createdIssueIds.length}`,
        status: 'SUBMITTED',
        priority: 'MEDIUM',
        onBehalfOf: false,
        citizenId: args.citizenId,
        createdById: args.citizenId,
      },
    });
    createdIssueIds.push(issue.id);
    return issue.id;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    issuesService = moduleFixture.get(IssuesService);
    issueReference = moduleFixture.get(IssueReferenceService);
    idempotency = moduleFixture.get(IdempotencyService);
    notifications = moduleFixture.get(NotificationsService);
    accessControl = moduleFixture.get(AccessControlService);
    audit = moduleFixture.get(AuditService);

    originalCap = env.ON_BEHALF_RATE_LIMIT_PER_HOUR;
    // Default high so only the dedicated cap test trips the limit.
    env.ON_BEHALF_RATE_LIMIT_PER_HOUR = 10_000;

    const category = await prisma.category.create({
      data: { slug: `${runId}-cat`, name: 'Roads', nameMl: 'റോഡുകൾ' },
    });
    categoryId = category.id;

    const panchayat = await prisma.panchayat.create({
      data: { code: `${runId}-pan`, name: 'Test Panchayat', nameMl: 'Test Panchayat ml' },
    });
    panchayatId = panchayat.id;
    const wardA = await prisma.ward.create({
      data: { panchayatId: panchayat.id, number: 1, name: 'Ward A', nameMl: 'Ward A ml' },
    });
    wardAId = wardA.id;

    const otherPanchayat = await prisma.panchayat.create({
      data: { code: `${runId}-pan-other`, name: 'Other Panchayat', nameMl: 'Other Panchayat ml' },
    });
    otherPanchayatId = otherPanchayat.id;
    const wardB = await prisma.ward.create({
      data: { panchayatId: otherPanchayat.id, number: 1, name: 'Ward B', nameMl: 'Ward B ml' },
    });
    wardBId = wardB.id;

    const repUser = await prisma.user.create({ data: { phone: freshPhone() } });
    createdUserIds.push(repUser.id);
    const ra = await prisma.roleAssignment.create({
      data: { userId: repUser.id, role: 'REPRESENTATIVE', wardId: wardAId },
    });
    createdRoleAssignmentIds.push(ra.id);
    repWardA = await loadSessionUser(repUser.id);
  });

  afterAll(async () => {
    env.ON_BEHALF_RATE_LIMIT_PER_HOUR = originalCap;

    // Sweep everything any tracked rep created via the service, plus seeds.
    await prisma.notification.deleteMany({ where: { issue: { createdById: { in: createdUserIds } } } });
    await prisma.notification.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.issueStatusHistory.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.issue.deleteMany({ where: { createdById: { in: createdUserIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } });
    await prisma.idempotencyKey.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.roleAssignment.deleteMany({ where: { id: { in: createdRoleAssignmentIds } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await prisma.ward.deleteMany({ where: { id: { in: [wardAId, wardBId] } } });
    await prisma.panchayat.deleteMany({ where: { id: { in: [panchayatId, otherPanchayatId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    // Delete tracked citizens AND any citizen upserted by the service (owners
    // of the rep's issues, which are now gone) — sweep childless users by the
    // phones we used is fragile, so rely on tracked ids; upserted citizens
    // with no remaining issues are harmless orphans in the test DB, but we
    // delete the ones we can address.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it('denies an out-of-scope ward before any citizen lookup, and audits the denial with a masked phone', async () => {
    const svc = buildService(new OnBehalfRateLimit(prisma));
    const phone = '+919000020001';

    await expect(
      svc.create(repWardA, validDto({ wardId: wardBId, citizenPhone: phone })),
    ).rejects.toMatchObject({ status: 403 });

    // No citizen row was created for that phone — the guard ran before lookup.
    expect(await prisma.user.findUnique({ where: { phone } })).toBeNull();

    const evt = await lastAudit();
    expect(evt.action).toBe('issue.on_behalf_denied');
    expect(JSON.stringify(evt.metadata)).not.toContain('919000020001'); // masked
    expect(JSON.stringify(evt.metadata)).toMatch(/\*{3,}0001/);
  });

  it('returns a neutral minimal response (4 keys, ISO createdAt) identical for new vs existing citizen', async () => {
    const svc = buildService(new OnBehalfRateLimit(prisma));

    const newPhone = freshPhone();
    const existingPhone = freshPhone();
    await seedCitizen({ phone: existingPhone, fullName: 'Already Here', email: 'eh@x.test' });

    const a = await svc.create(repWardA, validDto({ citizenPhone: newPhone }));
    const b = await svc.create(repWardA, validDto({ citizenPhone: existingPhone }));

    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(Object.keys(a).sort()).toEqual(['createdAt', 'id', 'referenceNo', 'status']);
    expect(a).not.toHaveProperty('fullName');
    expect(b).not.toHaveProperty('fullName');
    expect(a.createdAt).toBe(new Date(a.createdAt).toISOString()); // ISO, lossless
  });

  it('makes the citizen the owner + notification recipient; the rep is only the creator; onBehalfOf=true', async () => {
    const svc = buildService(new OnBehalfRateLimit(prisma));
    const phone = freshPhone();

    const res = await svc.create(repWardA, validDto({ citizenPhone: phone }));

    const citizen = await prisma.user.findUniqueOrThrow({ where: { phone } });
    const issue = await prisma.issue.findUniqueOrThrow({ where: { id: res.id } });
    expect(issue.citizenId).toBe(citizen.id);
    expect(issue.createdById).toBe(repWardA.id);
    expect(issue.onBehalfOf).toBe(true);

    const notes = await prisma.notification.findMany({
      where: { issueId: res.id, type: 'issue.submitted' },
    });
    expect(notes).toHaveLength(1);
    const note = notes[0];
    if (!note) throw new Error('expected a submission notification');
    expect(note.recipientId).toBe(citizen.id);
    expect(note.recipientId).not.toBe(repWardA.id);
  });

  it('does not give the rep access to the citizen profile or unrelated issues', async () => {
    const svc = buildService(new OnBehalfRateLimit(prisma));
    const phone = freshPhone();

    const citizenId = await seedCitizen({ phone, fullName: 'Private Name', email: 'p@x.test' });
    const unrelated = await seedIssue({ citizenId, wardId: wardBId, panchayatId: otherPanchayatId });

    const res = await svc.create(repWardA, validDto({ citizenPhone: phone }));

    expect(res).not.toHaveProperty('fullName');
    expect(res).not.toHaveProperty('email');
    expect(res).not.toHaveProperty('citizenId');
    expect(JSON.stringify(res)).not.toContain('Private Name');

    // The rep's scoped list (ward A) does NOT surface the ward-B unrelated issue.
    const repList = await issuesService.listFor(repWardA);
    expect(repList.map((i) => i.id)).not.toContain(unrelated);
  });

  it('rate-limits per representative (429 past the cap) and audits each limited attempt', async () => {
    // Use a DEDICATED rep so the hourly counter starts at 0 (the shared
    // `repWardA` already filed on-behalf issues in earlier tests, which the
    // DB-backed counter would count). Also drop the cap to `CAP` just for
    // this test so it only needs to create a handful of issues.
    const capRepUser = await prisma.user.create({ data: { phone: freshPhone() } });
    createdUserIds.push(capRepUser.id);
    const capRa = await prisma.roleAssignment.create({
      data: { userId: capRepUser.id, role: 'REPRESENTATIVE', wardId: wardAId },
    });
    createdRoleAssignmentIds.push(capRa.id);
    const capRep = await loadSessionUser(capRepUser.id);

    env.ON_BEHALF_RATE_LIMIT_PER_HOUR = CAP;
    const svc = buildService(new OnBehalfRateLimit(prisma));
    try {
      for (let i = 0; i < CAP; i++) {
        await svc.create(capRep, validDto({ citizenPhone: freshPhone() }));
      }
      await expect(
        svc.create(capRep, validDto({ citizenPhone: freshPhone() })),
      ).rejects.toMatchObject({ status: 429 });

      const evt = await lastAudit();
      expect(evt.action).toBe('issue.on_behalf_denied');
      expect(JSON.stringify(evt.metadata)).toContain('rate_limited');
    } finally {
      env.ON_BEHALF_RATE_LIMIT_PER_HOUR = 10_000;
    }
  });

  it('fails closed when the rate-limit backend is unavailable (503) and audits the denial', async () => {
    const limiter = new OnBehalfRateLimit(prisma);
    limiter.breakBackend(); // one-way test seam: next check() reports unavailable
    const svc = buildService(limiter);
    const phone = freshPhone();

    await expect(svc.create(repWardA, validDto({ citizenPhone: phone }))).rejects.toMatchObject({ status: 503 });

    expect((await lastAudit()).action).toBe('issue.on_behalf_denied');
    // Fail CLOSED: no citizen row was created.
    expect(await prisma.user.findUnique({ where: { phone } })).toBeNull();
  });
});
