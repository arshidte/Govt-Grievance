'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { updateProfileSchema, type MeResponse, type UpdateProfileInput } from '@pg/types';
import { useMe, useUpdateProfile } from '@pg/api-client';
import { Alert, Button, ErrorState, Input, LoadingState, Toast } from '@pg/ui';

import { useApiClient } from '../auth/api-client';

function toFormValues(me: MeResponse): UpdateProfileInput {
  return {
    fullName: me.fullName ?? '',
    email: me.email ?? '',
    preferredLanguage: me.preferredLanguage,
    addressLine: '',
  };
}

/**
 * Editable profile form. PRE-FILLS from `useMe` (the session's current
 * profile) once it loads, submits `updateProfileSchema`-validated input via
 * `useUpdateProfile` (through the BFF — `useApiClient` returns the
 * same-origin browser client), and shows a SUCCESS TOAST on save.
 *
 * `me`-cache invalidation on a successful update is already handled INSIDE
 * `useUpdateProfile` itself (`packages/api-client/src/profile.ts` calls
 * `queryClient.invalidateQueries({ queryKey: queryKeys.me })` in its
 * `onSuccess`) — this component adds no duplicate invalidation, it just
 * relies on that shared behavior, which is what makes the subsequent
 * `useMe()` read (e.g. on `/home`) reflect the update automatically.
 */
export function ProfileForm() {
  const t = useTranslations();
  const client = useApiClient();
  const me = useMe(client);
  const updateProfile = useUpdateProfile(client);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName: '', email: '', preferredLanguage: 'en', addressLine: '' },
  });

  // Pre-fill once `useMe` resolves (and whenever the underlying data
  // changes, e.g. after this very form's own successful save re-fetches it).
  useEffect(() => {
    if (me.data) {
      reset(toFormValues(me.data));
    }
  }, [me.data, reset]);

  const onSubmit = handleSubmit((data) => {
    updateProfile.mutate(data);
  });

  if (me.isPending) {
    return <LoadingState label={t('profile.title')} data-testid="profile-loading" />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title={t('profile.loadFailed')}
        description={me.error.message}
        onRetry={() => me.refetch()}
        data-testid="profile-error"
      />
    );
  }

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate data-testid="profile-form">
        <Input
          label={t('profile.phoneLabel')}
          value={me.data.phone}
          disabled
          readOnly
          data-testid="profile-phone"
        />

        <Input
          label={t('auth.fullNameLabel')}
          error={errors.fullName?.message}
          required
          data-testid="profile-full-name"
          {...register('fullName')}
        />

        <Input
          label={t('auth.emailLabel')}
          type="email"
          error={errors.email?.message}
          data-testid="profile-email"
          {...register('email')}
        />

        <Input
          label={t('auth.addressLabel')}
          error={errors.addressLine?.message}
          data-testid="profile-address"
          {...register('addressLine')}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="preferredLanguage" className="text-sm font-medium text-neutral-800">
            {t('auth.languageLabel')}
          </label>
          <select
            id="preferredLanguage"
            className="min-h-11 rounded-md border border-neutral-300 px-3 text-sm text-neutral-900"
            data-testid="profile-language"
            {...register('preferredLanguage')}
          >
            <option value="en">English</option>
            <option value="ml">മലയാളം</option>
          </select>
        </div>

        {updateProfile.isError && <Alert variant="error" title={t('auth.profileSaveFailed')} />}

        <Button type="submit" loading={updateProfile.isPending} data-testid="profile-save">
          {t('common.save')}
        </Button>
      </form>

      {updateProfile.isSuccess && (
        <Toast
          variant="success"
          title={t('profile.saveSuccessTitle')}
          description={t('profile.saveSuccessDescription')}
          duration={4000}
          onOpenChange={(open) => {
            if (!open) updateProfile.reset();
          }}
          data-testid="profile-save-toast"
        />
      )}
    </>
  );
}
