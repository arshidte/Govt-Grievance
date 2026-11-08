'use client';

import { useMe } from '@pg/api-client';
import { Avatar, NavItem, SidebarNav } from '@pg/ui';
import { Bell, FilePlus2, Home, Landmark, ListChecks, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { useApiClient } from '../features/auth/api-client';
import { LogoutButton } from '../features/auth/LogoutButton';

/**
 * Desktop persistent sidebar for the authed citizen `(app)` shell — visible
 * at `lg` and up (`hidden lg:flex`, applied by the layout); below `lg` the
 * mobile `AppHeader` + `BottomNav` take over instead (there is no citizen
 * drawer — the thumb-friendly bottom nav is the mobile pattern per the
 * design language).
 *
 * Mirrors the admin `Sidebar.tsx` pattern (locale-stripped active-route
 * match via `stripLocale`, each item a real `<Link>` so it is reachable via
 * normal browser navigation / SR link lists) but renders through the shared
 * `@pg/ui` `SidebarNav` + `NavItem` chrome rather than bespoke markup, so the
 * brand/nav/footer layout and the selected-item styling stay consistent with
 * the admin app.
 *
 * Nav items carry `data-testid="sidebar-nav-<key>"` and the active item gets
 * `aria-current="page"` (via `NavItem`'s `active` prop — never color alone,
 * WCAG 1.4.1). Labels come from the `sidebar` i18n namespace (clearer,
 * desktop-specific wording like "My Grievances" / "Submit a Grievance",
 * leaving the terse mobile `bottomNav` labels untouched).
 */

/** One desktop sidebar entry. `key` doubles as the testid suffix + i18n key. */
interface SidebarItem {
  key: 'home' | 'issues' | 'report' | 'notifications' | 'profile';
  /** Href relative to the locale prefix (e.g. `/home` -> `/${locale}/home`). */
  href: string;
  /** Lucide icon component rendered decoratively inside the NavItem. */
  Icon: typeof Home;
}

const NAV_ITEMS: SidebarItem[] = [
  { key: 'home', href: '/home', Icon: Home },
  { key: 'issues', href: '/issues', Icon: ListChecks },
  { key: 'report', href: '/report', Icon: FilePlus2 },
  { key: 'notifications', href: '/notifications', Icon: Bell },
  { key: 'profile', href: '/profile', Icon: User },
];

/** Strips a leading `/en` or `/ml` locale segment so pathname matching ignores locale. */
function stripLocale(pathname: string, locale: string): string {
  const prefix = `/${locale}`;
  if (pathname === prefix) return '/';
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  return pathname;
}

/** True when `unprefixed` is `href` itself or a child route under it. */
function isActive(unprefixed: string, href: string): boolean {
  return unprefixed === href || unprefixed.startsWith(`${href}/`);
}

export function CitizenSidebar() {
  const t = useTranslations('sidebar');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();
  const unprefixed = stripLocale(pathname, locale);

  // The one real network read this shell needs: the signed-in citizen, for
  // the footer identity card (name + phone). It reuses the SAME query key as
  // the rest of the app (`queryKeys.me`), so it's served from cache and never
  // triggers an extra round-trip on top of what pages already fetch.
  const client = useApiClient();
  const me = useMe(client);
  const fullName = me.data?.fullName ?? undefined;
  const phone = me.data?.phone;

  const brand = (
    <Link
      href={`/${locale}/home`}
      className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      data-testid="sidebar-brand"
    >
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white"
        aria-hidden="true"
      >
        <Landmark className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold text-neutral-900">{tCommon('appName')}</span>
    </Link>
  );

  const footer = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3" data-testid="sidebar-user">
        <Avatar name={fullName} size="md" />
        <div className="flex min-w-0 flex-col">
          {/* Fall back to the generic "Signed in" label while `me` is still
              loading or the citizen has no name yet, so the card never shows
              an empty line. */}
          <span className="truncate text-sm font-medium text-neutral-900">
            {fullName ?? t('signedInAs')}
          </span>
          {phone != null && (
            <span className="truncate text-xs text-neutral-500">{phone}</span>
          )}
        </div>
      </div>
      <LogoutButton />
    </div>
  );

  return (
    <SidebarNav
      aria-label={t('navLabel')}
      data-testid="citizen-sidebar"
      brand={brand}
      footer={footer}
      className="hidden lg:flex"
    >
      {NAV_ITEMS.map(({ key, href, Icon }) => (
        <NavItem
          key={key}
          asChild
          active={isActive(unprefixed, href)}
          icon={<Icon className="h-5 w-5" />}
          label={t(key)}
          data-testid={`sidebar-nav-${key}`}
        >
          <Link href={`/${locale}${href}`} />
        </NavItem>
      ))}
    </SidebarNav>
  );
}
