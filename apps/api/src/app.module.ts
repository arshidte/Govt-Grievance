import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AccessModule } from './access/access.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { env } from './config/env';
import { HealthController } from './health/health.controller';
import { OrgModule } from './org/org.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

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
    PrismaModule,
    AuthModule,
    AccessModule,
    CatalogModule,
    OrgModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
