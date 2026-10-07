/**
 * A typed, translatable application error.
 *
 * `code` is a stable machine-readable identifier (e.g. `validation`,
 * `rate_limited`). `status` is the HTTP status to respond with. `messageKey`
 * is an i18n key (or, for validation errors, a Zod issue message such as
 * `invalid_phone`) that the frontend resolves to a user-facing string.
 *
 * Never put raw/internal error text in `messageKey` — it is returned to
 * clients verbatim via the global exception filter.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly messageKey: string,
  ) {
    super(`${code}: ${messageKey}`);
    this.name = 'ApiError';
  }
}
