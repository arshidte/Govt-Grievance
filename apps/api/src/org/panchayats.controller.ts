import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { PanchayatDTO, WardDTO } from '@pg/types';

import { AuthGuard } from '../auth/auth.guard';
import { PanchayatsService } from './panchayats.service';

/**
 * `GET /panchayats` and `GET /panchayats/:id/wards` both require a valid
 * session (`AuthGuard`) — these are staff/citizen-authenticated reference
 * lookups, not public data.
 */
@Controller('panchayats')
@UseGuards(AuthGuard)
export class PanchayatsController {
  constructor(private readonly panchayats: PanchayatsService) {}

  @Get()
  async findAll(): Promise<PanchayatDTO[]> {
    return this.panchayats.findAll();
  }

  @Get(':id/wards')
  async findWards(@Param('id') id: string): Promise<WardDTO[]> {
    return this.panchayats.findWards(id);
  }
}
