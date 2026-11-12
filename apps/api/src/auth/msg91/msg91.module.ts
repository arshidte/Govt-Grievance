import { Module } from '@nestjs/common';

import { env } from '../../config/env';

import { MockMsg91Verifier } from './mock-msg91.verifier';
import { Msg91HttpVerifier } from './msg91-http.verifier';
import { MSG91_VERIFIER, type Msg91Verifier } from './msg91-verifier.interface';

/**
 * Binds the active `Msg91Verifier` under `MSG91_VERIFIER`, selected by
 * `env.MSG91_PROVIDER` ('live' → real HTTP verifier; anything else → the
 * dev/test mock). Mirrors `SmsModule`'s provider selection. `env.ts` prevents
 * the mock from being selected in production.
 */
@Module({
  providers: [
    MockMsg91Verifier,
    Msg91HttpVerifier,
    {
      provide: MSG91_VERIFIER,
      useFactory: (mock: MockMsg91Verifier, http: Msg91HttpVerifier): Msg91Verifier =>
        env.MSG91_PROVIDER === 'live' ? http : mock,
      inject: [MockMsg91Verifier, Msg91HttpVerifier],
    },
  ],
  exports: [MSG91_VERIFIER],
})
export class Msg91Module {}
