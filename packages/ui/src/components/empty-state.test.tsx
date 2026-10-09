import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the title and description', () => {
    render(<EmptyState title="No grievances yet" description="Submit your first grievance to get started." />);

    expect(screen.getByText('No grievances yet')).toBeInTheDocument();
    expect(screen.getByText('Submit your first grievance to get started.')).toBeInTheDocument();
  });

  it('renders the action button when provided and fires its callback', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No grievances yet"
        description="Submit your first grievance to get started."
        action={{ label: 'New grievance', onClick }}
      />,
    );

    const button = screen.getByRole('button', { name: 'New grievance' });
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders no button when action is omitted', () => {
    render(<EmptyState title="No grievances yet" description="Submit your first grievance to get started." />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
