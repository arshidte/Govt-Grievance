import { Injectable } from '@nestjs/common';
import type { CreateIssueInput, IssueDetailDTO } from '@pg/types';
import type { Prisma } from '@prisma/client';

import type { SessionUser } from '../auth/session.service';
import { ApiError } from '../common/api-error';
import { fingerprintOf, IdempotencyService } from '../common/idempotency/idempotency.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

import { IssueReferenceService } from './issue-reference.service';

/** `POST /issues` route identifier, used to scope idempotency keys. */
const CREATE_ISSUE_ROUTE = 'POST /issues';

/**
 * Full `Issue` row shape this service selects, carrying exactly the columns
 * `toIssueDetailDTO` needs. Declared once so the `prisma.issue.create` call
 * and the mapper agree on shape without a second round-trip query.
 */
type IssueRow = Awaited<ReturnType<Prisma.IssueDelegate['create']>>;

function toIssueDetailDTO(issue: IssueRow): IssueDetailDTO {
  return {
    id: issue.id,
    referenceNo: issue.referenceNo,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    categoryId: issue.categoryId,
    // ISO strings, not Date objects: an idempotent replay round-trips this
    // DTO through a Postgres JSONB column (IdempotencyKey.responseJson) —
    // Date objects would come back as plain strings on replay anyway, so
    // serializing up front here keeps the first response and every replay
    // byte-for-byte identical (see Task 6 report's "responseJson round-trip"
    // caveat).
    createdAt: issue.createdAt.toISOString(),
    description: issue.description,
    panchayatId: issue.panchayatId,
    wardId: issue.wardId,
    subcategoryId: issue.subcategoryId,
    onBehalfOf: issue.onBehalfOf,
    // M2 Task 7 never populates timeline/attachment at creation time — a
    // freshly-submitted issue has no status history yet (SUBMITTED is the
    // initial state, not a recorded transition) and no attachment upload
    // path exists in this task.
    timeline: [],
    attachment: null,
  };
}

/**
 * Citizen self-submission of a new issue (M2 spec §6/§7).
 *
 * Two responsibilities, both server-authoritative:
 * 1. Validate cross-references the client cannot be trusted to get right:
 *    ward must belong to the given panchayat; subcategory (if given) must
 *    belong to the given category. Both run BEFORE any write.
 * 2. Force every protected field — status, priority, citizenId, createdById,
 *    onBehalfOf — regardless of what a caller puts on `dto`. `CreateIssueInput`
 *    (from `@pg/types`) doesn't even declare these fields, but a caller could
 *    still pass an object with extra properties (as the "ignores client
 *    overrides" test does via an `as any` cast), so the service must derive
 *    these values itself rather than ever reading them off `dto`.
 *
 * The Issue insert and its submission Notification are always atomic: both
 * happen inside the single `Prisma.TransactionClient` that `IdempotencyService.run`
 * opens, so a committed issue is guaranteed to have a submission notification
 * (and vice versa — if the notification insert failed, the issue insert rolls
 * back too).
 */
@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issueReference: IssueReferenceService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationsService,
  ) {}

  async createForCitizen(
    user: SessionUser,
    dto: CreateIssueInput,
    idempotencyKey?: string,
  ): Promise<IssueDetailDTO> {
    await this.validate(dto);

    const referenceNo = await this.issueReference.next(new Date());

    const { result } = await this.idempotency.run(
      {
        key: idempotencyKey,
        userId: user.id,
        route: CREATE_ISSUE_ROUTE,
        fingerprint: fingerprintOf(dto),
      },
      async (tx) => {
        const issue = await tx.issue.create({
          data: {
            title: dto.title,
            description: dto.description,
            categoryId: dto.categoryId,
            subcategoryId: dto.subcategoryId,
            panchayatId: dto.panchayatId,
            wardId: dto.wardId,
            referenceNo,
            // Forced, never read from `dto`: a citizen self-submission is
            // always SUBMITTED/MEDIUM/not-on-behalf, and the citizen is
            // always both the issue's subject and its creator.
            status: 'SUBMITTED',
            priority: 'MEDIUM',
            onBehalfOf: false,
            citizenId: user.id,
            createdById: user.id,
          },
        });

        await this.notifications.createForSubmission(tx, {
          issueId: issue.id,
          citizenId: user.id,
          referenceNo,
        });

        const dtoResult = toIssueDetailDTO(issue);
        return { result: dtoResult, issueId: issue.id };
      },
    );

    return result;
  }

  /**
   * Server-authoritative cross-reference checks, run before any write.
   * Never trusts the client's claim that a ward/subcategory belongs to a
   * given panchayat/category — always re-derives from the DB.
   */
  private async validate(dto: CreateIssueInput): Promise<void> {
    const [ward, category] = await Promise.all([
      this.prisma.ward.findUnique({ where: { id: dto.wardId } }),
      this.prisma.category.findUnique({ where: { id: dto.categoryId } }),
    ]);

    if (!category) {
      throw new ApiError('category_not_found', 422, 'errors.categoryNotFound');
    }

    if (!ward || ward.panchayatId !== dto.panchayatId) {
      throw new ApiError('ward_panchayat_mismatch', 422, 'errors.wardPanchayatMismatch');
    }

    if (dto.subcategoryId) {
      const subcategory = await this.prisma.subcategory.findUnique({ where: { id: dto.subcategoryId } });

      if (!subcategory || subcategory.categoryId !== dto.categoryId) {
        throw new ApiError('subcategory_category_mismatch', 422, 'errors.subcategoryCategoryMismatch');
      }
    }
  }
}
