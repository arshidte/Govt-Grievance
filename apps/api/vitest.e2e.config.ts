import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts', 'test/**/*.spec.ts'],
    globals: false,
    root: './',
    // Guarantees DATABASE_URL (and the rest of the root `.env`) is in
    // `process.env` before ANY e2e spec runs, independent of which spec
    // file Vitest happens to import first — see test/setup-env.ts.
    setupFiles: ['./test/setup-env.ts'],
  },
  plugins: [swc.vite()],
});
