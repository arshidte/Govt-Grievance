import * as React from 'react';
import { cn } from '../lib/cn';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** Page title (already-translated — callers do their own i18n). */
  title: string;
  /** Optional supporting line under the title. */
  subtitle?: string;
  /** Right-aligned contextual actions (e.g. a primary Button). */
  actions?: React.ReactNode;
  /** Optional breadcrumb slot rendered above the title. */
  breadcrumb?: React.ReactNode;
  'data-testid'?: string;
}

/**
 * The top band of a page: an optional breadcrumb, the title + optional
 * subtitle on the left, and right-aligned contextual `actions`. Semantic
 * `<header>`. Presentational and app-agnostic — no routing/i18n lives here.
 *
 * Responsive: the title block and the actions sit in a `flex-col` that
 * becomes `sm:flex-row` so actions wrap BELOW the title on narrow widths
 * (no horizontal overflow) and align to the right edge on wider screens.
 */
export const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  (
    {
      title,
      subtitle,
      actions,
      breadcrumb,
      className,
      'data-testid': dataTestId = 'page-header',
      ...props
    },
    ref,
  ) => {
    return (
      <header
        ref={ref}
        data-testid={dataTestId}
        className={cn('flex flex-col gap-4', className)}
        {...props}
      >
        {breadcrumb != null && <div className="text-sm text-neutral-500">{breadcrumb}</div>}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-neutral-900 lg:text-2xl">{title}</h1>
            {subtitle != null && <p className="text-sm text-neutral-500">{subtitle}</p>}
          </div>
          {actions != null && (
            // `shrink-0` keeps buttons intact; `flex-wrap` lets multiple
            // actions wrap rather than overflow on narrow widths.
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      </header>
    );
  },
);
PageHeader.displayName = 'PageHeader';
