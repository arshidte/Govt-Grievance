import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import type { SessionUser } from '../src/auth/session.service';
import { ApiError } from '../src/common/api-error';
import { IssueTransitionService } from '../src/issues/issue-transition.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Task 10 (M2 spec §5.1–5.3, Review Focus #5): the transition service must be
 * correct under a genuine DB-level race. Two requests firing the SAME valid
 * transition concurrently must resolve to exactly ONE winner (200-equivalent)
 * and ONE 409 `stale_status`, with exactly ONE history row and ONE status-
 * change notification for the issue.
 *
 * NO HTTP: there is no `PATCH /issues/:id/status` route yet — that endpoint is
 * Task 11. So this spec drives `IssueTransitionService.transition(...)`
 * DIRECTLY, twice via `Promise.all`, against the REAL (bootstrapped-app)
 * Prisma. That still exercises the authoritative path end-to-end: the real
 * `$transaction` + conditional `updateMany` gate + atomic history/notification
 * writes. The race is in the database, not mocked.
 *
 * Staff authorization is NOT this service's concern (Task 11 owns it), and the
 * direct-call path does not pass through `AuthGuard` anyway. We still seed an
 * in-scope staff `RoleAssignment` (per the T8 carry-in note) so the fixture is
 * a faithful stand-in for the eventual authenticated staff actor, and we use a
 * real `SessionUser` object (with `roleAssignments` loaded) as the `actor`.
 */
describe('Transition concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: IssueTransitionService;

  const runId = `t10-${Date.now()}`;

  let actor: SessionUser;
  let issueId: string;

  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleAssignmentIds: string[] = [];
  let categoryId: string;
  let panchayatId: string;
  let wardId: string;

  function freshPhone(tag: string): string {
    const tail = `${Date.now()}${tag}`.replace(/\D/g, '').slice(-9).padStart(9, '0');
    return `+919${tail}`;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    service = moduleFixture.get(IssueTransitionService);

    const category = await prisma.category.create({
      data: { slug: `${runId}-cat`, name: 'Roads', nameMl: 'റോഡുകൾ' },
    });
    categoryId = category.id;

    const panchayat = await prisma.panchayat.create({
      data: { code: `${runId}-pan`, name: 'Test Panchayat', nameMl: 'Test Panchayat ml' },
    });
    panchayatId = panchayat.id;

    const ward = await prisma.ward.create({
      data: { panchayatId: panchayat.id, number: 1, name: 'Ward 1', nameMl: 'Ward 1 ml' },
    });
    wardId = ward.id;

    const citizen = await prisma.user.create({
      data: { phone: freshPhone('c'), fullName: 'Citizen' },
    });
    createdUserIds.push(citizen.id);

    // In-scope staff actor, granted its role DIRECTLY via Prisma (not a real
    // OTP login) per the T8 auth-throttle carry-in. The role is loaded onto the
    // SessionUser we hand to the service as `actor`.
    const staff = await prisma.user.create({
      data: { phone: freshPhone('s'), fullName: 'Coordinator' },
    });
    createdUserIds.push(staff.id);
    const ra = await prisma.roleAssignment.create({
      data: { userId: staff.id, role: 'COORDINATOR', panchayatId },
    });
    createdRoleAssignmentIds.push(ra.id);
    actor = { ...staff, roleAssignments: [ra] };

    const issue = await prisma.issue.create({
      data: {
        title: 'Pothole on main road',
        description: 'A large pothole causing traffic issues.',
        categoryId,
        panchayatId,
        wardId,
        referenceNo: `${runId}-ref`,
        status: 'SUBMITTED',
        priority: 'MEDIUM',
        onBehalfOf: false,
        citizenId: citizen.id,
        createdById: citizen.id,
      },
    });
    issueId = issue.id;
    createdIssueIds.push(issue.id);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.issueStatusHistory.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } });
    await prisma.roleAssignment.deleteMany({ where: { id: { in: createdRoleAssignmentIds } } });
    await prisma.ward.deleteMany({ where: { id: wardId } });
    await prisma.panchayat.deleteMany({ where: { id: panchayatId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  it('two racing valid transitions yield one winner and one 409; one history, one notification', async () => {
    // Genuine race: both fire the same SUBMITTED -> ACKNOWLEDGED transition.
    const settle = async (): Promise<number> => {
      try {
        await service.transition(actor, issueId, { toStatus: 'ACKNOWLEDGED', note: 'n' });
        return 200;
      } catch (err) {
        // The loser must be an ApiError with HTTP status 409 (stale_status).
        if (err instanceof ApiError) {
          return err.status;
        }
        throw err;
      }
    };

    const [a, b] = await Promise.all([settle(), settle()]);

    // Exactly one winner (200) and one loser (409) — never 200/200 or 409/409.
    expect([a, b].sort((x, y) => x - y)).toEqual([200, 409]);

    const historyCount = await prisma.issueStatusHistory.count({ where: { issueId } });
    expect(historyCount).toBe(1);

    const notificationCount = await prisma.notification.count({
      where: { issueId, type: 'issue.status_changed' },
    });
    expect(notificationCount).toBe(1);

    const finalIssue = await prisma.issue.findUnique({ where: { id: issueId } });
    expect(finalIssue?.status).toBe('ACKNOWLEDGED');
  });
});
