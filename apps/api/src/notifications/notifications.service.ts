import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

export interface CreateForSubmissionParams {
  issueId: string;
  citizenId: string;
  referenceNo: string;
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
}
