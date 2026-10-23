import type { CreateOnBehalfInput } from '@pg/types';
import { describe, expect, it, vi } from 'vitest';

import { AccessControlService } from '../access/access-control.service';
import type { AuditService, RecordAuditEventInput } from '../audit/audit.service';
import type { SessionUser } from '../auth/session.service';
import { ApiError } from '../common/api-error';
import type { IdempotencyService } from '../common/idempotency/idempotency.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';

import type { IssueReferenceService } from './issue-reference.service';
import { OnBehalfRateLimit } from './on-behalf-rate-limit';
import { OnBehalfService } from './on-behalf.service';

/**
 * Unit coverage for the PURE-LOGIC guard paths of `OnBehalfService.create`
 * (M2 Task 12, Review Focus #2): the two cases that must reject BEFORE any
 * citizen lookup / write, so they need no real database —
 *
 *   1. Out-of-scope ward → 403, audited with a MASKED phone (plaintext
 *      absent), and crucially NO citizen lookup is attempted.
 *   3. Rate-limit backend down (`breakBackend()`) → FAILS CLOSED with 503,
 *      audited as a denial.
 *
 * The DB-touching behaviors (neutral/identical response, per-rep cap,
 * citizen-owner + notification recipient, non-disclosure of profile /
 * unrelated issues) live in `test/on-behalf.e2e-spec.ts` against real
 * Postgres.
 */
describe('OnBehalfService (unit)', () => {
  const dto: CreateOnBehalfInput = {
    title: 'Broken streetlight',
    description: 'The streetlight on the corner has been out for a week.',
    categoryId: 'cat-1',
    wardId: 'ward-A',
    citizenPhone: '+919000020001',
  };

  /** A rep holding REPRESENTATIVE only for `ward-A`. */
  const repWardA = {
    id: 'rep-1',
    roleAssignments: [{ role: 'REPRESENTATIVE', wardId: 'ward-A', panchayatId: null }],
  } as unknown as SessionUser;

  /** Captures audit rows and lets the test inspect the most recent one. */
  function auditSpy() {
    const events: RecordAuditEventInput[] = [];
    const record = vi.fn(async (input: RecordAuditEventInput) => {
      events.push(input);
      return null;
    });
    const lastAudit = (): RecordAuditEventInput => {
      const evt = events[events.length - 1];
      if (!evt) throw new Error('expected an audit event');
      return evt;
    };
    return { audit: { record } as unknown as AuditService, events, lastAudit };
  }

  /**
   * Builds the service with real `AccessControlService` + a real
   * `OnBehalfRateLimit` (the rate-limit backend is `prisma.issue.count`, which
   * we stub) and spies for audit. Prisma is a partial stub; any method a given
   * test does NOT expect to be called is a `vi.fn` that fails loudly if hit.
   */
  function build(opts: { issueCount?: () => Promise<number> }) {
    const { audit, events, lastAudit } = auditSpy();

    const userUpsert = vi.fn(() => {
      throw new Error('citizen lookup must NOT happen before the guards pass');
    });
    const issueCount = vi.fn(opts.issueCount ?? (async () => 0));

    const prisma = {
      user: { upsert: userUpsert },
      issue: { count: issueCount },
      ward: { findUnique: vi.fn() },
      category: { findUnique: vi.fn() },
      subcategory: { findUnique: vi.fn() },
    } as unknown as PrismaService;

    const rateLimit = new OnBehalfRateLimit(prisma);

    const issueReference = { next: vi.fn() } as unknown as IssueReferenceService;
    const idempotency = { run: vi.fn() } as unknown as IdempotencyService;
    const notifications = { createForSubmission: vi.fn() } as unknown as NotificationsService;

    const service = new OnBehalfService(
      prisma,
      issueReference,
      idempotency,
      notifications,
      new AccessControlService(),
      audit,
      rateLimit,
    );

    return { service, rateLimit, events, lastAudit, userUpsert };
  }

  it('denies an out-of-scope ward before any citizen lookup, and audits the denial with a masked phone', async () => {
    const { service, lastAudit, userUpsert } = build({});

    await expect(
      service.create(repWardA, { ...dto, wardId: 'ward-B', citizenPhone: '+919000020001' }),
    ).rejects.toMatchObject({ status: 403 });

    // The guard ran first: the citizen upsert was never attempted.
    expect(userUpsert).not.toHaveBeenCalled();

    const evt = lastAudit();
    expect(evt.action).toBe('issue.on_behalf_denied');
    // Masked: plaintext phone absent, last-4 mask present.
    expect(JSON.stringify(evt.metadata)).not.toContain('919000020001');
    expect(JSON.stringify(evt.metadata)).toMatch(/\*{3,}0001/);
  });

  it('fails closed when the rate-limit backend is unavailable (503) and audits the denial', async () => {
    const { service, rateLimit, lastAudit, userUpsert } = build({});

    // Break the counter backend: the next check() reports `unavailable`.
    rateLimit.breakBackend();

    await expect(
      service.create(repWardA, { ...dto, citizenPhone: '+919000020020' }),
    ).rejects.toMatchObject({ status: 503 });

    // Fail CLOSED: no write path was entered.
    expect(userUpsert).not.toHaveBeenCalled();
    expect(lastAudit().action).toBe('issue.on_behalf_denied');
    expect(JSON.stringify(lastAudit().metadata)).toMatch(/\*{3,}0020/);
  });

  it('maps an over-cap count to 429 and audits the limited attempt', async () => {
    // Stub the counter to report the cap already reached.
    const { service, lastAudit } = build({ issueCount: async () => 1_000_000 });

    await expect(
      service.create(repWardA, { ...dto, citizenPhone: '+919000021099' }),
    ).rejects.toMatchObject({ status: 429 });

    expect(lastAudit().action).toBe('issue.on_behalf_denied');
    expect(JSON.stringify(lastAudit().metadata)).toContain('rate_limited');
  });

  it('reuses the M1 429 contract (code rate_limited / messageKey auth.tooMany)', async () => {
    const { service } = build({ issueCount: async () => 1_000_000 });

    await expect(
      service.create(repWardA, { ...dto, citizenPhone: '+919000021098' }),
    ).rejects.toMatchObject({ code: 'rate_limited', status: 429, messageKey: 'auth.tooMany' } as Partial<ApiError>);
  });
});
