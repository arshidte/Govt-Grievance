import * as React from 'react';
import { Button } from './button';
import { cn } from '../lib/cn';

export interface ForbiddenStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  /** Label for the optional action button (e.g. "Back to dashboard"). */
  actionLabel?: string;
  onAction?: () => void;
}

function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M10 2a4 4 0 0 0-4 4v2H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1V6a4 4 0 0 0-4-4Zm2 6V6a2 2 0 1 0-4 0v2h4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * 403/forbidden display, used by the admin app's staff gate (Phase G) to
 * block non-staff roles from staff-only screens. `role="alert"` so
 * assistive tech announces the access denial immediately. Defaults are
 * plain English as a fallback for contexts without an i18n `t` wired up
 * yet; pass `title`/`description`/`actionLabel` explicitly to localize.
 */
export function ForbiddenState({
  title = 'Access denied',
  description = "You don't have permission to view this page.",
  actionLabel,
  onAction,
  className,
  ...props
}: ForbiddenStateProps) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-3 rounded-lg px-6 py-12 text-center', className)}
      {...props}
    >
      <LockIcon className="h-10 w-10 text-status-escalated" />
      <p className="text-base font-semibold text-neutral-900">{title}</p>
      <p className="max-w-sm text-sm text-neutral-600">{description}</p>
      {actionLabel && onAction && (
        <Button className="mt-2" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
