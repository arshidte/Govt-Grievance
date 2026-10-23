import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { ApiError } from '../api-error';

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
 * NOT handled here (Task 9, deliberately deferred — see that task's brief):
 * the concurrent-same-key race (two requests racing to insert the same new
 * key both pass the "not found" check and both attempt `work` + insert; the
 * loser must catch the resulting unique-constraint violation (P2002) and
 * re-read the winner's row rather than erroring), and the 24h TTL — both the
 * read-time "is this row stale, treat as not-found" check and the periodic
 * purge job.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    params: IdempotencyRunParams,
    work: (tx: Prisma.TransactionClient) => Promise<IdempotencyWorkResult<T>>,
  ): Promise<IdempotencyRunResult<T>> {
    const { key, userId, route, fingerprint } = params;

    return this.prisma.$transaction(async (tx) => {
      if (key === undefined) {
        const { result } = await work(tx);
        return { result, replayed: false };
      }

      const existing = await tx.idempotencyKey.findUnique({
        where: { userId_route_key: { userId, route, key } },
      });

      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new ApiError('idempotency_key_conflict', 409, 'errors.idempotencyConflict');
        }

        // Same key + same fingerprint: replay the stored response verbatim,
        // never re-running the caller's side-effecting work.
        return { result: existing.responseJson as T, replayed: true };
      }

      // TODO(Task 9): concurrent-race + TTL — a second request racing on the
      // same new key will also reach here and attempt the same insert below;
      // the loser must catch the resulting P2002 unique-violation and re-read
      // the winner's row instead of propagating the raw DB error. Likewise,
      // an `existing` row older than 24h should be treated as not-found
      // (re-run `work`) rather than replayed/conflicted forever.
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
