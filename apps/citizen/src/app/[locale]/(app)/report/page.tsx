import { PageHeader } from '@pg/ui';
import { getTranslations } from 'next-intl/server';

import { SubmitWizard } from '../../../../features/issues/SubmitWizard';

export async function generateMetadata() {
  const t = await getTranslations('report');
  return { title: t('title') };
}

/**
 * Authed "report an issue" page — gated by the `(app)` route group's session
 * check (no PUBLIC_PATHS change needed). The `PageHeader` (title/subtitle) is
 * server-rendered static chrome; the actual wizard (catalog/org reads +
 * create mutation + optional photo upload) is client-side (`SubmitWizard`),
 * mirroring `IssuesPage`'s server-shell + client-feature split.
 */
export default async function ReportPage() {
  const t = await getTranslations('report');

  return (
    <div className="flex flex-col gap-6" data-testid="report-page">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <SubmitWizard />
    </div>
  );
}
