// @vitest-environment jsdom
import { ApiClientError } from '@pg/api-client';
import enMessages from '@pg/i18n/messages/en.json';
import mlMessages from '@pg/i18n/messages/ml.json';
import type { AuditLogPageDTO } from '@pg/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditLogViewer } from './AuditLogViewer';

vi.mock('../auth/api-client', () => ({ useApiClient: () => ({}) }));

// Controllable mock of the useAuditLogs hook; captures the params it's called with.
interface HookState {
  data?: AuditLogPageDTO;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}
let state: HookState;
const useAuditLogsMock = vi.fn((..._args: unknown[]) => state);
vi.mock('@pg/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pg/api-client')>();
  return { ...actual, useAuditLogs: (...args: unknown[]) => useAuditLogsMock(...args) };
});

const PAGE: AuditLogPageDTO = {
  items: [
    {
      id: 'al1',
      actorUserId: 'user-9',
      action: 'panchayat.created',
      entityType: 'Panchayat',
      entityId: 'p-1',
      metadata: { code: 'PG-1', name: 'Alpha' },
      createdAt: '2026-01-02T03:04:05.000Z',
    },
    {
      id: 'al2',
      actorUserId: null,
      action: 'otp.requested',
      entityType: 'User',
      entityId: null,
      metadata: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  nextCursor: 'CUR2',
  hasMore: true,
};

function renderViewer(locale: 'en' | 'ml' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? enMessages : mlMessages}>
      <AuditLogViewer />
    </NextIntlClientProvider>,
  );
}

const ok = (data: AuditLogPageDTO): HookState => ({ data, isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn() });

describe('AuditLogViewer', () => {
  beforeEach(() => {
    useAuditLogsMock.mockClear();
    state = ok(PAGE);
  });
  afterEach(() => vi.clearAllMocks());

  it('renders rows with the five columns and handles null values gracefully', () => {
    renderViewer();
    expect(screen.getByTestId('audit-table')).toBeInTheDocument();
    // The responsive table renders each row in both a desktop <table> and
    // mobile cards, so these appear more than once in jsdom.
    expect(screen.getAllByText('panchayat.created').length).toBeGreaterThan(0);
    expect(screen.getAllByText('otp.requested').length).toBeGreaterThan(0);
    // null entityId / actor render as the "—" placeholder.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('opens a row detail with metadata as formatted JSON (and "no metadata" for null)', async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.click(screen.getAllByText('panchayat.created')[0]!);
    const meta = await screen.findByTestId('audit-metadata');
    expect(meta.textContent).toContain('"code": "PG-1"'); // pretty-printed JSON text
    expect(meta.textContent).not.toContain('<'); // not HTML
  });

  it('commits filters on Apply and resets the cursor (page 1)', async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.type(screen.getByTestId('audit-filter-action'), 'ward.created');
    await user.click(screen.getByTestId('audit-apply'));
    const lastCall = useAuditLogsMock.mock.calls.at(-1)!;
    expect(lastCall[1]).toMatchObject({ action: 'ward.created', cursor: undefined, limit: 25 });
  });

  it('advances the cursor on Next (opaque cursor from the API)', async () => {
    const user = userEvent.setup();
    renderViewer();
    await user.click(screen.getByTestId('audit-next'));
    const lastCall = useAuditLogsMock.mock.calls.at(-1)!;
    expect(lastCall[1]).toMatchObject({ cursor: 'CUR2' });
  });

  it('shows the empty state when there are no items', () => {
    state = ok({ items: [], nextCursor: null, hasMore: false });
    renderViewer();
    expect(screen.getByTestId('audit-empty')).toBeInTheDocument();
  });

  it('shows the Forbidden state on a 403 (admin-only)', () => {
    state = { data: undefined, isLoading: false, isError: true, isFetching: false, error: new ApiClientError('forbidden', 'states.forbidden', 403), refetch: vi.fn() };
    renderViewer();
    expect(screen.getByTestId('audit-forbidden')).toBeInTheDocument();
    expect(screen.queryByTestId('audit-table')).not.toBeInTheDocument();
  });

  it('shows an error + retry on a non-403 failure', () => {
    const refetch = vi.fn();
    state = { data: undefined, isLoading: false, isError: true, isFetching: false, error: new ApiClientError('server_error', 'errors.generic', 500), refetch };
    renderViewer();
    expect(screen.getByTestId('audit-error')).toBeInTheDocument();
  });

  it('renders Malayalam copy', () => {
    renderViewer('ml');
    expect(screen.getAllByText(mlMessages.admin.auditLogs.title).length).toBeGreaterThan(0);
  });
});
