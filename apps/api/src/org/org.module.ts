import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PanchayatsController } from './panchayats.controller';
import { PanchayatsService } from './panchayats.service';

/**
 * Owns read-only organizational reference data (panchayats, wards). Both
 * routes require `AuthGuard` (imported via `AuthModule`, which exports it).
 * `PrismaService` comes from the global `PrismaModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [PanchayatsController],
  providers: [PanchayatsService],
})
export class OrgModule {}
