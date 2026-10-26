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
    <ol className="flex flex-col gap-4">
      {entries.map((entry) => {
        const actorLabel =
          entry.actorRoleLabel !== null && isKnownRole(entry.actorRoleLabel)
            ? t(roleLabelKey(entry.actorRoleLabel))
            : null;

        return (
          <li
            key={entry.id}
            data-testid="timeline-entry"
            className="flex flex-col gap-1.5 border-l-2 border-neutral-200 pl-3"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={entry.fromStatus} t={t} />
              <span aria-hidden="true" className="text-neutral-400">
                →
              </span>
              <StatusBadge status={entry.toStatus} t={t} />
            </div>

            {entry.note && <p className="text-sm text-neutral-700">{entry.note}</p>}

            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <time dateTime={entry.createdAt}>{dateFormatter.format(new Date(entry.createdAt))}</time>
              <span aria-hidden="true">·</span>
              {actorLabel !== null ? (
                <span>{actorLabel}</span>
              ) : (
                <span data-testid="timeline-actor-neutral">{t('issues.timelineSystemActor')}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
