import { AuditLogViewer } from '../../../../features/audit/AuditLogViewer';

/**
 * Admin Audit Logs viewer (M4B — replaces the `ModulePage` placeholder).
 * Reached only after the `(app)` layout's `requireStaff` gate; the data itself
 * is Global-Admin-only, enforced by the BFF/API (`@Roles('ADMIN')`), so a
 * non-admin staff member sees the viewer's Forbidden state rather than data.
 */
export default function AuditLogsPage() {
  return <AuditLogViewer />;
}
