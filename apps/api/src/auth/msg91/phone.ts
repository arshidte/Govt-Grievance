import { phoneSchema } from '@pg/types';

import { ApiError } from '../../common/api-error';

/** Uniform rejection for an unverifiable / non-conforming MSG91 identifier. */
function invalidToken(): ApiError {
  return new ApiError('invalid_token', 401, 'states.forbidden');
}

/**
 * Normalizes an MSG91-returned identifier to our canonical `+91XXXXXXXXXX`
 * form. MSG91 returns the verified mobile WITH country code but WITHOUT the
 * leading `+` (e.g. `919876543210`). We support Indian mobile numbers ONLY —
 * an email identifier or any value that doesn't match `phoneSchema` is
 * rejected (uniform `invalid_token`). This is the single place a verified
 * identifier becomes a trusted phone, so validation lives here.
 */
export function normalizeVerifiedPhone(identifier: string): string {
  const trimmed = (identifier ?? '').trim();
  if (!trimmed) {
    throw invalidToken();
  }
  const candidate = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  const parsed = phoneSchema.safeParse(candidate);
  if (!parsed.success) {
    throw invalidToken();
  }
  return parsed.data;
}
