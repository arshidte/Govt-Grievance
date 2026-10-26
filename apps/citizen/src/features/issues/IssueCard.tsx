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
    <Card data-testid="issue-card" className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-neutral-500">{issue.referenceNo}</span>
          <Link
            href={`/${locale}/issues/${issue.id}`}
            data-testid="issue-card-link"
            className="text-base font-semibold text-neutral-900 hover:underline"
          >
            {issue.title}
          </Link>
        </div>
        <PriorityBadge priority={issue.priority} t={t} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={issue.status} t={t} />
        <span className="text-xs text-neutral-500">
          {t('issues.createdOnLabel', { date: dateFormatter.format(new Date(issue.createdAt)) })}
        </span>
      </div>
    </Card>
  );
}
