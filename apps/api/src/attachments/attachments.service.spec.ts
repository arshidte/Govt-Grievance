import { Logger } from '@nestjs/common';
import type { Attachment, Issue } from '@prisma/client';
import { describe, expect, it, vi, type Mock } from 'vitest';

import type { AccessControlService } from '../access/access-control.service';
import type { SessionUser } from '../auth/session.service';
import type { PrismaService } from '../prisma/prisma.service';

import { AttachmentsService } from './attachments.service';
import { StorageObjectNotFoundError, type StorageProvider } from './storage/storage.provider';

/**
 * Unit tests for `AttachmentsService` — Task 15 (Review Focus #4).
 *
 * The collaborators (Prisma, the storage provider, the AccessControlService)
 * are hand-rolled mocks: this suite exercises the service's ORDERING and
 * FAILURE-handling logic (owner-only authz, magic-byte sniff vs. declared
 * type, 5MB cap, one-per-issue, and — the flagged crux — the file-then-DB
 * compensating-delete path with orphan-on-cleanup-failure logging) without a
 * real DB or disk. The e2e suite (`test/attachments.e2e-spec.ts`) covers the
 * real round-trip + real missing-file case.
 */

/** A minimal valid JPEG buffer: the magic bytes `FF D8 FF` followed by filler. */
const validJpeg = {
  buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(16, 0x00)]),
  mimetype: 'image/jpeg',
  originalname: 'photo.jpg',
  size: 19,
};

/** A plausible owning citizen (owner = `issue.citizenId`). */
const owner = { id: 'user-owner', roleAssignments: [] } as unknown as SessionUser;

/** An issue owned by `owner`, in a specific ward/panchayat (for staff-scope tests). */
function issueOwnedByOwner(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'issue-1',
    citizenId: owner.id,
    wardId: 'ward-1',
    panchayatId: 'pan-1',
    ...overrides,
  } as unknown as Issue;
}

/**
 * Builds a fresh service with fully-mocked collaborators, returning the raw
 * `Mock`s (not the service-shaped casts) so tests can reassign
 * implementations (`create = vi.fn(...)`) and read `.mock.calls` without
 * fighting the strict Prisma delegate types.
 */
function makeService(issue: Issue | null = issueOwnedByOwner()) {
  const put: Mock = vi.fn(async () => {});
  const get: Mock = vi.fn(async () => Buffer.alloc(0));
  const del: Mock = vi.fn(async () => {});
  const store = { put, get, delete: del } as unknown as StorageProvider;

  const issueFindUnique: Mock = vi.fn(async () => issue);
  const findFirst: Mock = vi.fn(async () => null);
  const findUnique: Mock = vi.fn(async () => null);
  const create: Mock = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: 'att-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...args.data,
  }));
  const prisma = {
    issue: { findUnique: issueFindUnique },
    attachment: { findFirst, findUnique, create },
  } as unknown as PrismaService;

  // AccessControlService.can() is only consulted in getStream for the
  // in-scope-staff branch; default deny.
  const can: Mock = vi.fn(() => false);
  const accessControl = { can } as unknown as AccessControlService;

  const service = new AttachmentsService(prisma, store, accessControl);
  // The service logs orphan failures through its own Logger instance; the
  // crux test spies on exactly that target.
  const logger = service['logger'] as Logger;

  return {
    service,
    store,
    prisma,
    accessControl,
    logger,
    mocks: { put, get, del, issueFindUnique, findFirst, findUnique, create, can },
  };
}

