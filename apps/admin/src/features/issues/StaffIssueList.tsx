'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { IssueSummaryDTO } from '@pg/types';
import { EmptyState, ErrorState, LoadingState, PageHeader, PriorityBadge, StatusBadge } from '@pg/ui';

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
 *
 * Revamp P4b — restyled to a professional, scannable layout: a `PageHeader`,
 * the interim `TemporaryNotice`, then the scoped list rendered as a semantic
 * `<table>` on `md+` (reference, title, status, read-only priority, created
 * date) that collapses to stacked `md:hidden` cards on mobile. CRITICAL: the
 * table/card markup is hand-built HERE (NOT the generic `@pg/ui` `Table`,
 * whose whole-row-click model conflicts with the nested per-row LINK the
 * admin cross-app Playwright relies on) so EVERY `<tr>`/card carries
 * `data-testid="staff-issue-item"` and contains a `data-testid="staff-issue-
 * item-link"` reference/title link to `/issues/[id]`. The Playwright finds a
 * row by reference number via `staff-issue-item`, then clicks
 * `staff-issue-item-link` — both must stay exactly, in both viewports.
 */
export function StaffIssueList() {
  const t = useTranslations('staffTriage');
  const tRoot = useTranslations();
  const locale = useLocale();
  const issues = useStaffIssues();

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className="flex flex-col gap-6" data-testid="admin-issues-page">
      <PageHeader title={t('listTitle')} subtitle={t('listSubtitle')} />

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
        // `data-testid="staff-issue-list"` stays on the single list wrapper
        // that holds BOTH presentations — the Playwright scopes its row/link
        // queries under this id regardless of which viewport is rendered.
        <div data-testid="staff-issue-list">
          {/* Desktop (md+): a scannable, bordered table. Hidden on mobile.
              The desktop/mobile layouts render the SAME rows (same
              `staff-issue-item`/`staff-issue-item-link` testids), so each issue
              is in the DOM twice; these container testids let a test scope to
              the layout visible at its viewport (mirrors admin nav's
              sidebar-vs-drawer scoping). */}
          <div
            data-testid="staff-issue-table"
            className="hidden overflow-hidden rounded-xl border border-neutral-200 bg-white md:block"
          >
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th scope="col" className="px-4 py-3">
                    {t('columnReference')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('columnTitle')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('columnStatus')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('columnPriority')}
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {t('columnCreated')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {issues.data.map((issue) => (
                  <IssueTableRow
                    key={issue.id}
                    issue={issue}
                    locale={locale}
                    tRoot={tRoot}
                    formattedDate={dateFormatter.format(new Date(issue.createdAt))}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile (< md): the SAME data as stacked cards. Hidden on md+. */}
          <div data-testid="staff-issue-cards" className="flex flex-col gap-3 md:hidden">
            {issues.data.map((issue) => (
              <IssueMobileCard
                key={issue.id}
                issue={issue}
                locale={locale}
                t={t}
                tRoot={tRoot}
                formattedDate={dateFormatter.format(new Date(issue.createdAt))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One desktop table row. Carries `data-testid="staff-issue-item"` on the
 * `<tr>` and nests the reference/title link under
 * `data-testid="staff-issue-item-link"` (the Playwright clicks exactly this).
 * The whole row is NOT a single click target (deliberately — see the
 * component doc) so the nested-link selector stays unambiguous.
 */
function IssueTableRow({
  issue,
  locale,
  tRoot,
  formattedDate,
}: {
  issue: IssueSummaryDTO;
  locale: string;
  tRoot: (key: string, values?: Record<string, string | number>) => string;
  formattedDate: string;
}) {
  return (
    <tr
      data-testid="staff-issue-item"
      className="border-b border-neutral-200 last:border-b-0 hover:bg-neutral-50"
    >
      <td className="whitespace-nowrap px-4 py-3 align-top text-xs font-medium text-neutral-500">
        {issue.referenceNo}
      </td>
      <td className="px-4 py-3 align-top">
        <Link
          href={`/${locale}/issues/${issue.id}`}
          data-testid="staff-issue-item-link"
          className="font-medium text-neutral-900 hover:text-primary-700 hover:underline"
        >
          {issue.title}
        </Link>
      </td>
      <td className="px-4 py-3 align-top">
        <StatusBadge status={issue.status} t={tRoot} />
      </td>
      <td className="px-4 py-3 align-top">
        <PriorityBadge priority={issue.priority} t={tRoot} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 align-top text-neutral-500">{formattedDate}</td>
    </tr>
  );
}

/**
 * One mobile card — the SAME fields and the SAME testids as the table row
 * (`staff-issue-item` on the card, `staff-issue-item-link` on the title),
 * so the Playwright's row-by-reference → click-link flow works identically
 * in the narrow viewport.
 */
function IssueMobileCard({
  issue,
  locale,
  t,
  tRoot,
  formattedDate,
}: {
  issue: IssueSummaryDTO;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  tRoot: (key: string, values?: Record<string, string | number>) => string;
  formattedDate: string;
}) {
  return (
    <div
      data-testid="staff-issue-item"
      className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium text-neutral-500">{issue.referenceNo}</span>
          <Link
            href={`/${locale}/issues/${issue.id}`}
            data-testid="staff-issue-item-link"
            className="text-base font-semibold text-neutral-900 hover:text-primary-700 hover:underline"
          >
            {issue.title}
          </Link>
        </div>
        <PriorityBadge priority={issue.priority} t={tRoot} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={issue.status} t={tRoot} />
        <span className="text-xs text-neutral-500">
          {t('createdOnLabel', { date: formattedDate })}
        </span>
      </div>
    </div>
  );
}
