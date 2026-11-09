import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { updateWardSchema, type UpdateWardInput, type WardDTO } from '@pg/types';

import { Roles } from '../access/roles.decorator';
import { RbacGuard } from '../access/rbac.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WardsService } from './wards.service';

/**
 * Ward item operations by ward id (admin-only management). Ward LISTING and
 * CREATE are parent-scoped and live on `PanchayatsController`
 * (`GET`/`POST /panchayats/:id/wards`). Every route here is `@Roles('ADMIN')`
 * via the activated `RbacGuard` — non-admins get a uniform 403.
 */
@Controller('wards')
@UseGuards(AuthGuard, RbacGuard)
export class WardsController {
  constructor(private readonly wards: WardsService) {}

  @Get(':id')
  @Roles('ADMIN')
  async findOne(@Param('id') id: string): Promise<WardDTO> {
    return this.wards.findDetail(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  async update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWardSchema)) dto: UpdateWardInput,
  ): Promise<WardDTO> {
    return this.wards.update(user.id, id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @Roles('ADMIN')
  async deactivate(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<WardDTO> {
    return this.wards.deactivate(user.id, id);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @Roles('ADMIN')
  async reactivate(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<WardDTO> {
    return this.wards.reactivate(user.id, id);
  }
}
