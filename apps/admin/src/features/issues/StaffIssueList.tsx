'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Card, EmptyState, ErrorState, LoadingState, PriorityBadge, StatusBadge } from '@pg/ui';

import { TemporaryNotice } from './TemporaryNotice';
import { useStaffIssues } from './useStaffIssues';

/**
 * Admin staff triage list (spec §12 "Admin app — temporary staff triage
 * screen"). Mirrors the citizen `IssuesDashboard`/`IssueCard` pattern
 * (Task 22) minus the citizen-only "report an issue" CTA: `useStaffIssues`
 * is already server-scoped, so there's no filter UI here either. Each row
 * shows the issue's OWN fields only — referenceNo, title, status (icon+text
 * `StatusBadge`), a read-only `PriorityBadge`, and the creation date — no
 * category/ward NAME resolution (out of scope per the brief; a future task
 * can join the catalog for display names).
 */
export function StaffIssueList() {
  const t = useTranslations('staffTriage');
  const tRoot = useTranslations();
  const locale = useLocale();
  const issues = useStaffIssues();

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className="flex flex-col gap-6" data-testid="admin-issues-page">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-neutral-900">{t('listTitle')}</h1>
        <p className="text-sm text-neutral-600">{t('listSubtitle')}</p>
      </div>

      <TemporaryNotice />

      {issues.isPending && (
        <LoadingState label={t('listTitle')} data-testid="staff-issues-loading" />
      )}

      {issues.isError && (
        <ErrorState
          title={t('loadFailed')}
          onRetry={() => issues.refetch()}
          data-testid="staff-issues-error"
        />
      )}

      {!issues.isPending && !issues.isError && issues.data.length === 0 && (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          data-testid="staff-issues-empty-state"
        />
      )}

      {!issues.isPending && !issues.isError && issues.data.length > 0 && (
        <div className="flex flex-col gap-3" data-testid="staff-issue-list">
          {issues.data.map((issue) => (
            <Card key={issue.id} data-testid="staff-issue-item" className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-neutral-500">{issue.referenceNo}</span>
                  <Link
                    href={`/${locale}/issues/${issue.id}`}
                    data-testid="staff-issue-item-link"
                    className="text-base font-semibold text-neutral-900 hover:underline"
                  >
                    {issue.title}
                  </Link>
                </div>
                <PriorityBadge priority={issue.priority} t={tRoot} />
              </div>

              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={issue.status} t={tRoot} />
                <span className="text-xs text-neutral-500">
                  {t('createdOnLabel', { date: dateFormatter.format(new Date(issue.createdAt)) })}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
