import { getTranslations } from 'next-intl/server';
import { TrackLookup } from '../../../features/track/TrackLookup';

export async function generateMetadata() {
  const t = await getTranslations('track');
  return { title: t('title') };
}

/**
 * Public grievance-tracking page (see middleware.ts PUBLIC_PATHS).
 *
 * NO PII WITHOUT AUTH: issue data/real lookups are M2 scope, so there is no
 * backend call on this page at all today — `TrackLookup` only ever shows a
 * generic "sign in for details" prompt after a reference is entered, never
 * any citizen/issue personal data. When M2 wires up a real lookup, any
 * response containing personal data MUST stay behind an auth check; this
 * page's job is to never render it pre-auth.
 */
export default async function TrackPage() {
  const t = await getTranslations('track');

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-neutral-600">{t('subtitle')}</p>
        </div>

        <TrackLookup />
      </div>
    </main>
  );
}
