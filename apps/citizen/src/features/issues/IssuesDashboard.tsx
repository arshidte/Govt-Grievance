'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useIssues } from '@pg/api-client';
import { Button, EmptyState, ErrorState, LoadingState } from '@pg/ui';

import { useApiClient } from '../auth/api-client';
import { IssueCard } from './IssueCard';

/**
 * Citizen issue dashboard (spec §12 "Dashboard"). Calls `useIssues(client)`
 * with NO params — the API scopes the list to the SIGNED-IN citizen's own
 * issues server-side, so there is no status filter (and no risk of ever
 * showing another citizen's issue) on this screen.
 *
 * Renders the shared `@pg/ui` loading/error/empty states (mirroring
 * `ProfileForm`/`HomeOverview`'s convention), then one `IssueCard` per
 * returned issue.
 */
export function IssuesDashboard() {
  const t = useTranslations();
  const locale = useLocale();
  const client = useApiClient();
  const issues = useIssues(client);

  if (issues.isPending) {
    return <LoadingState label={t('issues.dashboardTitle')} data-testid="issues-loading" />;
  }

  if (issues.isError) {
    return (
      <ErrorState
        title={t('issues.loadFailed')}
        onRetry={() => issues.refetch()}
        data-testid="issues-error"
      />
    );
  }

  if (issues.data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3" data-testid="issues-empty-state">
        <EmptyState title={t('issues.emptyTitle')} description={t('issues.emptyDescription')} />
        <Button asChild data-testid="issues-empty-report-link">
          <Link href={`/${locale}/report`}>{t('issues.reportCta')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="issues-dashboard">
      {issues.data.map((issue) => (
        <IssueCard key={issue.id} issue={issue} />
      ))}
    </div>
  );
}
