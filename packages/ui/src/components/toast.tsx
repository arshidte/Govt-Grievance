import * as ToastPrimitive from '@radix-ui/react-toast';
import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * Accessible toast notifications, built on @radix-ui/react-toast (the one
 * Radix primitive this package adds beyond react-slot, since toasts need
 * Radix's portal/viewport/swipe/auto-dismiss/aria-live wiring that would be
 * unsafe to hand-roll). Consumers wrap their app once in `ToastProvider`
 * (which also renders the `ToastViewport`), then render `Toast` elements —
 * typically driven by their own toast-queue state — as children.
 */
export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastProviderProps extends ToastPrimitive.ToastProviderProps {
  /** Classes for the fixed viewport that toasts are portaled into. */
  viewportClassName?: string;
}

/**
 * Mount once near the root of the app. Renders Radix's `Provider` (owns
 * swipe-to-dismiss + duration state) and `Viewport` (the live region/portal
 * target toasts render into) together, so callers only reach for `Toast`
 * itself when raising a notification.
 */
export function ToastProvider({ children, viewportClassName, ...props }: ToastProviderProps) {
  return (
    <ToastPrimitive.Provider {...props}>
      {children}
      <ToastPrimitive.Viewport
        className={cn(
          'fixed bottom-0 right-0 z-50 flex w-full max-w-sm flex-col gap-2 p-4 outline-none sm:bottom-4 sm:right-4',
          viewportClassName,
        )}
      />
    </ToastPrimitive.Provider>
  );
}

// Revamp P2a — a toast is a genuinely floating surface, so it keeps a soft
// shadow (shadow-sm) over a clean white-ish tint. Matching the Alert
// treatment: subtle same-hue frame + a stronger colored left accent rail +
// a colored icon, so the variant reads without relying on color alone.
const variantClasses: Record<ToastVariant, string> = {
  info: 'border-primary-200 border-l-primary-500 bg-primary-50 text-primary-900',
  success: 'border-green-200 border-l-status-resolved bg-green-50 text-green-900',
  warning: 'border-amber-200 border-l-status-inProgress bg-amber-50 text-amber-900',
  error: 'border-red-200 border-l-status-escalated bg-red-50 text-red-900',
};

// Icon tint per variant — stronger hue than the text, anchoring the toast.
const iconClasses: Record<ToastVariant, string> = {
  info: 'text-primary-600',
  success: 'text-status-resolved',
  warning: 'text-status-inProgress',
  error: 'text-status-escalated',
};

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

const icons: Record<ToastVariant, (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  info: InfoIcon,
  success: SuccessIcon,
  warning: WarningIcon,
  error: ErrorIcon,
};

export interface ToastProps extends ToastPrimitive.ToastProps {
  variant?: ToastVariant;
  title: string;
  description?: string;
  /** Optional action rendered via Radix's ToastAction (e.g. "Undo"). */
  action?: { label: string; altText: string; onClick: () => void };
  /** Accessible label for the built-in dismiss ("x") button. Defaults to "Dismiss". */
  closeLabel?: string;
}

/**
 * A single toast. `variant` always pairs an icon with the title/description
 * (WCAG 1.4.1 — color is never the only signal), matching the Alert
 * component's variant convention. Radix's `Root` supplies the aria-live
 * region, auto-dismiss timer, and swipe-to-dismiss gesture handling.
 */
export const Toast = React.forwardRef<HTMLLIElement, ToastProps>(
  ({ className, variant = 'info', title, description, action, closeLabel = 'Dismiss', ...props }, ref) => {
    const Icon = icons[variant];

    return (
      <ToastPrimitive.Root
        ref={ref}
        className={cn(
          'flex items-start gap-3 rounded-lg border border-l-4 p-4 shadow-sm data-[state=open]:animate-in data-[state=closed]:animate-out',
          variantClasses[variant],
          className,
        )}
        {...props}
      >
        <Icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', iconClasses[variant])} />
        <div className="flex flex-1 flex-col gap-0.5">
          <ToastPrimitive.Title className="text-sm font-medium">{title}</ToastPrimitive.Title>
          {description && (
            <ToastPrimitive.Description className="text-sm opacity-90">{description}</ToastPrimitive.Description>
          )}
        </div>
        {action && (
          <ToastPrimitive.Action
            altText={action.altText}
            onClick={action.onClick}
            className="text-sm font-medium underline"
          >
            {action.label}
          </ToastPrimitive.Action>
        )}
        <ToastPrimitive.Close aria-label={closeLabel} className="text-current opacity-70 hover:opacity-100">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
            <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </ToastPrimitive.Close>
      </ToastPrimitive.Root>
    );
  },
);
Toast.displayName = 'Toast';

export const ToastAction = ToastPrimitive.Action;
export const ToastClose = ToastPrimitive.Close;
export const ToastDescription = ToastPrimitive.Description;
export const ToastTitle = ToastPrimitive.Title;
export const ToastViewport = ToastPrimitive.Viewport;
