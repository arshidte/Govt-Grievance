// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

import enMessages from '@pg/i18n/messages/en.json';
import { LoginForm } from './LoginForm';

/**
 * Mocks `useAuth` (not the underlying `@pg/api-client` hooks or fetch) so
 * we can assert, in isolation, whether `requestOtp.mutate` was called —
 * the exact behavior this test exists to pin down: a BAD phone must show
 * the translated `invalid_phone` field error and must NOT call the
 * mutation; a VALID phone MUST call it.
 */
const mutate = vi.fn();

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    requestOtp: {
      mutate,
      isPending: false,
      isError: false,
      isSuccess: false,
    },
    verifyOtp: { mutate: vi.fn(), isPending: false, isError: false, isSuccess: false },
    logout: { mutate: vi.fn(), isPending: false, isError: false, isSuccess: false },
  }),
}));

function renderWithIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

describe('LoginForm', () => {
  beforeEach(() => {
    mutate.mockClear();
  });

  it('shows the translated invalid_phone field error and does NOT call the mutation for a bad phone', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LoginForm />);

    const phoneInput = screen.getByLabelText(/mobile number/i);
    await user.type(phoneInput, '12345');
    await user.click(screen.getByRole('button', { name: /send otp/i }));

    await waitFor(() => {
      expect(screen.getByText(enMessages.auth.invalidPhone)).toBeInTheDocument();
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it('calls the requestOtp mutation for a valid phone', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LoginForm />);

    const phoneInput = screen.getByLabelText(/mobile number/i);
    await user.type(phoneInput, '+919876543210');
    await user.click(screen.getByRole('button', { name: /send otp/i }));

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledTimes(1);
    });
    expect(mutate).toHaveBeenCalledWith(
      { phone: '+919876543210' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
