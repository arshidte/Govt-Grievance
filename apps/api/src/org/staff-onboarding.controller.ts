import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OnboardingStatus } from '@prisma/client';
import {
  initiateOnboardingSchema,
  verifyOnboardingSchema,
  type InitiateOnboardingInput,
  type StaffOnboardingDTO,
  type VerifyOnboardingInput,
} from '@pg/types';

import { Roles } from '../access/roles.decorator';
import { RbacGuard } from '../access/rbac.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { StaffOnboardingService } from './staff-onboarding.service';

/** Narrows an arbitrary query string to a valid `OnboardingStatus`, else undefined. */
function parseStatus(value?: string): OnboardingStatus | undefined {
  return value && (Object.values(OnboardingStatus) as string[]).includes(value)
    ? (value as OnboardingStatus)
    : undefined;
}

/**
 * Admin-only staff onboarding endpoints. Every route is `@Roles('ADMIN')` via
 * the activated `RbacGuard` — staff can never initiate or elevate their own
 * onboarding. Scope ids and role values are re-validated server-side (never
 * trusted from the client); OTP verification activates only the intended
 * assignments.
 */
@Controller('onboarding')
@UseGuards(AuthGuard, RbacGuard)
export class StaffOnboardingController {
  constructor(private readonly onboarding: StaffOnboardingService) {}

  @Post()
  @Roles('ADMIN')
  async initiate(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(initiateOnboardingSchema)) dto: InitiateOnboardingInput,
  ): Promise<StaffOnboardingDTO> {
    return this.onboarding.initiate(user.id, dto);
  }

  @Get()
  @Roles('ADMIN')
  async list(@Query('status') status?: string): Promise<StaffOnboardingDTO[]> {
    return this.onboarding.list(parseStatus(status));
  }

  @Get(':id')
  @Roles('ADMIN')
  async get(@Param('id') id: string): Promise<StaffOnboardingDTO> {
    return this.onboarding.get(id);
  }

  @Post(':id/resend')
  @HttpCode(200)
  @Roles('ADMIN')
  async resend(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<StaffOnboardingDTO> {
    return this.onboarding.resend(user.id, id);
  }

  @Post(':id/verify')
  @HttpCode(200)
  @Roles('ADMIN')
  async verify(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(verifyOnboardingSchema)) dto: VerifyOnboardingInput,
  ): Promise<StaffOnboardingDTO> {
    return this.onboarding.verify(user.id, id, dto.accessToken);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('ADMIN')
  async cancel(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<StaffOnboardingDTO> {
    return this.onboarding.cancel(user.id, id);
  }
}
