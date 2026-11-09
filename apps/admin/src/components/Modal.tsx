'use client';

import { X } from 'lucide-react';
import * as React from 'react';

/**
 * A small accessible modal dialog used by the org-management screens for
 * create/edit forms and (via `ConfirmDialog`) destructive confirmations.
 *
 * A11y (mirrors `MobileDrawer`): `role="dialog"` + `aria-modal`, labelled by
 * the title, ESC closes, the overlay click closes, focus moves into the
 * dialog on open and returns to the previously-focused element on close, and
 * background scroll is locked while open. `@pg/ui` has no dialog primitive,
 * so this admin-local component fills that gap without widening shared scope.
 */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  'data-testid'?: string;
}

export function Modal({ open, onClose, title, children, 'data-testid': testId }: ModalProps) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Move focus into the dialog (first focusable, else the dialog itself).
    const node = dialogRef.current;
    const focusable = node?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? node)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid={testId ? `${testId}-overlay` : 'modal-overlay'}
    >
      {/* Overlay — click to dismiss. */}
      <div
        className="absolute inset-0 bg-neutral-900/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId ?? 'modal'}
        className="relative z-10 w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-sm focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-neutral-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            data-testid={testId ? `${testId}-close` : 'modal-close'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
