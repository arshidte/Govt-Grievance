import { Injectable, Logger } from '@nestjs/common';
import type { AuditLog, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/** Input accepted by `AuditService.record` — mirrors the `AuditLog` columns. */
export interface RecordAuditEventInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  ip?: string | null;
}

/**
 * Append-only audit trail, backed by the `AuditLog` table.
 *
 * `record()` is intentionally best-effort: a failure to write an audit row
 * must never break the user-facing flow that triggered it (e.g. login).
 * Callers are NOT expected to try/catch this themselves — `record()` catches
 * its own DB errors, logs them server-side, and resolves to `null` rather
 * than rejecting. This is a deliberate choice (see Task 13 report): auditing
 * is a side effect of auth, not a precondition for it.
 *
 * GLOBAL CONSTRAINT: callers must never pass secrets in `metadata` — no OTP
 * codes, no plaintext phone numbers beyond a masked form. This service does
 * not attempt to scrub `metadata` itself; masking is the caller's
 * responsibility (see `maskPhone` in `auth.controller.ts`).
 *
 * TWO WRITE MODES (M4C):
 * - `record()` — best-effort, swallows errors, non-transactional. KEEP for
 *   side-effect audits where the audit must never break the flow (auth/OTP/
 *   session).
 * - `recordTx(tx, ...)` — writes through a caller-owned Prisma transaction
 *   client and DOES throw on failure, so a failed audit write rolls the
 *   enclosing business transaction back. Use for critical mutations whose
 *   audit record must commit atomically WITH them (grievance submission /
 *   status transitions / on-behalf / org-staff mutations).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes one audit row THROUGH the caller's transaction client (`tx`), so it
   * commits or rolls back together with the business mutation in the same
   * `$transaction`. Unlike `record()`, this deliberately does NOT catch — a
   * failed audit insert propagates and aborts the enclosing transaction, so a
   * critical mutation can never commit without its audit row. The caller owns
   * the transaction; this never opens its own (no nested transactions).
   */
  async recordTx(tx: Prisma.TransactionClient, input: RecordAuditEventInput): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? undefined,
        ip: input.ip ?? null,
      },
    });
  }

  /**
   * Persists one audit row. Resolves to the created row on success, or
   * `null` if the write itself failed (logged via `this.logger.error`,
   * never thrown) — see class doc for why this swallows errors.
   */
  async record(input: RecordAuditEventInput): Promise<AuditLog | null> {
    try {
      return await this.prisma.auditLog.create({
        data: {
          actorUserId: input.actorUserId ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          metadata: input.metadata ?? undefined,
          ip: input.ip ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to record audit event "${input.action}" for ${input.entityType}`,
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
  }
}
