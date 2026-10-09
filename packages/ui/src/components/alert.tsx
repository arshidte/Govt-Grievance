import * as React from 'react';
import { cn } from '../lib/cn';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  /** Accessible, visible title for the alert (icon + text, never color alone). */
  title?: string;
}

const variantClasses: Record<AlertVariant, string> = {
  info: 'border-primary-200 bg-primary-50 text-primary-900',
  success: 'border-status-resolved bg-green-50 text-green-900',
  warning: 'border-status-inProgress bg-amber-50 text-amber-900',
  error: 'border-status-escalated bg-red-50 text-red-900',
};

/** role=alert is reserved for variants needing an assertive announcement. */
const assertiveVariants: AlertVariant[] = ['warning', 'error'];

function InfoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0ZM9 9a1 1 0 0 1 2 0v4a1 1 0 1 1-2 0V9Zm1-4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function SuccessIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function WarningIcon(props: React.SVGProps<SVGSVGElement>) {
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

const icons: Record<AlertVariant, (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  info: InfoIcon,
  success: SuccessIcon,
  warning: WarningIcon,
  error: ErrorIcon,
};

/**
 * Status/notice banner. Always pairs an icon with text (WCAG 1.4.1 — color
 * is never the only signal). `warning`/`error` get `role="alert"` so
 * assistive tech announces them immediately; `info`/`success` use
 * `role="status"` for a polite announcement.
 */
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'info', title, children, ...props }, ref) => {
    const Icon = icons[variant];
    const role = assertiveVariants.includes(variant) ? 'alert' : 'status';

    return (
      <div
        ref={ref}
        role={role}
        className={cn(
          'flex gap-3 rounded-md border px-4 py-3 text-sm',
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="flex flex-col gap-0.5">
          {title && <p className="font-medium">{title}</p>}
          {children && <div>{children}</div>}
        </div>
      </div>
    );
  },
);
Alert.displayName = 'Alert';
