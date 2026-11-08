'use client';

// SearchInput is a controlled field with onChange/onClear handlers, so it must
// be a Client Component. Presentational only: no debouncing, no data fetching
// — the caller owns `value` and reacts to changes.
import { Search, X } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';

export interface SearchInputProps {
  /** Controlled value (the caller owns the state). */
  value: string;
  /** Called with the next raw string on every keystroke. */
  onChange: (value: string) => void;
  /** Placeholder text (already-translated). */
  placeholder?: string;
  /** Required accessible name — this field has no visible <label>. */
  'aria-label': string;
  /**
   * Called when the clear button is pressed. When omitted, the clear button
   * falls back to emitting `onChange('')` so clearing still works.
   */
  onClear?: () => void;
  /**
   * Accessible name for the clear button (translatable). Defaults to a plain
   * English "Clear search" when not supplied.
   */
  clearLabel?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * A search field styled to match `Input`: white surface, hairline border,
 * `rounded-lg`, brand focus ring. A leading lucide `Search` icon sits inside
 * the field, and — only while there is a value — a trailing clear button
 * (lucide `X`) lets the user reset it. Fully controlled and app-agnostic.
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      placeholder,
      'aria-label': ariaLabel,
      onClear,
      clearLabel = 'Clear search',
      className,
      'data-testid': dataTestId = 'search-input',
    },
    ref,
  ) => {
    const handleClear = () => {
      // Prefer the caller's handler; otherwise clear the controlled value
      // directly so the field still empties without extra wiring.
      if (onClear) {
        onClear();
      } else {
        onChange('');
      }
    };

    return (
      <div className={cn('relative', className)}>
        {/* Leading search glyph. Decorative — the field's aria-label names it. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400"
        >
          <Search className="h-4 w-4" />
        </span>
        <input
          ref={ref}
          type="search"
          role="searchbox"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          data-testid={dataTestId}
          className={cn(
            // Match Input's recipe, with extra left padding for the icon and
            // right padding reserved for the clear button.
            'min-h-11 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-9 text-sm text-neutral-900',
            'placeholder:text-neutral-400',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
          )}
        />
        {value.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={clearLabel}
            data-testid="search-input-clear"
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 transition-colors hover:text-neutral-600 focus:outline-none focus-visible:text-neutral-600"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  },
);
SearchInput.displayName = 'SearchInput';
