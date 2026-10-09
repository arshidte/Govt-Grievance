import * as React from 'react';
import { cn } from '../lib/cn';

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Shimmering placeholder block. Purely decorative (the real content it
 * stands in for isn't present yet), so it's hidden from assistive tech;
 * callers composing several Skeletons under a loading region should give
 * that region an accessible "Loading" label (see `LoadingState`).
 */
export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-neutral-200', className)}
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';
