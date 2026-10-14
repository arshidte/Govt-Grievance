'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { verifyOtpSchema } from '@pg/types';
import { Alert, Button, OtpInput } from '@pg/ui';

import { useAuth } from './useAuth';

export interface VerifyFormProps {
  /** Phone number the code was sent to (from the preceding LoginForm step). */
  phone: string;
  /** Called once `verifyOtp` succeeds. */
  onVerified?: () => void;
  /** Called when the user asks to go back and use a different number. */
  onChangeNumber?: () => void;
}

/**
 * Second step of the admin (staff) login flow: a 6-digit code entered via
 * `@pg/ui`'s `OtpInput`. Mirrors the citizen app's
 * `src/features/auth/VerifyForm.tsx`. Submits `{ phone, code }` through
 * `verifyOtpSchema` (parsed client-side before the mutation fires, same
 * discipline as LoginForm) to `useVerifyOtp`. On success, the BFF has
 * already relayed the `pg_session` cookie.
 *
 * Unlike citizen's VerifyForm, `onVerified` takes no argument: there is no
 * admin registration step to branch to (staff are seeded, not
 * self-registered — see LoginForm's header comment) and no staff-role
 * decision is made here either. The caller (verify/page.tsx) always
 * navigates to `/` and lets the `(app)` layout's server-side `requireStaff`
 * gate decide staff-vs-forbidden.
 */
export function VerifyForm({ phone, onVerified, onChangeNumber }: VerifyFormProps) {
  const t = useTranslations();
  const { verifyOtp } = useAuth();
  const [code, setCode] = useState('');
  const [clientError, setClientError] = useState<string | undefined>();

  const submit = (value: string) => {
    const result = verifyOtpSchema.safeParse({ phone, code: value });
    if (!result.success) {
      setClientError(t('auth.invalidCode'));
      return;
    }
    setClientError(undefined);

    verifyOtp.mutate(result.data, {
      onSuccess: () => onVerified?.(),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">{t('auth.verifySubtitle', { phone })}</p>

      <div data-testid="verify-otp-input">
        <OtpInput
          label={t('auth.otpLabel')}
          disabled={verifyOtp.isPending}
          onChange={setCode}
          onComplete={submit}
        />
      </div>

      {(clientError || verifyOtp.isError) && (
        <Alert variant="error" title={clientError ?? t('auth.verifyFailed')} />
      )}

      <Button
        type="button"
        loading={verifyOtp.isPending}
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
