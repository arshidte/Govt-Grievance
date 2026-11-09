'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import type { NotificationDTO } from '@pg/types';
import { EmptyState, ErrorState, LoadingState } from '@pg/ui';
import { Bell, FilePlus2, RefreshCw } from 'lucide-react';

import { useMarkReadMutation, useNotificationsQuery } from './useNotifications';

/**
 * Maps a `NotificationDTO.type` (an opaque string from the API — see
 * `@pg/types`'s header comment on `NotificationDTO`) to the i18n key for
 * its display message. Only the two M2 types are known; anything else
 * (a future type shipped server-side before the client supports it) falls
 * back to `notifications.message.unknown` rather than rendering the raw
 * key or throwing — same defensive convention as `StatusBadge`'s
 * unrecognized-status fallback.
 */
function messageKeyForType(type: string): string {
  switch (type) {
    case 'issue.submitted':
      return 'notifications.message.issueSubmitted';
    case 'issue.status_changed':
      return 'notifications.message.issueStatusChanged';
    default:
      return 'notifications.message.unknown';
  }
}

/**
 * Maps a `NotificationDTO.type` to its leading lucide icon — a per-type
 * visual cue alongside the message. Mirrors `messageKeyForType`'s defensive
 * fallback: an unknown/future type gets a generic `Bell` rather than throwing.
 * Purely presentational (no color meaning carried here — read/unread is the
 * only status cue and that lives on the row, with its text label).
 */
function iconForType(type: string): ComponentType<{ className?: string }> {
  switch (type) {
    case 'issue.submitted':
      return FilePlus2;
    case 'issue.status_changed':
      return RefreshCw;
    default:
      return Bell;
  }
}

interface NotificationRowProps {
  notification: NotificationDTO;
  dateFormatter: Intl.DateTimeFormat;
  onActivate: (notification: NotificationDTO) => void;
}

function NotificationRow({ notification, dateFormatter, onActivate }: NotificationRowProps) {
  const t = useTranslations();
  const isUnread = notification.readAt === null;
  const Icon = iconForType(notification.type);

  return (
    <button
      type="button"
      onClick={() => onActivate(notification)}
      data-testid="notification-item"
      data-unread={isUnread}
      className={[
        // Row: a leading type icon + message/timestamp column + unread cue.
        // Unread rows get a subtle left accent rail (border-l-4) + a tinted
        // surface + stronger text; read rows sit flat on white. Hover/focus
        // affordances make the whole row feel actionable.
        'flex w-full items-start gap-3 rounded-xl border border-l-4 px-4 py-3 text-left transition-colors',
        'hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
        isUnread
          ? 'border-neutral-200 border-l-primary-600 bg-primary-50 hover:bg-primary-50'
          : 'border-neutral-200 border-l-transparent bg-white',
      ].join(' ')}
    >
      {/* Leading type icon in a soft chip — unread tints it brand, read stays
          neutral. Decorative: the message text carries the real meaning. */}
      <span
        aria-hidden="true"
        className={[
          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          isUnread ? 'bg-primary-100 text-primary-700' : 'bg-neutral-100 text-neutral-500',
        ].join(' ')}
      >
        <Icon className="h-5 w-5" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex w-full items-start justify-between gap-2">
          <p className={isUnread ? 'text-sm font-semibold text-neutral-900' : 'text-sm font-normal text-neutral-700'}>
            {t(messageKeyForType(notification.type))}
          </p>
          {/* Unread state is conveyed via BOTH a visual dot AND this text
              label — never color/boldness alone (WCAG 1.4.1). */}
          {isUnread && (
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary-700">
              <span className="h-2 w-2 rounded-full bg-primary-600" aria-hidden="true" />
              {t('notifications.unreadLabel')}
            </span>
          )}
        </div>
        <span className="text-xs text-neutral-500">{dateFormatter.format(new Date(notification.createdAt))}</span>
      </div>
    </button>
  );
}

/**
 * Citizen notifications list (spec §11). Consumes `useNotificationsQuery`
 * (the local binding over `@pg/api-client`'s `useNotifications`), rendering
 * the shared `@pg/ui` loading/error/empty states (mirroring
 * `IssuesDashboard`'s convention).
 *
 * Clicking an UNREAD row fires the mark-read mutation for its id (not
 * awaited — the mutation's own `onSuccess` in `@pg/api-client`'s
 * `useMarkRead` already invalidates BOTH the notifications list and the
 * unread-count query, so this component adds no duplicate invalidation)
 * and then navigates to the issue. An already-READ row just navigates.
 * A null `issueId` (not expected for the two M2 types, but the DTO allows
 * it) still fires mark-read but does not navigate.
 */
export function NotificationsList() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const notifications = useNotificationsQuery();
  const markRead = useMarkReadMutation();

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  if (notifications.isPending) {
    return <LoadingState label={t('notifications.title')} data-testid="notifications-loading" />;
  }

  if (notifications.isError) {
    return (
      <ErrorState
        title={t('notifications.loadFailed')}
        onRetry={() => notifications.refetch()}
        data-testid="notifications-error"
      />
    );
  }

  if (notifications.data.length === 0) {
    return (
      <EmptyState
        title={t('notifications.emptyTitle')}
        description={t('notifications.emptyDescription')}
        data-testid="notifications-empty-state"
      />
    );
  }

  const handleActivate = (notification: NotificationDTO) => {
    if (notification.readAt === null) {
      markRead.mutate(notification.id);
    }
    if (notification.issueId !== null) {
      router.push(`/${locale}/issues/${notification.issueId}`);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="notifications-list">
      {notifications.data.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          dateFormatter={dateFormatter}
          onActivate={handleActivate}
        />
      ))}
    </div>
  );
}
