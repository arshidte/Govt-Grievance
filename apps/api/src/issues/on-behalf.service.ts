import { Injectable } from '@nestjs/common';
import type { CreateOnBehalfInput } from '@pg/types';

import { AccessControlService } from '../access/access-control.service';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/session.service';
import { ApiError } from '../common/api-error';
import { fingerprintOf, IdempotencyService } from '../common/idempotency/idempotency.service';
import { maskPhone } from '../common/mask-phone';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

import { IssueReferenceService } from './issue-reference.service';
import { OnBehalfRateLimit } from './on-behalf-rate-limit';

/** `POST /issues/on-behalf` route identifier, used to scope idempotency keys. */
const ON_BEHALF_ROUTE = 'POST /issues/on-behalf';

/**
 * The MINIMAL, NEUTRAL on-behalf create response (M2 spec §9). Exactly these
 * four keys — identical shape whether the citizen is brand-new or
 * pre-existing. Deliberately carries NO citizen profile field (name/email),
 * NO `citizenId`, and NO account-existence signal: the representative learns
 * only that an issue was filed, never anything about the citizen's account.
 */
export interface OnBehalfResult {
  referenceNo: string;
  id: string;
  /** ISO 8601 string — lossless across an idempotency JSONB replay (T7/T9). */
  createdAt: string;
  status: string;
}

/**
 * On-behalf issue submission by a REPRESENTATIVE (M2 spec §9, Review
 * Focus #2). The service enforces, in this STRICT order (guards before any
 * citizen lookup, so a denial reveals nothing about citizens):
 *
 *   1. Ward-scope: the rep MUST hold a REPRESENTATIVE assignment for
 *      `dto.wardId`. On-behalf is REPRESENTATIVE-only — intentionally
 *      `hasRole('REPRESENTATIVE', { wardId })`, NOT `can()` (which would also
 *      admit ADMIN/COORDINATOR). Denial → audit `issue.on_behalf_denied`
 *      (reason `out_of_scope_ward`, masked phone) then 403.
 *   2. Per-rep hourly rate limit (fail-closed). Over cap → audit denial
 *      (reason `rate_limited`) then 429. Backend error → audit denial
 *      (reason `rate_limit_unavailable`) then 503 — NEVER admitted.
 *   3. Server-side resolve/validate: load the ward (for its `panchayatId`),
 *      validate category + subcategory↔category, mirroring
 *      `IssuesService.validate` (422 on mismatch).
 *   4. Transactional create inside `IdempotencyService.run` — citizen
 *      upsert-by-phone, issue insert (all protected fields forced), and the
 *      submission notification addressed to the CITIZEN, all atomic.
 *   5. Audit success `issue.on_behalf_created` (masked phone only).
 *
 * Every audit metadata object in this service carries ONLY a `phoneMasked`
 * form of the citizen phone (via the shared `maskPhone`) — never plaintext,
 * never a profile field.
 */
