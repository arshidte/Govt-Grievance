import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';

import { IdempotencyService } from './idempotency.service';

/**
 * Owns the creation-idempotency replay store (`IdempotencyService`), used by
 * Task 7 (citizen issue submit) and Task 12 (on-behalf submit) to guard
 * side-effecting POST handlers behind an optional client-supplied
 * `Idempotency-Key`. `PrismaModule` is `@Global()` (so `PrismaService` is
 * already available app-wide) but is imported explicitly here anyway to
 * keep this module's own dependency declared rather than implicit.
 */
@Module({
  imports: [PrismaModule],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
