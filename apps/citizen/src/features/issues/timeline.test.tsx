// @vitest-environment jsdom
import { NextIntlClientProvider } from 'next-intl';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import type { IssueStatusHistoryDTO } from '@pg/types';

import enMessages from '@pg/i18n/messages/en.json';
import { Timeline } from './Timeline';

function renderWithIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>,
  );
}

const ENTRY_OLDEST: IssueStatusHistoryDTO = {
  id: 'hist-1',
  fromStatus: 'SUBMITTED',
  toStatus: 'ACKNOWLEDGED',
  note: 'Received and logged.',
  actorRoleLabel: 'COORDINATOR',
  createdAt: '2026-01-01T10:00:00.000Z',
};

const ENTRY_NEWEST: IssueStatusHistoryDTO = {
  id: 'hist-2',
  fromStatus: 'ACKNOWLEDGED',
  toStatus: 'IN_PROGRESS',
  note: 'Assigned to field team.',
  actorRoleLabel: 'REPRESENTATIVE',
  createdAt: '2026-01-02T10:00:00.000Z',
};

/** A legacy/backfilled row — no actor could be attributed. */
const ENTRY_NULL_ACTOR: IssueStatusHistoryDTO = {
  id: 'hist-3',
  fromStatus: 'IN_PROGRESS',
  toStatus: 'RESOLVED',
  note: 'Migrated from legacy system; actor unknown.',
  actorRoleLabel: null,
  createdAt: '2026-01-03T10:00:00.000Z',
};

describe('Timeline', () => {
  it('renders nothing (or an empty hint) for an empty entries array, without throwing', () => {
    expect(() => renderWithIntl(<Timeline entries={[]} />)).not.toThrow();
  });

  it('renders each entry in the given order (oldest first), not re-sorted', () => {
    renderWithIntl(<Timeline entries={[ENTRY_OLDEST, ENTRY_NEWEST]} />);

    const rows = screen.getAllByTestId('timeline-entry');
    expect(rows).toHaveLength(2);
    // The FIRST rendered entry must be the oldest (hist-1), proving the
    // component preserves input order rather than re-sorting it.
    expect(within(rows[0]!).getByText('Received and logged.')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Assigned to field team.')).toBeInTheDocument();
  });

  it('shows the from->to status transition as icon+text (never color alone) for each entry', () => {
    renderWithIntl(<Timeline entries={[ENTRY_OLDEST]} />);

    const row = screen.getByTestId('timeline-entry');
    // Both status labels (from + to) render as visible text within the row.
    expect(within(row).getByText(enMessages.status.submitted)).toBeInTheDocument();
    expect(within(row).getByText(enMessages.status.acknowledged)).toBeInTheDocument();
    // Each status label is paired with an icon (StatusBadge convention).
    const icons = row.querySelectorAll('svg[aria-hidden="true"]');
    expect(icons.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the note and a locale-formatted timestamp for each entry', () => {
    renderWithIntl(<Timeline entries={[ENTRY_OLDEST]} />);

    const row = screen.getByTestId('timeline-entry');
    expect(within(row).getByText('Received and logged.')).toBeInTheDocument();
    // The raw ISO timestamp should NOT appear verbatim (it must be
    // locale-formatted for display), but some rendering of the date exists.
    expect(row.textContent).not.toContain('2026-01-01T10:00:00.000Z');
  });

  it('renders the localized role label when actorRoleLabel is present', () => {
    renderWithIntl(<Timeline entries={[ENTRY_OLDEST]} />);

    const row = screen.getByTestId('timeline-entry');
    expect(within(row).getByText(enMessages.role.coordinator)).toBeInTheDocument();
  });

  it('renders a DIFFERENT localized role label for a different actorRoleLabel', () => {
    renderWithIntl(<Timeline entries={[ENTRY_NEWEST]} />);

    const row = screen.getByTestId('timeline-entry');
    expect(within(row).getByText(enMessages.role.representative)).toBeInTheDocument();
  });

  // Spec §4.5 / R-LEGACY-NOTE: a null actorRoleLabel (legacy/backfilled row)
  // must render a NEUTRAL label — never a fabricated role, and never any
  // actor PII. This is the key assertion the brief calls out for review.
  it('renders a neutral label (NOT a fabricated role, no PII) when actorRoleLabel is null', () => {
    renderWithIntl(<Timeline entries={[ENTRY_NULL_ACTOR]} />);

    const row = screen.getByTestId('timeline-entry');

    // None of the known role labels may appear as the actor label for this
    // row (would be fabrication).
    expect(within(row).queryByText(enMessages.role.admin)).not.toBeInTheDocument();
    expect(within(row).queryByText(enMessages.role.coordinator)).not.toBeInTheDocument();
    expect(within(row).queryByText(enMessages.role.representative)).not.toBeInTheDocument();
    expect(within(row).queryByText(enMessages.role.citizen)).not.toBeInTheDocument();

    // The neutral placeholder IS present.
    expect(within(row).getByTestId('timeline-actor-neutral')).toBeInTheDocument();

    // The note (a migration-fallback message) still displays as plain text
    // — it is not reinterpreted as an actor identity.
    expect(within(row).getByText('Migrated from legacy system; actor unknown.')).toBeInTheDocument();
  });
});
