import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AccessModule } from './access/access.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { AppThrottlerGuard } from './common/app-throttler.guard';
import { DEFAULT_THROTTLE_LIMIT, DEFAULT_THROTTLE_TTL_MS } from './common/throttler.config';
import { env } from './config/env';
import { DevModule } from './dev/dev.module';
import { HealthController } from './health/health.controller';
import { IssuesModule } from './issues/issues.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrgModule } from './org/org.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

/**
 * `DevModule` (the dev-only `GET /api/v1/dev/last-otp` endpoint) is
 * included ONLY when NOT running in production — belt #1 of its
 * production fence (belt #2 is the in-handler guard inside
 * `DevController`). Spreading a conditionally-empty array keeps this a
 * static, synchronous decision made once at module-definition time, same
 * as every other entry in `imports`.
 */
const conditionalModules = env.NODE_ENV === 'production' ? [] : [DevModule];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // `env` is validated eagerly on import (see src/config/env.ts) so the
      // app fails fast at boot if a required key is missing. Referencing it
      // here (rather than a bare side-effect import) keeps that import
      // intentional and lint-clean.
      load: [() => env],
    }),
    // Single named throttler ("default") registered globally via
    // `AppThrottlerGuard` below. `AuthController` overrides this SAME
    // throttler's limit/ttl with a much tighter value via
    // `@Throttle({ default: { limit: AUTH_THROTTLE_LIMIT, ttl: ... } })`
    // (see src/common/throttler.config.ts for both sets of numbers) —
    // every other route keeps this generous default.
    ThrottlerModule.forRoot([
      { name: 'default', limit: DEFAULT_THROTTLE_LIMIT, ttl: DEFAULT_THROTTLE_TTL_MS },
    ]),
    PrismaModule,
    AuthModule,
    AccessModule,
    AttachmentsModule,
    CatalogModule,
    IssuesModule,
    NotificationsModule,
    OrgModule,
    UsersModule,
    ...conditionalModules,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
