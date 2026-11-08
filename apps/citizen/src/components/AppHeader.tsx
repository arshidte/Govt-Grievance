'use client';

import type { Language } from '@pg/types';
import { LanguageSwitcher } from '@pg/ui';
import { Landmark } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { NotificationBell } from '../features/notifications/NotificationBell';

/** Replaces the leading `/en` or `/ml` segment of `pathname` with `/${nextLocale}`. */
function withLocale(pathname: string, currentLocale: string, nextLocale: string): string {
  const prefix = `/${currentLocale}`;
  const rest = pathname === prefix ? '' : pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
  return `/${nextLocale}${rest}`;
}

/**
 * MOBILE header for the authed `(app)` shell: the app name + a small civic
 * brand mark, the notification bell (T23), and the `LanguageSwitcher` (T24).
 * Only shown below `lg` (`lg:hidden`) — on desktop the persistent
 * `CitizenSidebar` + the main top bar carry the brand, bell, and language
 * switcher instead.
 *
 * Switching language navigates to the SAME route under the other locale's
 * prefix (next-intl's `localePrefix: 'always'` strategy — see middleware.ts),
 * re-rendering the page with that locale's messages.
 *
 * Restyled to the design language: a clean white bar with a hairline bottom
 * border (no shadow) — testids (`notification-bell`, the language switcher
 * radios) are untouched since those feature components are only composed here.
 */
export function AppHeader() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
      <span className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white"
          aria-hidden="true"
        >
          <Landmark className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-neutral-900">{t('common.appName')}</span>
      </span>
      <div className="flex items-center gap-1">
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
