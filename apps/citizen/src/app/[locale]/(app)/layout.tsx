import type { ReactNode } from 'react';
import { AppHeader } from '../../../components/AppHeader';
import { BottomNav } from '../../../components/BottomNav';

/**
 * Authed shell layout for the `(app)` route group (home, profile,
 * notifications — all gated by `middleware.ts`'s cookie-presence check,
 * since none of their paths are in `PUBLIC_PATHS`). Route groups don't
 * affect the URL (`(app)/home` still serves `/home`), so this adds no new
 * segment — it only wraps these routes with the mobile-first shell: a
 * header (app name + `LanguageSwitcher`), a scrollable main content area,
 * and the sticky bottom nav.
 *
 * `pb-16` on `<main>` reserves space so page content never renders behind
 * the sticky nav (`BottomNav` itself has no fixed height asserted here, but
 * its items are `min-h-11` = 44px plus `py-2` padding, roughly 60px total —
 * `pb-16` (64px) comfortably clears that on every supported viewport).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="flex-1 pb-16">{children}</main>
      <BottomNav />
    </div>
  );
}
