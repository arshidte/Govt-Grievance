import { Module } from '@nestjs/common';

import { SmsModule } from '../sms/sms.module';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

/**
 * Owns phone-OTP authentication and DB-backed login sessions. Both services
 * depend on the global `PrismaService` (see `PrismaModule`, `@Global()`);
 * `OtpService` additionally uses the active `SmsProvider` (via `SMS_PROVIDER`,
 * provided by `SmsModule`).
 */
@Module({
  imports: [SmsModule],
  providers: [OtpService, SessionService],
  exports: [OtpService, SessionService],
})
export class AuthModule {}
