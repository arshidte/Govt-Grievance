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
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

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
