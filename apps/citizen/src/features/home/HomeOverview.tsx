'use client';

import { useTranslations } from 'next-intl';
import { useMe } from '@pg/api-client';
import { Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState, LoadingState } from '@pg/ui';

import { useApiClient } from '../auth/api-client';

interface StatCardProps {
  label: string;
  value: number;
}

/**
 * Small local stat tile (brief: "build a small local StatCard using @pg/ui
 * Card; don't invent issue data"). Issue counts are HARD-ZEROED — there is
 * no issue data source until M2, so this never pretends to fetch or derive
 * a count; it is a presentational tile over a constant `0`.
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
 * Citizen home overview. The three stat tiles (active / awaiting /
 * resolved) are ZEROED placeholders — issue data arrives in M2, so this
 * intentionally never invents counts. `useMe` is the one real network
 * dependency this page has today (confirms the session for a personalized
 * heading), and its loading/error/success states are rendered via the
 * shared `@pg/ui` state components, per the brief's "every page renders
 * loading/empty/error states" requirement.
 */
export function HomeOverview() {
  const t = useTranslations('home');
  const client = useApiClient();
  const me = useMe(client);

  if (me.isPending) {
    return <LoadingState label={t('title')} data-testid="home-loading" />;
  }

  if (me.isError) {
    return (
      <ErrorState
        title={t('title')}
        description={me.error.message}
        onRetry={() => me.refetch()}
        data-testid="home-error"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4" data-testid="home-overview">
      <h1 className="text-xl font-semibold text-neutral-900">{t('title')}</h1>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('active')} value={0} />
        <StatCard label={t('awaiting')} value={0} />
        <StatCard label={t('resolved')} value={0} />
      </div>

      <EmptyState
        title={t('emptyTitle')}
        description={t('emptyDescription')}
        data-testid="home-empty-state"
      />
    </div>
  );
}
