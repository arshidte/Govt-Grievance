// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { NotificationDTO } from '@pg/types';

import enMessages from '@pg/i18n/messages/en.json';
import { NotificationsList } from './NotificationsList';
import { NotificationBell } from './NotificationBell';

/**
 * Mocks `@pg/api-client`'s `useNotifications`/`useUnreadCount`/`useMarkRead`
 * (the hooks this feature's local `useNotifications.ts` binding module
 * delegates to), plus the sibling `useApiClient` (so no real fetch/BFF call
 * happens). Mirrors `issue-detail.test.tsx`'s mocking conventions (T22).
 */
let notificationsResult: {
  data: NotificationDTO[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};
let unreadCountResult: {
  data: { count: number } | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
};

const refetchNotifications = vi.fn();
const markReadMutate = vi.fn();

vi.mock('@pg/api-client', async () => {
  const actual = await vi.importActual<typeof import('@pg/api-client')>('@pg/api-client');
  return {
    ...actual,
    useNotifications: () => notificationsResult,
    useUnreadCount: () => unreadCountResult,
    useMarkRead: () => ({ mutate: markReadMutate }),
  };
});

vi.mock('../auth/api-client', () => ({
  useApiClient: () => ({}),
}));

// `NotificationsList` navigates on click via `next/navigation`'s `useRouter`.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function renderWithIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

const UNREAD_SUBMITTED: NotificationDTO = {
  id: 'notif-1',
  type: 'issue.submitted',
  issueId: 'issue-1',
  readAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const READ_STATUS_CHANGED: NotificationDTO = {
  id: 'notif-2',
  type: 'issue.status_changed',
  issueId: 'issue-2',
  readAt: '2026-01-02T00:00:00.000Z',
  createdAt: '2026-01-02T00:00:00.000Z',
};

describe('NotificationsList', () => {
  beforeEach(() => {
    refetchNotifications.mockClear();
    markReadMutate.mockClear();
    pushMock.mockClear();
    notificationsResult = {
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: refetchNotifications,
    };
  });

  it('renders the loading state while useNotifications is pending', () => {
    renderWithIntl(<NotificationsList />);
    expect(screen.getByTestId('notifications-loading')).toBeInTheDocument();
  });

  it('renders the error state when useNotifications fails', () => {
    notificationsResult = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('network_error'),
      refetch: refetchNotifications,
    };
    renderWithIntl(<NotificationsList />);
    expect(screen.getByTestId('notifications-error')).toBeInTheDocument();
  });

  it('renders the empty state when useNotifications returns an empty list', () => {
    notificationsResult = { data: [], isPending: false, isError: false, error: null, refetch: refetchNotifications };
    renderWithIntl(<NotificationsList />);
    expect(screen.getByTestId('notifications-empty-state')).toBeInTheDocument();
  });

  it('renders a mix of unread and read notifications with the correct visual/aria state for each', () => {
    notificationsResult = {
      data: [UNREAD_SUBMITTED, READ_STATUS_CHANGED],
      isPending: false,
      isError: false,
      error: null,
      refetch: refetchNotifications,
    };
    renderWithIntl(<NotificationsList />);

    const items = screen.getAllByTestId('notification-item');
    expect(items).toHaveLength(2);

    // Item 1: UNREAD — derives message from `issue.submitted`, carries the
    // unread marker attribute, and exposes an accessible "Unread" label
    // (not color alone, per WCAG 1.4.1).
    expect(items[0]).toHaveAttribute('data-unread', 'true');
    expect(within(items[0]!).getByText(enMessages.notifications.message.issueSubmitted)).toBeInTheDocument();
    expect(within(items[0]!).getByText(enMessages.notifications.unreadLabel)).toBeInTheDocument();

    // Item 2: READ — derives message from `issue.status_changed`, carries
    // no unread marker.
    expect(items[1]).toHaveAttribute('data-unread', 'false');
    expect(within(items[1]!).getByText(enMessages.notifications.message.issueStatusChanged)).toBeInTheDocument();
    expect(within(items[1]!).queryByText(enMessages.notifications.unreadLabel)).not.toBeInTheDocument();
  });

  it('renders the createdAt timestamp, locale-formatted', () => {
    notificationsResult = {
      data: [UNREAD_SUBMITTED],
      isPending: false,
      isError: false,
      error: null,
      refetch: refetchNotifications,
    };
    renderWithIntl(<NotificationsList />);

    const expected = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(UNREAD_SUBMITTED.createdAt),
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  // Brief requirement: an unrecognized notification `type` must render
  // gracefully (no throw, no raw key leaking into the UI) via a fallback
  // message.
  it('renders gracefully (no throw, no raw key) for an unrecognized notification type', () => {
    const weird: NotificationDTO = { ...UNREAD_SUBMITTED, type: 'some.future.type' };
    notificationsResult = { data: [weird], isPending: false, isError: false, error: null, refetch: refetchNotifications };

    expect(() => renderWithIntl(<NotificationsList />)).not.toThrow();
    expect(screen.getByText(enMessages.notifications.message.unknown)).toBeInTheDocument();
    expect(screen.queryByText('some.future.type')).not.toBeInTheDocument();
  });

  it('clicking an UNREAD notification fires mark-read for its id and navigates to /issues/:id', () => {
    notificationsResult = {
      data: [UNREAD_SUBMITTED],
      isPending: false,
      isError: false,
      error: null,
      refetch: refetchNotifications,
    };
    renderWithIntl(<NotificationsList />);

    const item = screen.getByTestId('notification-item');
    fireEvent.click(item);

    expect(markReadMutate).toHaveBeenCalledWith('notif-1');
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('/issues/issue-1'));
  });

  it('clicking an already-READ notification navigates to /issues/:id WITHOUT calling mark-read', () => {
    notificationsResult = {
      data: [READ_STATUS_CHANGED],
      isPending: false,
      isError: false,
      error: null,
      refetch: refetchNotifications,
    };
    renderWithIntl(<NotificationsList />);

    const item = screen.getByTestId('notification-item');
    fireEvent.click(item);

    expect(markReadMutate).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('/issues/issue-2'));
  });

  it('each item links/navigates to /issues/:id matching its own issueId', () => {
    notificationsResult = {
      data: [UNREAD_SUBMITTED, READ_STATUS_CHANGED],
      isPending: false,
      isError: false,
      error: null,
      refetch: refetchNotifications,
    };
    renderWithIntl(<NotificationsList />);

    const items = screen.getAllByTestId('notification-item');
    fireEvent.click(items[1]!);
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('/issues/issue-2'));
  });
});

