import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditLogItemDTO, AuditLogPageDTO, AuditLogQuery } from '@pg/types';

import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

/** Decoded cursor payload: the (createdAt, id) of the last row of the previous page. */
interface CursorPosition {
  createdAt: Date;
  id: string;
}

/** Uniform rejection for any malformed/unparseable cursor (standard 422 validation response). */
function invalidCursor(): ApiError {
  return new ApiError('validation', 422, 'invalid_cursor');
}

/**
 * Encodes the compound keyset position as an OPAQUE base64url cursor. The
 * client treats it as opaque and passes it back unchanged.
 */
function encodeCursor(createdAt: Date, id: string): string {
  const payload = JSON.stringify({ c: createdAt.toISOString(), i: id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/** Decodes + validates an opaque cursor; throws a uniform 422 on anything malformed. */
function decodeCursor(cursor: string): CursorPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor();
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw invalidCursor();
  }
  const { c, i } = parsed as { c?: unknown; i?: unknown };
  if (typeof c !== 'string' || typeof i !== 'string' || i.length === 0) {
    throw invalidCursor();
  }
  const createdAt = new Date(c);
  if (Number.isNaN(createdAt.getTime())) {
    throw invalidCursor();
  }
  return { createdAt, id: i };
}

/**
 * Read-only query service for the audit trail (M4A). Separate from the write
 * `AuditService` by design. Produces a deterministically-ordered, cursor-
 * paginated page of audit records for the admin viewer.
 *
 * Ordering is fixed to `createdAt DESC, id DESC` (deterministic even when many
 * rows share a timestamp). Pagination uses a compound KEYSET on exactly that
 * ordering — a plain `createdAt` cursor would skip/duplicate rows on ties.
 * The `ip` column is never selected, so it cannot leak into the response.
 */
@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AuditLogQuery): Promise<AuditLogPageDTO> {
    const { limit, cursor, action, entityType, entityId, actorUserId, from, to } = query;

    // Exact-match filters + inclusive date range. Each is independently
    // optional and composes via AND (Prisma's default for sibling fields).
    const filters: Prisma.AuditLogWhereInput = {
      ...(action !== undefined ? { action } : {}),
      ...(entityType !== undefined ? { entityType } : {}),
      ...(entityId !== undefined ? { entityId } : {}),
      ...(actorUserId !== undefined ? { actorUserId } : {}),
      ...(from !== undefined || to !== undefined
        ? {
            createdAt: {
              ...(from !== undefined ? { gte: from } : {}),
              ...(to !== undefined ? { lte: to } : {}),
            },
          }
        : {}),
    };

    // Keyset predicate for `ORDER BY createdAt DESC, id DESC`: rows strictly
    // "after" the cursor position are `createdAt < c` OR (`createdAt = c` AND
    // `id < i`). AND-ed with the filters so they always compose correctly.
    let where: Prisma.AuditLogWhereInput = filters;
    if (cursor !== undefined) {
      const pos = decodeCursor(cursor);
      where = {
        AND: [
          filters,
          {
            OR: [
              { createdAt: { lt: pos.createdAt } },
              { createdAt: pos.createdAt, id: { lt: pos.id } },
            ],
          },
        ],
      };
    }

    // Fetch one extra row to determine `hasMore` without a COUNT query.
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      // `ip` is deliberately NOT selected — it must never reach the response.
      select: {
        id: true,
        actorUserId: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    const items: AuditLogItemDTO[] = page.map((r) => ({
      id: r.id,
      actorUserId: r.actorUserId,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      metadata: r.metadata ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return { items, nextCursor, hasMore };
  }
}
