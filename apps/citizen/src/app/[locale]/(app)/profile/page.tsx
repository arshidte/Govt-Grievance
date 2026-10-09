import { getTranslations } from 'next-intl/server';
import { ProfileForm } from '../../../../features/profile/ProfileForm';

export async function generateMetadata() {
  const t = await getTranslations('profile');
  return { title: t('title') };
}

/**
 * Authed profile page — gated by `middleware.ts`. Heading/subtitle are
 * server-rendered (static copy only); the actual form (data fetch + mutate
 * + toast) is client-side (`ProfileForm`), since it needs `useMe` /
 * `useUpdateProfile` through the browser BFF client.
 */
export default async function ProfilePage() {
  const t = await getTranslations('profile');

  return (
    <div className="flex flex-col gap-6 p-4" data-testid="profile-page">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-neutral-600">{t('subtitle')}</p>
      </div>

      <ProfileForm />
    </div>
  );
}
