import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// @testing-library/react does not auto-cleanup under vitest unless its
// globals are enabled; we run with `globals: false` (see vitest.config.ts),
// so unmount explicitly after every test to avoid leaking DOM nodes across
// test cases. Safe to run for non-component (node-environment) tests too —
// `cleanup()` is a no-op when nothing was rendered.
afterEach(() => {
  cleanup();
});
