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
        <label htmlFor={inputId} className="text-sm font-medium text-neutral-800">
          {label}
          {required && <span aria-hidden="true" className="text-status-escalated"> *</span>}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          className={cn(
            'min-h-11 rounded-md border border-neutral-300 px-3 text-sm text-neutral-900',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
            'disabled:pointer-events-none disabled:opacity-50',
            error && 'border-status-escalated focus-visible:ring-status-escalated',
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
