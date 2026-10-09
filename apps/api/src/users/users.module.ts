import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Owns the authenticated user's own profile (`PATCH /users/me`).
 * `AuthModule` supplies `AuthGuard` and `AuthService` (for `toMeResponse`);
 * `PrismaService` comes from the global `PrismaModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
