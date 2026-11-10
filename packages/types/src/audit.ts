import { z } from 'zod';

/**
 * Audit Log read API contracts (M4A).
 *
 * Read-only, admin-only querying of existing `AuditLog` rows. The response
 * deliberately OMITS the stored `ip` field and performs no actor enrichment —
 * it exposes only the fields the viewer needs, exactly as persisted.
 */

/** One audit record as returned by the read API. Note: no `ip`, no actor lookup. */
export interface AuditLogItemDTO {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  /** Persisted JSON metadata, returned verbatim (never interpreted/executed). */
  metadata: unknown;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

/**
 * Cursor-paginated page of audit records. `nextCursor` is an OPAQUE string
 * (clients pass it back unchanged); `null` when there are no more rows.
 */
export interface AuditLogPageDTO {
  items: AuditLogItemDTO[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * `GET /audit-logs` query parameters. All optional except the defaulted
 * `limit`. Only EXACT-match filters plus an inclusive `from`/`to` date range
 * are supported — there are deliberately NO client-controlled sort fields or
 * directions (ordering is fixed to `createdAt DESC, id DESC` server-side).
 *
 * Invalid dates/limits and `from > to` are rejected by this schema (the
 * project's standard 422 validation response); a malformed `cursor` is
 * rejected server-side when it is decoded.
 */
export const auditLogQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).optional(),
    action: z.string().min(1).max(200).optional(),
    entityType: z.string().min(1).max(200).optional(),
    entityId: z.string().min(1).max(200).optional(),
    actorUserId: z.string().min(1).max(200).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((q) => !(q.from && q.to) || q.from <= q.to, {
    message: 'from_after_to',
    path: ['from'],
  });
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
