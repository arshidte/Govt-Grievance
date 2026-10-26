'use client';

import { useLocale, useTranslations } from 'next-intl';
import { roleLabelKey } from '@pg/i18n';
import { useIssue } from '@pg/api-client';
import type { IssueStatusHistoryDTO, Role } from '@pg/types';
import { ErrorState, LoadingState, PriorityBadge, StatusBadge } from '@pg/ui';

import { useApiClient } from '../auth/api-client';
import { StatusTransitionControl } from './StatusTransitionControl';
import { TemporaryNotice } from './TemporaryNotice';

export interface StaffIssueDetailProps {
  id: string;
}

/**
 * Same-origin BFF URL for an attachment's bytes (identical rationale to
 * the citizen `IssueDetail`'s `attachmentUrl`): NEVER an API-origin URL,
 * since the browser already holds the admin session cookie for THIS
 * origin and `GET attachments/:id` is allowlisted in the admin BFF
 * (Task 19's allowlist — unmodified by this task).
 */
function attachmentUrl(attachmentId: string): string {
  return `/api/v1/attachments/${attachmentId}`;
}

/** True iff `value` is one of the 4 known `Role` tokens (not PII, not a free string). */
function isKnownRole(value: string): value is Role {
  return value === 'ADMIN' || value === 'COORDINATOR' || value === 'REPRESENTATIVE' || value === 'CITIZEN';
}

/**
 * The proceedings timeline — DELIBERATELY the SAME presentation as the
 * citizen `Timeline.tsx` (Task 22): from→to `StatusBadge`s, optional note,
 * locale-formatted timestamp, and the actor's ROLE LABEL (never actor PII
 * — `IssueStatusHistoryDTO` doesn't even carry a name/phone/id field). A
 * `null` `actorRoleLabel` (legacy/backfilled rows) renders the SAME neutral
 * placeholder as the citizen screen — this component never fabricates a
 * role for a null actor.
 */
function StaffTimeline({ entries }: { entries: IssueStatusHistoryDTO[] }) {
  const t = useTranslations('staffTriage');
  const tRoot = useTranslations();
  const locale = useLocale();

  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">{t('timelineEmpty')}</p>;
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <ol className="flex flex-col gap-4" data-testid="staff-issue-timeline">
      {entries.map((entry) => {
        const actorLabel =
          entry.actorRoleLabel !== null && isKnownRole(entry.actorRoleLabel)
            ? tRoot(roleLabelKey(entry.actorRoleLabel))
            : null;

        return (
          <li
            key={entry.id}
            data-testid="staff-timeline-entry"
            className="flex flex-col gap-1.5 border-l-2 border-neutral-200 pl-3"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={entry.fromStatus} t={tRoot} />
              <span aria-hidden="true" className="text-neutral-400">
                →
              </span>
              <StatusBadge status={entry.toStatus} t={tRoot} />
            </div>

            {entry.note && <p className="text-sm text-neutral-700">{entry.note}</p>}

            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <time dateTime={entry.createdAt}>{dateFormatter.format(new Date(entry.createdAt))}</time>
              <span aria-hidden="true">·</span>
              {actorLabel !== null ? (
                <span>{actorLabel}</span>
              ) : (
                <span data-testid="staff-timeline-actor-neutral">{t('timelineSystemActor')}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Admin staff triage detail screen (spec §12). Mirrors the citizen
 * `IssueDetail` pattern (Task 22): `useIssue(client, id)` reads one issue
 * by id, scoped server-side to staff in-scope issues; the API returns a
 * uniform, non-disclosing 404 for BOTH "doesn't exist" and "exists but out
 * of scope", so — exactly like the citizen screen — this component maps
 * ANY `useIssue` error to the same clean not-found state rather than a
 * crash or a generic error screen.
 *
 * Adds, beyond the citizen detail: `StatusTransitionControl` (the one
 * staff-only action this screen exists for) and `TemporaryNotice` (this
 * whole screen is an interim stopgap — see that component's own comment).
 * Does NOT resolve category/ward NAMES (out of scope per the brief) — only
 * title/description/categoryId/wardId at the id level, same as citizen.
 */
export function StaffIssueDetail({ id }: StaffIssueDetailProps) {
  const t = useTranslations('staffTriage');
  const tRoot = useTranslations();
  const locale = useLocale();
  const client = useApiClient();
  const issue = useIssue(client, id);

  if (issue.isPending) {
    return <LoadingState label={t('detailTitle')} data-testid="staff-issue-detail-loading" />;
  }

  if (issue.isError) {
    // Non-disclosing 404 (nonexistent OR out-of-scope) -> the SAME clean
    // not-found view either way, never a crash. See the citizen
    // `IssueDetail`'s identical comment for why this never branches on
    // `issue.error`.
    return (
      <ErrorState
        title={t('notFoundTitle')}
        description={t('notFoundDescription')}
        data-testid="staff-issue-detail-not-found"
      />
    );
  }

  const data = issue.data;
  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className="flex flex-col gap-6" data-testid="staff-issue-detail">
      <TemporaryNotice />

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-neutral-500">{data.referenceNo}</span>
        <h1 className="text-xl font-semibold text-neutral-900">{data.title}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={data.status} t={tRoot} />
        <PriorityBadge priority={data.priority} t={tRoot} />
      </div>

      <p className="text-sm text-neutral-700">{data.description}</p>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs font-medium text-neutral-500">{t('createdAtLabel')}</dt>
          <dd className="text-neutral-900">{dateFormatter.format(new Date(data.createdAt))}</dd>
        </div>
      </dl>

      {data.attachment && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-500">{t('attachmentLabel')}</span>
          {data.attachment.mimeType.startsWith('image/') ? (
            // Plain <img>, not next/image — same rationale as the citizen
            // `IssueDetail`: a same-origin BFF stream, not a remote/
            // optimizable asset next/image expects a loader config for.
            <img
              src={attachmentUrl(data.attachment.id)}
              alt={t('attachmentAlt')}
              data-testid="staff-issue-attachment"
              className="max-h-64 w-auto rounded-md border border-neutral-200 object-contain"
            />
          ) : (
            <a
              href={attachmentUrl(data.attachment.id)}
              data-testid="staff-issue-attachment"
              className="text-sm font-medium text-primary-700 hover:underline"
            >
              {t('downloadAttachment')}
            </a>
          )}
        </div>
      )}

      <StatusTransitionControl issue={data} />

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-neutral-900">{t('timelineTitle')}</h2>
        <StaffTimeline entries={data.timeline} />
      </div>
    </div>
  );
}
