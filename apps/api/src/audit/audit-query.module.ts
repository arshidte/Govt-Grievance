import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';

/**
 * Hosts the READ-only audit-log viewer API (M4A).
 *
 * Kept separate from the write `AuditModule` on purpose: `AuthModule` already
 * imports `AuditModule` (for `AuditService`), so adding `AuthModule` to
 * `AuditModule` for the guards would create a cycle. This module imports
 * `AuthModule` (`AuthGuard`) + `AccessModule` (`RbacGuard`) and owns the
 * read controller + query service; the write side is untouched. `PrismaService`
 * comes from the global `PrismaModule`.
 */
@Module({
  imports: [AuthModule, AccessModule],
  controllers: [AuditController],
  providers: [AuditQueryService],
})
export class AuditQueryModule {}
