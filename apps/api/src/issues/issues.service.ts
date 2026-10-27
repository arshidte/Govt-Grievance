import { Injectable } from '@nestjs/common';
import type {
  CreateIssueInput,
  IssueDetailDTO,
  IssueStatusHistoryDTO,
  IssueSummaryDTO,
  Role,
  TransitionInput,
} from '@pg/types';
import type { Prisma } from '@prisma/client';

import { AccessControlService } from '../access/access-control.service';
import type { SessionUser } from '../auth/session.service';
import { ApiError } from '../common/api-error';
import { fingerprintOf, IdempotencyService } from '../common/idempotency/idempotency.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

import { IssueReferenceService } from './issue-reference.service';
import { IssueTransitionService } from './issue-transition.service';

/** `POST /issues` route identifier, used to scope idempotency keys. */
const CREATE_ISSUE_ROUTE = 'POST /issues';

/**
 * Full `Issue` row shape this service selects, carrying exactly the columns
 * `toIssueDetailDTO` needs. Declared once so the `prisma.issue.create` call
 * and the mapper agree on shape without a second round-trip query.
 */
type IssueRow = Awaited<ReturnType<Prisma.IssueDelegate['create']>>;

function toIssueSummaryDTO(issue: {
  id: string;
  referenceNo: string;
  title: string;
  status: IssueRow['status'];
  priority: IssueRow['priority'];
  categoryId: string;
  createdAt: Date;
}): IssueSummaryDTO {
  return {
    id: issue.id,
    referenceNo: issue.referenceNo,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    categoryId: issue.categoryId,
    createdAt: issue.createdAt.toISOString(),
  };
}

/**
 * Staff roles in DESCENDING privilege order. When an actor holds several staff
 * roles, the timeline's `actorRoleLabel` is resolved deterministically to the
 * most-privileged one (ADMIN > COORDINATOR > REPRESENTATIVE) so the label is
 * stable regardless of `RoleAssignment` row ordering.
 */
const STAFF_ROLE_PRIVILEGE: Role[] = ['ADMIN', 'COORDINATOR', 'REPRESENTATIVE'];

/**
 * Shape of an `IssueStatusHistory` row as selected for the timeline. The acting
 * user is included via `changedBy` with ONLY its `roleAssignments.role`
 * selected — never name/phone/email/id — so the DTO can expose a non-PII role
 * label (see `IssueStatusHistoryDTO`'s "exposes role label, never actor PII"
 * contract; this timeline is visible to the filing citizen).
 */
type HistoryRow = {
  id: string;
  fromStatus: IssueRow['status'];
  toStatus: IssueRow['status'];
  note: string | null;
  createdAt: Date;
  changedById: string | null;
  changedBy: { roleAssignments: { role: string }[] } | null;
};

/**
 * Derives the stable, localizable `actorRoleLabel` for a timeline entry from
 * the acting user's STAFF ROLE — never any PII. `null` when the row has no
 * recorded actor (legacy/backfilled rows per schema §4.5) OR when the actor
 * holds no staff role (e.g. a citizen's own action, should not occur for
 * transitions but handled defensively). With multiple staff roles, the
 * most-privileged (ADMIN > COORDINATOR > REPRESENTATIVE) is chosen.
 */
function actorRoleLabelOf(row: HistoryRow): string | null {
  if (!row.changedById || !row.changedBy) {
    return null;
  }

  const roles = new Set(row.changedBy.roleAssignments.map((ra) => ra.role));
  return STAFF_ROLE_PRIVILEGE.find((role) => roles.has(role)) ?? null;
}

