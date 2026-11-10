import { ApiClientError } from '@pg/api-client';

/**
 * The org-management error message keys that have i18n entries. Restricting to
 * this set guarantees every key we translate exists (next-intl would throw on
 * a missing key), so any unexpected/other error falls back to the generic one.
 */
const KNOWN_KEYS = new Set([
  'errors.panchayatNotFound',
  'errors.panchayatCodeTaken',
  'errors.panchayatInactive',
  'errors.wardNotFound',
  'errors.wardNumberTaken',
  'errors.wardInactive',
  'errors.userNotFound',
  'errors.assignmentExists',
  'errors.assignmentNotFound',
  // Staff onboarding
  'errors.onboardingPendingExists',
  'errors.onboardingNotFound',
  'errors.onboardingNotPending',
  'errors.onboardingPhoneMismatch',
  'errors.resendCooldown',
  'errors.scopeRequired',
  // OTP verification (from the auth namespace)
  'auth.invalidCode',
  'auth.tooMany',
  'errors.generic',
]);

/**
 * Maps an API error to a translatable message key. The backend's uniform error
 * body carries a `messageKey` (e.g. `errors.panchayatCodeTaken`) surfaced by
 * `ApiClientError`; we translate that only when it is a known key, else the
 * generic fallback.
 */
export function orgErrorKey(err: unknown): string {
  if (err instanceof ApiClientError && KNOWN_KEYS.has(err.messageKey)) {
    return err.messageKey;
  }
  return 'errors.generic';
}
