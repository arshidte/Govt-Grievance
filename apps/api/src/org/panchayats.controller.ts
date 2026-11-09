import { Body, Controller, Get, HttpCode, Param, Post, Patch, Query, UseGuards } from '@nestjs/common';
import {
  createPanchayatSchema,
  createWardSchema,
  updatePanchayatSchema,
  type CreatePanchayatInput,
  type CreateWardInput,
  type PanchayatDetailDTO,
  type PanchayatDTO,
  type UpdatePanchayatInput,
  type WardDTO,
} from '@pg/types';

import { AccessControlService } from '../access/access-control.service';
import { Roles } from '../access/roles.decorator';
import { RbacGuard } from '../access/rbac.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PanchayatsService } from './panchayats.service';
import { WardsService } from './wards.service';

/**
 * Panchayat reference reads + admin-only management.
 *
 * Guards: `AuthGuard` (valid session) + `RbacGuard`. Reads carry no `@Roles`,
 * so `RbacGuard` imposes no restriction — citizens/staff may list ACTIVE
 * panchayats and a panchayat's ACTIVE wards (the submission wizard depends on
 * this). Every MUTATION (and the richer management detail) is `@Roles('ADMIN')`
 * — Global-Admin only; non-admins get a uniform 403. `includeInactive` is
 * honored ONLY for an ADMIN caller, so inactive panchayats/wards never leak to
 * citizens as selectable options.
 */
@Controller('panchayats')
@UseGuards(AuthGuard, RbacGuard)
export class PanchayatsController {
  constructor(
    private readonly panchayats: PanchayatsService,
    private readonly wards: WardsService,
    private readonly access: AccessControlService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: SessionUser,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<PanchayatDTO[]> {
    return this.panchayats.findAll(this.wantsInactive(user, includeInactive));
  }

  @Get(':id')
  @Roles('ADMIN')
  async findOne(@Param('id') id: string): Promise<PanchayatDetailDTO> {
    return this.panchayats.findDetail(id);
  }

  @Get(':id/wards')
  async findWards(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<WardDTO[]> {
    return this.panchayats.findWards(id, this.wantsInactive(user, includeInactive));
  }

  /** Create a ward under this panchayat (nested create; admin only). */
  @Post(':id/wards')
  @Roles('ADMIN')
  async createWard(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createWardSchema)) dto: CreateWardInput,
  ): Promise<WardDTO> {
    return this.wards.create(user.id, id, dto);
  }

  @Post()
  @Roles('ADMIN')
  async create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createPanchayatSchema)) dto: CreatePanchayatInput,
  ): Promise<PanchayatDetailDTO> {
    return this.panchayats.create(user.id, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePanchayatSchema)) dto: UpdatePanchayatInput,
  ): Promise<PanchayatDetailDTO> {
    return this.panchayats.update(user.id, id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Roles('ADMIN')
  async deactivate(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PanchayatDetailDTO> {
    return this.panchayats.deactivate(user.id, id);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @Roles('ADMIN')
  async reactivate(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<PanchayatDetailDTO> {
    return this.panchayats.reactivate(user.id, id);
  }

  /** Inactive rows are visible only when an ADMIN explicitly asks for them. */
  private wantsInactive(user: SessionUser, includeInactive?: string): boolean {
    return includeInactive === 'true' && this.access.hasRole(user, 'ADMIN');
  }
}
