import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { auditLogQuerySchema, type AuditLogPageDTO, type AuditLogQuery } from '@pg/types';

import { Roles } from '../access/roles.decorator';
import { RbacGuard } from '../access/rbac.guard';
import { AuthGuard } from '../auth/auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuditQueryService } from './audit-query.service';

/**
 * Read-only audit-log viewer API (M4A). Global-Admin only — `AuthGuard` +
 * `RbacGuard` with `@Roles('ADMIN')` (unauthenticated → 401, non-admin → 403).
 * Query params are validated by the shared Zod schema (422 on invalid
 * dates/limits/`from > to`); the service rejects a malformed cursor the same
 * way. No write/update/delete/export routes exist here by design.
 */
@Controller('audit-logs')
@UseGuards(AuthGuard, RbacGuard)
export class AuditController {
  constructor(private readonly auditQuery: AuditQueryService) {}

  @Get()
  @Roles('ADMIN')
  async list(
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<AuditLogPageDTO> {
    return this.auditQuery.list(query);
  }
}
