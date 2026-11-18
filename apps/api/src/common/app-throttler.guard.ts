import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import { env } from '../config/env';

import { ApiError } from './api-error';
import { resolveClientContext } from './client-context';

/**
 * Global `ThrottlerGuard` (registered as `APP_GUARD` in `app.module.ts`)
 * that throws the app's own `ApiError` shape on a throttle breach instead
 * of Nest's default `ThrottlerException`.
 *
 * `ApiError('rate_limited', 429, 'auth.tooMany')` is handled uniformly by
 * `AllExceptionsFilter`, producing
 * `429 { error: { code: 'rate_limited', messageKey: 'auth.tooMany' } }` —
 * the EXACT same code/messageKey `OtpService.request` already throws for
 * its own per-phone hourly limit (see Task 9). This is deliberate: a client
 * cannot (and should not need to) distinguish "too many requests from your
 * IP" from "too many OTPs for this phone" — both are "slow down."
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /**
   * Buckets are keyed on the END USER's ip (BFF-asserted, secret-verified —
   * see `resolveClientContext`), not the socket ip: behind the BFF + platform
   * proxy the socket ip is the same for everyone, which would turn every
   * per-IP limit into a platform-wide one. The base implementation is reused
   * so its IPv6 subnet normalization still applies to the resolved ip.
   */
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const { ip } = resolveClientContext(
      req as unknown as Parameters<typeof resolveClientContext>[0],
      env.BFF_SHARED_SECRET,
    );
    return super.getTracker({ ip: ip ?? (req.ip as string | undefined) });
  }

  protected override async throwThrottlingException(): Promise<void> {
    throw new ApiError('rate_limited', 429, 'auth.tooMany');
  }
}
