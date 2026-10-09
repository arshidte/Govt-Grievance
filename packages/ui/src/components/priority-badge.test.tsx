import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriorityBadge } from './priority-badge';

/** Stub translator: echoes the message key back, so assertions can check
 * the exact i18n key was resolved and rendered (proves i18n-purity: the
 * component never hardcodes English text). */
const t = (key: string) => key;

describe('PriorityBadge', () => {
  it.each(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const)(
    'renders visible translated text and an aria-hidden icon for %s',
    (priority) => {
      render(<PriorityBadge priority={priority} t={t} />);

      // Text must be visible in the document (never color-alone).
      expect(screen.getByText(`priority.${priority.toLowerCase()}`)).toBeInTheDocument();

      // An icon must be present and marked decorative (aria-hidden), since
      // the adjacent text already carries the accessible meaning.
      const badge = screen.getByText(`priority.${priority.toLowerCase()}`).closest('span');
      const icon = badge?.querySelector('svg[aria-hidden="true"]');
      expect(icon).toBeTruthy();
    },
  );

  it('renders a real string label when t resolves to known text', () => {
    const translate = (key: string) => (key === 'priority.urgent' ? 'Urgent' : key);
    render(<PriorityBadge priority="URGENT" t={translate} />);

    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });
});
