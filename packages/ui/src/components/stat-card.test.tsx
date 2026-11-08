import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatCard } from './stat-card';

describe('StatCard', () => {
  it('renders the label, value and hint', () => {
    render(<StatCard label="Open grievances" value={7} hint="this month" />);

    expect(screen.getByText('Open grievances')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('this month')).toBeInTheDocument();
  });

  it('renders a string value as-is (no formatting)', () => {
    render(<StatCard label="Total" value="1,234" />);

    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('renders the optional icon decoratively', () => {
    render(<StatCard label="Resolved" value={3} icon={<svg data-testid="icon" />} />);

    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('exposes the default testid', () => {
    render(<StatCard label="Pending" value={0} />);

    expect(screen.getByTestId('stat-card')).toBeInTheDocument();
  });
});
