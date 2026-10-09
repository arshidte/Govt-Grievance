import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@pg/ui';

/**
 * Landing page placeholder. Public route (see middleware.ts PUBLIC_PATHS).
 * Full landing content is out of scope for this task (shell only) — the
 * Login link added here (T23) is the minimum needed for the citizen auth
 * flow to be reachable from `/`.
 */
export default function LandingPage() {
  const t = useTranslations('common');
  const tAuth = useTranslations('auth');
  const locale = useLocale();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold text-primary-700">{t('appName')}</h1>
      <Button asChild data-testid="landing-login-link">
        <Link href={`/${locale}/login`}>{tAuth('login')}</Link>
      </Button>
    </main>
  );
}
