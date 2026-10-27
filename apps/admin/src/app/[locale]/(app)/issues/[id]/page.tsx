import { StaffIssueDetail } from '../../../../../features/issues/StaffIssueDetail';

interface StaffIssueDetailPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Admin staff triage detail (Task 24 — spec §12). `id` comes from the
 * dynamic route segment and is passed straight to the client
 * `StaffIssueDetail`, which owns the `useIssue` read, the not-found
 * mapping, the attachment/timeline rendering, and the
 * `StatusTransitionControl`. Gated by the `(app)` layout's server-side
 * staff check (this page itself does no auth work), mirroring the citizen
 * app's `issues/[id]/page.tsx`.
 */
export default async function StaffIssueDetailPage({ params }: StaffIssueDetailPageProps) {
  const { id } = await params;

  return <StaffIssueDetail id={id} />;
}
