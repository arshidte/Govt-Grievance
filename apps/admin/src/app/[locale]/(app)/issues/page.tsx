import { StaffIssueList } from '../../../../features/issues/StaffIssueList';

/**
 * Admin staff triage list (Task 24, replacing the `ModulePage` placeholder
 * — spec §12 "Admin app — temporary staff triage screen"). Reached only
 * once the `(app)` layout's staff gate + shell have passed; this page
 * itself does no auth work and is a thin server wrapper around the client
 * `StaffIssueList`, which owns the `useStaffIssues` read and all rendering
 * (including the `data-testid="admin-issues-page"` root the existing
 * admin e2e suite asserts on — kept unchanged from the placeholder).
 */
export default function IssuesPage() {
  return <StaffIssueList />;
}
