import { Button, Card } from '@pg/ui';
import { Landmark } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { PublicLanguageSwitcher } from '../../components/PublicLanguageSwitcher';

interface LandingPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * SEO metadata for the public landing page. This is a SERVER component
 * (no `'use client'` directive — see module-level absence below) precisely
 * so `generateMetadata` can run and emit a real `<title>`/meta description
 * for crawlers/social previews, which a client component cannot do.
 */
export async function generateMetadata({ params }: LandingPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

/**
 * Public landing page (see middleware.ts PUBLIC_PATHS — `/` is public).
 * Primary CTA is "Report an Issue" (issue creation itself is M2 scope, so
 * it currently routes to `/login` — reporting requires an authenticated
 * citizen — mirroring the BottomNav's same placeholder-destination note).
 * Secondary actions: Track a grievance (public, no auth) and Log in.
 *
 * Revamp P3 — calm civic hero on a `bg-neutral-50` canvas: a civic brand
 * mark, the app name, a one-line value prop, and a single centered white
 * `Card` holding the CTAs. No invented stats/illustrations. The
 * `LanguageSwitcher` is parked top-right (reachable before auth), matching
 * the rest of the public screens.
 */
export default async function LandingPage({ params }: LandingPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  const tAuth = await getTranslations({ locale, namespace: 'auth' });

  return (
    <main className="flex min-h-screen flex-col bg-neutral-50">
      <div className="flex justify-end p-4">
        <PublicLanguageSwitcher />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 pb-16 text-center">
        {/* Civic brand mark: Landmark glyph in a solid primary chip, matching
            the authed sidebar + the auth screens for cross-shell consistency. */}
        <div className="flex flex-col items-center gap-5">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary-600 text-white"
            aria-hidden="true"
          >
            <Landmark className="h-7 w-7" />
          </span>

          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold text-neutral-900">{t('title')}</h1>
            <p className="max-w-md text-base text-neutral-600">{t('tagline')}</p>
          </div>
        </div>

        <Card className="flex w-full max-w-sm flex-col gap-3">
          <Button asChild data-testid="landing-report-cta">
            <Link href={`/${locale}/login`}>{t('reportCta')}</Link>
          </Button>

          <Button asChild variant="secondary" data-testid="landing-track-cta">
            <Link href={`/${locale}/track`}>{t('trackCta')}</Link>
          </Button>

          <Button asChild variant="ghost" data-testid="landing-login-link">
            <Link href={`/${locale}/login`}>{tAuth('login')}</Link>
          </Button>
        </Card>
      </div>
    </main>
  );
}
