import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { ApiError } from '../common/api-error';
import { SESSION_COOKIE_NAME } from './cookie.util';
import { SessionService } from './session.service';

/** Request augmented with the authenticated user (see `AuthGuard`). */
export interface AuthenticatedRequest extends Request {
  user: Awaited<ReturnType<SessionService['validate']>>;
}

/**
 * Protects routes behind a valid session cookie.
 *
 * Reads the session token from the `SESSION_COOKIE_NAME` cookie and resolves
 * it via `SessionService.validate`, which throws the uniform `unauthenticated`
 * `ApiError` (401) for every failure mode (missing/expired/revoked session) —
 * this guard deliberately does not add its own distinct error for "no cookie
 * at all" so the 401 response never discloses which case occurred. On
 * success, attaches the resolved user (with `roleAssignments`) to `req.user`
 * for `@CurrentUser()` and downstream handlers to read.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

    if (!token) {
      throw new ApiError('unauthenticated', 401, 'states.forbidden');
    }

    request.user = await this.sessions.validate(token);
    return true;
  }
}
