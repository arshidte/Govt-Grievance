import { getTranslations } from 'next-intl/server';

import { AuthShell } from '../../../components/AuthShell';
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
 *
 * Revamp P3 — centered card layout via the shared `AuthShell`; the lookup
 * form + result states live in `TrackLookup` (testids + behaviour intact).
 */
export default async function TrackPage() {
  const t = await getTranslations('track');
  const tCommon = await getTranslations('common');

  return (
    <AuthShell
      appName={tCommon('appName')}
      title={t('title')}
      subtitle={t('subtitle')}
    >
      <TrackLookup />
    </AuthShell>
  );
}
