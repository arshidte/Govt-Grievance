import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput } from './otp-input';

describe('OtpInput', () => {
  it('exposes 6 labeled, numeric-keyboard cells', () => {
    render(<OtpInput />);

    const cells = screen.getAllByLabelText(/digit \d of 6/i);
    expect(cells).toHaveLength(6);
    for (const cell of cells) {
      expect(cell).toHaveAttribute('inputMode', 'numeric');
    }
  });

  it('emits the assembled 6-character string after typing six digits', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(<OtpInput onChange={onChange} onComplete={onComplete} />);

    const cells = screen.getAllByLabelText(/digit \d of 6/i);
    for (const [i, digit] of ['1', '2', '3', '4', '5', '6'].entries()) {
      await user.type(cells[i]!, digit);
    }

    expect(onChange).toHaveBeenLastCalledWith('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('auto-advances focus to the next cell after typing a digit', async () => {
    const user = userEvent.setup();
    render(<OtpInput />);

    const cells = screen.getAllByLabelText(/digit \d of 6/i);
    cells[0]!.focus();
    await user.keyboard('1');

    expect(cells[1]).toHaveFocus();
  });

  it('clears the current cell on backspace, then moves back on the next backspace', async () => {
    const user = userEvent.setup();
    render(<OtpInput />);

    const cells = screen.getAllByLabelText(/digit \d of 6/i);
    cells[0]!.focus();
    await user.keyboard('12');
    expect(cells[2]).toHaveFocus();

    // Cell 2 is empty (only 2 digits typed so far) -> backspace moves back.
    await user.keyboard('{Backspace}');
    expect(cells[1]).toHaveFocus();
    expect(cells[1]).toHaveValue('2');

    // Cell 1 now has a value -> backspace clears it and stays.
    await user.keyboard('{Backspace}');
    expect(cells[1]).toHaveFocus();
    expect(cells[1]).toHaveValue('');

    // Cell 1 is now empty -> backspace moves back to cell 0.
    await user.keyboard('{Backspace}');
    expect(cells[0]).toHaveFocus();
  });

  it('distributes a pasted 6-digit string across all cells and emits it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(<OtpInput onChange={onChange} onComplete={onComplete} />);

    const cells = screen.getAllByLabelText(/digit \d of 6/i);
    cells[0]!.focus();
    await user.paste('654321');

    for (const [i, cell] of cells.entries()) {
      expect(cell).toHaveValue('654321'[i]);
    }
    expect(onChange).toHaveBeenLastCalledWith('654321');
    expect(onComplete).toHaveBeenCalledWith('654321');
  });

  it('ignores non-digit paste content', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<OtpInput onComplete={onComplete} />);

    const cells = screen.getAllByLabelText(/digit \d of 6/i);
    cells[0]!.focus();
    await user.paste('abcdef');

    expect(onComplete).not.toHaveBeenCalled();
    for (const cell of cells) {
      expect(cell).toHaveValue('');
    }
  });
});
