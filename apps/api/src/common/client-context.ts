import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

import { BFF_AUTH_HEADER, CLIENT_IP_HEADER, CLIENT_UA_HEADER } from '@pg/types';
import type { Request } from 'express';

/**
 * Who is actually calling: the end user's IP + user-agent.
 *
 * WHY THIS EXISTS. In a deployment the API never sees the end user's socket:
 * browsers talk to a Next.js BFF (Vercel), which calls the API server-to-server,
 * and the host (Render) puts its own proxy in front of the process. So
 * `req.ip` is the platform proxy (observed as `::1` for every request on
 * staging) and `user-agent` is the BFF's `node` fetch. Keying the throttler or
 * the audit/session records on those values makes every user one client: the
 * strict `/auth/*` limit becomes a platform-wide limit (one user — or an
 * attacker — exhausts it for everyone) and recorded IPs carry no information.
 *
 * HOW. The BFF asserts the real client in `x-pg-client-ip` / `x-pg-client-ua`
 * and proves it is the BFF with `x-pg-bff-auth: <BFF_SHARED_SECRET>` (a
 * server-side secret shared by the BFFs and the API; never sent to browsers).
 * The asserted values are trusted ONLY when that secret matches (constant-time
 * compare) — a direct caller can send the headers but cannot know the secret,
 * so it cannot spoof another user's IP; it simply falls back to `req.ip`.
 * With no secret configured (local dev/tests) the behaviour is unchanged.
 */

// Header names are shared with the BFFs via @pg/types (one source of truth).
export { BFF_AUTH_HEADER, CLIENT_IP_HEADER, CLIENT_UA_HEADER };

/** Upper bound on a stored user-agent (it is client-controlled text). */
const MAX_USER_AGENT_LENGTH = 512;

export interface ClientContext {
  ip?: string;
  userAgent?: string;
}

type HeaderReader = Pick<Request, 'ip' | 'get'>;

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function capUserAgent(userAgent: string | undefined): string | undefined {
  return userAgent === undefined ? undefined : userAgent.slice(0, MAX_USER_AGENT_LENGTH);
}

/**
 * Resolves the end user's {ip, userAgent} for `req`. `sharedSecret` is the
 * configured `BFF_SHARED_SECRET` (undefined = feature off). Pure: pass the
 * secret in so it is trivially unit-testable.
 */
export function resolveClientContext(req: HeaderReader, sharedSecret: string | undefined): ClientContext {
  const fallback: ClientContext = { ip: req.ip, userAgent: capUserAgent(req.get('user-agent')) };

  if (!sharedSecret || !secretMatches(req.get(BFF_AUTH_HEADER), sharedSecret)) {
    return fallback;
  }

  const assertedIp = req.get(CLIENT_IP_HEADER)?.trim();
  if (!assertedIp || isIP(assertedIp) === 0) {
    return fallback;
  }

  return {
    ip: assertedIp,
    userAgent: capUserAgent(req.get(CLIENT_UA_HEADER)) ?? fallback.userAgent,
  };
}
