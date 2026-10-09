// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { MeResponse } from '@pg/types';

import enMessages from '@pg/i18n/messages/en.json';
import { HomeOverview } from './HomeOverview';

/**
 * Mocks `@pg/api-client`'s `useMe` (the one real network dependency this
 * page has — see HomeOverview.tsx's header comment) so the three states
 * (loading/error/success) can be asserted in isolation, without a real
 * BFF/fetch call. The success case is the one the brief calls out
 * explicitly: issue data is M2 scope, so the three stat tiles must render
 * as ZEROED, and the empty-state copy (`home.emptyTitle`/`emptyDescription`)
 * must be present — this test is the guard against ever inventing fake
 * issue counts here.
 */
let meResult: {
  data: MeResponse | undefined;
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

vi.mock('@pg/api-client', async () => {
  const actual = await vi.importActual<typeof import('@pg/api-client')>('@pg/api-client');
  return {
    ...actual,
    useMe: () => meResult,
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
  });

  it('renders zeroed stat tiles and the empty-state copy for issues (issue data is M2)', () => {
    renderWithIntl(<HomeOverview />);

    expect(screen.getByText(enMessages.home.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(enMessages.home.emptyDescription)).toBeInTheDocument();

    expect(screen.getByTestId(`stat-card-${enMessages.home.active}`)).toHaveTextContent('0');
    expect(screen.getByTestId(`stat-card-${enMessages.home.awaiting}`)).toHaveTextContent('0');
    expect(screen.getByTestId(`stat-card-${enMessages.home.resolved}`)).toHaveTextContent('0');
  });

  it('shows the loading state while useMe is pending', () => {
    meResult = { data: undefined, isPending: true, isError: false, error: null, refetch: vi.fn() };
    renderWithIntl(<HomeOverview />);

    expect(screen.getByTestId('home-loading')).toBeInTheDocument();
  });

  it('shows the error state when useMe fails', () => {
    meResult = {
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
