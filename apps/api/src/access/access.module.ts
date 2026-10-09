import { Module } from '@nestjs/common';

import { AccessControlService } from './access-control.service';
import { RbacGuard } from './rbac.guard';

/**
 * Owns the scoped-RBAC authorization boundary: `AccessControlService` (the
 * pure role/scope decision engine) and `RbacGuard` (the Nest guard that
 * wires request metadata — `@Roles`/`@ScopeFrom` — and `req.user`, set by
 * `AuthGuard`, into that engine). `PrismaService` is not provided here: it
 * is supplied by the global `PrismaModule`, which `RbacGuard` depends on
 * directly for ward->panchayat scope resolution.
 *
 * Other feature modules should import `AccessModule` and apply
 * `@UseGuards(AuthGuard, RbacGuard)` on their controllers/routes (AuthGuard
 * first, so `req.user` exists before `RbacGuard` runs).
 */
@Module({
  providers: [AccessControlService, RbacGuard],
  exports: [AccessControlService, RbacGuard],
})
export class AccessModule {}
