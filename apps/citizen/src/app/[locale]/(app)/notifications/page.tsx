import { PageHeader } from '@pg/ui';
import { getTranslations } from 'next-intl/server';

import { NotificationsList } from '../../../../features/notifications/NotificationsList';

export async function generateMetadata() {
  const t = await getTranslations('notifications');
  return { title: t('title') };
}

/**
 * Notifications page (T23): a thin server component — just the heading —
 * delegating all data-fetching/interaction to the `'use client'`
 * `NotificationsList` feature component, mirroring how `/issues` wraps
 * `IssuesDashboard`. The `notifications-page` testid carries over from the
 * prior static shell.
 */
export default async function NotificationsPage() {
  const t = await getTranslations('notifications');

  return (
    <div className="flex flex-col gap-6" data-testid="notifications-page">
      <PageHeader title={t('title')} />
      <NotificationsList />
    </div>
  );
}
