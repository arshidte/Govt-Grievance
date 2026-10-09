import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@pg/ui';

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
 */
export default async function LandingPage({ params }: LandingPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  const tAuth = await getTranslations({ locale, namespace: 'auth' });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold text-primary-700">{t('title')}</h1>
        <p className="max-w-md text-base text-neutral-600">{t('tagline')}</p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button asChild data-testid="landing-report-cta">
          <Link href={`/${locale}/login`}>{t('reportCta')}</Link>
        </Button>

        <Button asChild variant="secondary" data-testid="landing-track-cta">
          <Link href={`/${locale}/track`}>{t('trackCta')}</Link>
        </Button>

        <Button asChild variant="ghost" data-testid="landing-login-link">
          <Link href={`/${locale}/login`}>{tAuth('login')}</Link>
        </Button>
      </div>
    </main>
  );
}
