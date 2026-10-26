import { getTranslations } from 'next-intl/server';
import { IssuesDashboard } from '../../../../features/issues/IssuesDashboard';

export async function generateMetadata() {
  const t = await getTranslations('issues');
  return { title: t('dashboardTitle') };
}

/**
 * Authed issue dashboard (spec §12 "Dashboard") — gated by the `(app)`
 * route group's session check. Heading/subtitle are server-rendered static
 * copy; the list itself (the `useIssues` read + loading/empty/error states)
 * is client-side (`IssuesDashboard`), mirroring `ReportPage`/`ProfilePage`'s
 * server-shell + client-feature split.
 */
export default async function IssuesPage() {
  const t = await getTranslations('issues');

  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">{t('dashboardTitle')}</h1>
        <p className="mt-1 text-sm text-neutral-600">{t('dashboardSubtitle')}</p>
      </div>

      <IssuesDashboard />
    </div>
  );
}
