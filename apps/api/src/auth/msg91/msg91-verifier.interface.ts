/** DI token for the active `Msg91Verifier` implementation (mock vs live). */
export const MSG91_VERIFIER = 'MSG91_VERIFIER';

/**
 * Server-side trust boundary for MSG91 widget authentication.
 *
 * The browser widget sends + verifies the OTP and returns an opaque JWT access
 * token. The server NEVER trusts a client-supplied phone — it passes the token
 * here, and the verifier returns the identifier MSG91 itself vouches for (or
 * throws). Implementations:
 *  - `Msg91HttpVerifier` (live): calls MSG91 `verifyAccessToken` with the secret authkey.
 *  - `MockMsg91Verifier` (dev/test): trusts a `test-otp:<phone>` token, no network.
 */
export interface Msg91Verifier {
  /**
   * Validates `accessToken` and resolves to the verified `+91…` phone.
   * Throws `ApiError('invalid_token', 401)` for a rejected/forged token, or
   * `ApiError('otp_provider_unavailable', 503)` if MSG91 is unreachable.
   */
  verifyAccessToken(accessToken: string): Promise<{ phone: string }>;
}
