'use client';

import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';

interface NavItem {
  key: 'home' | 'report' | 'issues' | 'profile';
  /** Href relative to the locale prefix (e.g. `/home` -> `/${locale}/home`). */
  href: string;
  /** Whether this item's "current page" state should be matched against the pathname. */
  matchPrefix: string;
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
  { key: 'home', href: '/home', matchPrefix: '/home' },
  { key: 'report', href: '/report', matchPrefix: '/report' },
  { key: 'issues', href: '/issues', matchPrefix: '/issues' },
  { key: 'profile', href: '/profile', matchPrefix: '/profile' },
];

/** Strips a leading `/en` or `/ml` locale segment so pathname matching ignores locale. */
function stripLocale(pathname: string, locale: string): string {
  const prefix = `/${locale}`;
  if (pathname === prefix) return '/';
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  return pathname;
}

/**
 * Sticky bottom navigation for the authed shell: Home / Report / Issues /
 * Profile. Each item is a real `<Link>` (not a button) so it's reachable
 * via normal browser navigation and screen-reader rotor "links" lists.
 *
 * Accessibility: `nav` with an accessible label; the current page is
 * exposed via `aria-current="page"` (not color alone, per WCAG 1.4.1);
 * each link has a visible label (never icon-only) and a >=44px touch
 * target (`min-h-11` = 44px, matching `@pg/ui`'s Button convention).
 */
export function BottomNav() {
  const t = useTranslations('bottomNav');
  const locale = useLocale();
  const pathname = usePathname();
  const unprefixed = stripLocale(pathname, locale);

  return (
    <nav
      aria-label={t('navLabel')}
      className="sticky bottom-0 inset-x-0 z-40 flex border-t border-neutral-200 bg-white"
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
              'flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
              isCurrent ? 'text-primary-700' : 'text-neutral-500 hover:text-neutral-700',
            ].join(' ')}
          >
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
