import { Module } from '@nestjs/common';

import { AccessModule } from '../access/access.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AttachmentsService } from './attachments.service';
import { LocalDiskStorageProvider } from './storage/local-disk.storage';
import { STORAGE_PROVIDER } from './storage/storage.provider';

/**
 * Owns the attachment upload/download domain (spec §10 / Task 15).
 *
 * `STORAGE_PROVIDER` is bound to the dev-only `LocalDiskStorageProvider`;
 * swapping in a persistent object-storage provider (e.g. S3) is a one-line
 * binding change here, with no change to `AttachmentsService` or its callers.
 *
 * `PrismaModule` supplies `PrismaService` (attachment/issue rows),
 * `AccessModule` supplies `AccessControlService` (the download in-scope-staff
 * decision), and `AuthModule` supplies `AuthGuard`/`AuthService` for the
 * controller added in Task 16. `AttachmentsService` is exported so that
 * controller can consume it.
 */
@Module({
  imports: [PrismaModule, AccessModule, AuthModule],
  providers: [
    AttachmentsService,
    // `useFactory` (not `useClass`) because `LocalDiskStorageProvider`'s
    // constructor has a `root: string` parameter (defaulting to
    // `env.ATTACHMENT_STORAGE_DIR`). Nest's DI would otherwise try to resolve
    // a `String` provider for that param and fail; the factory lets the class
    // apply its own default while keeping the swap-a-provider seam at the
    // `STORAGE_PROVIDER` token.
    { provide: STORAGE_PROVIDER, useFactory: () => new LocalDiskStorageProvider() },
  ],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
