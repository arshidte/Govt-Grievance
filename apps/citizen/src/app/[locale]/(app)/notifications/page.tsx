import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@pg/ui';

export async function generateMetadata() {
  const t = await getTranslations('notifications');
  return { title: t('title') };
}

/**
 * Notifications shell. Notification data arrives in M2 (same milestone as
 * issue data) — this page is a server component that only renders the
 * empty-state copy; there is no network call here to show loading/error
 * states for yet, so none are invented.
 */
export default async function NotificationsPage() {
  const t = await getTranslations('notifications');

  return (
    <div className="flex flex-col gap-6 p-4" data-testid="notifications-page">
      <h1 className="text-xl font-semibold text-neutral-900">{t('title')}</h1>
      <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} data-testid="notifications-empty-state" />
    </div>
  );
}
