import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// @testing-library/react does not auto-cleanup under vitest unless its
// globals are enabled; we run with `globals: false`, so unmount explicitly
// after every test to avoid leaking DOM nodes (and duplicate role matches)
// across test cases.
afterEach(() => {
  cleanup();
});
