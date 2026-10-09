import { Injectable } from '@nestjs/common';
import type { PanchayatDTO, WardDTO } from '@pg/types';

import { PrismaService } from '../prisma/prisma.service';

/** Read-only access to panchayats and their wards. */
@Injectable()
export class PanchayatsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PanchayatDTO[]> {
    const panchayats = await this.prisma.panchayat.findMany({
      orderBy: { name: 'asc' },
    });

    return panchayats.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      nameMl: p.nameMl,
      status: p.status,
    }));
  }

  async findWards(panchayatId: string): Promise<WardDTO[]> {
    const wards = await this.prisma.ward.findMany({
      where: { panchayatId },
      orderBy: { number: 'asc' },
    });

    return wards.map((w) => ({
      id: w.id,
      number: w.number,
      name: w.name,
      nameMl: w.nameMl,
      panchayatId: w.panchayatId,
    }));
  }
}
