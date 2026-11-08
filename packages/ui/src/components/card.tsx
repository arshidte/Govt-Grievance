import * as React from 'react';
import { cn } from '../lib/cn';

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

/** Simple accessible container — a styled <div>, semantics come from children. */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      // Revamp P2a — calm surface: white panel, hairline neutral-200 border,
      // rounded-xl, and NO shadow (hierarchy comes from the border + spacing,
      // not elevation). Floating surfaces that genuinely sit above the page
      // (dropdowns/dialogs) opt into shadow-sm via className instead.
      className={cn(
        'rounded-xl border border-neutral-200 bg-white p-5',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>;

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mb-3 flex flex-col gap-1', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-base font-semibold text-neutral-900', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

export type CardBodyProps = React.HTMLAttributes<HTMLDivElement>;

export const CardBody = React.forwardRef<HTMLDivElement, CardBodyProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-neutral-700', className)} {...props} />
  ),
);
CardBody.displayName = 'CardBody';
