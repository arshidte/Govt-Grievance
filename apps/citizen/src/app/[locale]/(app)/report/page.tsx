import { getTranslations } from 'next-intl/server';
import { SubmitWizard } from '../../../../features/issues/SubmitWizard';

export async function generateMetadata() {
  const t = await getTranslations('report');
  return { title: t('title') };
}

/**
 * Authed "report an issue" page — gated by the `(app)` route group's session
 * check (no PUBLIC_PATHS change needed). Heading/subtitle are server-rendered
 * static copy; the actual wizard (catalog/org reads + create mutation +
 * optional photo upload) is client-side (`SubmitWizard`).
 */
export default async function ReportPage() {
  const t = await getTranslations('report');

  return (
    <div className="flex flex-col gap-6 p-4" data-testid="report-page">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-neutral-600">{t('subtitle')}</p>
      </div>

      <SubmitWizard />
    </div>
  );
}
