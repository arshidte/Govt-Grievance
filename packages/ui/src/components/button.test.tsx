import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('fires onClick when enabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Submit</Button>);

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and sets aria-busy when loading', () => {
    render(<Button loading>Submit</Button>);

    const button = screen.getByRole('button', { name: 'Submit' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument();
  });

  it('prevents onClick from firing when loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Submit
      </Button>,
    );

    // pointer-events are typically disabled via CSS, but the handler itself
    // must also refuse to run even if a click event is dispatched directly.
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('prevents onClick from firing when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Submit
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('meets the 44px minimum touch target', () => {
    render(<Button>Submit</Button>);

    const button = screen.getByRole('button', { name: 'Submit' });
    expect(button.className).toMatch(/min-h-11/);
  });

  it.each(['primary', 'secondary', 'ghost', 'destructive'] as const)(
    'renders the %s variant',
    (variant) => {
      render(<Button variant={variant}>Submit</Button>);
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    },
  );

  it('forwards refs to the underlying button element', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Submit</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
