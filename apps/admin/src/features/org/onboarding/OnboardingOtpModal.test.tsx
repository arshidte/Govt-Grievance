// @vitest-environment jsdom
import { ApiClientError } from '@pg/api-client';
import enMessages from '@pg/i18n/messages/en.json';
import mlMessages from '@pg/i18n/messages/ml.json';
import type { StaffOnboardingDTO } from '@pg/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OnboardingOtpModal } from './OnboardingOtpModal';

vi.mock('../../auth/api-client', () => ({ useApiClient: () => ({}) }));

let verifyBehavior: 'ok' | 'error' = 'ok';
const verifyMutate = vi.fn(
  (_vars: { id: string; accessToken: string }, opts: { onSuccess: () => void; onError: (e: unknown) => void }) => {
    if (verifyBehavior === 'error') opts.onError(new ApiClientError('invalid_otp', 'auth.invalidCode', 401));
    else opts.onSuccess();
  },
);
const resendMutate = vi.fn((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());

vi.mock('@pg/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pg/api-client')>();
  return {
    ...actual,
    useVerifyOnboarding: () => ({ mutate: verifyMutate, isPending: false }),
    useResendOnboarding: () => ({ mutate: resendMutate, isPending: false }),
  };
});

const ONBOARDING: StaffOnboardingDTO = {
  id: 'onb-1',
  phone: '+919000000055',
  role: 'REPRESENTATIVE',
  status: 'pending',
  scopes: [{ id: 'w1', label: 'Ward 1', active: true }],
  userExists: false,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 300000).toISOString(),
  verifiedAt: null,
};

function renderIntl(children: ReactNode, locale: 'en' | 'ml' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? enMessages : mlMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

describe('OnboardingOtpModal', () => {
  beforeEach(() => {
    verifyBehavior = 'ok';
    verifyMutate.mockClear();
    resendMutate.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it('verifies with a 6-digit code and calls the mutation', async () => {
    const user = userEvent.setup();
    const onVerified = vi.fn();
    renderIntl(<OnboardingOtpModal open onboarding={ONBOARDING} onClose={vi.fn()} onVerified={onVerified} />);

    expect(screen.getByText(/\+919000000055/)).toBeInTheDocument();
    const verifyBtn = screen.getByTestId('onboarding-verify-submit');
    expect(verifyBtn).toBeDisabled(); // nothing typed yet

    await user.type(screen.getByTestId('onboarding-code-input'), '123456');
    expect(verifyBtn).toBeEnabled();
    await user.click(verifyBtn);

    // In test/dev mode the MSG91 widget yields a `test-otp:<phone>` token.
    await waitFor(() =>
      expect(verifyMutate).toHaveBeenCalledWith(
        { id: 'onb-1', accessToken: 'test-otp:+919000000055' },
        expect.anything(),
      ),
    );
    expect(onVerified).toHaveBeenCalled();
  });

  it('shows a server error when the code is invalid', async () => {
    verifyBehavior = 'error';
    const user = userEvent.setup();
    renderIntl(<OnboardingOtpModal open onboarding={ONBOARDING} onClose={vi.fn()} onVerified={vi.fn()} />);
    await user.type(screen.getByTestId('onboarding-code-input'), '000000');
    await user.click(screen.getByTestId('onboarding-verify-submit'));
    expect(await screen.findByTestId('onboarding-otp-error')).toBeInTheDocument();
  });

  it('resends the code', async () => {
    const user = userEvent.setup();
    renderIntl(<OnboardingOtpModal open onboarding={ONBOARDING} onClose={vi.fn()} onVerified={vi.fn()} />);
    await user.click(screen.getByTestId('onboarding-resend-button'));
    expect(resendMutate).toHaveBeenCalledWith('onb-1', expect.anything());
    expect(await screen.findByTestId('onboarding-otp-notice')).toBeInTheDocument();
  });

  it('strips non-digits and caps the code at 6 characters', async () => {
    const user = userEvent.setup();
    renderIntl(<OnboardingOtpModal open onboarding={ONBOARDING} onClose={vi.fn()} onVerified={vi.fn()} />);
    const input = screen.getByTestId('onboarding-code-input') as HTMLInputElement;
    await user.type(input, '12ab34cd567');
    expect(input.value).toBe('123456');
  });

  it('renders Malayalam copy', () => {
    renderIntl(
      <OnboardingOtpModal open onboarding={ONBOARDING} onClose={vi.fn()} onVerified={vi.fn()} />,
      'ml',
    );
    expect(screen.getByText(mlMessages.admin.onboarding.verifyTitle)).toBeInTheDocument();
  });
});
