// @vitest-environment jsdom
import enMessages from '@pg/i18n/messages/en.json';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

function renderIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

describe('ConfirmDialog', () => {
  it('renders as an accessible dialog with the message and fires confirm/cancel', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderIntl(
      <ConfirmDialog
        open
        title="Deactivate panchayat"
        message="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    // role=dialog, labelled by the title.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();

    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderIntl(<ConfirmDialog open title="T" message="M" onConfirm={vi.fn()} onCancel={onCancel} />);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables both actions while loading', () => {
    renderIntl(
      <ConfirmDialog open loading title="T" message="M" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId('confirm-dialog-cancel')).toBeDisabled();
    // The confirm button renders aria-busy while loading.
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders nothing when closed', () => {
    renderIntl(<ConfirmDialog open={false} title="T" message="M" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
