'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import { useUnreadCountQuery } from './useNotifications';

function BellIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M10 2a5 5 0 0 0-5 5v2.1c0 .5-.2 1-.5 1.4L3 12.6c-.8.9-.1 2.4 1.1 2.4h11.8c1.2 0 1.9-1.5 1.1-2.4l-1.5-2.1a2 2 0 0 1-.5-1.4V7a5 5 0 0 0-5-5Zm0 16a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 10 18Z" />
    </svg>
  );
}

/**
 * Header bell (spec §11 "unread count / bell"): links to `/${locale}/notifications`
 * and shows the unread COUNT as a badge. While the count query is pending,
 * or once it resolves to `0`, NO badge is shown (a "0" badge would be
 * visual noise) — the bell icon alone is still rendered either way, so the
 * notifications page stays reachable.
 *
 * The button carries an `aria-label` that always includes the count (even
 * when 0/loading, so assistive tech gets a consistent announcement),
 * mirroring `BottomNav`'s "never icon-only, always a discernible accessible
 * name" convention.
 */
export function NotificationBell() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const unreadCount = useUnreadCountQuery();

  const count = unreadCount.data?.count ?? 0;
  const showBadge = !unreadCount.isPending && count > 0;

  return (
    <button
      type="button"
      onClick={() => router.push(`/${locale}/notifications`)}
      aria-label={t('notifications.bellLabel', { count })}
      data-testid="notification-bell"
      className="relative flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <BellIcon className="h-5 w-5" />
      {showBadge && (
        <span
          data-testid="notification-unread-count"
          className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-escalated px-1 text-[10px] font-semibold text-white"
        >
          {count}
        </span>
      )}
    </button>
  );
}
