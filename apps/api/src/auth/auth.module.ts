import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { Msg91Module } from './msg91/msg91.module';
import { SessionService } from './session.service';

/**
 * Owns MSG91-widget authentication and DB-backed login sessions, exposed over
 * HTTP via `AuthController` (`/api/v1/auth/*`). `SessionService` depends on the
 * global `PrismaService` (see `PrismaModule`, `@Global()`); `Msg91Module`
 * supplies the `MSG91_VERIFIER` trust boundary that `AuthController` uses to
 * validate widget access tokens. `AuditModule` supplies `AuditService` for the
 * auth audit events (`otp.verified`/`otp.failed`/`session.created`/
 * `session.revoked`). `AuthGuard` and `AuthService` are exported so other
 * feature modules can `@UseGuards(AuthGuard)` and reuse `toMeResponse`;
 * `Msg91Module` is re-exported so the staff-onboarding module can reuse the
 * same verifier for admin-driven onboarding verification.
 */
@Module({
  imports: [Msg91Module, AuditModule],
  controllers: [AuthController],
  providers: [SessionService, AuthService, AuthGuard],
  exports: [SessionService, AuthService, AuthGuard, Msg91Module],
})
export class AuthModule {}
