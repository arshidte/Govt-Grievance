import { Injectable, Logger } from '@nestjs/common';

import { ApiError } from '../../common/api-error';
import { env } from '../../config/env';

import type { Msg91Verifier } from './msg91-verifier.interface';
import { normalizeVerifiedPhone } from './phone';

/** Shape of the MSG91 `verifyAccessToken` response we rely on. */
interface Msg91VerifyResponse {
  type?: string; // 'success' | 'error'
  message?: string; // on success: the verified identifier (mobile w/ country code)
}

/**
 * Live `Msg91Verifier`: validates a widget access token against MSG91
 * (`POST {MSG91_VERIFY_URL}` with `{ authkey, 'access-token' }`). On
 * `{ type: 'success', message }` the `message` carries the verified identifier,
 * which `normalizeVerifiedPhone` turns into a trusted `+91…` phone. Anything
 * else is a uniform `invalid_token` (401); a transport failure is a
 * non-committal 503 so a flaky provider never silently authenticates anyone.
 *
 * The access token is NEVER logged (it authenticates a login); only the
 * non-sensitive outcome is logged.
 */
@Injectable()
export class Msg91HttpVerifier implements Msg91Verifier {
  private readonly logger = new Logger(Msg91HttpVerifier.name);

  async verifyAccessToken(accessToken: string): Promise<{ phone: string }> {
    const authkey = env.MSG91_AUTHKEY;
    if (!authkey) {
      // env.ts guards this at boot (live requires authkey); fail closed anyway.
      this.logger.error('MSG91_AUTHKEY is not configured; cannot verify access token');
      throw new ApiError('invalid_token', 401, 'states.forbidden');
    }

    let json: Msg91VerifyResponse;
    try {
      const res = await fetch(env.MSG91_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ authkey, 'access-token': accessToken }),
      });
      json = (await res.json()) as Msg91VerifyResponse;
    } catch (err) {
      this.logger.error(
        'MSG91 verifyAccessToken request failed',
        err instanceof Error ? err.stack : String(err),
      );
      throw new ApiError('otp_provider_unavailable', 503, 'errors.otpProviderUnavailable');
    }

    if (json?.type !== 'success' || typeof json.message !== 'string') {
      this.logger.warn(`MSG91 verifyAccessToken rejected (type=${json?.type ?? 'unknown'})`);
      throw new ApiError('invalid_token', 401, 'states.forbidden');
    }

    return { phone: normalizeVerifiedPhone(json.message) };
  }
}