@Injectable()
export class OnBehalfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly issueReference: IssueReferenceService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationsService,
    private readonly accessControl: AccessControlService,
    private readonly audit: AuditService,
    private readonly rateLimit: OnBehalfRateLimit,
  ) {}

  async create(
    rep: SessionUser,
    dto: CreateOnBehalfInput,
    idempotencyKey?: string,
  ): Promise<OnBehalfResult> {
    const phoneMasked = maskPhone(dto.citizenPhone);

    // --- Step 1: ward-scope check, BEFORE any citizen lookup ---------------
    // On-behalf is REPRESENTATIVE-only and ward-scoped; `hasRole` (not
    // `can`) excludes ADMIN/COORDINATOR per §9.
    const inScope = this.accessControl.hasRole(rep, 'REPRESENTATIVE', { wardId: dto.wardId });
    if (!inScope) {
      await this.auditDenied(rep, dto.wardId, phoneMasked, 'out_of_scope_ward');
      throw new ApiError('forbidden', 403, 'states.forbidden');
    }

    // --- Step 2: per-rep rate limit (fail-closed) --------------------------
    const outcome = await this.rateLimit.check(rep.id);
    if (outcome === 'rate_limited') {
      await this.auditDenied(rep, dto.wardId, phoneMasked, 'rate_limited');
      // Reuse the M1 429 contract (OtpService.request): code `rate_limited`,
      // messageKey `auth.tooMany`.
      throw new ApiError('rate_limited', 429, 'auth.tooMany');
    }
    if (outcome === 'unavailable') {
      await this.auditDenied(rep, dto.wardId, phoneMasked, 'rate_limit_unavailable');
      throw new ApiError('rate_limit_unavailable', 503, 'errors.rateLimitUnavailable');
    }

    // --- Step 3: resolve panchayatId + validate server-side ----------------
    // The ward was confirmed in-scope above, but we still need its
    // `panchayatId` (never trusted from the client — `dto` doesn't even carry
    // it). Category / subcategory checks mirror `IssuesService.validate`.
    const [ward, category] = await Promise.all([
      this.prisma.ward.findUnique({ where: { id: dto.wardId } }),
      this.prisma.category.findUnique({ where: { id: dto.categoryId } }),
    ]);

    if (!ward) {
      // In-scope per step 1 yet absent here would require a race (assignment
      // to a since-deleted ward); treat as a validation failure, not a 500.
      throw new ApiError('ward_not_found', 422, 'errors.wardNotFound');
    }
    if (!category) {
      throw new ApiError('category_not_found', 422, 'errors.categoryNotFound');
    }
    if (dto.subcategoryId) {
      const subcategory = await this.prisma.subcategory.findUnique({
        where: { id: dto.subcategoryId },
      });
      if (!subcategory || subcategory.categoryId !== dto.categoryId) {
        throw new ApiError('subcategory_category_mismatch', 422, 'errors.subcategoryCategoryMismatch');
      }
    }

    const panchayatId = ward.panchayatId;

    // --- Step 4: transactional create (idempotent) -------------------------
    const { result } = await this.idempotency.run<OnBehalfResult>(
      {
        key: idempotencyKey,
        userId: rep.id,
        route: ON_BEHALF_ROUTE,
        fingerprint: fingerprintOf(dto),
      },
      async (tx) => {
        // (a) Find-or-create the citizen by their unique `phone`. Upsert
        //     makes concurrent first-time resolution safe (no duplicate
        //     citizen rows). A brand-new identity gets NO profile fields —
        //     name/email stay null, matching M1 self-registration. An
        //     EXISTING citizen's profile is left untouched (`update: {}`).
        const citizen = await tx.user.upsert({
          where: { phone: dto.citizenPhone },
          update: {},
          create: { phone: dto.citizenPhone },
        });

        // Allocate the reference number INSIDE `work` so a replay (same key
        // + fingerprint) never burns a sequence value (T9 lesson).
        const referenceNo = await this.issueReference.next(new Date());

        // (b) Issue insert with all protected fields FORCED — never read
        //     from `dto`. The citizen owns it; the rep is only the creator;
        //     onBehalfOf is always true.
        const issue = await tx.issue.create({
          data: {
            title: dto.title,
            description: dto.description,
            categoryId: dto.categoryId,
            subcategoryId: dto.subcategoryId,
            wardId: dto.wardId,
            panchayatId,
            referenceNo,
            status: 'SUBMITTED',
            priority: 'MEDIUM',
            onBehalfOf: true,
            citizenId: citizen.id,
            createdById: rep.id,
          },
        });

        // (c) Submission notification is addressed to the CITIZEN, never the
        //     rep — atomic with the issue insert.
        await this.notifications.createForSubmission(tx, {
          issueId: issue.id,
          citizenId: citizen.id,
          referenceNo,
        });

        // (d) Minimal/neutral result (exactly 4 keys; ISO createdAt). No
        //     citizen profile, no citizenId, no existence signal.
        const dtoResult: OnBehalfResult = {
          referenceNo: issue.referenceNo,
          id: issue.id,
          status: issue.status,
          createdAt: issue.createdAt.toISOString(),
        };
        return { result: dtoResult, issueId: issue.id };
      },
    );

    // --- Step 5: audit success --------------------------------------------
    await this.audit.record({
      actorUserId: rep.id,
      action: 'issue.on_behalf_created',
      entityType: 'Issue',
      entityId: result.id,
      metadata: { referenceNo: result.referenceNo, wardId: dto.wardId, phoneMasked },
    });

    return result;
  }

  /**
   * Writes an `issue.on_behalf_denied` audit row with a MASKED phone only
   * (never plaintext, never a profile field) and the machine `reason`. Fires
   * on every denial path (out-of-scope ward, rate-limited, backend
   * unavailable) BEFORE the corresponding `ApiError` surfaces.
   */
  private async auditDenied(
    rep: SessionUser,
    wardId: string,
    phoneMasked: string,
    reason: 'out_of_scope_ward' | 'rate_limited' | 'rate_limit_unavailable',
  ): Promise<void> {
    await this.audit.record({
      actorUserId: rep.id,
      action: 'issue.on_behalf_denied',
      entityType: 'Issue',
      metadata: { reason, wardId, phoneMasked },
    });
  }
}
