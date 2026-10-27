/**
 * Masks `phone` to its last 4 digits for audit metadata (e.g.
 * `+919876543210` -> `*********3210`). GLOBAL CONSTRAINT: audit metadata
 * must never contain a plaintext phone number or OTP code — this is the
 * only form of `phone` that may ever be recorded.
 *
 * SINGLE SOURCE OF TRUTH: this function was extracted from a private helper
 * in `auth.controller.ts` so both the auth flow and the on-behalf flow
 * (Task 12) mask identically — no drift. Do NOT re-implement masking
 * anywhere else; import this.
 */
export function maskPhone(phone: string): string {
  const visible = phone.slice(-4);
  return '*'.repeat(Math.max(phone.length - visible.length, 0)) + visible;
}
