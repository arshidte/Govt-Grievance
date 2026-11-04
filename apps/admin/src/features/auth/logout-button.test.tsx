// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

import enMessages from '@pg/i18n/messages/en.json';
import { LogoutButton } from './LogoutButton';

/**
 * Mirrors the citizen app's `src/features/auth/logout-button.test.tsx`.
 * Mocks this app's own `useAuth` (not the underlying `@pg/api-client`
 * hooks), `next/navigation`'s `useRouter` (post-logout redirect), and
 * `@tanstack/react-query`'s `useQueryClient` (cache-clear on success).
 */
const mutate = vi.fn();
const clear = vi.fn();
const replace = vi.fn();

let logoutResult: {
  mutate: typeof mutate;
  isPending: boolean;
  isError: boolean;
};

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    requestOtp: { mutate: vi.fn(), isPending: false, isError: false },
    verifyOtp: { mutate: vi.fn(), isPending: false, isError: false },
    logout: logoutResult,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  );
  return {
    ...actual,
    useQueryClient: () => ({ clear }),
  };
});

function renderWithIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

describe('LogoutButton', () => {
  beforeEach(() => {
    mutate.mockClear();
    clear.mockClear();
    replace.mockClear();
    logoutResult = { mutate, isPending: false, isError: false };
  });

  it('renders a button with the translated logout label', () => {
    renderWithIntl(<LogoutButton />);

    const button = screen.getByTestId('logout-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent(enMessages.auth.logout);
  });

  it('calls the logout mutation on click', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LogoutButton />);

    await user.click(screen.getByTestId('logout-button'));

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('is disabled while the logout mutation is pending', () => {
    logoutResult = { mutate, isPending: true, isError: false };
    renderWithIntl(<LogoutButton />);

    expect(screen.getByTestId('logout-button')).toBeDisabled();
  });

  it('clears the query cache and navigates to /en/login on a successful logout', async () => {
    mutate.mockImplementation((_: void, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.();
    });
    const user = userEvent.setup();
    renderWithIntl(<LogoutButton />);

    await user.click(screen.getByTestId('logout-button'));

    await waitFor(() => {
      expect(clear).toHaveBeenCalledTimes(1);
    });
    expect(replace).toHaveBeenCalledWith('/en/login');
  });

  it('does NOT navigate when the logout mutation errors', async () => {
    mutate.mockImplementation(
      (_: void, options?: { onError?: () => void }) => {
        options?.onError?.();
      },
    );
    const user = userEvent.setup();
    renderWithIntl(<LogoutButton />);

    await user.click(screen.getByTestId('logout-button'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(replace).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});
