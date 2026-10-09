import type { ReactNode } from 'react';

/**
 * Root layout. App Router requires a root `app/layout.tsx` with <html>/<body>;
 * the real app shell (fonts, locale provider, Tailwind globals) lives in
 * `app/[locale]/layout.tsx`, which is the only child this layout ever
 * renders — this file just satisfies Next's requirement and stays minimal.
 * Mirrors the citizen app's root layout exactly.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
