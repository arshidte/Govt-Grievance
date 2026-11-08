'use client';

import { useIssue } from '@pg/api-client';
import {
  Card,
  ErrorState,
  LoadingState,
  PageHeader,
  PriorityBadge,
  StatusBadge,
} from '@pg/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import { useApiClient } from '../auth/api-client';

import { Timeline } from './Timeline';

export interface IssueDetailProps {
  id: string;
}

/**
 * Same-origin BFF URL for an attachment's bytes. NEVER an API-origin URL:
 * the browser already holds the `pg_session` cookie for THIS origin, and
 * `GET attachments/:id` is allowlisted in the citizen BFF (see
 * `src/lib/bff-allowlist.ts`), which streams the file straight from the
 * NestJS API without this component (or any citizen code) needing to know
 * the upstream API's address or forward a cookie manually.
 */
function attachmentUrl(attachmentId: string): string {
  return `/api/v1/attachments/${attachmentId}`;
}

/**
 * Citizen issue detail screen (spec §12 "Issue detail + proceedings
 * timeline"). `useIssue(client, id)` reads one issue by id; the API scopes
 * this to the signed-in citizen's own issues (or in-scope staff, for other
 * callers) and returns a uniform 404 for both "doesn't exist" and
 * "exists but out of scope" (non-disclosing, per spec) — this component
 * maps ANY `useIssue` error to the same clean "not found" state rather
 * than distinguishing them (nothing to distinguish on the client; the
 * server already collapsed the two cases for exactly this reason).
 */
export function IssueDetail({ id }: IssueDetailProps) {
  const t = useTranslations();
  const locale = useLocale();
  const client = useApiClient();
  const issue = useIssue(client, id);

  if (issue.isPending) {
    return <LoadingState label={t('issues.detailTitle')} data-testid="issue-detail-loading" />;
  }

  if (issue.isError) {
    // A 404 (nonexistent OR out-of-scope — the API does not disclose which)
    // renders the SAME clean "not found" view, never a crash and never a
    // generic error screen that implies a transient failure. We don't
    // branch on `issue.error`'s code/status here — the server already
    // collapsed "doesn't exist" and "exists but out of scope" into one
    // non-disclosing 404, so there is nothing meaningful to distinguish.
    return (
      <ErrorState
        title={t('issues.notFoundTitle')}
        description={t('issues.notFoundDescription')}
        data-testid="issue-detail-not-found"
      />
    );
  }

  const data = issue.data;

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className="flex flex-col gap-6" data-testid="issue-detail">
      {/* Header: a back link to the dashboard, the reference number as the
          page title, and the live StatusBadge (icon+text) as the right-aligned
          context — status is never conveyed by color alone. */}
      <PageHeader
        title={data.title}
        breadcrumb={
          <Link
            href={`/${locale}/issues`}
            data-testid="issue-detail-back-link"
            className="inline-flex items-center gap-1.5 rounded text-neutral-600 hover:text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('issues.backToDashboard')}
          </Link>
        }
        subtitle={data.referenceNo}
        actions={<StatusBadge status={data.status} t={t} />}
      />

      {/* Metadata section — title/description + the structured fields grouped
          in a single calm Card surface. */}
      <Card className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge priority={data.priority} t={t} />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-500">
            {t('issues.descriptionLabel')}
          </span>
          <p className="text-sm text-neutral-700">{data.description}</p>
        </div>

        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-neutral-500">{t('issues.categoryLabel')}</dt>
            <dd className="text-neutral-900">{data.categoryId}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-neutral-500">{t('issues.locationLabel')}</dt>
            {/* Only the panchayat/ward IDs are on IssueDetailDTO (spec §6) — no
                display-name join happens here, matching the brief's "render
                metadata: ... panchayat/ward" at the id level; a future task
                can enrich this with the panchayat/ward catalog lookup if a
                human-readable name is wanted. */}
            <dd className="text-neutral-900">
              {data.panchayatId} / {data.wardId}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-neutral-500">{t('issues.createdAtLabel')}</dt>
            <dd className="text-neutral-900">{dateFormatter.format(new Date(data.createdAt))}</dd>
          </div>
        </dl>

        {data.attachment && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-500">{t('issues.attachmentLabel')}</span>
          {data.attachment.mimeType.startsWith('image/') ? (
            // A plain <img> (not next/image) is deliberate: the source is a
            // same-origin BFF stream (`/api/v1/attachments/:id`), not a
            // remote/optimizable asset next/image expects a loader config
            // for, and this repo's eslint config has no next/core-web-vitals
            // rule set (see root eslint.config.mjs) that would flag it.
            <img
              src={attachmentUrl(data.attachment.id)}
              alt={t('issues.attachmentAlt')}
              data-testid="issue-attachment"
              className="max-h-64 w-auto rounded-md border border-neutral-200 object-contain"
            />
          ) : (
            <a
              href={attachmentUrl(data.attachment.id)}
              data-testid="issue-attachment"
              className="text-sm font-medium text-primary-700 hover:underline"
            >
              {t('issues.downloadAttachment')}
            </a>
          )}
        </div>
        )}
      </Card>

      {/* Proceedings timeline — its own Card surface, section-labelled for a11y. */}
      <Card
        className="flex flex-col gap-4"
        data-testid="issue-timeline"
        aria-labelledby="issue-timeline-heading"
      >
        <h2
          id="issue-timeline-heading"
          className="text-base font-semibold text-neutral-900"
        >
          {t('issues.timelineTitle')}
        </h2>
        <Timeline entries={data.timeline} />
      </Card>
    </div>
  );
}
