'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { MeResponse } from '@pg/types';
import { can, type CanUser } from '../features/auth/can';
import { navItems } from '../features/nav/navItems';

export interface SidebarProps {
  /**
   * The signed-in user's role assignments only (not the full `MeResponse`)
   * — the `(app)` layout already fetched `me` SERVER-side for the staff
   * gate (see src/app/[locale]/(app)/layout.tsx) and passes just `roles`
   * down, so this client component never needs its own `useMe` round-trip
   * or a new BFF surface.
   */
  roles: MeResponse['roles'];
}

/** Strips a leading `/en` or `/ml` locale segment so pathname matching ignores locale. */
function stripLocale(pathname: string, locale: string): string {
  const prefix = `/${locale}`;
  if (pathname === prefix) return '/';
  if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  return pathname;
}

function isActive(unprefixed: string, href: string): boolean {
  if (href === '/') return unprefixed === '/';
  return unprefixed === href || unprefixed.startsWith(`${href}/`);
}

/**
 * Nav link list shared by the desktop Sidebar and the MobileDrawer — same
 * items, same filtering, same active-state logic, just rendered inside
 * different chrome. Exported so MobileDrawer can reuse it without
 * duplicating the `can()` filter or the active-route match.
 */
export function NavLinks({ roles, onNavigate }: SidebarProps & { onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const unprefixed = stripLocale(pathname, locale);
  const user: CanUser = roles;

  return (
    <ul className="flex flex-col gap-1">
      {navItems
        .filter((item) => can(user, item.permission))
        .map((item) => {
          const active = isActive(unprefixed, item.href);
          return (
            <li key={item.key}>
              <Link
                href={`/${locale}${item.href}`}
                aria-current={active ? 'page' : undefined}
                data-testid={`nav-link-${item.key}`}
                onClick={onNavigate}
                className={[
                  'flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                  active
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900',
                ].join(' ')}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
    </ul>
  );
}

/**
 * Desktop PERSISTENT sidebar — visible at `lg` and up (`hidden lg:flex`);
 * below `lg` it is replaced by `MobileDrawer`'s toggleable overlay (both
 * share `NavLinks`, so the item set/filtering/active-state never drifts
 * between the two presentations). A plain `<nav>` landmark with an
 * accessible label; active route exposed via `aria-current="page"`
 * (WCAG 1.4.1 — never color alone).
 */
export function Sidebar({ roles }: SidebarProps) {
  const t = useTranslations('common');

  return (
    <nav
      aria-label={t('appName')}
      data-testid="admin-sidebar"
      className="hidden w-64 shrink-0 flex-col gap-1 border-r border-neutral-200 bg-white p-4 lg:flex"
    >
      <NavLinks roles={roles} />
    </nav>
  );
}
