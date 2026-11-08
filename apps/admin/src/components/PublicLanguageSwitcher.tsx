'use client';

import type { Language } from '@pg/types';
import { LanguageSwitcher } from '@pg/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

/**
 * Locale toggle for the admin app's PUBLIC / unauthenticated screens (login,
 * verify). The authed shell already wires its locale context via the sidebar;
 * those pages live inside the `(app)` layout. The public auth pages have NO
 * such shell, so this thin client wrapper supplies the same locale-swap
 * behaviour the citizen app uses on its public pages: it swaps the leading
 * `/en` or `/ml` segment of the current pathname and navigates, preserving the
 * rest of the route (any query string stays on the client via the router).
 *
 * Deliberately a self-contained admin copy (NOT an import of the citizen app's
 * `PublicLanguageSwitcher`) so the two apps stay independently buildable; the
 * shared `@pg/ui` `LanguageSwitcher` (its `radiogroup` + EN/ML radios the e2e
 * relies on) is what both reuse verbatim — this only owns the navigation
 * side-effect.
 */

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

export interface PublicLanguageSwitcherProps {
  className?: string;
}

export function PublicLanguageSwitcher({ className }: PublicLanguageSwitcherProps) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <LanguageSwitcher
      className={className}
      value={locale as Language}
      onChange={(nextLocale) => router.push(withLocale(pathname, locale, nextLocale))}
      t={(key) => t(key)}
    />
  );
}
