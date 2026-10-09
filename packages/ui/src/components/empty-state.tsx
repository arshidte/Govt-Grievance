import * as React from 'react';
import { Button } from './button';
import { cn } from '../lib/cn';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description: string;
  /** Optional call-to-action button (e.g. "New grievance"). Omit for a plain empty view. */
  action?: EmptyStateAction;
}

function InboxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M5.5 3a1 1 0 0 0-.9.6L2.1 9.3a1 1 0 0 0-.1.4V15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9.7a1 1 0 0 0-.1-.4l-2.5-5.7a1 1 0 0 0-.9-.6h-9Zm.7 2h7.6l1.8 4H12a1 1 0 0 0-.9.6L10 11.8 8.9 9.6A1 1 0 0 0 8 9H4.4l1.8-4Z" />
    </svg>
  );
}

/**
 * Placeholder shown when a list/collection has no items. Always carries a
 * title + description, plus an optional action button (reuses T20 Button)
 * so a caller can offer a next step (e.g. "File a grievance").
 */
export function EmptyState({ title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center gap-3 rounded-lg px-6 py-12 text-center', className)}
      {...props}
    >
      <InboxIcon className="h-10 w-10 text-neutral-400" />
      <p className="text-base font-semibold text-neutral-900">{title}</p>
      <p className="max-w-sm text-sm text-neutral-600">{description}</p>
      {action && (
        <Button className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
