import { Module } from '@nestjs/common';

import { SmsModule } from '../sms/sms.module';
import { OtpService } from './otp.service';

/**
 * Owns phone-OTP authentication. `OtpService` depends on the global
 * `PrismaService` (see `PrismaModule`, `@Global()`) and on the active
 * `SmsProvider` (via `SMS_PROVIDER`, provided by `SmsModule`).
 */
@Module({
  imports: [SmsModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class AuthModule {}
