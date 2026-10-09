import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
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
 * `SmsProvider` (via `SMS_PROVIDER`, provided by `SmsModule`). `AuditModule`
 * supplies `AuditService`, which `AuthController` injects to record the five
 * auth audit events (`otp.requested`/`otp.verified`/`otp.failed`/
 * `session.created`/`session.revoked`) — see Task 13. `AuthGuard` is
 * exported so other feature modules can `@UseGuards(AuthGuard)` on their own
 * controllers without re-importing `SmsModule`. `AuthService` is exported so
 * those same feature modules can reuse `toMeResponse` to serialize a
 * `MeResponse` (e.g. `UsersController` after a profile update) rather than
 * re-deriving that DTO shape (Task 14).
 */
@Module({
  imports: [SmsModule, AuditModule],
  controllers: [AuthController],
  providers: [OtpService, SessionService, AuthService, AuthGuard],
  exports: [OtpService, SessionService, AuthService, AuthGuard],
})
export class AuthModule {}
