import { Injectable } from '@nestjs/common';
import type { IssueDetailDTO, IssueStatus } from '@pg/types';

import type { SessionUser } from '../auth/session.service';
import { ApiError } from '../common/api-error';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/** Caller-supplied transition request: target status + optional free-text note. */
export interface TransitionInput {
  toStatus: IssueStatus;
  note?: string;
}

/**
 * The ONLY status transitions M2 activates (spec §5.1): a strict forward
 * chain. The map is keyed by `toStatus`; the value is the single `fromStatus`
 * a transition INTO that status is allowed from. Anything not in this table —
 * a skip (`SUBMITTED→IN_PROGRESS`), a dormant status (`CLOSED`, `REOPENED`,
 * `UNDER_REVIEW`, …), or a backward move — is an invalid transition.
 *
 * Expressed as `toStatus → expectedFrom` (rather than `from → [to]`) because
 * the conditional update below needs exactly the `expectedFrom` for a given
 * requested `toStatus`; the chain is linear so each `toStatus` has one source.
 */
const ALLOWED_TRANSITIONS: Partial<Record<IssueStatus, IssueStatus>> = {
  ACKNOWLEDGED: 'SUBMITTED',
  IN_PROGRESS: 'ACKNOWLEDGED',
  RESOLVED: 'IN_PROGRESS',
};

/**
 * Concurrency-safe status transition (M2 spec §5.1–5.3, Review Focus #5).
 *
 * This is the SERVICE CORE only. It does NOT implement scope/authorization
 * (in-scope-staff checks are the Task 11 endpoint's concern) — it uses
 * `actor.id` solely to stamp `changedById` on the history row.
 *
 * Correctness under races hinges on one thing: the status update is a
 * CONDITIONAL `updateMany` gated on the issue still being in `expectedFrom`.
 * Two requests racing on the same valid transition both compute the same
 * `expectedFrom`, but only the first to commit matches a row (`count === 1`);
 * the loser matches nothing (`count === 0`) and is rejected with `stale_status`
 * — no history, no notification. The whole update+history+notification runs in
 * a single `$transaction`, so a loser (or any downstream failure) leaves the
 * issue, its history, and its notifications entirely unchanged.
 */
@Injectable()
export class IssueTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async transition(actor: SessionUser, issueId: string, input: TransitionInput): Promise<IssueDetailDTO> {
    const { toStatus, note } = input;

    // 1. Read the issue to learn its current status (for transition validation)
    //    and `citizenId` (the notification recipient). This read is OUTSIDE the
    //    transaction on purpose: it is NOT the concurrency gate — the
    //    conditional `updateMany` below is. `citizenId` never changes, and a
    //    stale `status` read is caught by the `count === 0` branch, so reading
    //    here cannot produce an incorrect transition.
    const issue = await this.prisma.issue.findUnique({
      where: { id: issueId },
    });

    // Consistent with `IssuesService.getForUser`: a missing id is a 404. (The
    // endpoint layer (T11) owns scope-based 404s; here it is a plain existence
    // check so the transition has a `fromStatus` to validate against.)
    if (!issue) {
      throw new ApiError('issue_not_found', 404, 'errors.issueNotFound');
    }

    // 2. Validate the requested transition against the read `fromStatus`. The
    //    allowed source for `toStatus` is looked up; if it does not match the
    //    issue's current status, the transition is invalid (skip, dormant
    //    status, or backward move). Rejected BEFORE any write is attempted.
    const expectedFrom = ALLOWED_TRANSITIONS[toStatus];
    if (!expectedFrom || expectedFrom !== issue.status) {
      throw new ApiError('invalid_transition', 422, 'errors.invalidTransition');
    }

    // 3. Concurrency-safe core: conditional update + atomic history +
    //    notification, all inside ONE transaction.
    await this.prisma.$transaction(async (tx) => {
      // 3a. Conditional update: only flips the status if the issue is STILL in
      //     `expectedFrom`. `updatedAt` is `@updatedAt`, so Prisma bumps it
      //     automatically — never set here.
      const updated = await tx.issue.updateMany({
        where: { id: issueId, status: expectedFrom },
        data: { status: toStatus },
      });

      // 3b. count === 0 ⇒ the issue was not in `expectedFrom` (a concurrent
      //     request already moved it, or the caller's view is stale). Throwing
      //     aborts the transaction, so no history and no notification are
      //     written for this losing/stale request.
      if (updated.count === 0) {
        throw new ApiError('stale_status', 409, 'errors.staleStatus');
      }

      // 3c. Exactly one history row for the transition we just won.
      const history = await tx.issueStatusHistory.create({
        data: {
          issueId,
          changedById: actor.id,
          fromStatus: expectedFrom,
          toStatus,
          note,
        },
      });

      // 3d. Exactly one status-change notification, linked to that history row.
      //     The unique `statusHistoryId` column guarantees one-per-history.
      await this.notifications.createForStatusChange(tx, {
        issueId,
        recipientId: issue.citizenId,
        statusHistoryId: history.id,
      });
    });

    // 4. Return an IssueDetailDTO reflecting the NEW status. Built from the
    //    row already fetched in step 1 with `status` overridden to `toStatus`
    //    (every other column is immutable across a transition), avoiding a
    //    second round-trip. Mapped with the SAME minimal shape as
    //    `IssuesService.toIssueDetailDTO`: `timeline: []`, `attachment: null`.
    //    Full timeline hydration is Task 22's concern; the load-bearing
    //    guarantee here is only that `status === toStatus`.
    return {
      id: issue.id,
      referenceNo: issue.referenceNo,
      title: issue.title,
      status: toStatus,
      priority: issue.priority,
      categoryId: issue.categoryId,
      createdAt: issue.createdAt.toISOString(),
      description: issue.description,
      panchayatId: issue.panchayatId,
      wardId: issue.wardId,
      subcategoryId: issue.subcategoryId,
      onBehalfOf: issue.onBehalfOf,
      timeline: [],
      attachment: null,
    };
  }
}