describe('AttachmentsService.upload', () => {
  it('rejects a non-image by content sniff even if the declared type/extension say .jpg (415)', async () => {
    const { service } = makeService();
    await expect(
      service.upload(owner, 'issue-1', {
        buffer: Buffer.from('%PDF-1.7'),
        mimetype: 'image/jpeg',
        originalname: 'x.jpg',
        size: 8,
      }),
    ).rejects.toMatchObject({ status: 415, code: 'unsupported_type' });
  });

  it('rejects a file over 5MB with 413', async () => {
    const { service } = makeService();
    const tooBig = {
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 0xff),
      mimetype: 'image/png',
      originalname: 'big.png',
      size: 5 * 1024 * 1024 + 1,
    };
    await expect(service.upload(owner, 'issue-1', tooBig)).rejects.toMatchObject({ status: 413 });
  });

  it('404s when the issue does not exist', async () => {
    const { service } = makeService(null);
    await expect(service.upload(owner, 'missing', validJpeg)).rejects.toMatchObject({
      status: 404,
      code: 'issue_not_found',
    });
  });

  it('403s when the caller is not the issue owner', async () => {
    const { service } = makeService(issueOwnedByOwner({ citizenId: 'someone-else' }));
    await expect(service.upload(owner, 'issue-1', validJpeg)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
  });

  it('409s already_has_attachment when one already exists for the issue', async () => {
    const { service, mocks } = makeService();
    mocks.findFirst.mockResolvedValueOnce({ id: 'existing' });
    await expect(service.upload(owner, 'issue-1', validJpeg)).rejects.toMatchObject({
      status: 409,
      code: 'already_has_attachment',
    });
  });

  it('happy path: writes the file, creates the row, returns a DTO WITHOUT storageKey', async () => {
    const { service, mocks } = makeService();
    const dto = await service.upload(owner, 'issue-1', validJpeg);

    // File written BEFORE the DB row.
    const putOrder = mocks.put.mock.invocationCallOrder[0] ?? -1;
    const createOrder = mocks.create.mock.invocationCallOrder[0] ?? -1;
    expect(putOrder).toBeGreaterThan(0);
    expect(putOrder).toBeLessThan(createOrder);

    // Sniffed type is authoritative for the stored mimeType + the storageKey ext.
    const createArg = mocks.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(createArg.data.mimeType).toBe('image/jpeg');
    expect(createArg.data.storageKey).toMatch(/\.jpg$/);
    expect(createArg.data.originalName).toBe('photo.jpg');
    expect(createArg.data.sizeBytes).toBe(validJpeg.buffer.length);

    // The key written to disk is the same server-generated key stored in the row.
    expect(mocks.put.mock.calls[0]?.[0]).toBe(createArg.data.storageKey);

    // DTO shape: NO storageKey leak.
    expect(dto).not.toHaveProperty('storageKey');
    expect(dto).toMatchObject({
      id: 'att-1',
      mimeType: 'image/jpeg',
      sizeBytes: validJpeg.buffer.length,
      originalName: 'photo.jpg',
    });
    expect(typeof dto.createdAt).toBe('string');
  });

  it('on DB failure after file write, deletes the file; if delete also fails, logs ERROR(/orphan/) and rethrows the ORIGINAL db error — and no row exists to download', async () => {
    const { service, mocks, logger } = makeService();
    mocks.put.mockImplementation(async () => {}); // file "written"
    mocks.create.mockImplementation(async () => {
      throw new Error('db down');
    });
    mocks.del.mockImplementation(async () => {
      throw new Error('disk down');
    }); // cleanup fails
    const logSpy = vi.spyOn(logger, 'error');

    await expect(service.upload(owner, 'issue-1', validJpeg)).rejects.toThrow(/db down/);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/orphan/i),
      expect.objectContaining({ storageKey: expect.any(String) }),
    );

    // No Attachment row was created -> getStream cannot find it (uniform 404).
    mocks.findUnique.mockResolvedValueOnce(null);
    await expect(service.getStream(owner, 'any')).rejects.toMatchObject({ status: 404 });
  });

  it('on DB failure, the compensating delete SUCCEEDS silently (no orphan log) and still rethrows the original db error', async () => {
    const { service, mocks, logger } = makeService();
    mocks.create.mockImplementation(async () => {
      throw new Error('db down');
    });
    const logSpy = vi.spyOn(logger, 'error');

    await expect(service.upload(owner, 'issue-1', validJpeg)).rejects.toThrow(/db down/);
    expect(mocks.del).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe('AttachmentsService.getStream', () => {
  /** A stored attachment row joined to its issue (owner = `owner`). */
  function attachmentRow(overrides: Record<string, unknown> = {}): Attachment & { issue: Issue } {
    return {
      id: 'att-1',
      issueId: 'issue-1',
      uploadedById: owner.id,
      storageKey: 'abc-123.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 10,
      originalName: 'photo.jpg',
      createdAt: new Date(),
      issue: issueOwnedByOwner(),
      ...overrides,
    } as unknown as Attachment & { issue: Issue };
  }

  it('404 attachment_not_found when the row does not exist', async () => {
    const { service, mocks } = makeService();
    mocks.findUnique.mockResolvedValueOnce(null);
    await expect(service.getStream(owner, 'missing')).rejects.toMatchObject({
      status: 404,
      code: 'attachment_not_found',
    });
  });

  it('owner can read: returns the buffer + metadata', async () => {
    const { service, mocks } = makeService();
    mocks.findUnique.mockResolvedValueOnce(attachmentRow());
    const bytes = Buffer.from([1, 2, 3]);
    mocks.get.mockResolvedValueOnce(bytes);

    const out = await service.getStream(owner, 'att-1');
    expect(Buffer.compare(out.buffer, bytes)).toBe(0);
    expect(out.mimeType).toBe('image/jpeg');
    expect(out.originalName).toBe('photo.jpg');
  });

  it('non-owner, non-staff gets a NON-DISCLOSING 404 (not 403) and no bytes are read', async () => {
    const stranger = { id: 'stranger', roleAssignments: [] } as unknown as SessionUser;
    const { service, mocks } = makeService();
    mocks.findUnique.mockResolvedValueOnce(attachmentRow());
    mocks.can.mockReturnValue(false);

    await expect(service.getStream(stranger, 'att-1')).rejects.toMatchObject({
      status: 404,
      code: 'attachment_not_found',
    });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('in-scope staff (not owner) can read', async () => {
    const staff = { id: 'staff', roleAssignments: [] } as unknown as SessionUser;
    const { service, mocks } = makeService();
    mocks.findUnique.mockResolvedValueOnce(attachmentRow());
    mocks.can.mockReturnValue(true);
    const bytes = Buffer.from([9, 9]);
    mocks.get.mockResolvedValueOnce(bytes);

    const out = await service.getStream(staff, 'att-1');
    expect(Buffer.compare(out.buffer, bytes)).toBe(0);
    // Scope was sourced from the issue row.
    expect(mocks.can).toHaveBeenCalledWith(
      staff,
      'attachment:read',
      expect.objectContaining({ wardId: 'ward-1', panchayatId: 'pan-1' }),
    );
  });

  it('404 attachment_unavailable when the row exists but the file vanished', async () => {
    const { service, mocks } = makeService();
    mocks.findUnique.mockResolvedValueOnce(attachmentRow());
    mocks.get.mockRejectedValueOnce(new StorageObjectNotFoundError('abc-123.jpg'));

    await expect(service.getStream(owner, 'att-1')).rejects.toMatchObject({
      status: 404,
      code: 'attachment_unavailable',
    });
  });
});
