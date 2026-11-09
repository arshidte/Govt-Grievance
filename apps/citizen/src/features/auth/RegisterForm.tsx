'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { updateProfileSchema, type UpdateProfileInput } from '@pg/types';
import { Alert, Button, Input } from '@pg/ui';

import { useApiClient } from './api-client';
import { useUpdateProfile } from '@pg/api-client';

export interface RegisterFormProps {
  /** Called once the profile update succeeds. */
  onSaved?: () => void;
}

/**
 * Profile-completion step, shown after a first-time login when the user
 * has no `fullName` yet. Validates with `updateProfileSchema` (react-hook-
 * form + Zod resolver) before calling `useUpdateProfile`.
 */
export function RegisterForm({ onSaved }: RegisterFormProps) {
  const t = useTranslations();
  const client = useApiClient();
  const updateProfile = useUpdateProfile(client);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName: '', email: '', preferredLanguage: 'en', addressLine: '' },
  });

  const onSubmit = handleSubmit((data) => {
    updateProfile.mutate(data, { onSuccess: () => onSaved?.() });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Input
        label={t('auth.fullNameLabel')}
        error={errors.fullName?.message}
        required
        {...register('fullName')}
      />

      <Input
        label={t('auth.emailLabel')}
        type="email"
        error={errors.email?.message}
        {...register('email')}
      />

      <Input
        label={t('auth.addressLabel')}
        error={errors.addressLine?.message}
        {...register('addressLine')}
      />

      {/* Native <select> kept (not the controlled `@pg/ui` Select) so the
          react-hook-form `register(...)` wiring stays untouched; only the
          classes are restyled to the P3 field recipe — white surface,
          hairline neutral-200 border, rounded-lg, brand focus ring — to
          match the `Input` fields above it. */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="preferredLanguage" className="text-sm font-medium text-neutral-600">
          {t('auth.languageLabel')}
        </label>
        <select
          id="preferredLanguage"
          className="min-h-11 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          {...register('preferredLanguage')}
        >
          <option value="en">English</option>
          <option value="ml">മലയാളം</option>
        </select>
      </div>

      {updateProfile.isError && (
        <Alert variant="error" title={t('auth.profileSaveFailed')} />
      )}

      <Button type="submit" loading={updateProfile.isPending}>
        {t('auth.saveProfile')}
      </Button>
    </form>
  );
}
