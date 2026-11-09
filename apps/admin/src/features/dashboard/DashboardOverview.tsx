'use client';

import type { IssueStatus, IssueSummaryDTO } from '@pg/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PriorityBadge,
  StatCard,
  StatusBadge,
} from '@pg/ui';
import { CheckCircle2, Clock, Inbox, ListChecks, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import { useStaffIssues } from '../issues/useStaffIssues';

/**
 * How many of the most-recent scoped grievances to preview on the dashboard.
 * The full triage list lives on `/issues`; this is a glanceable teaser, so we
 * cap it rather than re-rendering the whole (potentially long) list here.
 */
const RECENT_PREVIEW_COUNT = 5;

/**
 * Derive the staff member's SCOPED grievance counts from the ALREADY-FETCHED
 * `useStaffIssues` list — no invented analytics, no extra network call. We
 * bucket by the real `status` field into the four M2-active lifecycle stages
 * (SUBMITTED -> ACKNOWLEDGED -> IN_PROGRESS -> RESOLVED). Any of the six
 * dormant statuses (UNDER_REVIEW, ASSIGNED, WAITING_FOR_INFORMATION,
 * ESCALATED, CLOSED, REOPENED) would NOT increment any of the four named
 * buckets here — they still count toward `total`, so the numbers always
 * reconcile (total >= sum of the four) and nothing is fabricated.
 */
function deriveCounts(issues: IssueSummaryDTO[]): {
  total: number;
  submitted: number;
  acknowledged: number;
  inProgress: number;
  resolved: number;
} {
  const byStatus = (status: IssueStatus): number =>
    issues.reduce((n, issue) => (issue.status === status ? n + 1 : n), 0);

  return {
    total: issues.length,
    submitted: byStatus('SUBMITTED'),
    acknowledged: byStatus('ACKNOWLEDGED'),
    inProgress: byStatus('IN_PROGRESS'),
    resolved: byStatus('RESOLVED'),
  };
}

export interface DashboardOverviewProps {
  /**
   * Already-translated role/scope label for the signed-in staff member (e.g.
   * "Administrator"), derived server-side from `me.roles` and passed down so
   * this client component needs no `useMe` round-trip. Used as the header
   * subtitle context; omitted if not easily available.
   */
  roleLabel?: string;
}

/**
 * Admin dashboard overview (revamp P4a). Replaces the previous hard-zeroed
 * placeholder tiles with a REAL staff overview driven entirely by the same
 * server-scoped hook the triage list uses (`useStaffIssues` -> `useIssues`,
 * scoped SERVER-SIDE to the staff member's role/ward/panchayat). It makes NO
 * new API call and invents NO analytics: a row of `StatCard`s showing the real
 * total-in-scope plus the four M2 lifecycle buckets, a CTA to the full
 * `/issues` triage, and a short preview of the most-recent scoped grievances
 * linking to their detail pages.
 *
 * Loading/error/empty states mirror the triage list so the two screens feel
 * consistent. The parent server page keeps the required `admin-dashboard-page`
 * testid on its root wrapper.
 */
export function DashboardOverview({ roleLabel }: DashboardOverviewProps) {
  const t = useTranslations('admin.dashboard');
  const tRoot = useTranslations();
  const locale = useLocale();
  const issues = useStaffIssues();

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  // The one primary action, reused in the header and the empty state: jump to
  // the full triage list. Scope/route are unchanged — this is a plain link.
  const triageAction = (
    <Button asChild data-testid="admin-dashboard-triage-link">
      <Link href={`/${locale}/issues`}>{t('viewTriageCta')}</Link>
    </Button>
  );

  // Subtitle: the role/scope context when we have it, else the generic line.
  const subtitle = roleLabel ? t('scopeSubtitle', { role: roleLabel }) : t('subtitle');

  return (
    <div className="flex flex-col gap-6" data-testid="admin-dashboard-page">
      <PageHeader title={t('title')} subtitle={subtitle} actions={triageAction} />

      {issues.isPending && (
        <LoadingState label={t('title')} data-testid="admin-dashboard-loading" />
      )}

      {issues.isError && (
        <ErrorState
          title={t('loadFailed')}
          onRetry={() => issues.refetch()}
          data-testid="admin-dashboard-error"
        />
      )}

      {!issues.isPending && !issues.isError && <DashboardBody
        issues={issues.data}
        t={t}
        tRoot={tRoot}
        locale={locale}
        dateFormatter={dateFormatter}
      />}
    </div>
  );
}

/**
 * The success-state body: the stat row + (when there is at least one scoped
 * issue) a recent-grievances preview. Split out so the parent keeps a flat
 * render tree and the counts are only derived once the data has loaded.
 */
function DashboardBody({
  issues,
  t,
  tRoot,
  locale,
  dateFormatter,
}: {
  issues: IssueSummaryDTO[];
  t: (key: string, values?: Record<string, string | number>) => string;
  tRoot: (key: string, values?: Record<string, string | number>) => string;
  locale: string;
  dateFormatter: Intl.DateTimeFormat;
}) {
  const counts = deriveCounts(issues);
  const recent = issues.slice(0, RECENT_PREVIEW_COUNT);

  return (
    <>
      {/* Metric row — REAL counts derived from the scoped issue list. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
          label={t('statAcknowledged')}
          value={counts.acknowledged}
          icon={<Megaphone className="h-5 w-5" aria-hidden="true" />}
          data-testid={`stat-card-${t('statAcknowledged')}`}
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

      {counts.total === 0 ? (
        // No grievances in scope yet — a calm empty state mirroring triage.
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          data-testid="admin-dashboard-empty-state"
        />
      ) : (
        // Recent scoped grievances preview — compact rows linking to detail.
        <section className="flex flex-col gap-3" aria-labelledby="admin-dashboard-recent-heading">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="admin-dashboard-recent-heading"
              className="text-base font-semibold text-neutral-900"
            >
              {t('recentTitle')}
            </h2>
            <Link
              href={`/${locale}/issues`}
              data-testid="admin-dashboard-view-all-link"
              className="text-sm font-medium text-primary-700 hover:underline"
            >
              {t('viewAll')}
            </Link>
          </div>

          <div className="flex flex-col gap-3" data-testid="admin-dashboard-recent-list">
            {recent.map((issue) => (
              <Card
                key={issue.id}
                data-testid="admin-dashboard-recent-item"
                className="flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-xs font-medium text-neutral-500">
                      {issue.referenceNo}
                    </span>
                    <Link
                      href={`/${locale}/issues/${issue.id}`}
                      data-testid="admin-dashboard-recent-item-link"
                      className="truncate text-base font-semibold text-neutral-900 hover:underline"
                    >
                      {issue.title}
                    </Link>
                  </div>
                  <PriorityBadge priority={issue.priority} t={tRoot} />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={issue.status} t={tRoot} />
                  <span className="text-xs text-neutral-500">
                    {t('createdOnLabel', {
                      date: dateFormatter.format(new Date(issue.createdAt)),
                    })}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
