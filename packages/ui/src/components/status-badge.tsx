import { statusLabelKey } from '@pg/i18n';
import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * The 10 canonical grievance statuses (UPPER_SNAKE, as stored/transmitted).
 * Kept local (not imported from @pg/types) since no shared `Status` enum
 * exists yet there — @pg/i18n's STATUS_KEY map is the parallel source of
 * truth for the UPPER_SNAKE -> message-key mapping.
 */
export type Status =
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'UNDER_REVIEW'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_INFORMATION'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED';

export interface StatusBadgeProps {
  status: Status;
  /** Translation function — resolves an i18n message key to display text. */
  t: (key: string) => string;
  className?: string;
}

function CircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <circle cx="10" cy="10" r="6" />
    </svg>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0l-3-3a1 1 0 1 1 1.4-1.4L9 11.6l6.3-6.3a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M9 3a6 6 0 1 0 3.8 10.6l3.3 3.3a1 1 0 0 0 1.4-1.4l-3.3-3.3A6 6 0 0 0 9 3ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-7 1.7-7 4v1a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1c0-2.3-3.7-4-7-4Z" />
    </svg>
  );
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1-9V5a1 1 0 1 0-2 0v5c0 .3.1.5.3.7l3 3a1 1 0 0 0 1.4-1.4L11 9Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function QuestionIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0ZM10 6a2 2 0 0 0-2 2 1 1 0 1 0 2 0 .5.5 0 1 1 1 0c0 .4-.2.7-.5 1-.7.5-1.2 1.2-1.2 2.3a1 1 0 1 0 2 0c0-.3.1-.5.4-.7.7-.5 1.3-1.3 1.3-2.6A2.5 2.5 0 0 0 10 6Zm0 9a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function AlertTriangleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M9.3 3.5c.5-.9 1.9-.9 2.4 0l6.9 11.9c.5.9-.1 2-1.2 2H3.6c-1.1 0-1.7-1.1-1.2-2L9.3 3.5ZM10 7a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 7a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
        clipRule="evenodd"
      />
    </svg>
  );
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

function RefreshIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M10 4a6 6 0 0 0-5.3 3.2 1 1 0 1 1-1.8-.9A8 8 0 0 1 17.9 9H16a1 1 0 1 0 0 2h4a1 1 0 0 0 1-1V6a1 1 0 1 0-2 0v1.3A8 8 0 0 0 10 4Zm0 12a6 6 0 0 0 5.3-3.2 1 1 0 1 1 1.8.9A8 8 0 0 1 2.1 11H4a1 1 0 1 0 0-2H0a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0v-1.3A8 8 0 0 0 10 16Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Explicit, exhaustive map of every UPPER_SNAKE status to its T19 token key
 * (for color) and its icon. Deliberately listing all 10 entries (rather
 * than deriving the token key programmatically) means a status added to
 * the enum without a matching entry here is a compile-time error, not a
 * silent fallthrough.
 */
const STATUS_DESCRIPTORS: Record<
  Status,
  { tokenKey: string; Icon: (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element }
> = {
  SUBMITTED: { tokenKey: 'submitted', Icon: CircleIcon },
  ACKNOWLEDGED: { tokenKey: 'acknowledged', Icon: CheckIcon },
  UNDER_REVIEW: { tokenKey: 'underReview', Icon: SearchIcon },
  ASSIGNED: { tokenKey: 'assigned', Icon: UserIcon },
  IN_PROGRESS: { tokenKey: 'inProgress', Icon: ClockIcon },
  WAITING_FOR_INFORMATION: { tokenKey: 'waitingForInformation', Icon: QuestionIcon },
  ESCALATED: { tokenKey: 'escalated', Icon: AlertTriangleIcon },
  RESOLVED: { tokenKey: 'resolved', Icon: CheckIcon },
  CLOSED: { tokenKey: 'closed', Icon: LockIcon },
  REOPENED: { tokenKey: 'reopened', Icon: RefreshIcon },
};

/** Tailwind classes keyed by the same token key — generated from the T19 `status.*` preset colors. */
const colorClasses: Record<string, string> = {
  submitted: 'bg-status-submitted/10 text-status-submitted',
  acknowledged: 'bg-status-acknowledged/10 text-status-acknowledged',
  underReview: 'bg-status-underReview/10 text-status-underReview',
  assigned: 'bg-status-assigned/10 text-status-assigned',
  inProgress: 'bg-status-inProgress/10 text-status-inProgress',
  waitingForInformation: 'bg-status-waitingForInformation/10 text-status-waitingForInformation',
  escalated: 'bg-status-escalated/10 text-status-escalated',
  resolved: 'bg-status-resolved/10 text-status-resolved',
  closed: 'bg-status-closed/10 text-status-closed',
  reopened: 'bg-status-reopened/10 text-status-reopened',
};

/**
 * Renders a grievance status as an icon + translated text pill. Color is
 * always paired with both (WCAG 1.4.1 — meaning is never conveyed by color
 * alone). Stays i18n-pure by taking a `t` function and resolving the label
 * through @pg/i18n's `statusLabelKey`, never hardcoding English strings.
 */
export function StatusBadge({ status, t, className }: StatusBadgeProps) {
  const { tokenKey, Icon } = STATUS_DESCRIPTORS[status];
  const label = t(statusLabelKey(status));

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
