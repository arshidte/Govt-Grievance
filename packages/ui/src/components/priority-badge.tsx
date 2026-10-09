import type { Priority } from '@pg/i18n';
import { priorityLabelKey } from '@pg/i18n';
import * as React from 'react';
import { cn } from '../lib/cn';

export interface PriorityBadgeProps {
  priority: Priority;
  /** Translation function — resolves an i18n message key to display text. */
  t: (key: string) => string;
  className?: string;
}

function ArrowDownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M10 3a1 1 0 0 1 1 1v9.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L9 13.6V4a1 1 0 0 1 1-1Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function MinusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path fillRule="evenodd" d="M4 10a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z" clipRule="evenodd" />
    </svg>
  );
}

function ArrowUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M10 17a1 1 0 0 1-1-1V6.4L6.7 8.7a1 1 0 1 1-1.4-1.4l4-4a1 1 0 0 1 1.4 0l4 4a1 1 0 1 1-1.4 1.4L11 6.4V16a1 1 0 0 1-1 1Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function AlertOctagonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M6.4 2h7.2a1 1 0 0 1 .7.3l3.4 3.4a1 1 0 0 1 .3.7v7.2a1 1 0 0 1-.3.7l-3.4 3.4a1 1 0 0 1-.7.3H6.4a1 1 0 0 1-.7-.3l-3.4-3.4a1 1 0 0 1-.3-.7V6.4a1 1 0 0 1 .3-.7l3.4-3.4a1 1 0 0 1 .7-.3ZM10 6a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V7a1 1 0 0 0-1-1Zm0 7a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Explicit, exhaustive map of every priority to its T19 token key (for
 * color) and its icon — all 4 entries listed so a priority added to the
 * `Priority` type without a matching entry here is a compile-time error.
 */
const PRIORITY_DESCRIPTORS: Record<
  Priority,
  { tokenKey: string; Icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element }
> = {
  LOW: { tokenKey: 'low', Icon: ArrowDownIcon },
  MEDIUM: { tokenKey: 'medium', Icon: MinusIcon },
  HIGH: { tokenKey: 'high', Icon: ArrowUpIcon },
  URGENT: { tokenKey: 'urgent', Icon: AlertOctagonIcon },
};

/** Tailwind classes keyed by the same token key — generated from the T19 `priority.*` preset colors. */
const colorClasses: Record<string, string> = {
  low: 'bg-priority-low/10 text-priority-low',
  medium: 'bg-priority-medium/10 text-priority-medium',
  high: 'bg-priority-high/10 text-priority-high',
  urgent: 'bg-priority-urgent/10 text-priority-urgent',
};

/**
 * Renders a grievance priority as an icon + translated text pill. Color is
 * always paired with both (WCAG 1.4.1 — meaning is never conveyed by color
 * alone). Stays i18n-pure by taking a `t` function and resolving the label
 * through @pg/i18n's `priorityLabelKey`, never hardcoding English strings.
 */
export function PriorityBadge({ priority, t, className }: PriorityBadgeProps) {
  const { tokenKey, Icon } = PRIORITY_DESCRIPTORS[priority];
  const label = t(priorityLabelKey(priority));

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        colorClasses[tokenKey],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      {label}
    </span>
  );
}
