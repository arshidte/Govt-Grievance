import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreatePanchayatInput,
  PanchayatDetailDTO,
  PanchayatDTO,
  UpdatePanchayatInput,
  WardDTO,
} from '@pg/types';

import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

import { toPanchayatDTO, toWardDTO } from './org.mappers';

/** Normalizes an optional contact field: empty string -> null, else trimmed value. */
function contactOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Panchayat reference reads (citizen wizard + admin) AND the admin-only
 * create/update/(de)activate mutations.
 *
 * Visibility rule: reference reads return ACTIVE panchayats only. The admin
 * management list opts into inactive rows via `includeInactive` (the
 * controller only passes `true` for a verified ADMIN) — so citizens can never
 * see a deactivated panchayat as a selectable option.
 *
 * Deactivation is a soft status flip (`status: 'inactive'`); panchayats are
 * never hard-deleted, and deactivating one does NOT touch its wards, users, or
 * role assignments (those keep their own state and historical references).
 */
@Injectable()
export class PanchayatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(includeInactive: boolean): Promise<PanchayatDTO[]> {
    const panchayats = await this.prisma.panchayat.findMany({
      where: includeInactive ? undefined : { status: 'active' },
      orderBy: { name: 'asc' },
    });
    return panchayats.map(toPanchayatDTO);
  }

  /** Full detail for the admin panel, incl. contact fields and ward counts. 404 if absent. */
  async findDetail(id: string): Promise<PanchayatDetailDTO> {
    const panchayat = await this.prisma.panchayat.findUnique({
      where: { id },
      include: { _count: { select: { wards: true } } },
    });
    if (!panchayat) {
      throw new ApiError('panchayat_not_found', 404, 'errors.panchayatNotFound');
    }
    const activeWardCount = await this.prisma.ward.count({
      where: { panchayatId: id, status: 'active' },
    });
    return {
      ...toPanchayatDTO(panchayat),
      contactPhone: panchayat.contactPhone,
      contactEmail: panchayat.contactEmail,
      wardCount: panchayat._count.wards,
      activeWardCount,
      createdAt: panchayat.createdAt.toISOString(),
    };
  }

  /** Wards of a panchayat. Active-only unless `includeInactive` (admin). */
  async findWards(panchayatId: string, includeInactive: boolean): Promise<WardDTO[]> {
    const wards = await this.prisma.ward.findMany({
      where: { panchayatId, ...(includeInactive ? {} : { status: 'active' }) },
      orderBy: { number: 'asc' },
    });
    return wards.map(toWardDTO);
  }

  async create(actorUserId: string, dto: CreatePanchayatInput): Promise<PanchayatDetailDTO> {
    try {
      const created = await this.prisma.panchayat.create({
        data: {
          code: dto.code.trim(),
          name: dto.name.trim(),
          nameMl: dto.nameMl.trim(),
          contactPhone: contactOrNull(dto.contactPhone),
          contactEmail: contactOrNull(dto.contactEmail),
          status: 'active',
        },
      });
      await this.audit.record({
        actorUserId,
        action: 'panchayat.created',
        entityType: 'Panchayat',
        entityId: created.id,
        metadata: { code: created.code, name: created.name },
      });
      return this.findDetail(created.id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Unique `code` collision.
        throw new ApiError('panchayat_code_taken', 409, 'errors.panchayatCodeTaken');
      }
      throw err;
    }
  }

  /** Update mutable fields. `code` is immutable and never read here. 404 if absent. */
  async update(
    actorUserId: string,
    id: string,
    dto: UpdatePanchayatInput,
  ): Promise<PanchayatDetailDTO> {
    const existing = await this.prisma.panchayat.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError('panchayat_not_found', 404, 'errors.panchayatNotFound');
    }
    const nextContactPhone = contactOrNull(dto.contactPhone);
    const nextContactEmail = contactOrNull(dto.contactEmail);
    await this.prisma.panchayat.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        nameMl: dto.nameMl.trim(),
        contactPhone: nextContactPhone,
        contactEmail: nextContactEmail,
      },
    });
    await this.audit.record({
      actorUserId,
      action: 'panchayat.updated',
      entityType: 'Panchayat',
      entityId: id,
      metadata: {
        before: { name: existing.name, nameMl: existing.nameMl },
        after: { name: dto.name.trim(), nameMl: dto.nameMl.trim() },
      },
    });
    return this.findDetail(id);
  }

  /** Deactivate (soft). Idempotent-safe; wards/users/assignments untouched. */
  async deactivate(actorUserId: string, id: string): Promise<PanchayatDetailDTO> {
    return this.setStatus(actorUserId, id, 'inactive', 'panchayat.deactivated');
  }

  /** Reactivate a previously-deactivated panchayat. */
  async reactivate(actorUserId: string, id: string): Promise<PanchayatDetailDTO> {
    return this.setStatus(actorUserId, id, 'active', 'panchayat.reactivated');
  }

  private async setStatus(
    actorUserId: string,
    id: string,
    status: 'active' | 'inactive',
    action: string,
  ): Promise<PanchayatDetailDTO> {
    const existing = await this.prisma.panchayat.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError('panchayat_not_found', 404, 'errors.panchayatNotFound');
    }
    if (existing.status !== status) {
      await this.prisma.panchayat.update({ where: { id }, data: { status } });
      await this.audit.record({
        actorUserId,
        action,
        entityType: 'Panchayat',
        entityId: id,
        metadata: { from: existing.status, to: status },
      });
    }
    return this.findDetail(id);
  }
}
