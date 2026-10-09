// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { MeResponse } from '@pg/types';

import enMessages from '@pg/i18n/messages/en.json';
import { ToastProvider } from '@pg/ui';
import { ProfileForm } from './ProfileForm';

/**
 * Mocks `@pg/api-client`'s `useMe`/`useUpdateProfile` (the hooks
 * `ProfileForm` imports directly — unlike `LoginForm`, which goes through
 * the citizen app's own `useAuth` wrapper), plus `./ProfileForm`'s sibling
 * `useApiClient` (so no real fetch/BFF call happens). This isolates the
 * three behaviors the brief asks for: (1) the form PRE-FILLS from `useMe`,
 * (2) a valid submit calls `useUpdateProfile`'s mutate with the
 * `updateProfileSchema`-shaped payload, (3) a success state renders the
 * success toast. We assert on rendered DOM (input values, toast text),
 * not on mock call internals alone, except for the one assertion the brief
 * explicitly asks for (that `mutate` was called with a valid payload).
 */
const mutate = vi.fn();
const refetchMe = vi.fn();

let meResult: {
  data: MeResponse | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};
let updateProfileResult: {
  mutate: typeof mutate;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  reset: () => void;
};

const MOCK_ME: MeResponse = {
  id: 'user-1',
  phone: '+919876543210',
  fullName: 'Jane Citizen',
  email: 'jane@example.com',
  preferredLanguage: 'en',
  status: 'active',
  roles: [],
};

vi.mock('@pg/api-client', async () => {
  const actual = await vi.importActual<typeof import('@pg/api-client')>('@pg/api-client');
  return {
    ...actual,
    useMe: () => meResult,
    useUpdateProfile: () => updateProfileResult,
  };
});

vi.mock('../auth/api-client', () => ({
  useApiClient: () => ({}),
}));

function renderWithIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ToastProvider>{children}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe('ProfileForm', () => {
  beforeEach(() => {
    mutate.mockClear();
    refetchMe.mockClear();
    meResult = { data: MOCK_ME, isPending: false, isError: false, error: null, refetch: refetchMe };
    updateProfileResult = { mutate, isPending: false, isError: false, isSuccess: false, reset: vi.fn() };
  });

  it('pre-fills the form fields from useMe', async () => {
    renderWithIntl(<ProfileForm />);

    expect(await screen.findByDisplayValue('Jane Citizen')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+919876543210')).toBeInTheDocument();
  });

  it('calls useUpdateProfile.mutate with a valid updateProfileSchema payload on submit', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ProfileForm />);

    const fullNameInput = await screen.findByDisplayValue('Jane Citizen');
    await user.clear(fullNameInput);
    await user.type(fullNameInput, 'Jane A. Citizen');

    await user.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(mutate).toHaveBeenCalledTimes(1);
    });
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Jane A. Citizen',
        email: 'jane@example.com',
        preferredLanguage: 'en',
      }),
    );
  });

  it('does NOT call mutate when fullName is cleared to empty (validation blocks submit)', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ProfileForm />);

    const fullNameInput = await screen.findByDisplayValue('Jane Citizen');
    await user.clear(fullNameInput);
    await user.click(screen.getByTestId('profile-save'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows a success toast when the update succeeds', async () => {
    updateProfileResult = { mutate, isPending: false, isError: false, isSuccess: true, reset: vi.fn() };
    renderWithIntl(<ProfileForm />);

    expect(await screen.findByTestId('profile-save-toast')).toBeInTheDocument();
    expect(screen.getByText(enMessages.profile.saveSuccessTitle)).toBeInTheDocument();
  });

  it('shows the loading state while useMe is pending', () => {
    meResult = { data: undefined, isPending: true, isError: false, error: null, refetch: refetchMe };
    renderWithIntl(<ProfileForm />);

    expect(screen.getByTestId('profile-loading')).toBeInTheDocument();
  });

  it('shows the error state when useMe fails', () => {
    meResult = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('network_error'),
      refetch: refetchMe,
    };
    renderWithIntl(<ProfileForm />);

    expect(screen.getByTestId('profile-error')).toBeInTheDocument();
  });
});
