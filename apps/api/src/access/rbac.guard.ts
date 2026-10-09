import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@pg/types';

import type { AuthenticatedRequest } from '../auth/auth.guard';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService, type ResourceScope } from './access-control.service';
import { ROLES_KEY } from './roles.decorator';
import { SCOPE_KEY, type ScopeDescriptor } from './scope';

/** Uniform denial: never discloses WHY (wrong role vs. wrong scope vs. no assignment at all). */
function forbiddenError(): ApiError {
  return new ApiError('forbidden', 403, 'states.forbidden');
}

/**
 * Enforces scoped RBAC on routes decorated with `@Roles(...)` (and
 * optionally `@ScopeFrom(...)`), on top of `AuthGuard` (which must run
 * first and attach `req.user`).
 *
 * Composition with `AuthGuard`: apply both, `AuthGuard` first —
 * `@UseGuards(AuthGuard, RbacGuard)`. `RbacGuard` trusts `req.user` exactly
 * as `AuthGuard` left it (a `User` with `roleAssignments`) and does not
 * re-authenticate. If `req.user` is missing (e.g. `RbacGuard` applied
 * without `AuthGuard`), this guard denies rather than throwing a confusing
 * error — see "fails closed" below.
 *
 * Scope resolution (see Task 12 brief, approach (a) in
 * `access-control.service.ts`): `AccessControlService.can()` is pure and
 * takes an already-resolved `{ panchayatId?, wardId? }`. This guard is
 * where the one DB lookup lives: when the route's `@ScopeFrom` descriptor
 * targets `wardId`, the guard resolves that ward's `panchayatId` via
 * Prisma and includes BOTH ids in the scope passed to `can()` — this is
 * what lets a COORDINATOR@P1 be allowed on a ward within P1 (pinned test 5)
 * without `AccessControlService` itself touching the database.
 *
 * Fails closed: every ambiguous case below (no `req.user`, no `@Roles`
 * metadata misconfigured, declared scope key missing from the request,
 * referenced ward not found) is treated as a DENY (403), never an allow.
 * ADMIN is the only role that bypasses scope resolution entirely (it is
 * allowed for any scope, including a completely unscoped route).
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessControlService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles declared: this guard imposes no restriction on this route.
    if (!roles || roles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    // Fail closed: RbacGuard without an authenticated user is a
    // misconfiguration (missing AuthGuard upstream), never an allow.
    if (!user) {
      throw forbiddenError();
    }

    // ADMIN bypasses both role-list and scope checks entirely.
    if (this.access.hasRole(user, 'ADMIN')) {
      return true;
    }

    if (!roles.some((role) => this.access.hasRole(user, role))) {
      throw forbiddenError();
    }

    const scope = await this.resolveScope(context, request);

    if (scope === null) {
      // Ambiguous/unresolvable scope (missing key, ward not found, etc.) -> deny.
      throw forbiddenError();
    }

    if (!this.access.can(user, `${context.getClass().name}.${context.getHandler().name}`, scope)) {
      throw forbiddenError();
    }

    return true;
  }

  /**
   * Resolves the route's declared `@ScopeFrom` descriptor into a
   * `ResourceScope`. Returns `null` (never throws) on anything ambiguous —
   * the caller treats `null` as a deny.
   *
   * A route with no `@ScopeFrom` resolves to the empty scope `{}`, which
   * only ADMIN (already handled above) or an unscoped `hasRole` match would
   * satisfy — COORDINATOR/REPRESENTATIVE always need a declared scope to be
   * granted access.
   */
  private async resolveScope(
    context: ExecutionContext,
    request: AuthenticatedRequest,
  ): Promise<ResourceScope | null> {
    const descriptor = this.reflector.getAllAndOverride<ScopeDescriptor | undefined>(SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!descriptor) {
      return {};
    }

    const source = descriptor.source === 'param' ? request.params : request.query;
    const value = (source as Record<string, unknown> | undefined)?.[descriptor.key];

    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }

    if (descriptor.target === 'panchayatId') {
      return { panchayatId: value };
    }

    // target === 'wardId': resolve the ward's panchayat so a
    // panchayat-scoped COORDINATOR assignment can match a ward resource.
    const ward = await this.prisma.ward.findUnique({
      where: { id: value },
      select: { panchayatId: true },
    });

    if (!ward) {
      return null;
    }

    return { wardId: value, panchayatId: ward.panchayatId };
  }
}
