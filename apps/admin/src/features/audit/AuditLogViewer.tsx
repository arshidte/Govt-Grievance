'use client';

import { ApiClientError, useAuditLogs } from '@pg/api-client';
import type { AuditLogItemDTO, AuditLogListParams } from '@pg/types';
import {
  Button,
  EmptyState,
  ErrorState,
  ForbiddenState,
  Input,
  LoadingState,
  PageHeader,
  Table,
  type TableColumn,
} from '@pg/ui';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Modal } from '../../components/Modal';
import { useApiClient } from '../auth/api-client';

const PAGE_SIZE = 25;

/** The five exact/date filter fields the viewer edits (as plain strings). */
interface FilterState {
  action: string;
  entityType: string;
  entityId: string;
  actorUserId: string;
  from: string; // yyyy-mm-dd (date input)
  to: string; // yyyy-mm-dd (date input)
}
const EMPTY_FILTERS: FilterState = { action: '', entityType: '', entityId: '', actorUserId: '', from: '', to: '' };

/** A date-only value → an unambiguous ISO-8601 UTC instant at the day's start/end. */
const startOfDay = (d: string): string | undefined => (d ? `${d}T00:00:00.000Z` : undefined);
const endOfDay = (d: string): string | undefined => (d ? `${d}T23:59:59.999Z` : undefined);

/** Builds the API params from committed filters + the current cursor (undefined values dropped by the client). */
function toParams(f: FilterState, cursor: string | undefined): AuditLogListParams {
  return {
    action: f.action.trim() || undefined,
    entityType: f.entityType.trim() || undefined,
    entityId: f.entityId.trim() || undefined,
    actorUserId: f.actorUserId.trim() || undefined,
    from: startOfDay(f.from),
    to: endOfDay(f.to),
    limit: PAGE_SIZE,
    cursor,
  };
}

/**
 * Admin Audit Log viewer (M4B). Read-only; Global-Admin only (enforced by the
 * BFF/API — a non-admin's request 403s and renders the Forbidden state).
 * Filters are committed via "Apply" (so editing doesn't fire requests); any
 * apply/reset resets pagination to the first page. Pagination is cursor-based
 * (a small cursor stack gives prev/next); metadata is shown as safely-formatted
 * JSON text, never HTML.
 */
