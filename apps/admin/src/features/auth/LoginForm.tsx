'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { requestOtpSchema, type RequestOtpInput } from '@pg/types';
import { Alert, Button, Input } from '@pg/ui';

import { useAuth } from './useAuth';

/** Maps a raw Zod issue message (the regex schemas' custom message string, e.g. `invalid_phone`) to an i18n key. */
const ZOD_MESSAGE_KEY: Record<string, string> = {
  invalid_phone: 'auth.invalidPhone',
};

export interface LoginFormProps {
  /** Called with the submitted phone once `requestOtp` succeeds. */
  onRequested?: (phone: string) => void;
}

/**
 * Phone-entry step of the admin (staff) login flow. Mirrors the citizen
 * app's `src/features/auth/LoginForm.tsx` exactly — same schema, same
 * `@pg/ui` components, same `auth.*` i18n keys (shared across both apps in
 * `@pg/i18n`). Validates client-side with `requestOtpSchema`
 * (react-hook-form + the Zod resolver) BEFORE ever calling `useRequestOtp`
 * — an invalid phone shows its translated field error and the mutation is
 * never invoked.
 *
 * No role check happens here: staff identities are SEEDED (Task 16), never
 * self-registered, so this form has no "register" branch. Whether the
 * phone belongs to staff is decided AFTER verify, server-side, by the
 * `(app)` layout's `requireStaff` gate (see src/app/[locale]/(app)/layout.tsx)
 * — this form and VerifyForm stay identical to the citizen flow and simply
 * let that gate decide.
 */
export function LoginForm({ onRequested }: LoginFormProps) {
  const t = useTranslations();
  const { requestOtp } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestOtpInput>({
    resolver: zodResolver(requestOtpSchema),
    defaultValues: { phone: '' },
  });

  const onSubmit = handleSubmit((data) => {
    requestOtp.mutate(data, {
      onSuccess: () => onRequested?.(data.phone),
    });
  });

  const phoneError = errors.phone?.message;
  const translatedPhoneError = phoneError
    ? t(ZOD_MESSAGE_KEY[phoneError] ?? 'auth.invalidPhone')
    : undefined;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Input
        label={t('auth.phoneLabel')}
        placeholder={t('auth.phonePlaceholder')}
        error={translatedPhoneError}
        type="tel"
        autoComplete="tel"
        required
        data-testid="login-phone-input"
        {...register('phone')}
      />

      {requestOtp.isError && (
        <Alert variant="error" title={t('auth.requestFailed')} />
      )}

      <Button type="submit" loading={requestOtp.isPending} data-testid="login-submit">
        {t('auth.sendOtp')}
      </Button>
    </form>
  );
}
