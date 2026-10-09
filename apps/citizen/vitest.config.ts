import { defineConfig } from 'vitest/config';

/**
 * Middleware runs in the Edge runtime in production, but for this unit
 * test we invoke the exported `middleware` function directly against a
 * constructed `NextRequest` — no running server, no Edge runtime needed.
 * Plain Node environment is sufficient.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
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