export function AuditLogViewer() {
  const t = useTranslations('admin.auditLogs');
  const locale = useLocale();
  const client = useApiClient();

  const [draft, setDraft] = React.useState<FilterState>(EMPTY_FILTERS);
  const [committed, setCommitted] = React.useState<FilterState>(EMPTY_FILTERS);
  // Cursor history: index 0 is the first page (undefined cursor). The last
  // entry is the current page's cursor.
  const [history, setHistory] = React.useState<(string | undefined)[]>([undefined]);
  const [detail, setDetail] = React.useState<AuditLogItemDTO | null>(null);

  const cursor = history[history.length - 1];
  const params = React.useMemo(() => toParams(committed, cursor), [committed, cursor]);
  const query = useAuditLogs(client, params);

  const dateFmt = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );

  function applyFilters() {
    setCommitted(draft);
    setHistory([undefined]); // reset pagination on any filter change
  }
  function resetFilters() {
    setDraft(EMPTY_FILTERS);
    setCommitted(EMPTY_FILTERS);
    setHistory([undefined]);
  }

  const none = t('none');
  const columns: Array<TableColumn<AuditLogItemDTO>> = [
    {
      key: 'createdAt',
      header: t('colTimestamp'),
      render: (r) => <span className="whitespace-nowrap text-neutral-700">{dateFmt.format(new Date(r.createdAt))}</span>,
    },
    { key: 'action', header: t('colAction'), render: (r) => <span className="font-medium text-neutral-900">{r.action}</span> },
    { key: 'entityType', header: t('colEntityType'), render: (r) => r.entityType },
    { key: 'entityId', header: t('colEntityId'), render: (r) => <span className="text-neutral-500">{r.entityId ?? none}</span> },
    { key: 'actorUserId', header: t('colActor'), render: (r) => <span className="text-neutral-500">{r.actorUserId ?? none}</span> },
  ];

  const isForbidden = query.error instanceof ApiClientError && query.error.status === 403;

  return (
    <div className="flex flex-col gap-6" data-testid="audit-logs-page">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {/* Filters — committed on Apply, so typing doesn't fire requests. */}
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
        data-testid="audit-filters"
      >
        <Input label={t('filterAction')} value={draft.action} placeholder={t('filterActionPlaceholder')} onChange={(e) => setDraft({ ...draft, action: e.target.value })} data-testid="audit-filter-action" />
        <Input label={t('filterEntityType')} value={draft.entityType} placeholder={t('filterEntityTypePlaceholder')} onChange={(e) => setDraft({ ...draft, entityType: e.target.value })} data-testid="audit-filter-entityType" />
        <Input label={t('filterEntityId')} value={draft.entityId} placeholder={t('filterEntityIdPlaceholder')} onChange={(e) => setDraft({ ...draft, entityId: e.target.value })} data-testid="audit-filter-entityId" />
        <Input label={t('filterActor')} value={draft.actorUserId} placeholder={t('filterActorPlaceholder')} onChange={(e) => setDraft({ ...draft, actorUserId: e.target.value })} data-testid="audit-filter-actorUserId" />
        <Input label={t('filterFrom')} type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} data-testid="audit-filter-from" />
        <Input label={t('filterTo')} type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} data-testid="audit-filter-to" />
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit" data-testid="audit-apply">{t('apply')}</Button>
          <Button type="button" variant="secondary" onClick={resetFilters} data-testid="audit-reset">{t('reset')}</Button>
        </div>
      </form>

      {query.isLoading ? (
        <LoadingState label={t('title')} data-testid="audit-loading" />
      ) : isForbidden ? (
        <ForbiddenState title={t('forbiddenTitle')} description={t('forbiddenDescription')} data-testid="audit-forbidden" />
      ) : query.isError ? (
        <ErrorState
          title={t('errorTitle')}
          description={t('errorDescription')}
          retryLabel={t('retry')}
          onRetry={() => void query.refetch()}
          data-testid="audit-error"
        />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} data-testid="audit-empty" />
      ) : (
        <>
          <Table<AuditLogItemDTO>
            columns={columns}
            rows={query.data?.items ?? []}
            getRowKey={(r) => r.id}
            onRowClick={(r) => setDetail(r)}
            caption={t('tableCaption')}
            data-testid="audit-table"
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="secondary"
              disabled={history.length <= 1 || query.isFetching}
              onClick={() => setHistory((h) => h.slice(0, -1))}
              data-testid="audit-prev"
            >
              {t('prev')}
            </Button>
            <span className="text-sm text-neutral-500" data-testid="audit-page">
              {t('pageN', { n: history.length })}
            </span>
            <Button
              variant="secondary"
              disabled={!query.data?.hasMore || query.isFetching}
              onClick={() => {
                const next = query.data?.nextCursor;
                if (next) setHistory((h) => [...h, next]);
              }}
              data-testid="audit-next"
            >
              {t('next')}
            </Button>
          </div>
        </>
      )}

      {/* Row detail — metadata as safely-formatted JSON text (never HTML). */}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title={t('detailTitle')} data-testid="audit-detail">
        {detail && (
          <dl className="flex flex-col gap-2 text-sm">
            <Row label={t('colTimestamp')} value={dateFmt.format(new Date(detail.createdAt))} />
            <Row label={t('colAction')} value={detail.action} />
            <Row label={t('colEntityType')} value={detail.entityType} />
            <Row label={t('colEntityId')} value={detail.entityId ?? none} />
            <Row label={t('colActor')} value={detail.actorUserId ?? none} />
            <div className="flex flex-col gap-1">
              <dt className="text-neutral-500">{t('metadataLabel')}</dt>
              <dd>
                <pre
                  className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800"
                  data-testid="audit-metadata"
                >
                  {detail.metadata == null ? t('noMetadata') : JSON.stringify(detail.metadata, null, 2)}
                </pre>
              </dd>
            </div>
          </dl>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="break-all text-right font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
