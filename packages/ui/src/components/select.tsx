'use client';

// Select wraps a controlled native <select> with an onChange handler, so it
// is a Client Component. We deliberately use a native select (not a custom
// listbox): it is accessible by default, works on every device, and matches
// the repo's existing preference for native selects.
import { ChevronDown } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';

export interface SelectOption {
  value: string;
  /** Already-translated, human-readable option text. */
  label: string;
}

export interface SelectProps {
  /** Controlled value (the caller owns the state). */
  value: string;
  /** Called with the chosen option's value on change. */
  onChange: (value: string) => void;
  /** The selectable options, in display order. */
  options: SelectOption[];
  /**
   * Optional placeholder rendered as a disabled first option. Shown as the
   * selected text when `value` is empty (i.e. nothing chosen yet).
   */
  placeholder?: string;
  /** Optional visible label; when set, it is associated via `htmlFor`. */
  label?: string;
  /** Explicit id for the <select> (needed to associate an external label). */
  id?: string;
  /** Accessible name used when there is no visible `label`. */
  'aria-label'?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * A styled native `<select>`. Visually matched to `Input` (white surface,
 * hairline border, `rounded-lg`, brand focus ring) with a lucide `ChevronDown`
 * affordance on the right. The native chevron is removed via `appearance-none`
 * so only our icon shows. Fully controlled and app-agnostic.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      value,
      onChange,
      options,
      placeholder,
      label,
      id,
      'aria-label': ariaLabel,
      className,
      'data-testid': dataTestId = 'select',
    },
    ref,
  ) => {
    // A select with a visible label needs a stable id to associate them.
    const generatedId = React.useId();
    const selectId = id ?? `select-${generatedId}`;

    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        {label != null && (
          <label htmlFor={selectId} className="text-sm font-medium text-neutral-600">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label == null ? ariaLabel : undefined}
            data-testid={dataTestId}
            className={cn(
              // Match Input's recipe. `appearance-none` hides the native
              // arrow; `pr-9` leaves room for our ChevronDown overlay.
              'min-h-11 w-full appearance-none rounded-lg border border-neutral-200 bg-white pl-3 pr-9 text-sm text-neutral-900',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {placeholder != null && (
              // Disabled placeholder: visible when nothing is selected, but not
              // a real choice. `value=""` pairs with an empty controlled value.
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {/* Decorative chevron overlay; the native control owns interaction. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400"
          >
            <ChevronDown className="h-4 w-4" />
          </span>
        </div>
      </div>
    );
  },
);
Select.displayName = 'Select';
