import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { STORAGE_PROVIDER, type StorageProvider } from '../src/attachments/storage/storage.provider';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.util';
import { AllExceptionsFilter } from '../src/common/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Task 16 (M2 spec §6, §10): real-HTTP e2e for the attachment endpoints —
 * `POST /issues/:id/attachment` (multipart upload) and `GET /attachments/:id`
 * (streaming download). The AttachmentsService (Task 15, reviewed/tested
 * independently in `attachments.e2e-spec.ts`) owns ALL validation/authz/
 * cleanup; this suite exercises the HTTP WIRING on top of it — multipart
 * parsing, the Multer 5MB limit -> 413 mapping, and that the controller does
 * not override the service's authz outcomes.
 *
 * DEVIATION FROM THE BRIEF'S WORDING (documented, deliberate): the brief
 * states "a different citizen -> 403 on BOTH" upload and download. That is
 * correct for UPLOAD (confirmed below), but the REVIEWED, APPROVED Task 15
 * `AttachmentsService.getStream` deliberately returns a NON-DISCLOSING 404
 * `attachment_not_found` for an unauthorized downloader — never 403 — so an
 * unauthorized caller can never learn whether the attachment (or even the
 * issue) exists. This controller is a thin wrapper and must not weaken that
 * guarantee by special-casing a 403 on top of the service's 404. Spec §10
 * requires "authorized before any byte is read", and the non-disclosing 404
 * is the SAME pattern used elsewhere in M2 (e.g. `IssuesService.getForUser`).
 * So below: upload-by-stranger -> 403, download-by-stranger -> 404.
 *
 * CARRY-IN (T8/T11/T12/T13/T15): `AuthController` throttles its whole surface
 * per IP, and real OTP logins are expensive (2 calls each). This file logs in
 * exactly TWO real users (the owning citizen + one reusable staff actor) and
 * creates the "different citizen" (stranger) actor via DIRECT Prisma (no
 * login needed — it only needs a session cookie for the owner-authz checks,
 * so it gets its own real login too, but every other actor/role flip uses
 * direct Prisma `RoleAssignment` rows). Each actor reuses ONE cookie for all
 * its requests. There is a documented pre-existing cross-suite throttle
 * flake in the full e2e run (unrelated to this task) — OTP calls are kept to
 * the minimum needed.
 */
