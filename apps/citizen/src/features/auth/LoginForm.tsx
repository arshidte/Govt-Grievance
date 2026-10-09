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
 * Phone-entry step of the citizen login flow. Validates client-side with
 * `requestOtpSchema` (react-hook-form + the Zod resolver) BEFORE ever
 * calling `useRequestOtp` — an invalid phone shows its translated field
 * error and the mutation is never invoked.
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
