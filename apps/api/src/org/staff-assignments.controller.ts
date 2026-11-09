import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  assignCoordinatorSchema,
  assignRepresentativeSchema,
  staffSearchSchema,
  type AssignCoordinatorInput,
  type AssignRepresentativeInput,
  type CoordinatorAssignmentDTO,
  type CoordinatorDTO,
  type RepresentativeAssignmentDTO,
  type RepresentativeDTO,
  type StaffSearchInput,
  type StaffUserDTO,
} from '@pg/types';

import { Roles } from '../access/roles.decorator';
import { RbacGuard } from '../access/rbac.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { StaffAssignmentsService } from './staff-assignments.service';

/**
 * Admin-only management of Representative (ward) and Coordinator (panchayat)
 * role assignments, plus the phone-search used to pick an existing user to
 * assign. Every route is `@Roles('ADMIN')` via the activated `RbacGuard`;
 * non-admins (incl. representatives/coordinators themselves) get a uniform
 * 403, so a representative can never reach these management endpoints.
 */
@Controller()
@UseGuards(AuthGuard, RbacGuard)
export class StaffAssignmentsController {
  constructor(private readonly staff: StaffAssignmentsService) {}

  /** Find an existing user by exact phone (null when none). */
  @Get('staff/search')
  @Roles('ADMIN')
  async search(
    @Query(new ZodValidationPipe(staffSearchSchema)) query: StaffSearchInput,
  ): Promise<StaffUserDTO | null> {
    return this.staff.searchByPhone(query.phone);
  }

  // ---- Representatives ---------------------------------------------------

  @Get('representatives')
  @Roles('ADMIN')
  async listRepresentatives(): Promise<RepresentativeDTO[]> {
    return this.staff.listRepresentatives();
  }

  @Post('representatives')
  @Roles('ADMIN')
  async assignRepresentative(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(assignRepresentativeSchema)) dto: AssignRepresentativeInput,
  ): Promise<RepresentativeAssignmentDTO> {
    return this.staff.assignRepresentative(user.id, dto.userId, dto.wardId);
  }

  @Post('representatives/:assignmentId/revoke')
  @HttpCode(200)
  @Roles('ADMIN')
  async revokeRepresentative(
    @CurrentUser() user: SessionUser,
    @Param('assignmentId') assignmentId: string,
  ): Promise<{ revoked: true }> {
    await this.staff.revokeRepresentative(user.id, assignmentId);
    return { revoked: true };
  }

  // ---- Coordinators ------------------------------------------------------

  @Get('coordinators')
  @Roles('ADMIN')
  async listCoordinators(): Promise<CoordinatorDTO[]> {
    return this.staff.listCoordinators();
  }

  @Post('coordinators')
  @Roles('ADMIN')
  async assignCoordinator(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(assignCoordinatorSchema)) dto: AssignCoordinatorInput,
  ): Promise<CoordinatorAssignmentDTO> {
    return this.staff.assignCoordinator(user.id, dto.userId, dto.panchayatId);
  }

  @Post('coordinators/:assignmentId/revoke')
  @HttpCode(200)
  @Roles('ADMIN')
  async revokeCoordinator(
    @CurrentUser() user: SessionUser,
    @Param('assignmentId') assignmentId: string,
  ): Promise<{ revoked: true }> {
    await this.staff.revokeCoordinator(user.id, assignmentId);
    return { revoked: true };
  }
}
