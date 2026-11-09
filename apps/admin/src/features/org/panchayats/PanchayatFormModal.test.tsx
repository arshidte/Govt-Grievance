// @vitest-environment jsdom
import { ApiClientError } from '@pg/api-client';
import enMessages from '@pg/i18n/messages/en.json';
import mlMessages from '@pg/i18n/messages/ml.json';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PanchayatFormModal } from './PanchayatFormModal';

// Mock the local client hook (no real network) and the two mutation hooks.
vi.mock('../../auth/api-client', () => ({ useApiClient: () => ({}) }));

let createBehavior: 'capture' | 'error' = 'capture';
const createMutate = vi.fn(
  (
    _input: unknown,
    opts: { onSuccess: () => void; onError: (e: unknown) => void },
  ) => {
    if (createBehavior === 'error') {
      opts.onError(new ApiClientError('panchayat_code_taken', 'errors.panchayatCodeTaken', 409));
    } else {
      opts.onSuccess();
    }
  },
);

vi.mock('@pg/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pg/api-client')>();
  return {
    ...actual,
    useCreatePanchayat: () => ({ mutate: createMutate, isPending: false }),
    useUpdatePanchayat: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

function renderIntl(children: ReactNode, locale: 'en' | 'ml' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? enMessages : mlMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

describe('PanchayatFormModal', () => {
  beforeEach(() => {
    createBehavior = 'capture';
    createMutate.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it('blocks submit and shows field errors when required fields are empty', async () => {
    const user = userEvent.setup();
    renderIntl(<PanchayatFormModal open editing={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.click(screen.getByTestId('panchayat-form-submit'));

    expect(createMutate).not.toHaveBeenCalled();
    // Each invalid field renders an inline error with role="alert".
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('submits valid input (mutation called once)', async () => {
    const user = userEvent.setup();
    renderIntl(<PanchayatFormModal open editing={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.type(screen.getByTestId('panchayat-code-input'), 'PG-100');
    await user.type(screen.getByTestId('panchayat-name-input'), 'Alpha');
    await user.type(screen.getByTestId('panchayat-name-ml-input'), 'ആൽഫ');
    await user.click(screen.getByTestId('panchayat-form-submit'));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0]?.[0]).toMatchObject({ code: 'PG-100', name: 'Alpha' });
  });

  it('surfaces a server error (e.g. duplicate code) in an alert', async () => {
    createBehavior = 'error';
    const user = userEvent.setup();
    renderIntl(<PanchayatFormModal open editing={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await user.type(screen.getByTestId('panchayat-code-input'), 'PG-100');
    await user.type(screen.getByTestId('panchayat-name-input'), 'Alpha');
    await user.type(screen.getByTestId('panchayat-name-ml-input'), 'ആൽഫ');
    await user.click(screen.getByTestId('panchayat-form-submit'));

    expect(await screen.findByTestId('panchayat-form-error')).toHaveTextContent(
      'That panchayat code is already in use.',
    );
  });

  it('renders Malayalam labels when locale is ml', () => {
    renderIntl(<PanchayatFormModal open editing={null} onClose={vi.fn()} onSaved={vi.fn()} />, 'ml');
    // mlMessages.admin.panchayats.codeLabel
    expect(screen.getByText(mlMessages.admin.panchayats.codeLabel)).toBeInTheDocument();
  });
});
