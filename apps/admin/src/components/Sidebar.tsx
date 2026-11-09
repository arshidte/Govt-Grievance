'use client';

import { Avatar, NavItem, SidebarNav } from '@pg/ui';
import {
  Bell,
  Building2,
  FolderTree,
  Landmark,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  MapPin,
  ScrollText,
  Settings,
  ShieldAlert,
  Users,
  UserCog,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { MeResponse, Role } from '@pg/types';
import { can, type CanUser } from '../features/auth/can';
import { LogoutButton } from '../features/auth/LogoutButton';
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

/**
 * Lucide icon per nav key. Decorative only (the label carries the meaning —
 * the icon is `aria-hidden` inside `NavItem`), so this map is purely a visual
 * refinement and never affects routing/filtering. Keyed by `navItems[].key`;
 * every current key has an entry so the sidebar/drawer always show an icon.
 */
const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  issues: ListChecks,
  panchayats: Landmark,
  wards: MapPin,
  representatives: UsersRound,
  coordinators: UserCog,
  citizens: Users,
  categories: FolderTree,
  escalations: ShieldAlert,
  notifications: Bell,
  reports: ScrollText,
  settings: Settings,
  auditLogs: Building2,
};

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
 *
 * Each row is rendered through the shared `@pg/ui` `NavItem` (via `asChild`
 * so the real Next `<Link>` is slotted in and the item stays reachable as a
 * normal link), which supplies the design-language styling: selected rows get
 * the solid `bg-primary-600 text-white` fill + `aria-current="page"`,
 * unselected rows lift to `hover:bg-neutral-100`. The `nav-link-<key>`
 * testid, the `aria-current` contract, the `can()` role filter, and the
 * locale-aware href are all preserved EXACTLY — only the chrome changed.
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
          const Icon = NAV_ICONS[item.key];
          return (
            <li key={item.key}>
              <NavItem
                asChild
                active={active}
                icon={Icon != null ? <Icon className="h-5 w-5" /> : undefined}
                label={t(item.key)}
                data-testid={`nav-link-${item.key}`}
              >
                {/* The real link: `NavItem` slots our icon + label inside it,
                    keeps the `aria-current` / selected style from `active`,
                    and `onNavigate` closes the mobile drawer on tap. */}
                <Link href={`/${locale}${item.href}`} onClick={onNavigate} />
              </NavItem>
            </li>
          );
        })}
    </ul>
  );
}

/**
 * Picks the highest-privilege role to label the signed-in staff member in
 * the sidebar footer. The layout passes only `roles` (no full name), so the
 * footer shows a role label rather than inventing a name or triggering a new
 * `useMe` fetch. ADMIN outranks COORDINATOR outranks REPRESENTATIVE; anything
 * else (there shouldn't be — the staff gate runs first) falls back to the
 * generic "Staff" label.
 */
function primaryRoleKey(roles: MeResponse['roles']): 'admin' | 'coordinator' | 'representative' | 'staff' {
  const held = new Set<Role>(roles.map((r) => r.role));
  if (held.has('ADMIN')) return 'admin';
  if (held.has('COORDINATOR')) return 'coordinator';
  if (held.has('REPRESENTATIVE')) return 'representative';
  return 'staff';
}

/**
 * Desktop PERSISTENT sidebar — visible at `lg` and up (`hidden lg:flex`);
 * below `lg` it is replaced by `MobileDrawer`'s toggleable overlay (both
 * share `NavLinks`, so the item set/filtering/active-state never drifts
 * between the two presentations).
 *
 * Built on the shared `@pg/ui` `SidebarNav` chrome (white surface + hairline
 * right border per the design language): a brand block with a civic
 * `Landmark` icon on top, the `NavLinks` list in the middle, and a footer
 * with the staff identity (`Avatar` + role label derived from `roles`) plus
 * the existing `LogoutButton`. `admin-sidebar` testid + `hidden lg:flex` are
 * forwarded onto the `SidebarNav` `<nav>` so the Playwright shell contract is
 * unchanged. `LogoutButton` remains a separate action (NOT a nav item / not
 * `can()`-filtered), pinned in the footer.
 */
export function Sidebar({ roles }: SidebarProps) {
  const t = useTranslations('common');
  const tNav = useTranslations('nav');
  const tAdmin = useTranslations('admin');
  const locale = useLocale();

  const roleLabel = tAdmin(`roles.${primaryRoleKey(roles)}`);

  const brand = (
    <Link
      href={`/${locale}/`}
      className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      data-testid="sidebar-brand"
    >
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white"
        aria-hidden="true"
      >
        <Landmark className="h-5 w-5" />
      </span>
      <span className="text-sm font-semibold text-neutral-900">{t('appName')}</span>
    </Link>
  );

  const footer = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3" data-testid="sidebar-user">
        <Avatar name={roleLabel} size="md" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-neutral-900">{roleLabel}</span>
          <span className="truncate text-xs text-neutral-500">{tNav('dashboard')}</span>
        </div>
      </div>
      <LogoutButton />
    </div>
  );

  return (
    <SidebarNav
      aria-label={t('appName')}
      data-testid="admin-sidebar"
      brand={brand}
      footer={footer}
      className="hidden shrink-0 lg:flex"
    >
      <NavLinks roles={roles} />
    </SidebarNav>
  );
}
