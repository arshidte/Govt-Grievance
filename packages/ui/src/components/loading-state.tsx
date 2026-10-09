import * as React from 'react';
import { Skeleton } from './skeleton';
import { cn } from '../lib/cn';

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Accessible label announced to assistive tech while content loads. Defaults to "Loading". */
  label?: string;
  /** Number of skeleton rows to render. */
  rows?: number;
}

/**
 * Skeleton-based loading placeholder for a screen/section. `role="status"`
 * with an `aria-label` means assistive tech announces the loading state
 * once, rather than reading each decorative Skeleton block.
 */
export function LoadingState({ label = 'Loading', rows = 3, className, ...props }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn('flex flex-col gap-3 p-4', className)}
      {...props}
    >
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-4 w-full" />
      ))}
    </div>
  );
}
