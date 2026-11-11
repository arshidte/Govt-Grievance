import type { IssueStatus } from '@pg/types';
import { describe, expect, it, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/session.service';
import { ApiError } from '../common/api-error';
import { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';

import { IssueTransitionService } from './issue-transition.service';

/**
 * No-op audit stub (M4C): the service now records a transactional audit via
 * `audit.recordTx(tx, …)`; this stub keeps these pure-logic unit tests focused
 * on transition behavior (the real transactional coupling + audit content are
 * covered by the M4C e2e specs against a real DB).
 */
const auditStub = { record: vi.fn(), recordTx: vi.fn(async () => undefined) } as unknown as AuditService;

/**
 * Task 10 unit coverage. Prisma is a hand-built stub (not a real DB): each
 * test drives the transition-validation + conditional-update branches in
 * isolation, asserting (a) the conditional `updateMany` is called with the
 * correct `expectedFrom`/`toStatus`, and (b) history + notification are
 * created exactly once on the happy path and never on a rejected/stale path.
 * The genuine DB-level race is covered separately in the e2e spec.
 */

/** The issue-row fields the service reads (for `fromStatus`/`citizenId`) and maps into the returned DTO. */
interface StubIssueRow {
  id: string;
  status: IssueStatus;
  citizenId: string;
  referenceNo: string;
  title: string;
  priority: string;
  categoryId: string;
  createdAt: Date;
  description: string;
  panchayatId: string;
  wardId: string;
  subcategoryId: string | null;
  onBehalfOf: boolean;
}

/**
 * Builds a Prisma stub whose `$transaction` immediately invokes the callback
 * with a transaction client whose `issue.updateMany`, `issueStatusHistory`
 * and `notification` methods are spies. `updateManyCount` controls whether the
 * conditional update "wins" (1) or loses the race (0).
 */
function makeStub(options: {
  issueRow: StubIssueRow | null;
  updateManyCount: number;
}) {
  const historyRow = { id: 'hist-1' };

  const updateMany = vi.fn(async () => ({ count: options.updateManyCount }));
  const historyCreate = vi.fn(async () => historyRow);
  const notificationCreate = vi.fn(async () => ({ id: 'notif-1' }));

  const tx = {
    issue: { updateMany },
    issueStatusHistory: { create: historyCreate },
    notification: { create: notificationCreate },
  };

  const findUnique = vi.fn(async () => options.issueRow);

  const prisma = {
    issue: { findUnique },
    // The stub's `$transaction` only needs to forward a tx-shaped object to the
    // callback; typing `cb`'s param as the full Prisma.TransactionClient adds no
    // safety here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn(async (cb: (c: any) => Promise<unknown>) => cb(tx)),
  };

  return {
    // The service only touches the methods stubbed above; a cast keeps the
    // stub readable without re-declaring the whole PrismaService surface.
    prisma: prisma as unknown as PrismaService,
    findUnique,
    updateMany,
    historyCreate,
    notificationCreate,
  };
}

const actor: SessionUser = {
  id: 'actor-1',
  // Remaining SessionUser fields are irrelevant to the service (it reads only
  // `actor.id`); a cast avoids fabricating a full User row.
} as unknown as SessionUser;

function issueRow(status: IssueStatus): StubIssueRow {
  return {
    id: 'issue-1',
    status,
    citizenId: 'citizen-1',
    // The service maps the fetched row into an IssueDetailDTO; supply the
    // columns that mapping touches so DTO construction does not NPE.
    referenceNo: 'GRV-2026-000001',
    title: 'Pothole',
    priority: 'MEDIUM',
    categoryId: 'cat-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    description: 'desc',
    panchayatId: 'pan-1',
    wardId: 'ward-1',
    subcategoryId: null,
    onBehalfOf: false,
  };
}

describe('IssueTransitionService', () => {
  const notifications = new NotificationsService();

  it('accepts SUBMITTED -> ACKNOWLEDGED (conditional update + one history + one notification)', async () => {
    const stub = makeStub({ issueRow: issueRow('SUBMITTED'), updateManyCount: 1 });
    const service = new IssueTransitionService(stub.prisma, notifications, auditStub);

    const dto = await service.transition(actor, 'issue-1', { toStatus: 'ACKNOWLEDGED', note: 'n' });

    expect(dto.status).toBe('ACKNOWLEDGED');
    expect(stub.updateMany).toHaveBeenCalledWith({
      where: { id: 'issue-1', status: 'SUBMITTED' },
      data: { status: 'ACKNOWLEDGED' },
    });
    expect(stub.historyCreate).toHaveBeenCalledTimes(1);
    expect(stub.historyCreate).toHaveBeenCalledWith({
      data: {
        issueId: 'issue-1',
        changedById: 'actor-1',
        fromStatus: 'SUBMITTED',
        toStatus: 'ACKNOWLEDGED',
        note: 'n',
      },
    });
    expect(stub.notificationCreate).toHaveBeenCalledTimes(1);
    expect(stub.notificationCreate).toHaveBeenCalledWith({
      data: {
        type: 'issue.status_changed',
        recipientId: 'citizen-1',
        issueId: 'issue-1',
        statusHistoryId: 'hist-1',
      },
    });
  });

  it('accepts ACKNOWLEDGED -> IN_PROGRESS', async () => {
    const stub = makeStub({ issueRow: issueRow('ACKNOWLEDGED'), updateManyCount: 1 });
    const service = new IssueTransitionService(stub.prisma, notifications, auditStub);

    const dto = await service.transition(actor, 'issue-1', { toStatus: 'IN_PROGRESS' });

    expect(dto.status).toBe('IN_PROGRESS');
    expect(stub.updateMany).toHaveBeenCalledWith({
      where: { id: 'issue-1', status: 'ACKNOWLEDGED' },
      data: { status: 'IN_PROGRESS' },
    });
    expect(stub.historyCreate).toHaveBeenCalledTimes(1);
    expect(stub.notificationCreate).toHaveBeenCalledTimes(1);
  });

  it('accepts IN_PROGRESS -> RESOLVED', async () => {
    const stub = makeStub({ issueRow: issueRow('IN_PROGRESS'), updateManyCount: 1 });
    const service = new IssueTransitionService(stub.prisma, notifications, auditStub);

    const dto = await service.transition(actor, 'issue-1', { toStatus: 'RESOLVED' });

    expect(dto.status).toBe('RESOLVED');
    expect(stub.updateMany).toHaveBeenCalledWith({
      where: { id: 'issue-1', status: 'IN_PROGRESS' },
      data: { status: 'RESOLVED' },
    });
    expect(stub.historyCreate).toHaveBeenCalledTimes(1);
    expect(stub.notificationCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects a skip (SUBMITTED -> IN_PROGRESS) with 422 invalid_transition and never attempts an update', async () => {
    const stub = makeStub({ issueRow: issueRow('SUBMITTED'), updateManyCount: 1 });
    const service = new IssueTransitionService(stub.prisma, notifications, auditStub);

    const attempt = service.transition(actor, 'issue-1', { toStatus: 'IN_PROGRESS' });

    await expect(attempt).rejects.toMatchObject({
      code: 'invalid_transition',
      status: 422,
      messageKey: 'errors.invalidTransition',
    });
    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    expect(stub.updateMany).not.toHaveBeenCalled();
    expect(stub.historyCreate).not.toHaveBeenCalled();
    expect(stub.notificationCreate).not.toHaveBeenCalled();
  });

  it('rejects SUBMITTED -> CLOSED with 422 invalid_transition', async () => {
    const stub = makeStub({ issueRow: issueRow('SUBMITTED'), updateManyCount: 1 });
    const service = new IssueTransitionService(stub.prisma, notifications, auditStub);

    await expect(
      service.transition(actor, 'issue-1', { toStatus: 'CLOSED' }),
    ).rejects.toMatchObject({ code: 'invalid_transition', status: 422 });
    expect(stub.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a backward move (ACKNOWLEDGED -> SUBMITTED) with 422 invalid_transition', async () => {
    const stub = makeStub({ issueRow: issueRow('ACKNOWLEDGED'), updateManyCount: 1 });
    const service = new IssueTransitionService(stub.prisma, notifications, auditStub);

    await expect(
      service.transition(actor, 'issue-1', { toStatus: 'SUBMITTED' }),
    ).rejects.toMatchObject({ code: 'invalid_transition', status: 422 });
    expect(stub.updateMany).not.toHaveBeenCalled();
  });

  it('throws 404 issue_not_found when the issue id does not exist', async () => {
    const stub = makeStub({ issueRow: null, updateManyCount: 1 });
    const service = new IssueTransitionService(stub.prisma, notifications, auditStub);

    await expect(
      service.transition(actor, 'missing', { toStatus: 'ACKNOWLEDGED' }),
    ).rejects.toMatchObject({ code: 'issue_not_found', status: 404 });
    expect(stub.updateMany).not.toHaveBeenCalled();
  });

  it('throws 409 stale_status when the conditional update matches no row (count 0) and writes no history/notification', async () => {
    const stub = makeStub({ issueRow: issueRow('SUBMITTED'), updateManyCount: 0 });
    const service = new IssueTransitionService(stub.prisma, notifications, auditStub);

    const attempt = service.transition(actor, 'issue-1', { toStatus: 'ACKNOWLEDGED' });

    await expect(attempt).rejects.toMatchObject({
      code: 'stale_status',
      status: 409,
      messageKey: 'errors.staleStatus',
    });
    expect(stub.updateMany).toHaveBeenCalledTimes(1);
    expect(stub.historyCreate).not.toHaveBeenCalled();
    expect(stub.notificationCreate).not.toHaveBeenCalled();
  });
});
