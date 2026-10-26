'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@pg/ui';
import type { Language } from '@pg/types';

import { NotificationBell } from '../features/notifications/NotificationBell';

/** Replaces the leading `/en` or `/ml` segment of `pathname` with `/${nextLocale}`. */
function withLocale(pathname: string, currentLocale: string, nextLocale: string): string {
  const prefix = `/${currentLocale}`;
  const rest = pathname === prefix ? '' : pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
  return `/${nextLocale}${rest}`;
}

/**
 * Minimal header for the authed `(app)` shell: the app name, the
 * notification bell (T23), and the `LanguageSwitcher` (T24 — not wired
 * anywhere yet; the brief's e2e extension needs it reachable from an
 * authed page). Switching language navigates to the SAME route under the
 * other locale's prefix (next-intl's `localePrefix: 'always'` strategy —
 * see middleware.ts), re-rendering the page with that locale's messages.
 */
export function AppHeader() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
      <span className="text-sm font-semibold text-primary-700">{t('common.appName')}</span>
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
