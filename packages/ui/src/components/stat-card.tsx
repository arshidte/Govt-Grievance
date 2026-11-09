import * as React from 'react';

import { cn } from '../lib/cn';

export interface StatCardProps {
  /** Small, muted caption describing the metric (already-translated). */
  label: string;
  /**
   * The metric itself. Accepts a number or a pre-formatted string so the
   * caller stays in control of locale formatting (we never format here).
   */
  value: string | number;
  /**
   * Optional decorative icon (e.g. a lucide icon). Rendered in a soft
   * primary-tinted chip beside the value. Purely illustrative — the label
   * already conveys meaning, so the chip is `aria-hidden`.
   */
  icon?: React.ReactNode;
  /** Optional supporting line under the value (e.g. "this month"). */
  hint?: string;
  className?: string;
  'data-testid'?: string;
}

/**
 * A compact metric card for a "stat row": a small muted label, a large
 * emphasized value, an optional soft icon chip, and an optional hint line.
 * Presentational only — it just displays whatever `value` it is handed (e.g.
 * a citizen's real grievance counts by status); it invents and formats no
 * data. White surface + hairline border + `rounded-xl` per the design spec.
 */
export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  (
    {
      label,
      value,
      icon,
      hint,
      className,
      'data-testid': dataTestId = 'stat-card',
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        data-testid={dataTestId}
        className={cn(
          // Calm surface matching Card: white panel, hairline neutral border,
          // rounded-xl, no shadow (hierarchy from border + spacing).
          'rounded-xl border border-neutral-200 bg-white p-5',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm text-neutral-500">{label}</span>
            <span className="text-2xl font-semibold text-neutral-900">{value}</span>
            {hint != null && <span className="text-xs text-neutral-500">{hint}</span>}
          </div>
          {icon != null && (
            // Soft primary-tinted chip. Decorative: the label already names
            // the metric, so hide the icon from assistive tech.
            <span
              aria-hidden="true"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700"
            >
              {icon}
            </span>
          )}
        </div>
      </div>
    );
  },
);
StatCard.displayName = 'StatCard';
