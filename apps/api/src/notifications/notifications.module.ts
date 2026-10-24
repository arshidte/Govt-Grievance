import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * `PrismaModule` supplies `PrismaService` (the read methods added in Task
 * 17 use it directly, alongside the pre-existing tx-based write methods),
 * and `AuthModule` supplies `AuthGuard` for `NotificationsController`,
 * registered below. `NotificationsService` remains exported — `IssuesModule`
 * still imports it for the `createForSubmission`/`createForStatusChange`
 * write paths (Tasks 7/10), unaffected by this controller's addition.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
