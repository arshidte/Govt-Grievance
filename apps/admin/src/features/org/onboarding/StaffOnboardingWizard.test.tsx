// @vitest-environment jsdom
import enMessages from '@pg/i18n/messages/en.json';
import mlMessages from '@pg/i18n/messages/ml.json';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StaffOnboardingWizard } from './StaffOnboardingWizard';

vi.mock('../../auth/api-client', () => ({ useApiClient: () => ({}) }));

const PANCHAYAT = { id: 'p1', code: 'PG-1', name: 'Alpha', nameMl: 'ആൽഫ', status: 'active' };

let searchResult: { id: string; phone: string; fullName: string | null } | null = {
  id: 'u1',
  phone: '+919000000055',
  fullName: 'Found User',
};
const searchMutate = vi.fn((phone: string, opts: { onSuccess: (u: unknown) => void }) =>
  opts.onSuccess(searchResult),
);
const initiateMutate = vi.fn((_input: unknown, opts: { onSuccess: () => void }) => opts.onSuccess());

vi.mock('@pg/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pg/api-client')>();
  return {
    ...actual,
    useSearchStaff: () => ({ mutate: searchMutate, isPending: false }),
    useInitiateOnboarding: () => ({ mutate: initiateMutate, isPending: false }),
    useAdminPanchayats: () => ({ data: [PANCHAYAT], isLoading: false, isError: false }),
    useAdminWards: () => ({ data: [], isLoading: false, isError: false }),
  };
});

function renderIntl(children: ReactNode, locale: 'en' | 'ml' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? enMessages : mlMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

describe('StaffOnboardingWizard (coordinator path)', () => {
  beforeEach(() => {
    searchResult = { id: 'u1', phone: '+919000000055', fullName: 'Found User' };
    searchMutate.mockClear();
    initiateMutate.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it('searches an existing user, selects a panchayat scope, reviews and initiates', async () => {
    const user = userEvent.setup();
    const onInitiated = vi.fn();
    renderIntl(
      <StaffOnboardingWizard open role="COORDINATOR" onClose={vi.fn()} onInitiated={onInitiated} />,
    );

    // Review is disabled until a valid phone is searched + a scope chosen.
    expect(screen.getByTestId('onboarding-review-button')).toBeDisabled();

    await user.type(screen.getByTestId('onboarding-phone-input'), '+919000000055');
    await user.click(screen.getByTestId('onboarding-search-button'));
    expect(searchMutate).toHaveBeenCalled();
    // Existing-user success notice renders.
    expect(screen.getByTestId('onboarding-search-result')).toHaveTextContent('Found User');

    await user.click(screen.getByTestId('onboarding-scope-checkbox'));
    await user.click(screen.getByTestId('onboarding-review-button'));

    // Review step shows the summary; initiate sends the request.
    expect(screen.getByTestId('onboarding-review')).toBeInTheDocument();
    await user.click(screen.getByTestId('onboarding-initiate-submit'));
    expect(initiateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+919000000055', role: 'COORDINATOR', panchayatIds: ['p1'] }),
      expect.anything(),
    );
    expect(onInitiated).toHaveBeenCalled();
  });

  it('shows the new-account notice when no user is found', async () => {
    searchResult = null;
    const user = userEvent.setup();
    renderIntl(<StaffOnboardingWizard open role="COORDINATOR" onClose={vi.fn()} onInitiated={vi.fn()} />);
    await user.type(screen.getByTestId('onboarding-phone-input'), '+919000000055');
    await user.click(screen.getByTestId('onboarding-search-button'));
    expect(screen.getByTestId('onboarding-search-result')).toHaveTextContent(
      enMessages.admin.onboarding.newAccountNotice,
    );
  });

  it('renders Malayalam title', () => {
    renderIntl(
      <StaffOnboardingWizard open role="COORDINATOR" onClose={vi.fn()} onInitiated={vi.fn()} />,
      'ml',
    );
    expect(screen.getByText(mlMessages.admin.onboarding.titleCoord)).toBeInTheDocument();
  });
});
