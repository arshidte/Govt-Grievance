import { getTranslations } from 'next-intl/server';
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from '@pg/ui';

interface StatCardProps {
  label: string;
  value: number;
}

/**
 * Small local stat tile (mirrors the citizen app's `HomeOverview.tsx`
 * `StatCard`). Values are HARD-ZEROED — there is no metrics data source
 * until a later milestone, so this never pretends to fetch or derive a
 * count; it is a presentational tile over a constant `0`.
 */
function StatCard({ label, value }: StatCardProps) {
  return (
    <Card data-testid={`stat-card-${label}`}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-neutral-600">{label}</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="text-3xl font-semibold text-neutral-900">{value}</p>
      </CardBody>
    </Card>
  );
}

/**
 * Admin dashboard home. Reached only once the `(app)` route group's layout
 * (src/app/[locale]/(app)/layout.tsx) has confirmed both a valid session
 * and a staff role, and has rendered the Sidebar/MobileDrawer shell around
 * this page — this page itself does no auth work.
 *
 * The four metric StatCards are ZEROED placeholders (no fabricated data —
 * real metrics arrive once the issues/escalations/citizens modules ship in
 * M2+), paired with an `EmptyState` making that explicit.
 */
export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.dashboard' });

  return (
    <div className="flex flex-col gap-6" data-testid="admin-dashboard-page">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">{t('title')}</h1>
        <p className="text-sm text-neutral-600">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('openIssues')} value={0} />
        <StatCard label={t('escalatedIssues')} value={0} />
        <StatCard label={t('resolvedThisMonth')} value={0} />
        <StatCard label={t('pendingCitizens')} value={0} />
      </div>

      <EmptyState
        title={t('emptyTitle')}
        description={t('emptyDescription')}
        data-testid="admin-dashboard-empty-state"
      />
    </div>
  );
}
