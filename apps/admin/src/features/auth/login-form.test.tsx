// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

import enMessages from '@pg/i18n/messages/en.json';
import { LoginForm } from './LoginForm';

/**
 * Mocks the MSG91 widget's `sendOtp` (not fetch) so we can assert, in
 * isolation, that a BAD phone shows the translated `invalid_phone` field error
 * and does NOT dispatch the widget, while a VALID phone sends the OTP and
 * advances (`onRequested`).
 */
const sendOtp = vi.fn().mockResolvedValue(undefined);
vi.mock('./otpWidget', () => ({ sendOtp: (...args: unknown[]) => sendOtp(...args) }));

function renderWithIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

describe('LoginForm', () => {
  beforeEach(() => {
    sendOtp.mockClear();
  });

  it('shows the translated invalid_phone field error and does NOT send for a bad phone', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LoginForm />);

    await user.type(screen.getByLabelText(/mobile number/i), '12345');
    await user.click(screen.getByRole('button', { name: /send otp/i }));

    await waitFor(() => {
      expect(screen.getByText(enMessages.auth.invalidPhone)).toBeInTheDocument();
    });
    expect(sendOtp).not.toHaveBeenCalled();
  });

  it('sends the OTP via the widget and advances for a valid phone', async () => {
    const onRequested = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<LoginForm onRequested={onRequested} />);

    await user.type(screen.getByLabelText(/mobile number/i), '+919876543210');
    await user.click(screen.getByRole('button', { name: /send otp/i }));

    await waitFor(() => expect(sendOtp).toHaveBeenCalledWith('+919876543210'));
    await waitFor(() => expect(onRequested).toHaveBeenCalledWith('+919876543210'));
  });
});
