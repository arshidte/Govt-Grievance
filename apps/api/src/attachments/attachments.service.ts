import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AttachmentDTO } from '@pg/types';
import type { Attachment } from '@prisma/client';

import { AccessControlService } from '../access/access-control.service';
import type { SessionUser } from '../auth/session.service';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

import { STORAGE_PROVIDER, StorageObjectNotFoundError, type StorageProvider } from './storage/storage.provider';

/** Hard upper bound on attachment size (spec §10: max 5 MB). */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * The Multer-style file shape the upload path consumes. `size` is the
 * CLIENT-DECLARED size (used only for an optional fast-reject); `buffer` is
 * the AUTHORITY for both the size check and the magic-byte content sniff.
 */
export interface UploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * Internal return shape of `getStream` — a buffer plus the metadata the
 * download route (Task 16) needs to set response headers. Deliberately NOT a
 * new `@pg/types` DTO: it never crosses the HTTP boundary as-is (T16 streams
 * `buffer` and maps the metadata to headers), and it intentionally omits the
 * server-internal `storageKey`.
 */
export interface AttachmentStream {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

/**
 * A sniffed, trusted image type. The sniff result — never the client's
 * declared `mimetype`/`originalname` — is the authority for the stored
 * `mimeType` and the storageKey extension.
 */
type SniffedType = { mimeType: string; ext: string };

/**
 * Maps `Attachment` row -> `AttachmentDTO`. CRITICAL: `storageKey` is a
 * server-internal safe key and is NEVER exposed — the DTO has no such field.
 * Exposing it would be an information leak (and the key has no meaning to the
 * client, which downloads by `id` via the authenticated route).
 */
function toAttachmentDTO(row: Attachment): AttachmentDTO {
  return {
    id: row.id,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    originalName: row.originalName,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Content-type sniffer over the LEADING BYTES of `buf`. Returns the trusted
 * type, or `null` for anything not in the JPEG/PNG/WebP allow-list.
 *
 * We deliberately DO NOT trust `file.mimetype` or `file.originalname` — a
 * client can set those to anything (the brief's hostile case is a `%PDF`
 * buffer carrying `mimetype:'image/jpeg'`, `originalname:'x.jpg'`). Only the
 * actual bytes decide, so a renamed/mislabelled file is rejected with 415.
 */
function sniffImageType(buf: Buffer): SniffedType | null {
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length >= 8 && pngSig.every((b, i) => buf[i] === b)) {
    return { mimeType: 'image/png', ext: 'png' };
  }

  // WebP: bytes 0..3 == ASCII "RIFF" AND bytes 8..11 == ASCII "WEBP"
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', ext: 'webp' };
  }

  return null;
}

/**
 * Owns the attachment upload/download domain (spec §10). Collaborators:
 * - `PrismaService` for the `Attachment`/`Issue` rows (metadata),
 * - the active `StorageProvider` (via `STORAGE_PROVIDER`) for the bytes,
 * - `AccessControlService` for the download in-scope-staff decision.
 */
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly store: StorageProvider,
    private readonly accessControl: AccessControlService,
  ) {}

  /**
   * Uploads the single optional image for `issueId`. Owner-only. Order is
   * STRICT (spec §10 + Task 15 brief):
   *   1. load issue → 404 if missing; 403 if caller is not the owner
   *      (`citizenId`, even for on-behalf issues);
   *   2. size cap (≤5 MB by actual buffer length) → 413;
   *   3. magic-byte content sniff (NOT the declared type/ext) → 415;
   *   4. one-per-issue → 409;
   *   5. server-generated storageKey (`<uuid>.<sniffed-ext>`, no client path);
   *   6. write file FIRST, then the DB row, with a compensating delete.
   */
  async upload(user: SessionUser, issueId: string, file: UploadFile): Promise<AttachmentDTO> {
    // 1. Owner-only authz. Load-then-403 is acceptable here (§6 lists both 403
    // and 404 for this route); the owner is the issue's `citizenId`.
    const issue = await this.prisma.issue.findUnique({ where: { id: issueId } });
    if (!issue) {
      throw new ApiError('issue_not_found', 404, 'errors.issueNotFound');
    }
    if (issue.citizenId !== user.id) {
      throw new ApiError('forbidden', 403, 'states.forbidden');
    }

    // 2. Size cap. The actual buffer length is the authority (a lying `size`
    // cannot sneak past); `file.size` may be used for a cheaper fast-reject
    // but the buffer check below is the one that matters.
    if (file.size > MAX_BYTES || file.buffer.length > MAX_BYTES) {
      throw new ApiError('file_too_large', 413, 'errors.fileTooLarge');
    }

    // 3. Magic-byte sniff. The sniffed type — never the client's declared
    // mimetype/extension — is authoritative from here on.
    const sniffed = sniffImageType(file.buffer);
    if (!sniffed) {
      throw new ApiError('unsupported_type', 415, 'errors.unsupportedType');
    }

    // 4. One-per-issue. NOTE (TOCTOU): the schema has NO unique index on
    // `Attachment.issueId`, so this check-then-create races under concurrent
    // uploads by the same owner. Acceptable for M2 (owner-only, single user);
    // adding a unique index/migration is out of scope for this task.
    const existing = await this.prisma.attachment.findFirst({ where: { issueId } });
    if (existing) {
      throw new ApiError('already_has_attachment', 409, 'errors.alreadyHasAttachment');
    }

    // 5. Server-generated key. The extension comes from the SNIFFED type, not
    // `originalname`, so there is no client-controlled path component.
    // `originalName` is persisted as metadata only, never used as a path.
    const storageKey = `${randomUUID()}.${sniffed.ext}`;

    // 6. File-then-DB with compensating delete (Review Focus #4).
    // Invariant: no DB row without its file. A stored file WITHOUT a row is
    // possible ONLY if the compensating delete itself fails — that orphan is
    // logged at ERROR (discoverable), harmless (never served: download needs a
    // row), and left for a future sweep (out of M2 scope). The client ALWAYS
    // gets the original DB error back; the cleanup outcome never changes the
    // response.
    await this.store.put(storageKey, file.buffer); // file FIRST
    try {
      const row = await this.prisma.attachment.create({
        data: {
          issueId,
          uploadedById: user.id,
          storageKey,
          mimeType: sniffed.mimeType,
          sizeBytes: file.buffer.length,
          originalName: file.originalname,
        },
      });
      return toAttachmentDTO(row);
    } catch (dbErr) {
      // DB row failed AFTER the file was written → compensating delete.
      try {
        await this.store.delete(storageKey);
      } catch {
        // Cleanup failed → an orphan file now exists. Log it so it is
        // discoverable (storageKey + issueId); do NOT let this change the
        // client response.
        this.logger.error('orphan file left after failed cleanup', { storageKey, issueId });
      }
      throw dbErr; // ALWAYS rethrow the ORIGINAL db error.
    }
  }

  /**
   * Reads an attachment's bytes + metadata for the authenticated download
   * route (Task 16). Authorization happens BEFORE any byte is read.
   *   1. load row (+ issue for scope) → 404 `attachment_not_found` if missing;
   *   2. authz: issue owner OR in-scope staff; otherwise a uniform,
   *      NON-DISCLOSING 404 `attachment_not_found` (never reveal existence to
   *      an unauthorized caller, and never a 403 here);
   *   3. read bytes; if the file vanished under the row (ephemeral dev disk) →
   *      a clean 404 `attachment_unavailable` (never a 500/partial stream).
   */
  async getStream(user: SessionUser, attachmentId: string): Promise<AttachmentStream> {
    const row = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { issue: true },
    });
    if (!row) {
      throw new ApiError('attachment_not_found', 404, 'errors.attachmentNotFound');
    }

    // Authz BEFORE reading bytes. Owner = issue.citizenId; in-scope staff via
    // the SAME decision engine the transition gate uses (scope from the issue
    // row). Denial → uniform 404 (non-disclosing), NOT 403.
    const isOwner = row.issue.citizenId === user.id;
    const isInScopeStaff = this.accessControl.can(user, 'attachment:read', {
      wardId: row.issue.wardId,
      panchayatId: row.issue.panchayatId,
    });
    if (!isOwner && !isInScopeStaff) {
      throw new ApiError('attachment_not_found', 404, 'errors.attachmentNotFound');
    }

    try {
      const buffer = await this.store.get(row.storageKey);
      return { buffer, mimeType: row.mimeType, originalName: row.originalName };
    } catch (err) {
      if (err instanceof StorageObjectNotFoundError) {
        // DB row exists but the file is gone (ephemeral dev disk). Log
        // server-side and return a clean 404 rather than a 500.
        this.logger.error('attachment file missing for existing row', {
          attachmentId,
          storageKey: row.storageKey,
        });
        throw new ApiError('attachment_unavailable', 404, 'errors.attachmentUnavailable');
      }
      throw err;
    }
  }
}