function toIssueStatusHistoryDTO(row: HistoryRow): IssueStatusHistoryDTO {
  return {
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    note: row.note,
    actorRoleLabel: actorRoleLabelOf(row),
    createdAt: row.createdAt.toISOString(),
  };
}

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
    private readonly accessControl: AccessControlService,
    private readonly transitions: IssueTransitionService,
  ) {}

  async createForCitizen(
    user: SessionUser,
    dto: CreateIssueInput,
    idempotencyKey?: string,
  ): Promise<IssueDetailDTO> {
    await this.validate(dto);

    const { result } = await this.idempotency.run(
      {
        key: idempotencyKey,
        userId: user.id,
        route: CREATE_ISSUE_ROUTE,
        fingerprint: fingerprintOf(dto),
      },
      async (tx) => {
        // Deliberately INSIDE `work`: `IdempotencyService.run` only invokes
        // this callback on a genuine fresh create (no key, new key, or an
        // expired key) — never on a replay. Allocating the reference number
        // here, rather than before `run()` is called, means a replayed
        // request (same key + same fingerprint, racing or not) never burns
        // a sequence value for a row that won't be created (see Task 9
        // review carry-in from Task 7).
        const referenceNo = await this.issueReference.next(new Date());

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
   * Scoped issue list (M2 spec §6): a CITIZEN sees only their own
   * submissions; STAFF see every issue within their role's scope
   * (ADMIN → all; COORDINATOR → their panchayat(s); REPRESENTATIVE →
   * their ward(s)). The scope is turned into a Prisma `where` clause and
   * applied AT THE DATABASE, never as a post-fetch filter, so a staff
   * member with many assignments still gets one query.
   */
  async listFor(user: SessionUser): Promise<IssueSummaryDTO[]> {
    const where = this.scopeWhereFor(user);
    if (!where) {
      return [];
    }

    const issues = await this.prisma.issue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return issues.map(toIssueSummaryDTO);
  }

  /**
   * Scoped single-issue read (M2 spec §6): returns the full
   * `IssueDetailDTO` if `user` is the issue's own citizen OR in-scope
   * staff; otherwise throws a 404 `issue_not_found` — deliberately the
   * SAME error as a genuinely nonexistent id, so an out-of-scope caller
   * (citizen or staff) can never distinguish "doesn't exist" from "exists
   * but isn't yours to see" (see class/module doc on non-disclosure).
   */
  async getForUser(user: SessionUser, id: string): Promise<IssueDetailDTO> {
    const where = this.scopeWhereFor(user);
    if (!where) {
      throw new ApiError('issue_not_found', 404, 'errors.issueNotFound');
    }

    const issue = await this.prisma.issue.findFirst({
      where: { ...where, id },
      include: {
        statusHistory: {
          // Ascending by createdAt: the timeline is chronological, oldest
          // event first (M2 Task 11 / spec §5).
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            createdAt: true,
            changedById: true,
            // PII-safe: select ONLY the acting user's role assignments'
            // `role` — never name/phone/email/id — so the citizen-visible
            // timeline exposes a role label and nothing identifying.
            changedBy: { select: { roleAssignments: { select: { role: true } } } },
          },
        },
      },
    });

    if (!issue) {
      throw new ApiError('issue_not_found', 404, 'errors.issueNotFound');
    }

    const detail = toIssueDetailDTO(issue);
    detail.timeline = issue.statusHistory.map(toIssueStatusHistoryDTO);
    return detail;
  }

  /**
   * Scope-gated status transition (M2 Task 11 / spec §5.1–5.3, §6).
   *
   * This is the AUTHORIZATION gate the `PATCH /issues/:id/status` endpoint
   * needs that `RbacGuard`/`@ScopeFrom` CANNOT provide: that guard resolves
   * scope from a ward/panchayat URL param, but here `:id` is an ISSUE id, so
   * the guard would resolve scope to `{}` and wrongly 403 every non-admin
   * staff member. Instead we reuse the SAME decision engine the guard uses —
   * `AccessControlService` — but source the scope from the issue ROW
   * (`wardId` + `panchayatId`), exactly how the guard would resolve it.
   *
   * Order is deliberate (see brief §6 / 403-vs-404 contract):
   * 1. Non-staff (citizen, even the issue owner) → 403 BEFORE any DB load, so
   *    a citizen gets no existence disclosure.
   * 2. Load the issue; missing → 404.
   * 3. Out-of-scope staff → 403 (existence IS disclosed to staff here — this
   *    is intentionally different from GET's uniform-404 non-disclosure).
   * 4. In-scope → delegate to `IssueTransitionService.transition` (Task 10;
   *    its concurrency logic is untouched and carries NO authz of its own),
   *    then re-read via the scoped `getForUser` so the response carries the
   *    now-populated, chronological timeline.
   */
  async transitionForUser(user: SessionUser, id: string, input: TransitionInput): Promise<IssueDetailDTO> {
    if (!this.accessControl.isStaff(user)) {
      throw new ApiError('forbidden', 403, 'states.forbidden');
    }

    const issue = await this.prisma.issue.findUnique({ where: { id } });
    if (!issue) {
      throw new ApiError('issue_not_found', 404, 'errors.issueNotFound');
    }

    const inScope = this.accessControl.can(user, 'issue:update', {
      wardId: issue.wardId,
      panchayatId: issue.panchayatId,
    });
    if (!inScope) {
      throw new ApiError('forbidden', 403, 'states.forbidden');
    }

    await this.transitions.transition(user, id, input);

    // Re-read scoped: the transition service returns a bare `timeline: []`
    // DTO (Task 10 is not timeline-aware); `getForUser` is the single place
    // that hydrates the ordered, PII-safe timeline for both this PATCH
    // response and a subsequent GET.
    return this.getForUser(user, id);
  }

  /**
   * Resolves `user`'s visibility scope into a Prisma `Issue` `where`
   * clause, or `null` if `user` has no visibility at all (a citizen is
   * never "null" — they always see their own issues; `null` can only
   * happen for a staff role with no scoped assignments, which should not
   * occur given `RoleAssignment`'s DB-level CHECK constraint, but is
   * handled defensively rather than assumed impossible).
   *
   * - ADMIN: no filter (all issues).
   * - COORDINATOR: `panchayatId IN (their panchayat assignments)`.
   * - REPRESENTATIVE: `wardId IN (their ward assignments)`.
   * - CITIZEN / no role assignments: `citizenId = user.id`.
   *
   * Uses `AccessControlService.hasRole`/`isStaff` rather than re-deriving
   * role logic here — this method's only job is turning an already-known
   * role/scope into a DB filter.
   */
  private scopeWhereFor(user: SessionUser): Prisma.IssueWhereInput | null {
    if (this.accessControl.hasRole(user, 'ADMIN')) {
      return {};
    }

    if (this.accessControl.hasRole(user, 'COORDINATOR')) {
      const panchayatIds = user.roleAssignments
        .filter((ra) => ra.role === 'COORDINATOR' && ra.panchayatId)
        .map((ra) => ra.panchayatId as string);

      if (panchayatIds.length === 0) {
        return null;
      }

      return { panchayatId: { in: panchayatIds } };
    }

    if (this.accessControl.hasRole(user, 'REPRESENTATIVE')) {
      const wardIds = user.roleAssignments
        .filter((ra) => ra.role === 'REPRESENTATIVE' && ra.wardId)
        .map((ra) => ra.wardId as string);

      if (wardIds.length === 0) {
        return null;
      }

      return { wardId: { in: wardIds } };
    }

    // Citizen path (no staff role assignment, including a brand-new user
    // with none at all): visible scope is exactly their own submissions.
    return { citizenId: user.id };
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
