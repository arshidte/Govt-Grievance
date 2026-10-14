import { getTranslations } from 'next-intl/server';
import { ModulePage } from '../../../../components/ModulePage';

/**
 * Placeholder shell for the notifications module (M2+ scope — see ModulePage.tsx).
 * Reached only once the `(app)` layout's staff gate + shell have passed;
 * this page itself does no auth work.
 */
export default async function NotificationsPage({
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
      title={tNav('notifications')}
      description={tModules('notificationsDescription')}
      testId="admin-notifications-page"
    />
  );
}
