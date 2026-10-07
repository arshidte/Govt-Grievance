import { Module } from '@nestjs/common';

import { env } from '../config/env';
import { MockSmsProvider } from './mock-sms.provider';
import { SMS_PROVIDER, type SmsProvider } from './sms-provider.interface';

/**
 * Selects and provides the active `SmsProvider` implementation under the
 * `SMS_PROVIDER` DI token, based on `env.SMS_PROVIDER`. Only `mock` exists
 * today; adding a real provider later (e.g. `twilio`) means adding a case
 * to the factory below and a new class in `src/sms/` — no change to
 * consumers, which only ever depend on the `SMS_PROVIDER` token.
 */
@Module({
  providers: [
    MockSmsProvider,
    {
      provide: SMS_PROVIDER,
      useFactory: (mock: MockSmsProvider): SmsProvider => {
        switch (env.SMS_PROVIDER) {
          case 'mock':
            return mock;
          default:
            throw new Error(`Unknown SMS_PROVIDER: ${env.SMS_PROVIDER}`);
        }
      },
      inject: [MockSmsProvider],
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
