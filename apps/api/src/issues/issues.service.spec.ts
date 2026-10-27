import type { CreateIssueInput } from '@pg/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Imported for its side effect: loads the root `.env` (DATABASE_URL etc.)
// before PrismaService is constructed, matching the pattern used by other
// DB-backed specs (see auth/otp.service.spec.ts, issues/issue-reference.service.spec.ts).
import '../config/env';
import { AccessControlService } from '../access/access-control.service';
import type { SessionUser } from '../auth/session.service';
import { ApiError } from '../common/api-error';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

import { IssueReferenceService } from './issue-reference.service';
import { IssueTransitionService } from './issue-transition.service';
import { IssuesService } from './issues.service';

let counter = 0;

/** Generates a fresh, collision-free phone number for each seeded user. */
function freshPhone(): string {
  counter += 1;
  const suffix = `${Date.now()}${counter}`.slice(-9).padStart(9, '0');
  return `+91${suffix}`;
}

describe('IssuesService', () => {
  const prisma = new PrismaService();
  const idempotency = new IdempotencyService(prisma);
  const notifications = new NotificationsService();
  const issueReference = new IssueReferenceService(prisma);
  const accessControl = new AccessControlService();
  const transitions = new IssueTransitionService(prisma, notifications);
  const service = new IssuesService(prisma, issueReference, idempotency, notifications, accessControl, transitions);

  // Shared seed fixtures, created once for the whole suite.
  let citizen: SessionUser;
  let category: { id: string };
  let subcategory: { id: string };
  let foreignCategory: { id: string };
  let foreignSubcategory: { id: string };
  let panchayat: { id: string };
  let ward: { id: string };
  let otherPanchayat: { id: string };
  let otherPanchayatWard: { id: string };
  let valid: CreateIssueInput;

  beforeAll(async () => {
    counter += 1;
    const suffix = `${Date.now()}${counter}`;

    const citizenRow = await prisma.user.create({
      data: { phone: freshPhone(), fullName: 'Test Citizen' },
    });
    citizen = { ...citizenRow, roleAssignments: [] };

    category = await prisma.category.create({
      data: { slug: `cat-${suffix}`, name: 'Roads', nameMl: 'Roads-ml' },
    });
    subcategory = await prisma.subcategory.create({
      data: { categoryId: category.id, name: 'Potholes', nameMl: 'Potholes-ml' },
    });

    foreignCategory = await prisma.category.create({
      data: { slug: `cat-foreign-${suffix}`, name: 'Water', nameMl: 'Water-ml' },
    });
    foreignSubcategory = await prisma.subcategory.create({
      data: { categoryId: foreignCategory.id, name: 'Leakage', nameMl: 'Leakage-ml' },
    });

    panchayat = await prisma.panchayat.create({
      data: { code: `pan-${suffix}`, name: 'Panchayat A', nameMl: 'Panchayat A ml' },
    });
    ward = await prisma.ward.create({
      data: { panchayatId: panchayat.id, number: 1, name: 'Ward 1', nameMl: 'Ward 1 ml' },
    });

    otherPanchayat = await prisma.panchayat.create({
      data: { code: `pan-other-${suffix}`, name: 'Panchayat B', nameMl: 'Panchayat B ml' },
    });
    otherPanchayatWard = await prisma.ward.create({
      data: { panchayatId: otherPanchayat.id, number: 1, name: 'Ward B1', nameMl: 'Ward B1 ml' },
    });

    valid = {
      title: 'Pothole on main road',
      description: 'There is a large pothole causing traffic issues.',
      categoryId: category.id,
      subcategoryId: subcategory.id,
      panchayatId: panchayat.id,
      wardId: ward.id,
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates an issue with forced defaults and a matching submission notification', async () => {
    const issue = await service.createForCitizen(citizen, valid);

    expect(issue.status).toBe('SUBMITTED');
    expect(issue.priority).toBe('MEDIUM');
    expect(issue.onBehalfOf).toBe(false);
    expect(issue.referenceNo).toMatch(/^GRV-\d{4}-\d{6,}$/);
    expect(typeof issue.createdAt).toBe('string');
    expect(() => new Date(issue.createdAt).toISOString()).not.toThrow();

    const row = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(row?.citizenId).toBe(citizen.id);
    expect(row?.createdById).toBe(citizen.id);
    expect(row?.status).toBe('SUBMITTED');
    expect(row?.priority).toBe('MEDIUM');
    expect(row?.onBehalfOf).toBe(false);

    const notification = await prisma.notification.findFirst({
      where: { issueId: issue.id, type: 'issue.submitted' },
    });
    expect(notification).not.toBeNull();
    expect(notification?.recipientId).toBe(citizen.id);
  });

  it('forces protected fields and ignores client overrides', async () => {
    const issue = await service.createForCitizen(citizen, {
      ...valid,
      priority: 'URGENT',
      status: 'RESOLVED',
      citizenId: 'someone-else',
      createdById: 'someone-else',
      onBehalfOf: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    expect(issue.priority).toBe('MEDIUM');
    expect(issue.status).toBe('SUBMITTED');
    expect(issue.onBehalfOf).toBe(false);

    const row = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(row?.citizenId).toBe(citizen.id);
    expect(row?.createdById).toBe(citizen.id);
  });

  it('rejects a ward that does not belong to the panchayat (422 ward_panchayat_mismatch)', async () => {
    const attempt = service.createForCitizen(citizen, {
      ...valid,
      wardId: otherPanchayatWard.id,
    });

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.code).toBe('ward_panchayat_mismatch');
      expect(err.status).toBe(422);
    });
  });

  it('rejects a subcategory that does not belong to the category (422 subcategory_category_mismatch)', async () => {
    const attempt = service.createForCitizen(citizen, {
      ...valid,
      subcategoryId: foreignSubcategory.id,
    });

    await expect(attempt).rejects.toBeInstanceOf(ApiError);
    await attempt.catch((err: ApiError) => {
      expect(err.code).toBe('subcategory_category_mismatch');
      expect(err.status).toBe(422);
    });
  });
});
