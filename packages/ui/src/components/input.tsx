import * as React from 'react';
import { cn } from '../lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Error message; when present, wires aria-invalid + aria-describedby. */
  error?: string;
  /** Optional helper text shown when there is no error. */
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, required, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? `input-${generatedId}`;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    const describedBy = error ? errorId : hint ? hintId : undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {/* Label: neutral-600 per spec label hierarchy (quieter than body). */}
        <label htmlFor={inputId} className="text-sm font-medium text-neutral-600">
          {label}
          {required && <span aria-hidden="true" className="text-status-escalated"> *</span>}
        </label>
        {/* Revamp P2a — calm white field: bg-white + hairline neutral-200
         * border, rounded-lg, comfortable px-3 py-2.5. Focus draws a brand
         * ring AND tints the border so the active field reads clearly; error
         * swaps border + ring to escalated-red (paired with the role="alert"
         * message below, never color alone). */}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          className={cn(
            'min-h-11 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900',
            'placeholder:text-neutral-400',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
            'disabled:pointer-events-none disabled:opacity-50',
            error && 'border-status-escalated focus:ring-status-escalated focus:border-status-escalated',
            className,
          )}
          {...props}
        />
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-status-escalated">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-sm text-neutral-500">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
