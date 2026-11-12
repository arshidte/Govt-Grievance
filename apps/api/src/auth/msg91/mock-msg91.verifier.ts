import { Injectable, Logger } from '@nestjs/common';

import { ApiError } from '../../common/api-error';

import type { Msg91Verifier } from './msg91-verifier.interface';
import { normalizeVerifiedPhone } from './phone';

/** Token scheme the mock verifier trusts: `test-otp:<phone>`. */
const MOCK_TOKEN_PREFIX = 'test-otp:';

/**
 * Dev/test `Msg91Verifier`. Does NOT contact MSG91 — it trusts a token of the
 * form `test-otp:<phone>` (where `<phone>` is treated as already verified) and
 * returns that normalized phone. This mirrors `MockSmsProvider`: it lets the
 * unit/e2e/Playwright suites mint real sessions deterministically, without the
 * external MSG91 service or a browser widget.
 *
 * SECURITY: this accepts forged tokens BY DESIGN, so it must never run in
 * production. Two fences: (1) `Msg91Module` only binds it when
 * `env.MSG91_PROVIDER !== 'live'`; (2) `env.ts` rejects boot if
 * `NODE_ENV==='production'` and `MSG91_PROVIDER!=='live'`.
 */
@Injectable()
export class MockMsg91Verifier implements Msg91Verifier {
  private readonly logger = new Logger(MockMsg91Verifier.name);

  async verifyAccessToken(accessToken: string): Promise<{ phone: string }> {
    if (!accessToken.startsWith(MOCK_TOKEN_PREFIX)) {
      // A real MSG91 JWT reaching the mock verifier is a misconfiguration;
      // reject uniformly (never a real verification).
      throw new ApiError('invalid_token', 401, 'states.forbidden');
    }
    const phone = normalizeVerifiedPhone(accessToken.slice(MOCK_TOKEN_PREFIX.length));
    this.logger.log(`Mock MSG91 verify accepted for ${phone}`);
    return { phone };
  }
}
