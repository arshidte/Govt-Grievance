/**
 * BFF → API end-user context headers (single source of truth for both sides).
 *
 * The API sits behind the Next.js BFFs and a platform proxy, so its socket ip
 * and user-agent are never the end user's. A BFF asserts the real client in
 * `CLIENT_IP_HEADER` / `CLIENT_UA_HEADER` and authenticates itself with
 * `BFF_AUTH_HEADER: <BFF_SHARED_SECRET>`. The API honours the asserted values
 * ONLY when the secret matches (apps/api/src/common/client-context.ts).
 */
export const BFF_AUTH_HEADER = 'x-pg-bff-auth';
export const CLIENT_IP_HEADER = 'x-pg-client-ip';
export const CLIENT_UA_HEADER = 'x-pg-client-ua';
