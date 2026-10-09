import * as React from 'react';
import { Button } from './button';
import { cn } from '../lib/cn';

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  /** Label for the retry button. Defaults to "Try again". */
  retryLabel?: string;
  /** Called when the user activates the retry affordance. Omit to hide the button. */
  onRetry?: () => void;
}

function ErrorIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-1-5a1 1 0 1 0 2 0 1 1 0 0 0-2 0Zm1-7a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V7a1 1 0 0 0-1-1Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Error display with a retry affordance. `role="alert"` so assistive tech
 * announces the failure immediately; the retry Button (T20) is only
 * rendered when `onRetry` is supplied, letting callers show a non-
 * recoverable error without an inert/no-op button.
 */
export function ErrorState({
  title,
  description,
  retryLabel = 'Try again',
  onRetry,
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 rounded-lg px-6 py-12 text-center', className)}
      {...props}
    >
      <ErrorIcon className="h-10 w-10 text-status-escalated" />
      <p className="text-base font-semibold text-neutral-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-neutral-600">{description}</p>}
      {onRetry && (
        <Button className="mt-2" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
