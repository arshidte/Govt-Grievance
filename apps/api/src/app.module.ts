import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { env } from './config/env';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

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
  ],
  controllers: [HealthController],
})
export class AppModule {}
