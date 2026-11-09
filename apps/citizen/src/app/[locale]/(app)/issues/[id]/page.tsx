import { getTranslations } from 'next-intl/server';
import { IssueDetail } from '../../../../../features/issues/IssueDetail';

export async function generateMetadata() {
  const t = await getTranslations('issues');
  return { title: t('detailTitle') };
}

interface IssueDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Authed issue detail + proceedings timeline (spec §12) — gated by the
 * `(app)` route group's session check. `id` comes from the dynamic route
 * segment and is passed straight to the client `IssueDetail` component,
 * which owns the `useIssue` read, the not-found mapping, and the
 * attachment/timeline rendering.
 */
export default async function IssueDetailPage({ params }: IssueDetailPageProps) {
  const { id } = await params;

  return <IssueDetail id={id} />;
}
