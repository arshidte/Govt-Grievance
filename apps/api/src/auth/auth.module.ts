import { Module } from '@nestjs/common';

import { SmsModule } from '../sms/sms.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

/**
 * Owns phone-OTP authentication and DB-backed login sessions, and exposes
 * them over HTTP via `AuthController` (`/api/v1/auth/*`). Both `OtpService`
 * and `SessionService` depend on the global `PrismaService` (see
 * `PrismaModule`, `@Global()`); `OtpService` additionally uses the active
 * `SmsProvider` (via `SMS_PROVIDER`, provided by `SmsModule`). `AuthGuard` is
 * exported so other feature modules can `@UseGuards(AuthGuard)` on their own
 * controllers without re-importing `SmsModule`.
 */
@Module({
  imports: [SmsModule],
  controllers: [AuthController],
  providers: [OtpService, SessionService, AuthService, AuthGuard],
  exports: [OtpService, SessionService, AuthGuard],
})
export class AuthModule {}
