import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../src/attachments/storage/storage.provider';
import type { SessionUser } from '../src/auth/session.service';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Task 15 (M2 spec §10) — Attachment service e2e with a REAL Nest app, the
 * REAL `LocalDiskStorageProvider` (writing to the configured dev disk), and a
 * REAL Postgres.
 *
 * There is NO HTTP endpoint yet (that is Task 16), so — same direct-service
 * pattern as the T10/T12 e2e — we resolve `AttachmentsService` from the Nest
 * container and call it directly. We still boot the full `AppModule` so the DI
 * wiring (STORAGE_PROVIDER binding, module imports) is exercised for real.
 *
 * CARRY-IN (T8): `AuthController` throttles its surface per IP; real OTP logins
 * are expensive. We grant roles via direct Prisma and do NOT log in at all —
 * the service takes a `SessionUser` object directly, so we construct the two
 * actors (owner + in-scope staff) from the DB rows we create.
 */
describe('Attachments service (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: AttachmentsService;
  let store: StorageProvider;

  const runId = `t15-${Date.now()}`;

  let categoryId: string;
  let panchayatId: string;
  let wardId: string;

  let owner: SessionUser;
  let staff: SessionUser;
  let stranger: SessionUser;

  const createdUserIds: string[] = [];
  const createdIssueIds: string[] = [];
  const createdAttachmentIds: string[] = [];
  const createdStorageKeys: string[] = [];

  /** A minimal valid JPEG buffer (magic `FF D8 FF` + filler). */
  const validJpeg = {
    buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('hello-attachment')]),
    mimetype: 'image/jpeg',
    originalname: 'photo.jpg',
    size: 19,
  };

  /** Loads a `SessionUser` (user + roleAssignments) exactly as the auth path would. */
  async function loadSessionUser(userId: string): Promise<SessionUser> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roleAssignments: true },
    });
    return user as SessionUser;
  }

  /** Creates a fresh SUBMITTED issue owned by `owner` in the in-scope ward/panchayat. */
  async function freshIssue(): Promise<string> {
    const issue = await prisma.issue.create({
      data: {
        title: 'Pothole on main road',
        description: 'A large pothole causing traffic issues on the main road.',
        categoryId,
        panchayatId,
        wardId,
        referenceNo: `${runId}-ref-${createdIssueIds.length}`,
        status: 'SUBMITTED',
        priority: 'MEDIUM',
        onBehalfOf: false,
        citizenId: owner.id,
        createdById: owner.id,
      },
    });
    createdIssueIds.push(issue.id);
    return issue.id;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.use(cookieParser());
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    service = moduleFixture.get(AttachmentsService);
    store = moduleFixture.get(STORAGE_PROVIDER);

    const category = await prisma.category.create({
      data: { slug: `${runId}-cat`, name: 'Roads', nameMl: 'റോഡുകൾ' },
    });
    categoryId = category.id;

    const panchayat = await prisma.panchayat.create({
      data: { code: `${runId}-pan`, name: 'Test Panchayat', nameMl: 'Test Panchayat ml' },
    });
    panchayatId = panchayat.id;

    const ward = await prisma.ward.create({
      data: { panchayatId: panchayat.id, number: 1, name: 'Ward 1', nameMl: 'Ward 1 ml' },
    });
    wardId = ward.id;

    // Three users, created directly (no OTP logins): the owning citizen, an
    // in-scope COORDINATOR, and an unrelated citizen.
    // Unique, well-formed phone numbers (no OTP login needed).
    const phoneBase = `${Date.now()}`.slice(-8);
    const ownerRow = await prisma.user.create({
      data: { phone: `+9190${phoneBase}1`, status: 'active' },
    });
    const staffRow = await prisma.user.create({
      data: {
        phone: `+9190${phoneBase}2`,
        status: 'active',
        roleAssignments: { create: { role: 'COORDINATOR', panchayatId } },
      },
    });
    const strangerRow = await prisma.user.create({
      data: { phone: `+9190${phoneBase}3`, status: 'active' },
    });
    createdUserIds.push(ownerRow.id, staffRow.id, strangerRow.id);

    owner = await loadSessionUser(ownerRow.id);
    staff = await loadSessionUser(staffRow.id);
    stranger = await loadSessionUser(strangerRow.id);
  });

  afterAll(async () => {
    await prisma.attachment.deleteMany({ where: { id: { in: createdAttachmentIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } });
    await prisma.roleAssignment.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.ward.deleteMany({ where: { id: wardId } });
    await prisma.panchayat.deleteMany({ where: { id: panchayatId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    // Best-effort cleanup of any files this run wrote.
    for (const key of createdStorageKeys) {
      await store.delete(key).catch(() => undefined);
    }
    await app.close();
  });

  it('round-trips a real upload: upload then getStream returns identical bytes, DTO has no storageKey', async () => {
    const issueId = await freshIssue();
    const dto = await service.upload(owner, issueId, validJpeg);
    createdAttachmentIds.push(dto.id);

    expect(dto).not.toHaveProperty('storageKey');
    expect(dto.mimeType).toBe('image/jpeg');
    expect(dto.sizeBytes).toBe(validJpeg.buffer.length);

    // Track the real on-disk key for cleanup.
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: dto.id } });
    createdStorageKeys.push(row.storageKey);

    const out = await service.getStream(owner, dto.id);
    expect(Buffer.compare(out.buffer, validJpeg.buffer)).toBe(0);
    expect(out.originalName).toBe('photo.jpg');
  });

  it('in-scope staff can download; an unrelated citizen gets a non-disclosing 404', async () => {
    const issueId = await freshIssue();
    const dto = await service.upload(owner, issueId, validJpeg);
    createdAttachmentIds.push(dto.id);
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: dto.id } });
    createdStorageKeys.push(row.storageKey);

    const staffOut = await service.getStream(staff, dto.id);
    expect(Buffer.compare(staffOut.buffer, validJpeg.buffer)).toBe(0);

    await expect(service.getStream(stranger, dto.id)).rejects.toMatchObject({
      status: 404,
      code: 'attachment_not_found',
    });
  });

  it('returns 404 attachment_unavailable when the DB row exists but the file is missing', async () => {
    const issueId = await freshIssue();
    const dto = await service.upload(owner, issueId, validJpeg);
    createdAttachmentIds.push(dto.id);

    // The DTO has NO storageKey (server-internal); obtain it from the DB row to
    // simulate the file vanishing out from under the row (ephemeral dev disk).
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: dto.id } });
    await store.delete(row.storageKey);

    await expect(service.getStream(owner, dto.id)).rejects.toMatchObject({
      status: 404,
      code: 'attachment_unavailable',
    });
  });
});
