import { Card, PageHeader } from '@pg/ui';
import { getTranslations } from 'next-intl/server';

import { ProfileForm } from '../../../../features/profile/ProfileForm';
import { LogoutButton } from '../../../../features/auth/LogoutButton';

export async function generateMetadata() {
  const t = await getTranslations('profile');
  return { title: t('title') };
}

/**
 * Authed profile page — gated by `middleware.ts`. Heading/subtitle are
 * server-rendered (static copy only); the actual form (data fetch + mutate
 * + toast) is client-side (`ProfileForm`), since it needs `useMe` /
 * `useUpdateProfile` through the browser BFF client. `LogoutButton` (also
 * client-side) sits in its own "account" Card below the form — this page
 * itself stays a Server Component; only the two interactive pieces are
 * client boundaries.
 */
export default async function ProfilePage() {
  const t = await getTranslations('profile');

  return (
    <div className="flex flex-col gap-6" data-testid="profile-page">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {/* The form itself (fields + save) lives in a calm white Card; the
          ProfileForm renders its own loading/error/success surfaces. */}
      <Card>
        <ProfileForm />
      </Card>

      {/* Account section — profile is where the mobile logout lives. Clearly
          separated into its own Card with a heading + hint, then the
          (unchanged) LogoutButton. */}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-neutral-900">{t('accountSection')}</h2>
          <p className="text-sm text-neutral-500">{t('accountSectionHint')}</p>
        </div>
        <LogoutButton />
      </Card>
    </div>
  );
}
