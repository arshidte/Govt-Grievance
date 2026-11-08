import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Select } from './select';

const options = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'resolved', label: 'Resolved' },
];

describe('Select', () => {
  it('renders all options', () => {
    render(<Select value="submitted" onChange={vi.fn()} options={options} aria-label="Status" />);

    expect(screen.getByRole('option', { name: 'Submitted' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Resolved' })).toBeInTheDocument();
  });

  it('calls onChange with the chosen value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select value="submitted" onChange={onChange} options={options} aria-label="Status" />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'resolved');

    expect(onChange).toHaveBeenCalledWith('resolved');
  });

  it('associates a visible label with the select', () => {
    render(<Select value="submitted" onChange={vi.fn()} options={options} label="Status" />);

    // getByLabelText only matches when the <label htmlFor> is wired correctly.
    expect(screen.getByLabelText('Status')).toBe(screen.getByRole('combobox'));
  });

  it('renders a disabled placeholder option when provided', () => {
    render(
      <Select value="" onChange={vi.fn()} options={options} placeholder="Choose one" aria-label="Status" />,
    );

    const placeholder = screen.getByRole('option', { name: 'Choose one' });
    expect(placeholder).toBeDisabled();
  });
});
