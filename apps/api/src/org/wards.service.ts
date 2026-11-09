import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CreateWardInput, UpdateWardInput, WardDTO } from '@pg/types';

import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

import { toWardDTO } from './org.mappers';

/**
 * Ward reads + admin-only mutations. A ward always belongs to a panchayat;
 * `number` is unique within that panchayat (DB `@@unique([panchayatId,
 * number])`). Wards are deactivated (soft `status`), never hard-deleted, so
 * historical grievance/assignment references are preserved. Number changes
 * are audited explicitly (before/after).
 */
@Injectable()
export class WardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Single ward by id (admin detail). 404 if absent. */
  async findDetail(wardId: string): Promise<WardDTO> {
    const ward = await this.prisma.ward.findUnique({ where: { id: wardId } });
    if (!ward) {
      throw new ApiError('ward_not_found', 404, 'errors.wardNotFound');
    }
    return toWardDTO(ward);
  }

  /** Create a ward under `panchayatId` (from the route). Panchayat must exist. */
  async create(
    actorUserId: string,
    panchayatId: string,
    dto: CreateWardInput,
  ): Promise<WardDTO> {
    const panchayat = await this.prisma.panchayat.findUnique({ where: { id: panchayatId } });
    if (!panchayat) {
      throw new ApiError('panchayat_not_found', 404, 'errors.panchayatNotFound');
    }
    try {
      const created = await this.prisma.ward.create({
        data: {
          number: dto.number,
          name: dto.name.trim(),
          nameMl: dto.nameMl.trim(),
          panchayatId,
          status: 'active',
        },
      });
      await this.audit.record({
        actorUserId,
        action: 'ward.created',
        entityType: 'Ward',
        entityId: created.id,
        metadata: { panchayatId, number: created.number, name: created.name },
      });
      return toWardDTO(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Duplicate (panchayatId, number).
        throw new ApiError('ward_number_taken', 409, 'errors.wardNumberTaken');
      }
      throw err;
    }
  }

  /** Update a ward. Number may change (re-checked for uniqueness + audited). 404 if absent. */
  async update(actorUserId: string, wardId: string, dto: UpdateWardInput): Promise<WardDTO> {
    const existing = await this.prisma.ward.findUnique({ where: { id: wardId } });
    if (!existing) {
      throw new ApiError('ward_not_found', 404, 'errors.wardNotFound');
    }
    try {
      const updated = await this.prisma.ward.update({
        where: { id: wardId },
        data: { number: dto.number, name: dto.name.trim(), nameMl: dto.nameMl.trim() },
      });
      await this.audit.record({
        actorUserId,
        action: 'ward.updated',
        entityType: 'Ward',
        entityId: wardId,
        metadata: {
          panchayatId: existing.panchayatId,
          before: { number: existing.number, name: existing.name, nameMl: existing.nameMl },
          after: { number: updated.number, name: updated.name, nameMl: updated.nameMl },
          numberChanged: existing.number !== updated.number,
        },
      });
      return toWardDTO(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ApiError('ward_number_taken', 409, 'errors.wardNumberTaken');
      }
      throw err;
    }
  }

  async deactivate(actorUserId: string, wardId: string): Promise<WardDTO> {
    return this.setStatus(actorUserId, wardId, 'inactive', 'ward.deactivated');
  }

  async reactivate(actorUserId: string, wardId: string): Promise<WardDTO> {
    return this.setStatus(actorUserId, wardId, 'active', 'ward.reactivated');
  }

  private async setStatus(
    actorUserId: string,
    wardId: string,
    status: 'active' | 'inactive',
    action: string,
  ): Promise<WardDTO> {
    const existing = await this.prisma.ward.findUnique({ where: { id: wardId } });
    if (!existing) {
      throw new ApiError('ward_not_found', 404, 'errors.wardNotFound');
    }
    if (existing.status === status) {
      return toWardDTO(existing);
    }
    const updated = await this.prisma.ward.update({ where: { id: wardId }, data: { status } });
    await this.audit.record({
      actorUserId,
      action,
      entityType: 'Ward',
      entityId: wardId,
      metadata: { panchayatId: existing.panchayatId, from: existing.status, to: status },
    });
    return toWardDTO(updated);
  }
}