describe('Attachment endpoints authz (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let store: StorageProvider;

  const runId = `t16-${Date.now()}`;

  let categoryId: string;
  let panchayatId: string;
  let wardId: string;

  // The issue owner (real login).
  let owner: { cookie: string; userId: string };
  // A different citizen, unrelated to the issue (real login).
  let stranger: { cookie: string; userId: string };
  // A reusable staff actor (real login); granted an in-scope COORDINATOR
  // RoleAssignment via direct Prisma for the staff-download case.
  let staff: { cookie: string; userId: string };

  const createdIssueIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRoleAssignmentIds: string[] = [];
  const createdStorageKeys: string[] = [];

  let phoneCounter = 0;
  function freshPhone(): string {
    phoneCounter += 1;
    const tail = `${Date.now()}${phoneCounter}`.slice(-9).padStart(9, '0');
    return `+919${tail}`;
  }

  /** Logs a brand-new citizen phone in via the real OTP flow; returns its session cookie + user id. */
  async function login(phone: string): Promise<{ cookie: string; userId: string }> {
    const verifyResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/verify-token')
      .send({ accessToken: `test-otp:${phone}` });

    const setCookie = verifyResponse.get('Set-Cookie');
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    if (!cookie) throw new Error('login failed: no session cookie set');

    return { cookie, userId: verifyResponse.body.id as string };
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
        citizenId: owner.userId,
        createdById: owner.userId,
      },
    });
    createdIssueIds.push(issue.id);
    return issue.id;
  }

  /** A minimal valid JPEG buffer (magic `FF D8 FF` + filler). */
  function validJpegBuffer(): Buffer {
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('hello-attachment-bytes')]);
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

    // Exactly three real logins for this whole file (6 OTP calls total).
    owner = await login(freshPhone());
    stranger = await login(freshPhone());
    staff = await login(freshPhone());
    createdUserIds.push(owner.userId, stranger.userId, staff.userId);
  });

  afterAll(async () => {
    // Best-effort cleanup of any files this run wrote.
    const attachments = await prisma.attachment.findMany({
      where: { issueId: { in: createdIssueIds } },
    });
    for (const a of attachments) {
      createdStorageKeys.push(a.storageKey);
    }
    await prisma.attachment.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.roleAssignment.deleteMany({ where: { id: { in: createdRoleAssignmentIds } } });
    await prisma.notification.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.issueStatusHistory.deleteMany({ where: { issueId: { in: createdIssueIds } } });
    await prisma.issue.deleteMany({ where: { id: { in: createdIssueIds } } });
    await prisma.ward.deleteMany({ where: { id: wardId } });
    await prisma.panchayat.deleteMany({ where: { id: panchayatId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    for (const key of createdStorageKeys) {
      await store.delete(key).catch(() => undefined);
    }
    await app.close();
  });

  it('owner uploads a valid JPEG -> 201 with the 4/5-key AttachmentDTO (no storageKey); owner downloads -> 200 with identical bytes and sniffed Content-Type', async () => {
    const issueId = await freshIssue();
    const bytes = validJpegBuffer();

    const uploadRes = await request(app.getHttpServer())
      .post(`/api/v1/issues/${issueId}/attachment`)
      .set('Cookie', owner.cookie)
      .attach('file', bytes, { filename: 'photo.jpg', contentType: 'image/jpeg' });

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body).not.toHaveProperty('storageKey');
    expect(uploadRes.body).toMatchObject({
      mimeType: 'image/jpeg',
      sizeBytes: bytes.length,
      originalName: 'photo.jpg',
    });
    expect(typeof uploadRes.body.id).toBe('string');
    expect(typeof uploadRes.body.createdAt).toBe('string');

    const attachmentId = uploadRes.body.id as string;

    const downloadRes = await request(app.getHttpServer())
      .get(`/api/v1/attachments/${attachmentId}`)
      .set('Cookie', owner.cookie);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.compare(downloadRes.body as Buffer, bytes)).toBe(0);
  });

  it('a different citizen (not the owner): upload -> 403; download of the owner\'s attachment -> 404 (non-disclosing, per the T15 service contract)', async () => {
    const issueId = await freshIssue();
    const bytes = validJpegBuffer();

    // Owner uploads first so there is a real attachment to attempt to download.
    const uploadByOwner = await request(app.getHttpServer())
      .post(`/api/v1/issues/${issueId}/attachment`)
      .set('Cookie', owner.cookie)
      .attach('file', bytes, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(uploadByOwner.status).toBe(201);
    const attachmentId = uploadByOwner.body.id as string;

    // Stranger's own upload attempt on the owner's issue -> 403 (service's non-owner upload result).
    const uploadByStranger = await request(app.getHttpServer())
      .post(`/api/v1/issues/${issueId}/attachment`)
      .set('Cookie', stranger.cookie)
      .attach('file', bytes, { filename: 'other.jpg', contentType: 'image/jpeg' });
    expect(uploadByStranger.status).toBe(403);

    // Stranger's download of the owner's existing attachment -> 404, NOT 403
    // (see the class-level deviation note above).
    const downloadByStranger = await request(app.getHttpServer())
      .get(`/api/v1/attachments/${attachmentId}`)
      .set('Cookie', stranger.cookie);
    expect(downloadByStranger.status).toBe(404);
    expect(downloadByStranger.body.error.code).toBe('attachment_not_found');
  });

  it('in-scope COORDINATOR staff can download the owner\'s attachment -> 200', async () => {
    const issueId = await freshIssue();
    const bytes = validJpegBuffer();

    const uploadRes = await request(app.getHttpServer())
      .post(`/api/v1/issues/${issueId}/attachment`)
      .set('Cookie', owner.cookie)
      .attach('file', bytes, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    expect(uploadRes.status).toBe(201);
    const attachmentId = uploadRes.body.id as string;

    const ra = await prisma.roleAssignment.create({
      data: { userId: staff.userId, role: 'COORDINATOR', panchayatId },
    });
    createdRoleAssignmentIds.push(ra.id);

    try {
      const downloadRes = await request(app.getHttpServer())
        .get(`/api/v1/attachments/${attachmentId}`)
        .set('Cookie', staff.cookie);

      expect(downloadRes.status).toBe(200);
      expect(Buffer.compare(downloadRes.body as Buffer, bytes)).toBe(0);
    } finally {
      await prisma.roleAssignment.delete({ where: { id: ra.id } });
      const i = createdRoleAssignmentIds.indexOf(ra.id);
      if (i >= 0) createdRoleAssignmentIds.splice(i, 1);
    }
  });

  it('oversize upload (5MB + 1 byte) -> 413 file_too_large (exercises the Multer limit + filter mapping)', async () => {
    const issueId = await freshIssue();
    // 5 MB + 1 byte, still carrying the valid JPEG magic bytes so the ONLY
    // thing that can reject it is the size limit (not the content sniff).
    const oversize = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(5 * 1024 * 1024 + 1 - 3, 0x00),
    ]);
    expect(oversize.length).toBe(5 * 1024 * 1024 + 1);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/issues/${issueId}/attachment`)
      .set('Cookie', owner.cookie)
      .attach('file', oversize, { filename: 'big.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('file_too_large');
  });

  it('wrong type (a %PDF buffer mislabelled as image/jpeg) -> 415 unsupported_type (service magic-byte sniff)', async () => {
    const issueId = await freshIssue();
    const pdfBytes = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(16, 0x00)]);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/issues/${issueId}/attachment`)
      .set('Cookie', owner.cookie)
      .attach('file', pdfBytes, { filename: 'x.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('unsupported_type');
  });
});
