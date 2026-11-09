'use client';

import type { Language } from '@pg/types';
import { LanguageSwitcher } from '@pg/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { NotificationBell } from '../features/notifications/NotificationBell';

/**
 * DESKTOP top bar for the authed `(app)` shell — shown at `lg` and up only
 * (`hidden lg:flex`), paired with the persistent `CitizenSidebar`. Below `lg`
 * the `AppHeader` carries the bell + language switcher instead.
 *
 * Left: the current page's context (its sidebar label, derived from the
 * locale-stripped pathname). Right: the `NotificationBell` + `LanguageSwitcher`
 * so both stay reachable on desktop (the brief requires the bell to be
 * reachable without the mobile header). Those feature components are only
 * composed here — their testids (`notification-bell`, the ML/EN radios) are
 * untouched.
 *
 * This is NOT a page `PageHeader` (that belongs to each page's CONTENT, a
 * later phase) — it's shell chrome: a thin context strip above the canvas.
 */

/** Maps the leading path segment to its `sidebar` i18n key for the page context. */
const SEGMENT_TO_KEY: Record<string, 'home' | 'issues' | 'report' | 'notifications' | 'profile'> = {
  home: 'home',
  issues: 'issues',
  report: 'report',
  notifications: 'notifications',
  profile: 'profile',
};

/** Replaces the leading `/en` or `/ml` segment of `pathname` with `/${nextLocale}`. */
function withLocale(pathname: string, currentLocale: string, nextLocale: string): string {
  const prefix = `/${currentLocale}`;
  const rest =
    pathname === prefix
      ? ''
      : pathname.startsWith(`${prefix}/`)
        ? pathname.slice(prefix.length)
        : pathname;
  return `/${nextLocale}${rest}`;
}

/** Returns the first non-locale path segment (e.g. `/en/issues/123` -> `issues`). */
function firstSegment(pathname: string, locale: string): string {
  const prefix = `/${locale}`;
  const rest = pathname.startsWith(`${prefix}/`)
    ? pathname.slice(prefix.length)
    : pathname === prefix
      ? '/'
      : pathname;
  return rest.split('/').filter(Boolean)[0] ?? '';
}

export function CitizenTopBar() {
  const t = useTranslations();
  const tSidebar = useTranslations('sidebar');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const segment = firstSegment(pathname, locale);
  const pageKey = SEGMENT_TO_KEY[segment];
  // Fall back to the app name when the segment isn't one of the known pages
  // (so the strip never renders blank on an unexpected route).
  const context = pageKey ? tSidebar(pageKey) : t('common.appName');

  return (
    <header
      data-testid="citizen-topbar"
      className="hidden items-center justify-between border-b border-neutral-200 bg-white px-6 py-4 lg:flex"
    >
      <span className="text-base font-semibold text-neutral-900">{context}</span>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <LanguageSwitcher
          value={locale as Language}
          onChange={(nextLocale) => router.push(withLocale(pathname, locale, nextLocale))}
          t={(key) => t(key)}
        />
      </div>
    </header>
  );
}
