'use client';

import { Button } from '@pg/ui';
import { useTranslations } from 'next-intl';

import { Modal } from './Modal';

/**
 * Confirmation dialog for destructive/consequential actions (deactivation,
 * assignment revocation) — required by the org-management milestone. Built on
 * `Modal`, so it inherits the dialog a11y. The confirm button shows a loading
 * state and both actions are disabled while the mutation runs.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Confirm button label; defaults to a generic "Confirm". */
  confirmLabel?: string;
  /** Use the destructive button styling for the confirm action. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  'data-testid'?: string;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  destructive,
  loading,
  onConfirm,
  onCancel,
  'data-testid': testId = 'confirm-dialog',
}: ConfirmDialogProps) {
  const t = useTranslations('common');

  return (
    <Modal open={open} onClose={onCancel} title={title} data-testid={testId}>
      <p className="text-sm text-neutral-700">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={loading} data-testid={`${testId}-cancel`}>
          {t('cancel')}
        </Button>
        <Button
          variant={destructive ? 'destructive' : 'primary'}
          onClick={onConfirm}
          loading={loading}
          data-testid={`${testId}-confirm`}
        >
          {confirmLabel ?? t('confirm')}
        </Button>
      </div>
    </Modal>
  );
}
