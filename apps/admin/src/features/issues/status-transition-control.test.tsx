// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { IssueDetailDTO, IssueStatus } from '@pg/types';

import enMessages from '@pg/i18n/messages/en.json';
import { StatusTransitionControl } from './StatusTransitionControl';

/**
 * Mocks `@pg/api-client`'s `useTransitionIssue` (mirrors
 * `issue-detail.test.tsx`'s mocking convention) and the admin
 * `useApiClient`, so no real fetch/BFF call happens. Pins down the three
 * behaviors the brief calls out: (1) only the single allowed next status is
 * ever offered (never a skip/backward/CLOSED/REOPENED), (2) the note is
 * REQUIRED to enable submit, (3) submit calls the mutation with exactly
 * `{ id, input: { toStatus, note } }`.
 */
const mutate = vi.fn();

vi.mock('@pg/api-client', async () => {
  const actual = await vi.importActual<typeof import('@pg/api-client')>('@pg/api-client');
  return {
    ...actual,
    useTransitionIssue: () => ({
      mutate,
      isPending: false,
      isError: false,
      error: null,
    }),
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

function makeIssue(status: IssueStatus): IssueDetailDTO {
  return {
    id: 'issue-1',
    referenceNo: 'PG-2026-000123',
    title: 'Pothole on main road',
    status,
    priority: 'MEDIUM',
    categoryId: 'cat-roads',
    createdAt: '2026-01-01T00:00:00.000Z',
    description: 'There is a large pothole.',
    panchayatId: 'pan-1',
    wardId: 'ward-1a',
    subcategoryId: null,
    onBehalfOf: false,
    timeline: [],
    attachment: null,
  };
}

describe('StatusTransitionControl', () => {
  beforeEach(() => {
    mutate.mockClear();
  });

  it('SUBMITTED: offers only ACKNOWLEDGED as the next status (never IN_PROGRESS/RESOLVED/CLOSED/backward)', () => {
    renderWithIntl(<StatusTransitionControl issue={makeIssue('SUBMITTED')} />);

    const control = screen.getByTestId('status-transition-control');
    expect(control).toBeInTheDocument();

    const target = screen.getByTestId('transition-target');
    expect(target).toHaveTextContent(enMessages.status.acknowledged);
    expect(target).not.toHaveTextContent(enMessages.status.inProgress);
    expect(target).not.toHaveTextContent(enMessages.status.resolved);
    expect(target).not.toHaveTextContent(enMessages.status.closed);
    expect(target).not.toHaveTextContent(enMessages.status.submitted);
  });

  it('ACKNOWLEDGED: offers only IN_PROGRESS as the next status', () => {
    renderWithIntl(<StatusTransitionControl issue={makeIssue('ACKNOWLEDGED')} />);

    const target = screen.getByTestId('transition-target');
    expect(target).toHaveTextContent(enMessages.status.inProgress);
    expect(target).not.toHaveTextContent(enMessages.status.resolved);
  });

  it('IN_PROGRESS: offers only RESOLVED as the next status', () => {
    renderWithIntl(<StatusTransitionControl issue={makeIssue('IN_PROGRESS')} />);

    const target = screen.getByTestId('transition-target');
    expect(target).toHaveTextContent(enMessages.status.resolved);
  });

  it('RESOLVED: renders no transition control, only the "no further action" message', () => {
    renderWithIntl(<StatusTransitionControl issue={makeIssue('RESOLVED')} />);

    expect(screen.queryByTestId('status-transition-control')).not.toBeInTheDocument();
    expect(screen.queryByTestId('transition-submit')).not.toBeInTheDocument();
    expect(screen.getByTestId('transition-none')).toBeInTheDocument();
  });

  it('submit is disabled until the note is non-empty, then becomes enabled', async () => {
    const user = userEvent.setup();
    renderWithIntl(<StatusTransitionControl issue={makeIssue('SUBMITTED')} />);

    const submit = screen.getByTestId('transition-submit');
    expect(submit).toBeDisabled();

    const noteInput = screen.getByTestId('transition-note-input');
    await user.type(noteInput, 'Acknowledged, assigning to field team.');

    expect(submit).toBeEnabled();
  });

  it('submitting calls useTransitionIssue.mutate with { id, input: { toStatus, note } }', async () => {
    const user = userEvent.setup();
    renderWithIntl(<StatusTransitionControl issue={makeIssue('SUBMITTED')} />);

    const noteInput = screen.getByTestId('transition-note-input');
    await user.type(noteInput, 'Acknowledged, assigning to field team.');
    await user.click(screen.getByTestId('transition-submit'));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      {
        id: 'issue-1',
        input: { toStatus: 'ACKNOWLEDGED', note: 'Acknowledged, assigning to field team.' },
      },
      expect.anything(),
    );
  });
});
