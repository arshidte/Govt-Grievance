'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { verifyOtpSchema } from '@pg/types';
import { Alert, Button, OtpInput } from '@pg/ui';

import { verifyOtp as widgetVerifyOtp } from './otpWidget';
import { useAuth } from './useAuth';

export interface VerifyFormProps {
  /** Phone number the code was sent to (from the preceding LoginForm step). */
  phone: string;
  /** Called once `verifyOtp` succeeds, with the resulting MeResponse's profile-completeness. */
  onVerified?: (isProfileComplete: boolean) => void;
  /** Called when the user asks to go back and use a different number. */
  onChangeNumber?: () => void;
}

/**
 * Second step of the citizen login flow: a 6-digit code entered via
 * `@pg/ui`'s `OtpInput`. Submits `{ phone, code }` through `verifyOtpSchema`
 * (parsed client-side before the mutation fires, same discipline as
 * LoginForm) to `useVerifyOtp`. On success, the BFF has already relayed the
 * `pg_session` cookie — `onVerified` tells the caller whether the profile
 * looks complete (no `fullName` yet means "needs registration").
 */
export function VerifyForm({ phone, onVerified, onChangeNumber }: VerifyFormProps) {
  const t = useTranslations();
  const { verifyToken } = useAuth();
  const [code, setCode] = useState('');
  const [clientError, setClientError] = useState<string | undefined>();
  const [verifying, setVerifying] = useState(false);

  // The MSG91 widget verifies the entered code and yields an access token,
  // which `verifyToken` exchanges for a session.
  const submit = async (value: string) => {
    const result = verifyOtpSchema.safeParse({ phone, code: value });
    if (!result.success) {
      setClientError(t('auth.invalidCode'));
      return;
    }
    setClientError(undefined);
    setVerifying(true);
    try {
      const accessToken = await widgetVerifyOtp(phone, value);
      verifyToken.mutate(
        { accessToken },
        { onSuccess: (me) => onVerified?.(Boolean(me.fullName)) },
      );
    } catch {
      setClientError(t('auth.verifyFailed'));
    } finally {
      setVerifying(false);
    }
  };

  const pending = verifying || verifyToken.isPending;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">{t('auth.verifySubtitle', { phone })}</p>

      <div data-testid="verify-otp-input">
        <OtpInput
          label={t('auth.otpLabel')}
          disabled={pending}
          onChange={setCode}
          onComplete={submit}
        />
      </div>

      {(clientError || verifyToken.isError) && (
        <Alert variant="error" title={clientError ?? t('auth.verifyFailed')} />
      )}

      <Button
        type="button"
        loading={pending}
        onClick={() => submit(code)}
        data-testid="verify-submit"
      >
        {t('auth.verify')}
      </Button>

      {onChangeNumber && (
        <Button type="button" variant="ghost" onClick={onChangeNumber}>
          {t('auth.changeNumber')}
        </Button>
      )}
    </div>
  );
}
