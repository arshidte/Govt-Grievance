/**
 * Pure predicate backing the dev-only endpoints' in-handler production
 * guard (belt #2 — belt #1 is `DevModule` not being imported into
 * `AppModule` at all when `env.NODE_ENV === 'production'`, see
 * `src/app.module.ts`).
 *
 * Kept as a standalone pure function (rather than inlining the comparison
 * in the controller) specifically so a unit test can assert the guard's
 * CONDITION directly — including the `'production'` case — without having
 * to boot a whole second Nest app with `NODE_ENV=production` (`env` is
 * parsed once, eagerly, at process start; see `src/config/env.ts`).
 */
export function isDevEndpointEnabled(nodeEnv: string): boolean {
  return nodeEnv !== 'production';
}
