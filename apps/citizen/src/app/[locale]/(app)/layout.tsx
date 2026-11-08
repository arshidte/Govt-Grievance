import type { ReactNode } from 'react';

import { AppHeader } from '../../../components/AppHeader';
import { BottomNav } from '../../../components/BottomNav';
import { CitizenSidebar } from '../../../components/CitizenSidebar';
import { CitizenTopBar } from '../../../components/CitizenTopBar';

/**
 * Authed shell layout for the `(app)` route group (home, issues, report,
 * notifications, profile — all gated by `middleware.ts`'s cookie-presence
 * check, since none of their paths are in `PUBLIC_PATHS`). Route groups don't
 * affect the URL (`(app)/home` still serves `/home`), so this adds no new
 * segment — it only wraps these routes with the responsive shell chrome.
 *
 * Responsive composition (revamp P3-shell):
 *  - Desktop (`lg` and up): a persistent left `CitizenSidebar`
 *    (`hidden lg:flex`) + a `CitizenTopBar` (page context + bell + language
 *    switcher) above the page content.
 *  - Mobile (`< lg`): the `AppHeader` (brand + bell + language switcher,
 *    `lg:hidden`) on top and the sticky `BottomNav` (`lg:hidden`) at the
 *    bottom — the thumb-friendly nav pattern per the design language.
 *
 * The whole authed area sits on `bg-neutral-50`. The main column caps its
 * content at a readable max width with comfortable gutters (`p-6 lg:p-8`).
 *
 * `pb-16` on the mobile `<main>` reserves space so page content never renders
 * behind the sticky bottom nav; `lg:pb-0` drops that reserve on desktop where
 * the bottom nav is hidden.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-neutral-50">
      {/* Desktop-only persistent sidebar (its own `hidden lg:flex`). */}
      <CitizenSidebar />

      {/* Main column: a flex-col so the top bar / header pin above the
          scrollable content canvas and (on mobile) the bottom nav below. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        {/* Mobile header (`lg:hidden`) + desktop top bar (`hidden lg:flex`). */}
        <AppHeader />
        <CitizenTopBar />

        <main className="flex-1 pb-16 lg:pb-0">
          {/* Readable max-width content column + comfortable gutters. */}
          <div className="mx-auto w-full max-w-5xl p-6 lg:p-8">{children}</div>
        </main>

        {/* Mobile sticky bottom nav (`lg:hidden`). */}
        <BottomNav />
      </div>
    </div>
  );
}
