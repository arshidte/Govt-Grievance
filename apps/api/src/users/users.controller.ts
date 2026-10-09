import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import { updateProfileSchema, type MeResponse, type UpdateProfileInput } from '@pg/types';

import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

/**
 * `PATCH /users/me` requires a valid session (`AuthGuard`) and updates ONLY
 * the session user's own row — the target id comes from `@CurrentUser()`
 * (set by `AuthGuard` from the session), never from the request body or a
 * route param, so there is no way for this endpoint to mutate another
 * user's profile.
 */
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Patch('me')
  async updateMe(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ): Promise<MeResponse> {
    const updated = await this.users.updateProfile(user.id, body);
    return this.auth.toMeResponse(updated);
  }
}
