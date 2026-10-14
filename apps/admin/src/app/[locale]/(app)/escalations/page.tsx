import { getTranslations } from 'next-intl/server';
import { ModulePage } from '../../../../components/ModulePage';

/**
 * Placeholder shell for the escalations module (M2+ scope — see ModulePage.tsx).
 * Reached only once the `(app)` layout's staff gate + shell have passed;
 * this page itself does no auth work.
 */
export default async function EscalationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [tNav, tModules] = await Promise.all([
    getTranslations({ locale, namespace: 'nav' }),
    getTranslations({ locale, namespace: 'admin.modules' }),
  ]);

  return (
    <ModulePage
      title={tNav('escalations')}
      description={tModules('escalationsDescription')}
      testId="admin-escalations-page"
    />
  );
}
