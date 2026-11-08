import { Button, PageHeader } from '@pg/ui';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

import { IssuesDashboard } from '../../../../features/issues/IssuesDashboard';

export async function generateMetadata() {
  const t = await getTranslations('issues');
  return { title: t('dashboardTitle') };
}

/**
 * Authed issue dashboard (spec §12 "Dashboard") — gated by the `(app)`
 * route group's session check. The `PageHeader` (title/subtitle + a Submit
 * action) is server-rendered static chrome; the list itself (the `useIssues`
 * read + loading/empty/error states) is client-side (`IssuesDashboard`),
 * mirroring `ReportPage`/`ProfilePage`'s server-shell + client-feature split.
 *
 * The `PageHeader`'s Submit action reuses the shared `Button asChild` + a
 * `next/link` (same pattern as the empty-state report link), giving the
 * dashboard a prominent entry point to `/report` from the header itself.
 */
export default async function IssuesPage() {
  const t = await getTranslations('issues');
  const locale = await getLocale();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('dashboardTitle')}
        subtitle={t('dashboardSubtitle')}
        actions={
          <Button asChild data-testid="issues-submit-link">
            <Link href={`/${locale}/report`}>{t('submitCta')}</Link>
          </Button>
        }
      />

      <IssuesDashboard />
    </div>
  );
}
