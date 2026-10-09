import { Controller, Get, Inject, NotFoundException, Query } from '@nestjs/common';

import { env } from '../config/env';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms-provider.interface';
import { isDevEndpointEnabled } from './dev-guard';

/** Narrow shape for the mock provider's dev-only extra method (duck-typed, since the DI token is typed as the base `SmsProvider` interface). */
interface LastCodeCapable {
  lastCodeFor(phone: string): string | undefined;
}

function hasLastCodeFor(provider: SmsProvider): provider is SmsProvider & LastCodeCapable {
  return typeof (provider as Partial<LastCodeCapable>).lastCodeFor === 'function';
}

/**
 * Dev/e2e-only endpoint: `GET /api/v1/dev/last-otp?phone=...` returns the
 * most recent OTP code sent to `phone`, so a human or an e2e test can log
 * in without a real SMS gateway.
 *
 * THIS ENDPOINT EXPOSES OTP CODES BY DESIGN. Its production-safety rests on
 * two independent fences (belt-and-suspenders):
 *   1. `DevModule` is only imported into `AppModule` when
 *      `env.NODE_ENV !== 'production'` (see `src/app.module.ts`) — in a
 *      real production boot this controller/route does not exist at all.
 *   2. Even if that wiring were ever bypassed, THIS handler re-checks
 *      `isDevEndpointEnabled(env.NODE_ENV)` itself and returns a plain 404
 *      (never 403 — a 403 would confirm the route exists; a 404 reveals
 *      nothing) when it's false.
 *
 * It only works against the mock SMS provider (duck-typed via
 * `lastCodeFor`) — if a real provider is ever configured, there is no
 * in-memory code to return, so this 404s too. The code is returned in the
 * response body ONLY; it is never written to any log.
 */
@Controller('dev')
export class DevController {
  constructor(@Inject(SMS_PROVIDER) private readonly sms: SmsProvider) {}

  @Get('last-otp')
  lastOtp(@Query('phone') phone: string | undefined): { code: string } {
    if (!isDevEndpointEnabled(env.NODE_ENV)) {
      throw new NotFoundException();
    }

    if (!phone || !hasLastCodeFor(this.sms)) {
      throw new NotFoundException();
    }

    const code = this.sms.lastCodeFor(phone);
    if (!code) {
      throw new NotFoundException();
    }

    return { code };
  }
}