describe('NotificationBell', () => {
  beforeEach(() => {
    pushMock.mockClear();
    unreadCountResult = { data: undefined, isPending: true, isError: false, error: null };
  });

  it('renders the bell with NO count badge while loading', () => {
    renderWithIntl(<NotificationBell />);
    expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    expect(screen.queryByTestId('notification-unread-count')).not.toBeInTheDocument();
  });

  it('renders the bell with NO count badge when count is 0', () => {
    unreadCountResult = { data: { count: 0 }, isPending: false, isError: false, error: null };
    renderWithIntl(<NotificationBell />);
    expect(screen.queryByTestId('notification-unread-count')).not.toBeInTheDocument();
  });

  it('shows the unread count badge and an aria-label including the count when count > 0', () => {
    unreadCountResult = { data: { count: 2 }, isPending: false, isError: false, error: null };
    renderWithIntl(<NotificationBell />);

    const badge = screen.getByTestId('notification-unread-count');
    expect(badge).toHaveTextContent('2');

    const bell = screen.getByTestId('notification-bell');
    expect(bell).toHaveAttribute('aria-label', expect.stringContaining('2'));
  });

  it('navigates to the notifications page when clicked', () => {
    unreadCountResult = { data: { count: 2 }, isPending: false, isError: false, error: null };
    renderWithIntl(<NotificationBell />);

    fireEvent.click(screen.getByTestId('notification-bell'));
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining('/notifications'));
  });
});
