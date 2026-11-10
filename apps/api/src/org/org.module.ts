import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PanchayatsController } from './panchayats.controller';
import { PanchayatsService } from './panchayats.service';
import { StaffAssignmentsController } from './staff-assignments.controller';
import { StaffAssignmentsService } from './staff-assignments.service';
import { StaffOnboardingController } from './staff-onboarding.controller';
import { StaffOnboardingService } from './staff-onboarding.service';
import { WardsController } from './wards.controller';
import { WardsService } from './wards.service';

/**
 * Organizational management: panchayats, wards, and staff (representative /
 * coordinator) role assignments.
 *
 * Reference reads (panchayat/ward lists for the citizen wizard) require only
 * `AuthGuard` (from `AuthModule`). Every MUTATION is Global-Admin-only,
 * enforced by `RbacGuard` + `@Roles('ADMIN')` — hence `AccessModule` (exports
 * `RbacGuard` + `AccessControlService`). `AuditModule` provides the
 * `AuditService` used to record every administrative mutation. `PrismaService`
 * comes from the global `PrismaModule`.
 */
@Module({
  imports: [AuthModule, AccessModule, AuditModule],
  controllers: [
    PanchayatsController,
    WardsController,
    StaffAssignmentsController,
    StaffOnboardingController,
  ],
  providers: [PanchayatsService, WardsService, StaffAssignmentsService, StaffOnboardingService],
})
export class OrgModule {}
