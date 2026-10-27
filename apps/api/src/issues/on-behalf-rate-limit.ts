import { Injectable } from '@nestjs/common';

import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Discriminated outcome of the rate-limit backend query. The rate-limit
 * service never throws `ApiError` itself — it returns one of these so the
 * ON-BEHALF SERVICE owns the mapping to HTTP + the audit-denial write (the
 * audit row must be emitted BEFORE the error surfaces, and only the service
 * has the masked phone / rep context to build that row). See
 * `OnBehalfService.create`.
 *
 * - `ok`              → under cap; proceed.
 * - `rate_limited`    → at/over cap → service maps to 429.
 * - `unavailable`     → the counter query itself errored → service maps to
 *                       503 (FAIL CLOSED — never treated as `ok`).
 */
export type RateLimitOutcome = 'ok' | 'rate_limited' | 'unavailable';

/**
 * Per-representative hourly on-behalf rate limiter (M2 Task 12 / spec §9).
 *
 * Backed by a DB counter over committed on-behalf issues — mirrors the OTP
 * per-window `count({ createdAt: { gte: oneHourAgo } })` pattern in
 * `OtpService.request`. Counting ACTUAL persisted issues (rather than a
 * separate attempts table) means a rolled-back transaction never consumes
 * quota, and the cap is `env.ON_BEHALF_RATE_LIMIT_PER_HOUR`.
 *
 * FAIL CLOSED: the count is wrapped in try/catch. If the backend query
 * throws for any reason, the method returns `'unavailable'` — never `'ok'` —
 * so a flaky/overloaded DB can never silently let on-behalf submissions
 * through unmetered.
 */
@Injectable()
export class OnBehalfRateLimit {
  /**
   * TEST-ONLY fail-closed seam (`@internal`). Default `false`; the only way
   * to set it is an explicit `breakBackend()` call from a test. When `true`,
   * `check()` forces the backend-query catch path so the 503 fail-closed
   * behaviour can be exercised without actually taking Postgres down. It is
   * impossible to trigger in production: nothing but `breakBackend()` flips
   * it, and `breakBackend()` is never called by any production code path.
   */
  private simulateBackendFailure = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns whether `repId` is still under the hourly on-behalf cap.
   * Never throws (fail-closed: a backend error becomes `'unavailable'`,
   * never `'ok'`). The caller audits + maps the non-`ok` outcomes.
   */
  async check(repId: string): Promise<RateLimitOutcome> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    try {
      if (this.simulateBackendFailure) {
        // Test seam only (see field doc): simulate the count query failing.
        throw new Error('rate-limit backend unavailable (simulated)');
      }

      const recentCount = await this.prisma.issue.count({
        where: {
          createdById: repId,
          onBehalfOf: true,
          createdAt: { gte: oneHourAgo },
        },
      });

      return recentCount >= env.ON_BEHALF_RATE_LIMIT_PER_HOUR ? 'rate_limited' : 'ok';
    } catch {
      // FAIL CLOSED: any backend error is reported as unavailable so the
      // service rejects with 503 rather than admitting the request.
      return 'unavailable';
    }
  }

  /**
   * @internal TEST-ONLY. Flips the fail-closed seam on so the next `check()`
   * reports `'unavailable'`. There is deliberately no production caller.
   */
  breakBackend(): void {
    this.simulateBackendFailure = true;
  }
}
