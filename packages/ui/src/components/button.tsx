import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows a spinner, sets aria-busy, and blocks activation while true. */
  loading?: boolean;
  /**
   * Render the child element instead of a <button> (Radix Slot), so a
   * caller can e.g. make the button a styled <a> for link-as-button cases
   * while keeping all Button styling/behavior.
   */
  asChild?: boolean;
}

/**
 * Base styles shared by every variant. `min-h-11` (44px) satisfies the
 * WCAG 2.5.5 / mobile touch-target minimum; horizontal padding keeps text
 * buttons comfortably sized without a fixed min-width.
 */
const base =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ' +
  'focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
  secondary:
    'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300',
  ghost: 'bg-transparent text-neutral-900 hover:bg-neutral-100 active:bg-neutral-200',
  destructive: 'bg-status-escalated text-white hover:bg-red-800 active:bg-red-900',
};

function Spinner() {
  return (
    <svg
      data-testid="button-spinner"
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z"
      />
    </svg>
  );
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      loading = false,
      disabled,
      asChild,
      onClick,
      children,
      ...props
    },
    ref,
  ) => {
    const isInactive = disabled || loading;
    const Comp = asChild ? Slot : 'button';

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      if (isInactive) {
        event.preventDefault();
        return;
      }
      onClick?.(event);
    };

    return (
      <Comp
        ref={ref}
        className={cn(base, variantClasses[variant], className)}
        disabled={!asChild ? isInactive : undefined}
        aria-busy={loading || undefined}
        aria-disabled={asChild && isInactive ? true : undefined}
        onClick={handleClick}
        {...props}
      >
        {asChild ? (
          // Radix `Slot` requires EXACTLY ONE React element child and clones
          // the caller's element (e.g. a `next/link` `<Link>`), merging these
          // props onto it. The loading spinner is a second child, which Slot
          // rejects ("Expected a single React element child"), so it is only
          // rendered in the real-`<button>` path below. A polymorphic
          // `asChild` button (typically a link) does not surface a spinner;
          // `aria-busy`/`aria-disabled` are still applied to the cloned child.
          children
        ) : (
          <>
            {loading && <Spinner />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
