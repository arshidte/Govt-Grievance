import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge, type Status } from './status-badge';

/** Stub translator: mirrors `@pg/i18n`'s real status.* keys for the known
 * statuses, and returns the key itself for anything else (same shape as a
 * real next-intl `t`, which would throw/return the key for a missing
 * message depending on config — this stub just echoes, which is enough to
 * prove the badge renders SOME text without throwing). */
const t = (key: string) => key;

describe('StatusBadge', () => {
  it.each([
    'SUBMITTED',
    'ACKNOWLEDGED',
    'UNDER_REVIEW',
    'ASSIGNED',
    'IN_PROGRESS',
    'WAITING_FOR_INFORMATION',
    'ESCALATED',
    'RESOLVED',
    'CLOSED',
    'REOPENED',
  ] as const)('renders visible translated text and an aria-hidden icon for %s', (status) => {
    render(<StatusBadge status={status} t={t} />);

    const label = screen.getByText(/status\./);
    expect(label).toBeInTheDocument();

    const badge = label.closest('span');
    const icon = badge?.querySelector('svg[aria-hidden="true"]');
    expect(icon).toBeTruthy();
  });

  // Task 22 (citizen dashboard/detail/timeline) requires that an unrecognized
  // status value coming back from the API — i.e. a string outside the 10
  // canonical members, which the DTO's TypeScript type cannot actually
  // prevent at runtime — renders gracefully instead of crashing the page.
  // `statusLabelKey` already falls back to `status.submitted` for an
  // unknown string; this asserts the BADGE COMPONENT ITSELF does too (it
  // previously threw on an unrecognized status via a direct, unguarded
  // `STATUS_DESCRIPTORS[status]` lookup).
  it('renders gracefully (does not throw) for an unrecognized status value', () => {
    // Deliberate cast: simulating a runtime value outside the typed union,
    // exactly as a real unknown-status API response would arrive.
    const unknownStatus = 'SOME_FUTURE_STATUS' as Status;

    expect(() => render(<StatusBadge status={unknownStatus} t={t} />)).not.toThrow();
    expect(screen.getByText('status.submitted')).toBeInTheDocument();
  });
});
