import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import { ApiError } from './api-error';

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
  protected override async throwThrottlingException(): Promise<void> {
    throw new ApiError('rate_limited', 429, 'auth.tooMany');
  }
}
