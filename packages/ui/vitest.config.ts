import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * @pg/ui test environment.
 *
 * Every test in this package runs under jsdom + the React plugin so that
 * component tests (button/otp-input/etc.) can render real DOM and fire
 * real events via @testing-library/user-event. The pre-existing T19
 * tokens test (src/tokens.test.ts) is plain Node-ish logic with no DOM
 * dependency, so it runs unchanged under jsdom too — jsdom is a superset
 * environment for code that never touches `window`/`document`.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: false,
  },
});
