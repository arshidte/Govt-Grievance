import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma, type IdempotencyKey } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { ApiError } from '../api-error';

/**
 * Read-time TTL for idempotency keys (M2 Task 9, spec §6.2): a row older
 * than this is treated as ABSENT by every lookup in this service, even if
 * no scheduled purge job has deleted it yet. There is deliberately no cron
 * here — correctness comes entirely from this read-time check, not from
 * background cleanup (which M2 does not require).
 */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyRunParams {
  /** Idempotency-Key header value, if the caller supplied one. */
  key?: string;
  userId: string;
  route: string;
  /** Stable hash of the request body — see `fingerprintOf` below. */
  fingerprint: string;
}

export interface IdempotencyWorkResult<T> {
  result: T;
  issueId?: string;
}

export interface IdempotencyRunResult<T> {
  result: T;
  /** True when the stored response was returned without re-running `work`. */
  replayed: boolean;
}

/**
 * Base creation-idempotency replay store (M2 Task 6).
 *
 * `run()` lets a caller (Task 7 citizen submit, Task 12 on-behalf) guard a
 * side-effecting operation behind an optional client-supplied key:
 *
 * - No `key` → always execute `work`, no row is written (nothing to replay).
 * - `key` present, no existing `(userId, route, key)` row → execute `work`,
 *   persist the response, return it fresh (`replayed: false`).
 * - `key` present, existing row with the SAME `fingerprint` → return the
 *   stored response WITHOUT re-running `work` (`replayed: true`).
 * - `key` present, existing row with a DIFFERENT `fingerprint` → the key is
 *   being reused for a different request body; reject with 409.
 *
 * Concurrency + expiry (M2 Task 9, spec §6.2):
 *
 * - **Concurrent same-key race.** The `@@unique([userId, route, key])` index
 *   is the single authoritative arbiter. When two requests race on a brand
 *   new key, both pass the initial "not found" check and both attempt
 *   `work` + the key insert; the DB allows exactly one `INSERT` to commit
 *   and aborts the other's transaction with Prisma error `P2002`. The loser
 *   catches that (never surfacing the raw DB error) and **re-reads** the
 *   winning row in a fresh query (the aborted transaction cannot be reused):
 *   if the winner's `fingerprint` matches, the loser's response is the
 *   stored one (`replayed: true`); if it differs, the loser throws the same
 *   409 `idempotency_key_conflict` as the non-concurrent conflict path.
 * - **Read-time TTL.** Every lookup (the initial check AND the post-P2002
 *   re-read) treats a row with `createdAt` older than `IDEMPOTENCY_TTL_MS`
 *   as absent, so an expired key is a fresh create even if no purge job has
 *   ever run — M2 has no purge cron; this read-time check is the entire
 *   correctness guarantee.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    params: IdempotencyRunParams,
    work: (tx: Prisma.TransactionClient) => Promise<IdempotencyWorkResult<T>>,
  ): Promise<IdempotencyRunResult<T>> {
    const { key, userId, route, fingerprint } = params;

    if (key === undefined) {
      return this.prisma.$transaction(async (tx) => {
        const { result } = await work(tx);
        return { result, replayed: false };
      });
    }

    const existing = await this.findFreshRow(userId, route, key);

    if (existing) {
      return this.replayOrConflict<T>(existing, fingerprint);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Re-check for a fresh row INSIDE the transaction too: another
        // request may have committed its row in the window between the
        // lookup above and this transaction starting. Without this, two
        // concurrent requests could both reach the `work`+insert below and
        // rely solely on the DB unique index to catch the loser — which
        // still works (P2002 below), but re-checking here lets a loser
        // that arrives slightly later avoid redundantly re-running `work`.
        const recheck = await tx.idempotencyKey.findUnique({
          where: { userId_route_key: { userId, route, key } },
        });

        if (recheck) {
          if (!this.isExpired(recheck)) {
            if (recheck.fingerprint !== fingerprint) {
              throw new ApiError('idempotency_key_conflict', 409, 'errors.idempotencyConflict');
            }
            return { result: recheck.responseJson as T, replayed: true };
          }

          // Expired: read-time TTL treats it as absent, but the physical
          // row still occupies this unique triple — delete it before the
          // `create` below, or that `create` would hit a P2002 that has
          // nothing to do with a genuine concurrent race (it would be
          // racing a dead key, not a live one). Deliberately a plain
          // `delete`, not `deleteMany`: two transactions racing to expire
          // the SAME stale row both attempt this delete, and the loser's
          // `delete` throws Prisma `P2025` (record not found) — caught
          // below and treated the same as the P2002 race, since both mean
          // "someone else is also past this point for this key".
          try {
            await tx.idempotencyKey.delete({ where: { userId_route_key: { userId, route, key } } });
          } catch (deleteErr) {
            if (
              deleteErr instanceof Prisma.PrismaClientKnownRequestError &&
              deleteErr.code === 'P2025'
            ) {
              // Someone else already deleted/replaced this stale row in
              // this instant; fall through to `work` + `create` below —
              // if THEY also already inserted their fresh row first, our
              // `create` will raise P2002 and the catch block below
              // handles it exactly like any other race loser.
            } else {
              throw deleteErr;
            }
          }
        }

        const { result, issueId } = await work(tx);

        await tx.idempotencyKey.create({
          data: {
            key,
            userId,
            route,
            fingerprint,
            // `responseJson` is a Prisma `Json` column; `T` is caller-defined
            // and not statically known to be JSON-serializable, so this cast
            // is a deliberate, narrow escape hatch at the DB-write boundary.
            responseJson: result as Prisma.InputJsonValue,
            issueId,
          },
        });

        return { result, replayed: false };
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
        throw err;
      }

      // Our own INSERT lost the race: `err`'s transaction already aborted,
      // so it cannot be reused for a re-read — open a brand new query
      // against `this.prisma` instead. The winning row MUST exist now (the
      // P2002 means some row occupies this unique triple), but it is still
      // read through the same TTL-aware lookup for consistency/paranoia.
      const winner = await this.findFreshRow(userId, route, key);

      if (!winner) {
        // Exceedingly unlikely (the winner's row would have to expire or
        // be deleted in the instant between our P2002 and this re-read),
        // but never silently swallow it — surface the conflict rather than
        // claim success for a write that didn't happen.
        throw new ApiError('idempotency_key_conflict', 409, 'errors.idempotencyConflict');
      }

      return this.replayOrConflict<T>(winner, fingerprint);
    }
  }

  /**
   * Looks up the `(userId, route, key)` row, treating one older than
   * `IDEMPOTENCY_TTL_MS` as not-found (read-time TTL — see class doc).
   */
  private async findFreshRow(userId: string, route: string, key: string): Promise<IdempotencyKey | null> {
    const row = await this.prisma.idempotencyKey.findUnique({
      where: { userId_route_key: { userId, route, key } },
    });

    return row && !this.isExpired(row) ? row : null;
  }

  private isExpired(row: IdempotencyKey): boolean {
    return row.createdAt.getTime() < Date.now() - IDEMPOTENCY_TTL_MS;
  }

  /** Shared replay/conflict decision for both the initial lookup and the post-P2002 re-read. */
  private replayOrConflict<T>(row: IdempotencyKey, fingerprint: string): IdempotencyRunResult<T> {
    if (row.fingerprint !== fingerprint) {
      throw new ApiError('idempotency_key_conflict', 409, 'errors.idempotencyConflict');
    }

    return { result: row.responseJson as T, replayed: true };
  }
}

/**
 * Stable SHA-256 hex digest of a request body, for callers (Task 7/12) to
 * pass as `fingerprint`. Canonicalizes by sorting object keys recursively so
 * that semantically-identical bodies with differently-ordered keys hash the
 * same; array order is preserved as-is since it is meaningful.
 */
export function fingerprintOf(body: unknown): string {
  const canonical = canonicalize(body);
  return createHash('sha256').update(canonical).digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`,
  );
  return `{${entries.join(',')}}`;
}
