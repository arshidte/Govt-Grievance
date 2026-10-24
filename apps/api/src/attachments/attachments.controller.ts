import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AttachmentDTO } from '@pg/types';

import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { SessionUser } from '../auth/session.service';

import { AttachmentsService, type UploadFile } from './attachments.service';

/** Exact upload cap, in bytes. MUST match `AttachmentsService`'s own ≤5MB
 * defense-in-depth check (see that service's `MAX_BYTES`) so the Multer
 * limit (rejects BEFORE the handler, before buffering past the limit — spec
 * §10) and the service's own check always agree: ≤5MB accepted, >5MB
 * rejected, from either path. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * There is no `@types/multer` installed (and the brief asks us not to add
 * it), so `Express.Multer.File` does not resolve as an ambient type here.
 * `AttachmentsService.upload` only reads these 4 fields (see its
 * `UploadFile` interface) — this inline type matches that shape exactly, so
 * passing a real Multer-produced file object through satisfies it
 * structurally with no `any`.
 */
type MulterFile = UploadFile;

/**
 * `POST /issues/:id/attachment` (multipart upload) and `GET /attachments/:id`
 * (streaming download) — Task 16, M2 spec §6/§10.
 *
 * THIN HTTP WIRING ONLY. `AttachmentsService` (Task 15, reviewed/tested
 * independently) owns every validation/authz/cleanup decision: owner-only
 * upload authz (403/404), the magic-byte content sniff (415), one-per-issue
 * (409), the ≤5MB cap (413, defense-in-depth — the Multer interceptor below
 * is the FIRST line of defense for oversize uploads), and the download
 * authz (owner OR in-scope staff; a NON-DISCLOSING 404 for everyone else —
 * see `AttachmentsService.getStream`'s doc comment). This controller must
 * never re-derive or override any of those outcomes.
 */
@Controller()
@UseGuards(AuthGuard)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  /**
   * Owner-only multipart upload. `FileInterceptor`'s `limits.fileSize` is set
   * to EXACTLY `MAX_UPLOAD_BYTES` so a file whose body exceeds 5MB is
   * rejected by Multer itself — via a thrown `MulterError` with
   * `code: 'LIMIT_FILE_SIZE'`, mapped to a clean 413 by the additive branch
   * in `AllExceptionsFilter` — BEFORE the full body is buffered or the
   * handler runs, matching spec §10's "reject before buffering the whole
   * body". A file at or under the limit reaches the service, which re-checks
   * the exact same cap against the actual buffer length as defense-in-depth
   * for any direct (non-HTTP) caller.
   *
   * The Multer file object is passed straight through to the service — it
   * already has the exact 4 fields (`buffer`, `mimetype`, `originalname`,
   * `size`) the service's `UploadFile` expects; no mapping needed.
   */
  @Post('issues/:id/attachment')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @UploadedFile() file: MulterFile,
  ): Promise<AttachmentDTO> {
    return this.attachments.upload(user, id, file);
  }

  /**
   * Streaming download. Authorization happens entirely inside
   * `AttachmentsService.getStream` BEFORE any byte is read (spec §10):
   * issue owner or in-scope staff -> the bytes; anyone else -> a uniform,
   * non-disclosing 404 `attachment_not_found` (never a 403 — see that
   * method's doc comment, and the class-level deviation note in this
   * task's e2e spec for why the brief's "403 on both" wording does not
   * apply to this route).
   *
   * Content-Disposition safety: `originalName` is user-supplied metadata
   * (the uploader's claimed filename) and must NEVER be interpolated raw
   * into a response header — an attacker-controlled filename containing
   * CR/LF could inject arbitrary header lines. We sidestep the whole class
   * of risk by using `disposition: 'inline'` with NO filename at all, so
   * there is nothing derived from `originalName` in the header. The
   * sniffed, trusted `mimeType` still drives `Content-Type` so the browser
   * renders the image inline correctly.
   */
  @Get('attachments/:id')
  async download(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const { buffer, mimeType } = await this.attachments.getStream(user, id);
    return new StreamableFile(buffer, { type: mimeType, disposition: 'inline' });
  }
}
