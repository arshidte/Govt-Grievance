import { useTranslations } from 'next-intl';

/**
 * Landing page placeholder. Public route (see middleware.ts PUBLIC_PATHS).
 * Full landing content is out of scope for this task (shell only).
 */
export default function LandingPage() {
  const t = useTranslations('common');
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <h1 className="text-2xl font-semibold text-primary-700">{t('appName')}</h1>
    </main>
  );
}
