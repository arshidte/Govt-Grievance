import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Default `environment: 'node'` suits the middleware test (invokes the
 * exported `middleware` function directly against a constructed
 * `NextRequest` — no running server, no Edge runtime, no DOM needed) and
 * the pure `requireStaff` unit test. Component tests (added in later
 * admin tasks) can opt into jsdom per-file via a `// @vitest-environment
 * jsdom` directive comment rather than flipping the whole suite's default.
 * The React plugin (JSX/Fast Refresh transform) is needed globally since
 * both environments may import .tsx files.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    // `e2e/**` holds Playwright specs (authored in T25, execution deferred
    // to T28 per ruling R15 — see e2e/admin-auth.spec.ts's header
    // comment). They import `@playwright/test`, which is intentionally
    // NOT installed yet; excluding the directory here keeps `vitest run`
    // from trying to collect them as Vitest tests.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // `next` ships without a package.json `exports` map (it relies on
    // bundler-style CJS resolution for subpaths like `next/server`).
    // Under Vitest's default SSR "externalize" behavior, that subpath is
    // resolved via plain Node ESM, which — unlike Node's CJS resolver —
    // does NOT fall back to appending `.js`, so `next/server` fails to
    // resolve. Inlining `next` (and `next-intl`, which imports it) routes
    // the resolution through Vite's own resolver instead, which handles
    // extensionless node_modules subpaths correctly.
    server: {
      deps: {
        inline: ['next', 'next-intl'],
      },
    },
  },
});
