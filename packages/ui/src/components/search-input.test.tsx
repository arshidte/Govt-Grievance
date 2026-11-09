import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SearchInput } from './search-input';

describe('SearchInput', () => {
  it('calls onChange on typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} aria-label="Search grievances" />);

    await user.type(screen.getByRole('searchbox', { name: 'Search grievances' }), 'a');

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('shows no clear button when the value is empty', () => {
    render(<SearchInput value="" onChange={vi.fn()} aria-label="Search" />);

    expect(screen.queryByTestId('search-input-clear')).not.toBeInTheDocument();
  });

  it('shows the clear button when there is a value and calls onClear', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <SearchInput value="road" onChange={vi.fn()} onClear={onClear} aria-label="Search" clearLabel="Clear" />,
    );

    const clear = screen.getByRole('button', { name: 'Clear' });
    await user.click(clear);

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('falls back to clearing via onChange when onClear is not provided', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SearchInput value="road" onChange={onChange} aria-label="Search" />);

    await user.click(screen.getByTestId('search-input-clear'));

    expect(onChange).toHaveBeenCalledWith('');
  });
});
