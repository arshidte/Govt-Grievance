'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { IssueSummaryDTO } from '@pg/types';
import { Card, PriorityBadge, StatusBadge } from '@pg/ui';

export interface IssueCardProps {
  issue: IssueSummaryDTO;
}

/**
 * One row on the citizen issue dashboard (spec §12). Shows the reference
 * number, title, status (icon+text `StatusBadge`), a READ-ONLY priority
 * badge, and the locale-formatted creation date. The whole card links to
 * `/issues/[id]` — a plain `next/link` with a manual `/${locale}` prefix,
 * matching `BottomNav`/`TrackLookup`'s existing navigation convention (this
 * app has no next-intl `Link` wrapper).
 */
export function IssueCard({ issue }: IssueCardProps) {
  const t = useTranslations();
  const locale = useLocale();

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    // Revamp P3 — interactive surface: the calm `Card` gains a hover border
    // tint + focus-within ring so the whole tile reads as clickable, while
    // the actual navigation stays on the title `Link` (keeps the a11y-tested
    // `issue-card-link`). `focus-within` lifts the border when the inner link
    // is keyboard-focused, so the card itself shows the focus affordance.
    <Card
      data-testid="issue-card"
      className="flex flex-col gap-3 transition-colors hover:border-primary-300 focus-within:border-primary-400"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {issue.referenceNo}
          </span>
          <Link
            href={`/${locale}/issues/${issue.id}`}
            data-testid="issue-card-link"
            className="rounded text-base font-semibold text-neutral-900 hover:text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            {issue.title}
          </Link>
        </div>
        <PriorityBadge priority={issue.priority} t={t} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusBadge status={issue.status} t={t} />
        <span className="text-xs text-neutral-500">
          {t('issues.createdOnLabel', { date: dateFormatter.format(new Date(issue.createdAt)) })}
        </span>
      </div>
    </Card>
  );
}
