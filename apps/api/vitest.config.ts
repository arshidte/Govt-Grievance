import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    globals: false,
    root: './',
    // Same env bootstrap as the e2e config: loads the root `.env` and, under
    // M4D, points the test process's DATABASE_URL at the admin/migration role
    // (DIRECT_DATABASE_URL) so DB-backed unit specs — which purge append-only
    // AuditLog rows via the superuser bypass — keep working. No-op when
    // DIRECT_DATABASE_URL is unset. See test/setup-env.ts.
    setupFiles: ['./test/setup-env.ts'],
  },
  plugins: [swc.vite()],
});
