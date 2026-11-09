'use client';

import { useIssues, useMe } from '@pg/api-client';
import type { IssueSummaryDTO } from '@pg/types';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
} from '@pg/ui';
import { ListChecks, Clock, CheckCircle2, Inbox } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import { useApiClient } from '../auth/api-client';
import { IssueCard } from '../issues/IssueCard';

/**
 * How many of the citizen's most-recent grievances to preview on the home
 * overview. The full list lives on `/issues`; this is a glanceable teaser,
 * so we cap it rather than rendering the whole (potentially long) list here.
 */
const RECENT_PREVIEW_COUNT = 3;

/**
 * Derive the citizen's OWN grievance counts from the ALREADY-FETCHED
 * `useIssues` list — no invented analytics, no extra network call. We bucket
 * by the real `status` field: "in progress" is the mid-lifecycle bucket
 * (everything that has left SUBMITTED but is not yet RESOLVED/CLOSED), and
 * "resolved" counts RESOLVED (the terminal success state M2 activates).
 * Anything still SUBMITTED counts as "submitted". These three buckets plus
 * the total are the only numbers shown — all computed from real data.
 */
function deriveCounts(issues: IssueSummaryDTO[]): {
  total: number;
  submitted: number;
  inProgress: number;
  resolved: number;
} {
  let submitted = 0;
  let resolved = 0;
  let inProgress = 0;

  for (const issue of issues) {
    if (issue.status === 'SUBMITTED') {
      submitted += 1;
    } else if (issue.status === 'RESOLVED') {
      resolved += 1;
    } else {
      // Every other live status (ACKNOWLEDGED, UNDER_REVIEW, ASSIGNED,
      // IN_PROGRESS, WAITING_FOR_INFORMATION, ESCALATED, CLOSED, REOPENED)
      // sits between "just submitted" and "resolved" from the citizen's
      // point of view — group them under the "in progress" bucket rather
      // than inventing a tile per status.
      inProgress += 1;
    }
  }

  return { total: issues.length, submitted, inProgress, resolved };
}

/**
 * Citizen home overview. A welcoming `PageHeader` greeting (personalized from
 * `useMe`), a row of `StatCard`s showing the citizen's OWN grievance counts
 * DERIVED FROM REAL DATA (`useIssues` — never invented), a short preview of
 * the most-recent grievances, and a prominent "Submit a Grievance" action.
 *
 * Two real network dependencies: `useMe` (personalizes the greeting) and
 * `useIssues` (the count/preview source). Loading/error states cover both;
 * when the citizen has no grievances we show a calm empty state with the
 * Submit CTA (the `home-empty-state` container the Playwright/RTL specs
 * assert on).
 */
export function HomeOverview() {
  const t = useTranslations('home');
  const locale = useLocale();
  const client = useApiClient();
  const me = useMe(client);
  const issues = useIssues(client);

  // Loading: wait for BOTH reads so the stat row renders with real numbers
  // rather than flashing zeros, and the greeting has the citizen's name.
  if (me.isPending || issues.isPending) {
    return <LoadingState label={t('title')} data-testid="home-loading" />;
  }

  // Error: either read failing blocks a trustworthy overview. Retry both.
  if (me.isError || issues.isError) {
    return (
      <ErrorState
        title={t('title')}
        description={me.error?.message ?? issues.error?.message}
        onRetry={() => {
          me.refetch();
          issues.refetch();
        }}
        data-testid="home-error"
      />
    );
  }

  const counts = deriveCounts(issues.data);
  // The citizen's name personalizes the greeting; fall back to the generic
  // overview title when `useMe` has no name (never fabricate one).
  const fullName = me.data.fullName;
  const greeting = fullName ? t('greeting', { name: fullName }) : t('title');
  const recent = issues.data.slice(0, RECENT_PREVIEW_COUNT);

  // The one primary action, reused in both the header and the empty state.
  const submitAction = (
    <Button asChild data-testid="home-submit-link">
      <Link href={`/${locale}/report`}>{t('submitCta')}</Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6" data-testid="home-overview">
      <PageHeader title={greeting} subtitle={t('subtitle')} actions={submitAction} />

      {counts.total === 0 ? (
        // No grievances yet — a calm empty state carrying the Submit CTA.
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={{ label: t('submitCta'), onClick: () => undefined }}
          data-testid="home-empty-state"
        />
      ) : (
        <>
          {/* Metric row — REAL counts derived from the fetched issue list. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t('statTotal')}
              value={counts.total}
              icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
              data-testid={`stat-card-${t('statTotal')}`}
            />
            <StatCard
              label={t('statSubmitted')}
              value={counts.submitted}
              icon={<ListChecks className="h-5 w-5" aria-hidden="true" />}
              data-testid={`stat-card-${t('statSubmitted')}`}
            />
            <StatCard
              label={t('statInProgress')}
              value={counts.inProgress}
              icon={<Clock className="h-5 w-5" aria-hidden="true" />}
              data-testid={`stat-card-${t('statInProgress')}`}
            />
            <StatCard
              label={t('statResolved')}
              value={counts.resolved}
              icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
              data-testid={`stat-card-${t('statResolved')}`}
            />
          </div>

          {/* Recent grievances preview — a few cards linking to detail. */}
          <section className="flex flex-col gap-3" aria-labelledby="home-recent-heading">
            <div className="flex items-center justify-between gap-2">
              <h2
                id="home-recent-heading"
                className="text-base font-semibold text-neutral-900"
              >
                {t('recentTitle')}
              </h2>
              <Link
                href={`/${locale}/issues`}
                data-testid="home-view-all-link"
                className="text-sm font-medium text-primary-700 hover:underline"
              >
                {t('viewAll')}
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              {recent.map((issue) => (
                <IssueCard key={issue.id} issue={issue} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
