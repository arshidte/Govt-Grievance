import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Inter, Noto_Sans_Malayalam } from 'next/font/google';
import { locales, type Locale } from '@pg/i18n';
import { fonts } from '@pg/ui';
import '@pg/ui/styles/globals.css';
import { Providers } from '../../providers';

/**
 * Fonts: the app owns `next/font` (per the framework-agnostic split
 * documented in packages/ui/src/fonts.ts) and assigns the loaded fonts'
 * `.variable` CSS classes to the SAME CSS variable names `@pg/ui`'s
 * Tailwind preset and globals.css already reference (`--font-sans`,
 * `--font-malayalam`), so `font-sans` / `font-malayalam` utilities work
 * without any extra per-app Tailwind config.
 *
 * NOTE: `next/font` requires its config object to be a statically analyzable
 * literal (its babel/SWC plugin inlines the call) — `variable: fonts.vars.sans`
 * fails the build ("Font loader values must be explicitly written literals").
 * So the `--font-sans` / `--font-malayalam` strings are duplicated here as
 * literals; the assertions below fail typecheck if `@pg/ui`'s fonts.ts ever
 * renames them, keeping the two in sync.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const notoSansMalayalam = Noto_Sans_Malayalam({
  subsets: ['malayalam'],
  variable: '--font-malayalam',
  display: 'swap',
});

type AssertSansVar = typeof fonts.vars.sans extends '--font-sans' ? true : never;
type AssertMalayalamVar = typeof fonts.vars.malayalam extends '--font-malayalam' ? true : never;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _assertFontVarsInSync: [AssertSansVar, AssertMalayalamVar] = [true, true];

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const messages = await getMessages();

  return (
    <html lang={locale} className={`${inter.variable} ${notoSansMalayalam.variable}`}>
      <body className="font-sans">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
