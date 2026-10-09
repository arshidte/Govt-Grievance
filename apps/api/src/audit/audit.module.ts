import { Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/**
 * Owns the audit trail (`AuditService`, backed by the `AuditLog` table via
 * the global `PrismaService`). Other feature modules import `AuditModule`
 * and inject `AuditService` to record side-effect audit rows (e.g.
 * `AuthModule` for `otp.requested`/`otp.verified`/`otp.failed`/
 * `session.created`/`session.revoked`).
 */
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
