import { BFF_AUTH_HEADER, CLIENT_IP_HEADER, CLIENT_UA_HEADER } from '@pg/types';

/**
 * SERVER-SIDE ONLY (BFF route handlers / server components). Builds the
 * headers that tell the API who the END USER is, from the incoming browser
 * request's headers:
 *
 * - client ip: `x-real-ip`, else the FIRST `x-forwarded-for` hop. On Vercel
 *   both are set by the platform edge from the real connection (any
 *   client-supplied value is overwritten), so they are safe to read here.
 * - user-agent: the browser's own `user-agent`.
 *
 * The values are only useful to the API together with `BFF_AUTH_HEADER`
 * carrying the shared secret, so with no secret configured — or no known
 * client ip — this returns `{}` and the request is sent exactly as before.
 * `sharedSecret` is passed in (never read from `process.env` here) so this
 * module can never pull a secret into a browser bundle.
 */
export function clientContextHeaders(
  incoming: Headers,
  sharedSecret: string | undefined,
): Record<string, string> {
  if (!sharedSecret) return {};

  const clientIp =
    incoming.get('x-real-ip')?.trim() || incoming.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (!clientIp) return {};

  const headers: Record<string, string> = {
    [BFF_AUTH_HEADER]: sharedSecret,
    [CLIENT_IP_HEADER]: clientIp,
  };
  const userAgent = incoming.get('user-agent');
  if (userAgent) headers[CLIENT_UA_HEADER] = userAgent;
  return headers;
}
