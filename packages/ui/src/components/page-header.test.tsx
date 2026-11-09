import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the title as a heading inside a <header> landmark', () => {
    render(<PageHeader title="My Grievances" />);

    const banner = screen.getByRole('banner');
    expect(banner).toBe(screen.getByTestId('page-header'));
    expect(screen.getByRole('heading', { name: 'My Grievances' })).toBeInTheDocument();
  });

  it('renders the subtitle when provided', () => {
    render(<PageHeader title="My Grievances" subtitle="Track your submissions" />);

    expect(screen.getByText('Track your submissions')).toBeInTheDocument();
  });

  it('renders the actions slot', () => {
    render(
      <PageHeader title="My Grievances" actions={<button type="button">Submit a Grievance</button>} />,
    );

    expect(screen.getByRole('button', { name: 'Submit a Grievance' })).toBeInTheDocument();
  });

  it('renders the breadcrumb slot', () => {
    render(<PageHeader title="Detail" breadcrumb={<span>Home / Grievances</span>} />);

    expect(screen.getByText('Home / Grievances')).toBeInTheDocument();
  });
});
