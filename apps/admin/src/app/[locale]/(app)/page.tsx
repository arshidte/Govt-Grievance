import { getTranslations } from 'next-intl/server';

/**
 * Minimal authed landing area. Reached only once the `(app)` route group's
 * layout (src/app/[locale]/(app)/layout.tsx) has confirmed BOTH a valid
 * session AND a staff role — this page itself does no auth work. The full
 * dashboard is Task 27's scope; this task only needs somewhere real for
 * the staff gate to render `children` into once it passes.
 */
export default async function AdminHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'nav' });

  return (
    <main className="flex min-h-screen flex-col gap-2 p-8" data-testid="admin-dashboard-page">
      <h1 className="text-xl font-semibold text-neutral-900">{t('dashboard')}</h1>
    </main>
  );
}
