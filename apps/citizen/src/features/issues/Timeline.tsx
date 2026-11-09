'use client';

import { useLocale, useTranslations } from 'next-intl';
import { roleLabelKey } from '@pg/i18n';
import type { IssueStatusHistoryDTO, Role } from '@pg/types';
import { StatusBadge } from '@pg/ui';

export interface TimelineProps {
  /**
   * Status-history rows for one issue, ALREADY ordered ascending by
   * `createdAt` by the server (spec §6 / T11's `getForUser`). This
   * component renders them in the given order and never re-sorts — do not
   * add a `.sort()` here without confirming the server contract changed.
   */
  entries: IssueStatusHistoryDTO[];
}

/** True iff `value` is one of the 4 known `Role` tokens (not PII, not a free string). */
function isKnownRole(value: string): value is Role {
  return value === 'ADMIN' || value === 'COORDINATOR' || value === 'REPRESENTATIVE' || value === 'CITIZEN';
}

/**
 * The proceedings timeline for an issue (spec §12 "Issue detail + proceedings
 * timeline"). Each entry shows the from→to status transition (icon+text via
 * `StatusBadge`, never color alone), the optional note, a locale-formatted
 * timestamp, and the ACTOR's ROLE LABEL — never actor PII.
 *
 * `actorRoleLabel` (spec §4.5 / R-LEGACY-NOTE) is either a `Role` token or
 * `null` for legacy/backfilled rows where no actor could be attributed. A
 * `null` value renders a NEUTRAL placeholder (`issues.timelineSystemActor`)
 * — this component NEVER fabricates a role for a null actor, and never
 * reads/renders any actor identity field (name/phone/id are not even part
 * of `IssueStatusHistoryDTO`, so there is nothing to leak).
 */
export function Timeline({ entries }: TimelineProps) {
  const t = useTranslations();
  const locale = useLocale();

  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">{t('issues.timelineEmpty')}</p>;
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <ol className="flex flex-col">
      {entries.map((entry, index) => {
        const actorLabel =
          entry.actorRoleLabel !== null && isKnownRole(entry.actorRoleLabel)
            ? t(roleLabelKey(entry.actorRoleLabel))
            : null;

        // The last row doesn't draw a trailing connector line below its dot.
        const isLast = index === entries.length - 1;

        return (
          // Revamp P3 — a rail-and-dot timeline: a small primary dot sits on a
          // vertical connector in the left gutter, the entry content to its
          // right. Pure styling — the from→to StatusBadge pair, note, time,
          // and actor-role label (never PII) are unchanged.
          <li
            key={entry.id}
            data-testid="timeline-entry"
            className="relative flex gap-3 pb-5 last:pb-0"
          >
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary-500 ring-4 ring-primary-50"
              />
              {!isLast && <span aria-hidden="true" className="mt-1 w-px flex-1 bg-neutral-200" />}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={entry.fromStatus} t={t} />
                <span aria-hidden="true" className="text-neutral-400">
                  →
                </span>
                <StatusBadge status={entry.toStatus} t={t} />
              </div>

              {entry.note && <p className="text-sm text-neutral-700">{entry.note}</p>}

              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <time dateTime={entry.createdAt}>
                  {dateFormatter.format(new Date(entry.createdAt))}
                </time>
                <span aria-hidden="true">·</span>
                {actorLabel !== null ? (
                  <span>{actorLabel}</span>
                ) : (
                  <span data-testid="timeline-actor-neutral">{t('issues.timelineSystemActor')}</span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
