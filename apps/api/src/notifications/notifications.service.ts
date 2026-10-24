import { Injectable } from '@nestjs/common';
import type { NotificationDTO } from '@pg/types';
import type { Notification, Prisma } from '@prisma/client';

import type { SessionUser } from '../auth/session.service';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateForSubmissionParams {
  issueId: string;
  citizenId: string;
  referenceNo: string;
}

export interface CreateForStatusChangeParams {
  issueId: string;
  recipientId: string;
  statusHistoryId: string;
}

/**
 * Notification writes. `createForSubmission` is called from inside
 * `IssuesService.createForCitizen`'s transaction (Task 7) — it takes the
 * caller's `Prisma.TransactionClient` rather than `PrismaService` directly,
 * so the Notification insert is always atomic with the Issue insert that
 * produced it. The `(issueId, type='issue.submitted')` partial unique index
 * (migration `20261016000000_m2_issue_lifecycle`,
 * `notification_one_submitted_per_issue`) is the DB-level backstop against
 * ever creating a second submission notification for the same issue.
 *
 * `referenceNo` is accepted but not persisted — `Notification` has no
 * denormalized reference-number column (see `schema.prisma`); it is taken
 * here only so future callers/tests can be explicit about which issue's
 * submission this notification documents, matching the brief's exact
 * `{issueId, citizenId, referenceNo}` parameter shape.
 */
@Injectable()
export class NotificationsService {
  // Only the READ methods below (`listFor`/`unreadCount`/`markRead`, Task
  // 17) use `PrismaService` directly. The two WRITE methods above/below this
  // constructor are unaffected — they still take their own
  // `Prisma.TransactionClient` from the caller's transaction (see their
  // doc-comments) and never touch `this.prisma`.
  //
  // The parameter defaults to a fresh `PrismaService` so pre-existing
  // zero-arg call sites (`new NotificationsService()` in
  // `issues/issues.service.spec.ts` and
  // `issues/issue-transition.service.spec.ts` — both out of scope for this
  // task and exercising only the tx-based write methods, which never read
  // `this.prisma`) keep compiling unmodified. Nest's own DI container
  // always passes an explicit, already-resolved `PrismaService` instance at
  // runtime, so this default is never actually invoked in the running app.
  constructor(private readonly prisma: PrismaService = new PrismaService()) {}

  async createForSubmission(tx: Prisma.TransactionClient, params: CreateForSubmissionParams): Promise<void> {
    const { issueId, citizenId } = params;

    await tx.notification.create({
      data: {
        type: 'issue.submitted',
        recipientId: citizenId,
        issueId,
      },
    });
  }

  /**
   * Status-change notification, called from inside
   * `IssueTransitionService.transition`'s transaction (Task 10). Like
   * `createForSubmission`, it takes the caller's `Prisma.TransactionClient`
   * rather than `PrismaService`, so the Notification insert is always atomic
   * with the `IssueStatusHistory` row it documents: if either write fails, the
   * conditional status update rolls back too, leaving the issue unchanged.
   *
   * The `statusHistoryId` is the id of the history row just inserted for this
   * transition. `Notification.statusHistoryId` carries a DB-level `@unique`
   * constraint (see `schema.prisma`), so there is at most ONE notification per
   * history row — the backstop against a double-fired status-change notice for
   * a single transition.
   */
  async createForStatusChange(tx: Prisma.TransactionClient, params: CreateForStatusChangeParams): Promise<void> {
    const { issueId, recipientId, statusHistoryId } = params;

    await tx.notification.create({
      data: {
        type: 'issue.status_changed',
        recipientId,
        issueId,
        statusHistoryId,
      },
    });
  }

  /**
   * Recipient-scoped list (M2 spec §11, Task 17). The `where: { recipientId:
   * user.id }` filter happens at the DB level — this query can structurally
   * never return another user's rows, not just "doesn't return them because
   * the caller filtered client-side."
   *
   * PAGINATION: the spec §6 contract row mentions pagination, but M2 volume
   * is low; this returns ALL of the recipient's notifications ordered
   * newest-first. A full pagination system is a deferred follow-up —
   * consistent with the T8 unpaginated-list note for `IssuesService.listFor`.
   */
  async listFor(user: SessionUser): Promise<NotificationDTO[]> {
    const rows = await this.prisma.notification.findMany({
      where: { recipientId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toNotificationDTO(row));
  }

  /**
   * Recipient-scoped unread count — same DB-level `recipientId` filter as
   * `listFor`, plus `readAt: null`.
   */
  async unreadCount(user: SessionUser): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { recipientId: user.id, readAt: null },
    });
    return { count };
  }

  /**
   * Recipient-scoped mark-as-read. The ownership check and the read happen
   * together (`findFirst({ where: { id, recipientId: user.id } })`) — a
   * notification that exists but belongs to someone else is
   * INDISTINGUISHABLE, from the caller's point of view, from one that does
   * not exist at all: both throw the SAME uniform
   * `notification_not_found` 404. We deliberately do NOT use 403 here —
   * a 403 would confirm "this id exists, you're just not allowed to touch
   * it," disclosing another user's notification id as valid. 404 for both
   * cases leaks nothing.
   *
   * Idempotent `readAt`: `existing.readAt ?? new Date()` preserves the
   * original read timestamp on a repeat mark-read rather than bumping it
   * forward every call.
   */
  async markRead(user: SessionUser, id: string): Promise<NotificationDTO> {
    const existing = await this.prisma.notification.findFirst({
      where: { id, recipientId: user.id },
    });
    if (!existing) {
      throw new ApiError('notification_not_found', 404, 'errors.notificationNotFound');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: existing.readAt ?? new Date() },
    });
    return this.toNotificationDTO(updated);
  }

  /** Shared mapper: DB row -> the recipient-facing `NotificationDTO` (ISO-string timestamps, no recipientId/statusHistoryId). */
  private toNotificationDTO(row: Notification): NotificationDTO {
    return {
      id: row.id,
      type: row.type,
      issueId: row.issueId,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
