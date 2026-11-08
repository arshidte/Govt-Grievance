'use client';

import { FilePlus2, Home, ListChecks, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

interface NavItem {
  key: 'home' | 'report' | 'issues' | 'profile';
  /** Href relative to the locale prefix (e.g. `/home` -> `/${locale}/home`). */
  href: string;
  /** Whether this item's "current page" state should be matched against the pathname. */
  matchPrefix: string;
  /** Lucide icon rendered above the label (decorative — the label conveys meaning). */
  Icon: typeof Home;
}

/**
 * Task 22: the former "Track" slot (a placeholder pointing at the public
 * `/track` reference-number lookup — see that page's own comment on why a
 * real authed lookup was deferred) now points at `/issues`, the real authed
 * issue dashboard. `/track` itself is UNCHANGED and still reachable
 * (pre-auth visitors use it directly, per `middleware.ts` PUBLIC_PATHS) —
 * only this signed-in shell's nav destination moved, since "my issues" is
 * strictly more useful to an authed citizen than the pre-auth lookup form.
 */
const NAV_ITEMS: NavItem[] = [
  { key: 'home', href: '/home', matchPrefix: '/home', Icon: Home },
  { key: 'report', href: '/report', matchPrefix: '/report', Icon: FilePlus2 },
  { key: 'issues', href: '/issues', matchPrefix: '/issues', Icon: ListChecks },
  { key: 'profile', href: '/profile', matchPrefix: '/profile', Icon: User },
];

/** Strips a leading `/en` or `/ml` locale segment so pathname matching ignores locale. */
function stripLocale(pathname: string, locale: string): string {
  const prefix = `/${locale}`;
  if (pathname === prefix) return '/';
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  return pathname;
}

/**
 * Sticky bottom navigation for the authed MOBILE shell: Home / Report /
 * Issues / Profile. Only shown below `lg` (`lg:hidden`) — on desktop the
 * persistent `CitizenSidebar` replaces it. Each item is a real `<Link>` (not
 * a button) so it's reachable via normal browser navigation and screen-reader
 * rotor "links" lists.
 *
 * Restyled to the design language: a clean white bar with a hairline top
 * border (no shadow); each item is an icon + label stack. The active item is
 * `text-primary-700` AND carries a small top indicator bar (never color alone,
 * WCAG 1.4.1) plus `aria-current="page"`.
 *
 * Accessibility: `nav` with an accessible label; the current page is exposed
 * via `aria-current="page"`; each link has a visible label (never icon-only)
 * and a >=44px touch target (`min-h-11` = 44px, matching `@pg/ui`'s Button
 * convention). Icons are decorative (`aria-hidden`) since the label already
 * conveys meaning. Testids/keys are unchanged (Playwright + RTL depend on
 * them).
 */
export function BottomNav() {
  const t = useTranslations('bottomNav');
  const locale = useLocale();
  const pathname = usePathname();
  const unprefixed = stripLocale(pathname, locale);

  return (
    <nav
      aria-label={t('navLabel')}
      className="sticky bottom-0 inset-x-0 z-40 flex border-t border-neutral-200 bg-white lg:hidden"
      data-testid="bottom-nav"
    >
      {NAV_ITEMS.map((item) => {
        const isCurrent = unprefixed === item.matchPrefix || unprefixed.startsWith(`${item.matchPrefix}/`);
        return (
          <Link
            key={item.key}
            href={`/${locale}${item.href}`}
            aria-current={isCurrent ? 'page' : undefined}
            data-testid={`bottom-nav-${item.key}`}
            className={[
              'relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
              isCurrent ? 'text-primary-700' : 'text-neutral-500 hover:text-neutral-700',
            ].join(' ')}
          >
            {/* Active indicator bar pinned to the top edge of the cell — a
                non-color cue that pairs with the primary text tint. */}
            {isCurrent && (
              <span
                aria-hidden="true"
                className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary-600"
              />
            )}
            <item.Icon className="h-5 w-5" aria-hidden="true" />
            <span>{t(item.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
