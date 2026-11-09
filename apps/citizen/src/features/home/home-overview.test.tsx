// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { IssueSummaryDTO, MeResponse } from '@pg/types';

import enMessages from '@pg/i18n/messages/en.json';
import { HomeOverview } from './HomeOverview';

/**
 * Mocks `@pg/api-client`'s `useMe` (personalizes the greeting) and
 * `useIssues` (the REAL count/preview source — revamp P3 replaced the
 * former hard-zeroed placeholder tiles with counts DERIVED from this list),
 * plus the sibling `useApiClient` (so no real fetch/BFF call happens). The
 * key guards here: the stat tiles reflect the actual issue list (never
 * invented), and the empty-state copy appears only when the citizen has no
 * grievances.
 */
let meResult: {
  data: MeResponse | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};
let issuesResult: {
  data: IssueSummaryDTO[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};

const MOCK_ME: MeResponse = {
  id: 'user-1',
  phone: '+919876543210',
  fullName: 'Jane Citizen',
  email: null,
  preferredLanguage: 'en',
  status: 'active',
  roles: [],
};

function issue(id: string, status: IssueSummaryDTO['status']): IssueSummaryDTO {
  return {
    id,
    referenceNo: `PG-2026-${id}`,
    title: `Issue ${id}`,
    status,
    priority: 'MEDIUM',
    categoryId: 'cat-roads',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

vi.mock('@pg/api-client', async () => {
  const actual = await vi.importActual<typeof import('@pg/api-client')>('@pg/api-client');
  return {
    ...actual,
    useMe: () => meResult,
    useIssues: () => issuesResult,
  };
});

vi.mock('../auth/api-client', () => ({
  useApiClient: () => ({}),
}));

function renderWithIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

describe('HomeOverview', () => {
  beforeEach(() => {
    meResult = { data: MOCK_ME, isPending: false, isError: false, error: null, refetch: vi.fn() };
    issuesResult = { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() };
  });

  it('shows the empty-state copy (with Submit CTA) when the citizen has no grievances', () => {
    issuesResult = { data: [], isPending: false, isError: false, error: null, refetch: vi.fn() };
    renderWithIntl(<HomeOverview />);

    expect(screen.getByTestId('home-empty-state')).toBeInTheDocument();
    expect(screen.getByText(enMessages.home.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(enMessages.home.emptyDescription)).toBeInTheDocument();
  });

  it('derives REAL stat counts from the useIssues list (never invented, never zeroed)', () => {
    // 1 submitted, 2 mid-lifecycle (in progress), 1 resolved => total 4.
    issuesResult = {
      data: [
        issue('1', 'SUBMITTED'),
        issue('2', 'IN_PROGRESS'),
        issue('3', 'ACKNOWLEDGED'),
        issue('4', 'RESOLVED'),
      ],
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    renderWithIntl(<HomeOverview />);

    expect(screen.getByTestId(`stat-card-${enMessages.home.statTotal}`)).toHaveTextContent('4');
    expect(screen.getByTestId(`stat-card-${enMessages.home.statSubmitted}`)).toHaveTextContent('1');
    expect(screen.getByTestId(`stat-card-${enMessages.home.statInProgress}`)).toHaveTextContent('2');
    expect(screen.getByTestId(`stat-card-${enMessages.home.statResolved}`)).toHaveTextContent('1');
  });

  it('shows the loading state while either read is pending', () => {
    issuesResult = { data: undefined, isPending: true, isError: false, error: null, refetch: vi.fn() };
    renderWithIntl(<HomeOverview />);

    expect(screen.getByTestId('home-loading')).toBeInTheDocument();
  });

  it('shows the error state when a read fails', () => {
    issuesResult = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('network_error'),
      refetch: vi.fn(),
    };
    renderWithIntl(<HomeOverview />);

    expect(screen.getByTestId('home-error')).toBeInTheDocument();
  });
});
