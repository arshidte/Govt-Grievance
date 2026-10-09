import { Module } from '@nestjs/common';

import { SmsModule } from '../sms/sms.module';
import { DevController } from './dev.controller';

/**
 * Dev/e2e-only endpoints (currently just `GET /api/v1/dev/last-otp`).
 *
 * Belt #1 of the production fence: `AppModule` only imports `DevModule`
 * when `env.NODE_ENV !== 'production'` (see `app.module.ts`), so in a real
 * production boot this module — and therefore its controller/route — is
 * never registered at all; belt #2 (the in-handler guard) lives in
 * `DevController`/`isDevEndpointEnabled`.
 */
@Module({
  imports: [SmsModule],
  controllers: [DevController],
})
export class DevModule {}
