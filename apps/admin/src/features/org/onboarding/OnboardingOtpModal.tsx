'use client';

import { useResendOnboarding, useVerifyOnboarding } from '@pg/api-client';
import type { StaffOnboardingDTO } from '@pg/types';
import { Alert, Button, Input } from '@pg/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { useApiClient } from '../../auth/api-client';
import { Modal } from '../../../components/Modal';
import { orgErrorKey } from '../orgError';

interface Props {
  open: boolean;
  onboarding: StaffOnboardingDTO | null;
  onClose: () => void;
  onVerified: () => void;
}

/**
 * Admin enters the OTP the staff member received (phone-ownership proof) to
 * activate the pending onboarding. Supports resend (server enforces the
 * cooldown, surfaced as an error). OTP values are never displayed — only
 * entered.
 */
export function OnboardingOtpModal({ open, onboarding, onClose, onVerified }: Props) {
  const t = useTranslations('admin.onboarding');
  const tCommon = useTranslations('common');
  const tErr = useTranslations();
  const client = useApiClient();
  const verifyMut = useVerifyOnboarding(client);
  const resendMut = useResendOnboarding(client);

  const [code, setCode] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setCode('');
    setError(null);
    setNotice(null);
  }, [open, onboarding?.id]);

  if (!onboarding) return null;

  function onVerify() {
    if (!onboarding) return;
    setError(null);
    setNotice(null);
    verifyMut.mutate(
      { id: onboarding.id, code: code.trim() },
      { onSuccess: onVerified, onError: (err) => setError(tErr(orgErrorKey(err))) },
    );
  }

  function onResend() {
    if (!onboarding) return;
    setError(null);
    setNotice(null);
    resendMut.mutate(onboarding.id, {
      onSuccess: () => setNotice(t('resendSent')),
      onError: (err) => setError(tErr(orgErrorKey(err))),
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={t('verifyTitle')} data-testid="onboarding-otp-modal">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-neutral-700">{t('verifyPrompt', { phone: onboarding.phone })}</p>
        {error && (
          <Alert variant="error" data-testid="onboarding-otp-error">
            {error}
          </Alert>
        )}
        {notice && (
          <Alert variant="success" data-testid="onboarding-otp-notice">
            {notice}
          </Alert>
        )}
        <Input
          label={t('codeLabel')}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          maxLength={6}
          data-testid="onboarding-code-input"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onResend}
            loading={resendMut.isPending}
            data-testid="onboarding-resend-button"
          >
            {t('resend')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={verifyMut.isPending}>
              {tCommon('close')}
            </Button>
            <Button
              type="button"
              onClick={onVerify}
              loading={verifyMut.isPending}
              disabled={code.length !== 6}
              data-testid="onboarding-verify-submit"
            >
              {t('verifySubmit')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
