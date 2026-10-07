import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from './auth.guard';

/**
 * Injects the authenticated user attached by `AuthGuard` (`req.user`) into a
 * controller handler parameter. Must only be used on routes guarded by
 * `AuthGuard` — on an unguarded route `req.user` is undefined.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedRequest['user'] => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
